import json
import logging
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from .atgt_plate_reader import resolve_vehicle_plate
from .crane_detection_catalog import CRANE_CATALOG_STYLES
from .config import settings
from .event_dedup import EventDedupRegistry, build_dedup_key, dedupe_events_by_key
from .schemas import Detection, PpeDetection, RoadDetection, CraneProximityDetection, ViolationEvent
from .snapshot_compose import (
    compose_violation_snapshot,
    draw_atld_roi_box,
    draw_violation_roi_annotation,
    format_distance_suffix_meters,
    merge_bboxes,
)

logger = logging.getLogger("events")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SNAPSHOT_DIR = DATA_DIR / "snapshots"
EVENTS_DIR = DATA_DIR / "events"
LEGACY_EVENTS_FILE = DATA_DIR / "events.jsonl"


def _event_date(ts: Optional[float] = None) -> str:
    """Ngày sự kiện theo giờ VN — đồng bộ filter FE (?date= / getSafetyTodayDate)."""
    from datetime import timezone, timedelta

    vn = timezone(timedelta(hours=7))
    return datetime.fromtimestamp(ts or time.time(), tz=vn).strftime("%Y-%m-%d")


def _daily_events_file(date: str) -> Path:
    folder = EVENTS_DIR / date
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "events.jsonl"


def _daily_snapshot_dir(date: str) -> Path:
    folder = SNAPSHOT_DIR / date
    folder.mkdir(parents=True, exist_ok=True)
    return folder


_PATROL_TIER_WEIGHT = {"object": 0.0, "person": 1.0, "identity": 2.0}


def _patrol_snapshot_score(detection: PpeDetection) -> float:
    """Ảnh nào đáng giữ hơn cho một người — ưu tiên khung nhìn rõ mặt.

    Ảnh mới không đương nhiên tốt hơn ảnh cũ. Bản ghi được làm mới mỗi ba giây,
    nên chỉ cần đúng nhịp đó người đang quay lưng hay bị che một nửa là ảnh rõ
    mặt trước đó bị thay, và chỉ huy mất luôn thứ để nhận ra ai.

    Thang điểm bám theo mức độ hữu ích khi nhận diện: tầng đã đạt được quan trọng
    hơn hẳn độ tin cậy của khung đơn lẻ, vì tầng phản ánh cả quá trình quan sát.
    """
    score = _PATROL_TIER_WEIGHT.get(detection.tier or "object", 0.0) * 10.0
    if detection.face_eligible:
        score += 4.0
    if detection.face_match_confidence:
        score += float(detection.face_match_confidence) * 2.0
    return score + float(detection.confidence or 0.0)


class PersistenceDebouncer:
    """Xác nhận sự kiện khi hành vi detect liên tục đủ min_duration.

    one_event_per_episode=True: mỗi phiên (liên tục, gap <= max_gap) chỉ log 1 lần;
    phiên mới bắt đầu khi mất detect > max_gap (vd hút điếu mới).
    """

    def __init__(
        self,
        min_duration_seconds: float,
        cooldown_seconds: float,
        max_gap_seconds: float = 2.5,
        *,
        one_event_per_episode: bool = False,
    ):
        self.min_duration_seconds = min_duration_seconds
        self.cooldown_seconds = cooldown_seconds
        self.max_gap_seconds = max_gap_seconds
        self.one_event_per_episode = one_event_per_episode
        self._active_since: Optional[float] = None
        self._last_hit_at: Optional[float] = None
        self._last_confirmed_at: float = 0.0
        self._logged_this_episode: bool = False

    def _reset_episode(self) -> None:
        self._active_since = None
        self._last_hit_at = None
        self._logged_this_episode = False

    def reset(self) -> None:
        """Reset phiên — dùng khi track mới / rời segment demo."""
        self._reset_episode()
        self._last_confirmed_at = 0.0

    def note_hit(self, hit: bool) -> None:
        """Cập nhật hit/debounce timing — không consume confirm."""
        now = time.time()

        if hit and self._last_hit_at is not None and now - self._last_hit_at > self.max_gap_seconds:
            self._reset_episode()

        if hit:
            if self._active_since is None:
                self._active_since = now
            self._last_hit_at = now
        elif self._last_hit_at is not None and now - self._last_hit_at > self.max_gap_seconds:
            self._reset_episode()

    def consume_confirm(self, now: Optional[float] = None) -> bool:
        """Đánh dấu đã confirm sau khi persist sự kiện thành công."""
        ts = now if now is not None else time.time()
        if not self.snapshot(ts)["ready_to_confirm"]:
            return False
        self._last_confirmed_at = ts
        if self.one_event_per_episode:
            self._logged_this_episode = True
        return True

    def register(self, hit: bool) -> bool:
        self.note_hit(hit)
        if not hit or self._active_since is None:
            return False
        return self.consume_confirm()

    def snapshot(self, now: Optional[float] = None) -> dict:
        """Trạng thái debounce — dùng khi test timing sự kiện."""
        ts = now if now is not None else time.time()
        active_for = (ts - self._active_since) if self._active_since is not None else 0.0
        since_last_hit = (ts - self._last_hit_at) if self._last_hit_at is not None else None
        since_confirm = ts - self._last_confirmed_at if self._last_confirmed_at else None
        return {
            "min_duration_seconds": self.min_duration_seconds,
            "max_gap_seconds": self.max_gap_seconds,
            "cooldown_seconds": self.cooldown_seconds,
            "one_event_per_episode": self.one_event_per_episode,
            "active": self._active_since is not None,
            "active_for_seconds": round(active_for, 2),
            "logged_this_episode": self._logged_this_episode,
            "seconds_since_last_hit": round(since_last_hit, 2) if since_last_hit is not None else None,
            "seconds_since_last_confirm": round(since_confirm, 2) if since_confirm is not None else None,
            "ready_to_confirm": (
                self._active_since is not None
                and active_for >= self.min_duration_seconds
                and not (self.one_event_per_episode and self._logged_this_episode)
                and (
                    self.one_event_per_episode
                    or since_confirm is None
                    or since_confirm >= self.cooldown_seconds
                )
            ),
        }


class EventStore:
    """Lưu event RAM + JSONL theo ngày + snapshot ảnh theo ngày."""

    def __init__(self, max_in_memory: int = 200):
        self._events: deque[ViolationEvent] = deque(maxlen=max_in_memory)
        self._lock = threading.Lock()
        self._dedup = EventDedupRegistry(settings.event_first_seen_window_effective)
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        EVENTS_DIR.mkdir(parents=True, exist_ok=True)
        self._load_today_from_disk()

    def _load_today_from_disk(self) -> None:
        today = _event_date()
        disk_events = self._read_events_file(_daily_events_file(today))
        self._dedup.load_from_events(disk_events)
        for event in disk_events:
            with self._lock:
                if not any(e.id == event.id for e in self._events):
                    self._events.appendleft(event)

    @staticmethod
    def _read_events_file(path: Path) -> list[ViolationEvent]:
        if not path.exists():
            return []
        rows: list[ViolationEvent] = []
        try:
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rows.append(ViolationEvent.model_validate_json(line))
                    except Exception:  # noqa: BLE001
                        continue
        except OSError as exc:
            logger.warning("Không đọc được %s: %s", path, exc)
        return rows

    def _find_by_dedup_key(self, dedup_key: str) -> Optional[ViolationEvent]:
        with self._lock:
            for event in self._events:
                if event.dedup_key == dedup_key:
                    return event
        return None

    def find_by_dedup_key(self, dedup_key: str) -> Optional[ViolationEvent]:
        return self._find_by_dedup_key(dedup_key)

    def _refresh_existing_snapshot(
        self,
        existing: ViolationEvent,
        snapshot_image: np.ndarray,
        incoming: ViolationEvent,
        *,
        frame_size: Optional[tuple[int, int]] = None,
    ) -> ViolationEvent:
        """Giữ created_at/id — chỉ cập nhật ảnh + bbox/conf nếu tốt hơn."""
        event_date = existing.event_date or _event_date(existing.created_at)
        snapshot_name = existing.snapshot_file or f"{event_date}/{existing.id}.jpg"
        snapshot_path = SNAPSHOT_DIR / snapshot_name
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(snapshot_path), snapshot_image)
        existing.snapshot_file = snapshot_name
        existing.confirmed_at = time.time()

        if incoming.behavior in ("no_helmet", "no_vest", "no_shoes"):
            existing.bbox = list(incoming.bbox)
            if incoming.subject_bbox:
                existing.subject_bbox = list(incoming.subject_bbox)
            if incoming.confidence >= existing.confidence:
                existing.confidence = incoming.confidence
        elif incoming.confidence >= existing.confidence:
            existing.confidence = incoming.confidence
            existing.bbox = list(incoming.bbox)
            if incoming.subject_bbox:
                existing.subject_bbox = list(incoming.subject_bbox)
            if incoming.related_bbox:
                existing.related_bbox = list(incoming.related_bbox)
        elif incoming.subject_bbox:
            existing.subject_bbox = list(incoming.subject_bbox)

        if frame_size:
            existing.frame_width, existing.frame_height = frame_size
        else:
            h, w = snapshot_image.shape[:2]
            existing.frame_width = int(w)
            existing.frame_height = int(h)

        for field in (
            "worker_id",
            "worker_name",
            "employee_code",
            "contractor_name",
            "face_match_confidence",
            "face_match_source",
            "vehicle_plate",
            "vehicle_type",
            "driver_name",
            "gps_lat",
            "gps_lng",
        ):
            new_val = getattr(incoming, field, None)
            if new_val is not None and getattr(existing, field, None) in (None, "", 0, 0.0):
                setattr(existing, field, new_val)
        if incoming.gps_lat is not None and incoming.gps_lng is not None:
            existing.gps_lat = incoming.gps_lat
            existing.gps_lng = incoming.gps_lng

        logger.info(
            "Refresh snapshot event=%s key=%s (giữ created_at=%.0f)",
            existing.id,
            existing.dedup_key,
            existing.created_at,
        )
        return existing

    def _finalize_event(
        self,
        event: ViolationEvent,
        snapshot_image: np.ndarray,
        dedup_key: str,
        log_template: str,
        *log_args: object,
        frame_size: Optional[tuple[int, int]] = None,
    ) -> Optional[ViolationEvent]:
        event.dedup_key = dedup_key

        if settings.event_dedup_enabled() and self._dedup.should_skip(dedup_key):
            existing = self._find_by_dedup_key(dedup_key)
            if existing is not None:
                self._refresh_existing_snapshot(
                    existing, snapshot_image, event, frame_size=frame_size,
                )
                if event.behavior == "person":
                    return existing
            return None

        event_date = event.event_date or _event_date(event.created_at)
        if frame_size:
            event.frame_width, event.frame_height = frame_size
        else:
            h, w = snapshot_image.shape[:2]
            event.frame_width = int(w)
            event.frame_height = int(h)
        if event.confirmed_at is None:
            event.confirmed_at = event.created_at
        snapshot_name = f"{event_date}/{event.id}.jpg"
        snapshot_path = _daily_snapshot_dir(event_date) / f"{event.id}.jpg"
        cv2.imwrite(str(snapshot_path), snapshot_image)
        event.snapshot_file = snapshot_name

        with self._lock:
            self._events.appendleft(event)
        self._append_to_disk(event)
        self._dedup.register(dedup_key, event.created_at, replace=True)
        logger.info(log_template, *log_args)
        return event

    @staticmethod
    def _compose_event_snapshot(
        raw: np.ndarray,
        annotated: np.ndarray,
        event: ViolationEvent,
        *,
        behavior: str = "",
        focus_bbox: Optional[list[float]] = None,
    ) -> np.ndarray:
        return compose_violation_snapshot(
            raw,
            annotated,
            scenario_id=event.scenario_id,
            behavior=behavior,
            focus_bbox=focus_bbox,
        )

    @staticmethod
    def _frame_size(raw: np.ndarray) -> tuple[int, int]:
        h, w = raw.shape[:2]
        return int(w), int(h)

    def add(
        self,
        detection: Detection,
        frame: np.ndarray,
        *,
        camera_id: str = "LOCAL-CAM",
        dedup_key: Optional[str] = None,
    ) -> Optional[ViolationEvent]:
        event_date = _event_date()
        event = ViolationEvent.from_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        key = dedup_key or build_dedup_key(camera_id, event.scenario_id, detection.behavior)
        raw = frame.copy()
        annotated = self._draw_bbox(raw, detection)
        snapshot = self._compose_event_snapshot(
            raw,
            annotated,
            event,
            behavior=detection.behavior,
            focus_bbox=list(detection.bbox),
        )
        return self._finalize_event(
            event,
            snapshot,
            key,
            "Sự kiện mới [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
            frame_size=self._frame_size(raw),
        )

    def add_pccc(
        self,
        detection: Detection,
        frame: np.ndarray,
        *,
        camera_id: str = "A-04",
        person_bbox: Optional[list[float]] = None,
        dedup_key: Optional[str] = None,
    ) -> Optional[ViolationEvent]:
        event_date = _event_date()
        event = ViolationEvent.from_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        subject = person_bbox or getattr(detection, "subject_bbox", None)
        if subject and len(subject) >= 4:
            event.subject_bbox = [float(v) for v in subject]
        key = dedup_key or build_dedup_key(camera_id, event.scenario_id, detection.behavior)
        raw = frame.copy()
        annotated = self._draw_pccc_snapshot(raw, detection)
        snapshot = self._compose_event_snapshot(
            raw,
            annotated,
            event,
            behavior=detection.behavior,
            focus_bbox=list(detection.bbox),
        )
        return self._finalize_event(
            event,
            snapshot,
            key,
            "Sự kiện PCCC [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
            frame_size=self._frame_size(raw),
        )

    def add_road(
        self,
        detection: RoadDetection,
        frame: np.ndarray,
        *,
        camera_id: str = "A-03",
        dedup_key: Optional[str] = None,
        track_id: Optional[str] = None,
    ) -> Optional[ViolationEvent]:
        event_date = _event_date()
        event = ViolationEvent.from_road_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        stable_track = track_id or detection.behavior
        key = dedup_key or build_dedup_key(camera_id, event.scenario_id, stable_track)
        raw = frame.copy()
        annotated = self._draw_road_bbox(raw, detection)
        snapshot = self._compose_event_snapshot(
            raw,
            annotated,
            event,
            behavior=detection.behavior,
            focus_bbox=list(detection.bbox),
        )
        return self._finalize_event(
            event,
            snapshot,
            key,
            "Sự kiện road [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
            frame_size=self._frame_size(raw),
        )

    def add_mesh(
        self,
        detection: RoadDetection,
        frame: np.ndarray,
        *,
        camera_id: str = "A-03",
        dedup_key: Optional[str] = None,
        track_id: Optional[str] = None,
    ) -> Optional[ViolationEvent]:
        """BPTC-001 — lưới bao che thiếu/bẩn, snapshot full frame + ROI."""
        event_date = _event_date()
        event = ViolationEvent.from_road_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        stable_track = track_id or detection.behavior
        key = dedup_key or build_dedup_key(camera_id, event.scenario_id, stable_track)
        raw = frame.copy()
        annotated = self._draw_road_bbox(raw, detection)
        snapshot = self._compose_event_snapshot(
            raw,
            annotated,
            event,
            behavior=detection.behavior,
            focus_bbox=list(detection.bbox),
        )
        return self._finalize_event(
            event,
            snapshot,
            key,
            "Sự kiện mesh [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
            frame_size=self._frame_size(raw),
        )

    def add_crane(
        self,
        detection: CraneProximityDetection,
        frame: np.ndarray,
        *,
        camera_id: str = "A-04",
        context: Optional[list[CraneProximityDetection]] = None,
        person_bbox: Optional[list[float]] = None,
        machine_bbox: Optional[list[float]] = None,
        dedup_key: Optional[str] = None,
        track_id: Optional[str] = None,
    ) -> Optional[ViolationEvent]:
        _ = context
        event_date = _event_date()
        event = ViolationEvent.from_crane_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        if person_bbox and len(person_bbox) >= 4:
            event.subject_bbox = [float(v) for v in person_bbox]
        if machine_bbox and len(machine_bbox) >= 4:
            event.related_bbox = [float(v) for v in machine_bbox]
        stable_track = track_id or "proximity"
        key = dedup_key or build_dedup_key(camera_id, event.scenario_id, stable_track)
        raw = frame.copy()
        annotated = self._draw_crane_snapshot(
            raw,
            detection,
            person_bbox=person_bbox,
            machine_bbox=machine_bbox,
        )
        snapshot = self._compose_event_snapshot(raw, annotated, event, behavior=detection.behavior)
        return self._finalize_event(
            event,
            snapshot,
            key,
            "Sự kiện crane [%s]: %s (%s) conf=%.2f dist=%s",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
            getattr(detection, "distance_m", None),
            frame_size=self._frame_size(raw),
        )

    def add_ppe(
        self,
        detection: PpeDetection,
        frame: np.ndarray,
        *,
        camera_id: str = "A-04",
        person_bbox: Optional[list[float]] = None,
        dedup_key: Optional[str] = None,
        track_id: Optional[str] = None,
    ) -> Optional[ViolationEvent]:
        from .ppe_analyzer import raw_person_bbox, snapshot_annotation_detection

        display_det = detection
        raw_pb = raw_person_bbox(detection)
        if person_bbox and len(person_bbox) >= 4:
            if detection.subject_bbox and len(detection.subject_bbox) >= 4:
                raw_pb = [float(v) for v in detection.subject_bbox]
            else:
                raw_pb = [float(v) for v in person_bbox]

        event_date = _event_date()
        event = ViolationEvent.from_ppe_detection(
            display_det,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        from .patrol_api import get_patrol_gps

        gps_lat, gps_lng = get_patrol_gps(camera_id)
        if gps_lat is not None and gps_lng is not None:
            event.gps_lat = gps_lat
            event.gps_lng = gps_lng
        if raw_pb and len(raw_pb) >= 4:
            event.subject_bbox = [float(v) for v in raw_pb]
        stable_track = track_id or detection.behavior
        key = dedup_key or build_dedup_key(camera_id, event.scenario_id, stable_track)
        raw = frame.copy()
        h, w = raw.shape[:2]
        annot_det = snapshot_annotation_detection(display_det, w, h, camera_id=camera_id)
        event.bbox = [float(v) for v in annot_det.bbox]
        # Không tạo no_vest nếu không gắn được ROI ngực (tránh khoanh mặt cận).
        if detection.behavior == "no_vest" and (
            len(annot_det.bbox) < 4
            or annot_det.bbox[2] - annot_det.bbox[0] < 4
            or annot_det.bbox[3] - annot_det.bbox[1] < 4
        ):
            return None
        annotated = self._draw_ppe_bbox(
            raw, annot_det, copy_frame=True, thickness=2, camera_id=camera_id,
        )
        snapshot = annotated
        return self._finalize_event(
            event,
            snapshot,
            key,
            "Sự kiện PPE [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
            frame_size=(int(w), int(h)),
        )

    def _person_incoming_event(
        self,
        detection: PpeDetection,
        *,
        camera_id: str,
        track_id: Optional[str] = None,
        frame_w: int = 0,
        frame_h: int = 0,
    ) -> tuple[ViolationEvent, str]:
        event_date = _event_date()
        event = ViolationEvent.from_person_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        from .patrol_api import get_patrol_gps

        gps_lat, gps_lng = get_patrol_gps(camera_id)
        if gps_lat is not None and gps_lng is not None:
            event.gps_lat = gps_lat
            event.gps_lng = gps_lng
        from .ppe_analyzer import raw_person_bbox

        raw_pb = raw_person_bbox(detection)
        if raw_pb and len(raw_pb) >= 4:
            event.subject_bbox = [float(v) for v in raw_pb]

        if track_id:
            event.track_id = str(track_id).strip()
        oid = self._resolve_workforce_object_id(
            camera_id,
            detection.worker_id,
            event.track_id,
        )
        if oid:
            event.object_id = oid

        from .patrol_entity import resolve_patrol_dedup_stable_id

        stable_id = resolve_patrol_dedup_stable_id(
            detection.worker_id,
            event.object_id,
            track_id,
            person_bbox=raw_pb,
            frame_w=frame_w,
            frame_h=frame_h,
        )
        key = build_dedup_key(camera_id, event.scenario_id, stable_id)
        return event, key

    @staticmethod
    def _resolve_workforce_object_id(
        camera_id: str,
        worker_id: Optional[str],
        track_id: Optional[str],
    ) -> Optional[str]:
        try:
            from .workforce_engine import workforce_engine
        except Exception:
            return None
        tid = (track_id or "").strip()
        if tid:
            track_key = f"{camera_id}:{tid}"
            oid = workforce_engine.track_to_object.get(track_key)
            if oid:
                return oid
        wid = (worker_id or "").strip()
        if not wid:
            return None
        for obj in workforce_engine.objects.values():
            if obj.helmet_id == camera_id and obj.worker_id == wid:
                return obj.object_id
        return None

    def upsert_patrol_person(
        self,
        detection: PpeDetection,
        frame: np.ndarray,
        *,
        camera_id: str = "HC-01",
        track_id: Optional[str] = None,
        allow_create: bool = True,
    ) -> Optional[ViolationEvent]:
        """Tạo hoặc cập nhật PERS-001 — 1 người = 1 sự kiện, gặp lại cập nhật GPS/dot."""
        raw = frame.copy()
        h, w = raw.shape[:2]
        incoming, key = self._person_incoming_event(
            detection,
            camera_id=camera_id,
            track_id=track_id,
            frame_w=int(w),
            frame_h=int(h),
        )
        existing = self._find_by_dedup_key(key)
        from .ppe_analyzer import snapshot_annotation_detection

        annot_det = snapshot_annotation_detection(
            incoming, w, h, camera_id=camera_id, frame=raw,
        )
        if (
            annot_det.bbox[2] <= annot_det.bbox[0]
            or annot_det.bbox[3] <= annot_det.bbox[1]
        ):
            if existing is not None:
                return existing
            return None
        incoming.bbox = [float(v) for v in annot_det.bbox]
        annotated = self._draw_ppe_bbox(raw, annot_det, copy_frame=True, thickness=2)
        from .snapshot_compose import crop_to_focus

        snapshot = crop_to_focus(annotated, list(incoming.bbox), behavior="person")
        frame_size = (int(w), int(h))

        incoming_score = _patrol_snapshot_score(detection)
        incoming.snapshot_score = incoming_score

        if existing is not None:
            now = time.time()
            last_touch = float(existing.confirmed_at or existing.created_at or 0)
            stored_score = (
                existing.snapshot_score if existing.snapshot_score is not None else -1.0
            )
            if now - last_touch >= 3.0 and incoming_score >= stored_score:
                refreshed = self._finalize_event(
                    incoming,
                    snapshot,
                    key,
                    "Refresh Person [%s]: %s conf=%.2f",
                    incoming.event_date or _event_date(),
                    existing.worker_name or existing.scenario_name,
                    existing.confidence,
                    frame_size=frame_size,
                )
                return refreshed or existing

            if incoming.gps_lat is not None and incoming.gps_lng is not None:
                existing.gps_lat = incoming.gps_lat
                existing.gps_lng = incoming.gps_lng
            existing.confirmed_at = now
            if detection.confidence >= existing.confidence:
                existing.confidence = detection.confidence
            existing.bbox = list(incoming.bbox)
            if incoming.subject_bbox:
                existing.subject_bbox = list(incoming.subject_bbox)
            if incoming.track_id:
                existing.track_id = incoming.track_id
            if incoming.object_id:
                existing.object_id = incoming.object_id
            incoming_wid = (detection.worker_id or "").strip()
            if incoming_wid and incoming_wid not in ("", "unknown"):
                existing.worker_id = incoming_wid
                existing.worker_name = (detection.worker_name or incoming_wid).strip()
            return existing

        if not allow_create:
            return None

        return self._finalize_event(
            incoming,
            snapshot,
            key,
            "Sự kiện Person [%s]: %s (%s) conf=%.2f",
            incoming.event_date or _event_date(),
            incoming.worker_name or incoming.scenario_name,
            incoming.id,
            incoming.confidence,
            frame_size=frame_size,
        )

    def add_person(
        self,
        detection: PpeDetection,
        frame: np.ndarray,
        *,
        camera_id: str = "HC-01",
        dedup_key: Optional[str] = None,
        track_id: Optional[str] = None,
    ) -> Optional[ViolationEvent]:
        _ = dedup_key
        return self.upsert_patrol_person(
            detection,
            frame,
            camera_id=camera_id,
            track_id=track_id,
            allow_create=True,
        )

    def add_wah(
        self,
        detection: Detection,
        frame: np.ndarray,
        *,
        camera_id: str = "A-04",
        person_bbox: Optional[list[float]] = None,
        dedup_key: Optional[str] = None,
        track_id: Optional[str] = None,
    ) -> Optional[ViolationEvent]:
        event_date = _event_date()
        event = ViolationEvent.from_wah_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        if person_bbox and len(person_bbox) >= 4:
            event.subject_bbox = [float(v) for v in person_bbox]
        stable_track = track_id or detection.behavior
        key = dedup_key or build_dedup_key(camera_id, event.scenario_id, stable_track)
        raw = frame.copy()
        annotated = self._draw_wah_snapshot(raw, detection, person_bbox)
        snapshot = self._compose_event_snapshot(raw, annotated, event, behavior=detection.behavior)
        return self._finalize_event(
            event,
            snapshot,
            key,
            "Sự kiện WAH [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
            frame_size=self._frame_size(raw),
        )

    @classmethod
    def _draw_wah_snapshot(
        cls,
        frame: np.ndarray,
        detection: Detection,
        person_bbox: Optional[list[float]] = None,
    ) -> np.ndarray:
        """Snapshot WAH — viền liền + nhãn WAH-001 88% - 0,2m."""
        _ = person_bbox
        annotated = frame.copy()
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in detection.bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        color = (0, 140, 255)
        draw_violation_roi_annotation(
            annotated,
            x1,
            y1,
            x2,
            y2,
            color,
            behavior=detection.behavior,
            scenario_id=getattr(detection, "scenario_id", None) or "WAH-001",
            confidence=float(detection.confidence),
            thickness=2,
            suffix=" - 0,2m",
        )
        return annotated

    def add_atgt(
        self,
        detection: Detection,
        frame: np.ndarray,
        *,
        camera_id: str = "A-03",
        vehicle_bbox: Optional[list[float]] = None,
        dedup_key: Optional[str] = None,
        track_id: Optional[str] = None,
    ) -> Optional[ViolationEvent]:
        event_date = _event_date()
        event = ViolationEvent.from_atgt_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        if vehicle_bbox and len(vehicle_bbox) >= 4:
            event.subject_bbox = [float(v) for v in vehicle_bbox]
        if not getattr(detection, "vehicle_plate", None) and vehicle_bbox and len(vehicle_bbox) >= 4:
            retry = resolve_vehicle_plate(frame, vehicle_bbox, camera_id=camera_id)
            if retry:
                detection = detection.model_copy(update={"vehicle_plate": retry})
                event.vehicle_plate = retry
        plate = getattr(detection, "vehicle_plate", None)
        stable_track = track_id or (plate if plate else detection.behavior)
        key = dedup_key or build_dedup_key(camera_id, event.scenario_id, stable_track)
        focus_bbox = (
            list(vehicle_bbox)
            if vehicle_bbox and len(vehicle_bbox) >= 4
            else list(detection.bbox)
        )
        if detection.behavior == "speeding" and vehicle_bbox and len(vehicle_bbox) >= 4:
            event.bbox = focus_bbox
        raw = frame.copy()
        annotated = self._draw_atgt_snapshot(raw, detection, vehicle_bbox)
        snapshot = self._compose_event_snapshot(
            raw,
            annotated,
            event,
            behavior=detection.behavior,
            focus_bbox=focus_bbox,
        )
        return self._finalize_event(
            event,
            snapshot,
            key,
            "Sự kiện ATGT [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
            frame_size=self._frame_size(raw),
        )

    @classmethod
    def _draw_atgt_snapshot(
        cls,
        frame: np.ndarray,
        detection: Detection,
        vehicle_bbox: Optional[list[float]] = None,
    ) -> np.ndarray:
        """Snapshot ATGT — full frame + bbox vi phạm; speeding vẽ bbox xe."""
        annotated = frame.copy()
        h, w = frame.shape[:2]
        target = (
            vehicle_bbox
            if vehicle_bbox
            and len(vehicle_bbox) >= 4
            and detection.behavior == "speeding"
            else detection.bbox
        )
        x1, y1, x2, y2 = [int(v) for v in target]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        colors = {
            "speeding": (0, 120, 255),
            "hard_median": (255, 200, 0),
            "no_soft_median": (0, 140, 255),
        }
        color = colors.get(detection.behavior, (0, 200, 255))
        draw_violation_roi_annotation(
            annotated,
            x1,
            y1,
            x2,
            y2,
            color,
            behavior=detection.behavior,
            scenario_id=getattr(detection, "scenario_id", None),
            confidence=float(detection.confidence),
            thickness=2,
        )
        return annotated

    @classmethod
    def _draw_ppe_snapshot(
        cls,
        frame: np.ndarray,
        detection: PpeDetection,
        person_bbox: Optional[list[float]] = None,
    ) -> np.ndarray:
        """Snapshot PPE — bbox bám trên người (không tràn lên máy phía sau)."""
        return cls._draw_ppe_bbox(frame, detection, copy_frame=True, thickness=2)

    @staticmethod
    def _draw_ppe_bbox(
        frame: np.ndarray,
        detection: PpeDetection,
        *,
        copy_frame: bool = True,
        thickness: int = 2,
        camera_id: str = "",
    ) -> np.ndarray:
        annotated = frame.copy() if copy_frame else frame
        if detection.behavior in ("no_vest", "safety_vest"):
            from .ppe_analyzer import raw_person_bbox, _vest_roi_overlaps_face

            pb = raw_person_bbox(detection)
            if (
                len(detection.bbox) < 4
                or detection.bbox[2] - detection.bbox[0] < 4
                or detection.bbox[3] - detection.bbox[1] < 4
            ):
                return annotated
            if len(pb) >= 4 and _vest_roi_overlaps_face(
                tuple(float(v) for v in pb),
                tuple(float(v) for v in detection.bbox),
                camera_id=camera_id,
            ):
                return annotated
        x1, y1, x2, y2 = [int(v) for v in detection.bbox]
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        colors = {
            "no_helmet": (80, 80, 255),
            "no_vest": (0, 140, 255),
            "no_shoes": (0, 190, 255),
            "hard_hat": (80, 255, 80),
            "safety_vest": (100, 255, 100),
            "safety_shoes": (120, 255, 120),
            "person": (255, 200, 80),
        }
        color = colors.get(detection.behavior, (0, 255, 0))
        draw_violation_roi_annotation(
            annotated,
            x1,
            y1,
            x2,
            y2,
            color,
            behavior=detection.behavior,
            scenario_id=getattr(detection, "scenario_id", None),
            confidence=float(detection.confidence),
            thickness=thickness,
            worker_id=getattr(detection, "worker_id", None),
            worker_name=getattr(detection, "worker_name", None),
            object_id=getattr(detection, "object_id", None),
        )
        return annotated

    @staticmethod
    def _draw_crane_bbox(
        frame: np.ndarray,
        detection: CraneProximityDetection,
        *,
        emphasis: bool = True,
        copy_frame: bool = True,
    ) -> np.ndarray:
        annotated = frame.copy() if copy_frame else frame
        x1, y1, x2, y2 = [int(v) for v in detection.bbox]
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        if detection.behavior == "crane" and detection.machine_kind:
            color = CRANE_CATALOG_STYLES.get(detection.machine_kind, CRANE_CATALOG_STYLES["person"])["color"]
        elif detection.behavior == "crane_proximity":
            color = CRANE_CATALOG_STYLES["crane_proximity"]["color"]
        elif detection.behavior == "person":
            color = CRANE_CATALOG_STYLES["person"]["color"]
        else:
            color = CRANE_CATALOG_STYLES.get(detection.behavior, CRANE_CATALOG_STYLES["person"])["color"]
        thickness = 3 if emphasis and detection.behavior == "crane_proximity" else 2
        suffix = ""
        if detection.behavior == "crane_proximity" and detection.distance_m is not None:
            suffix = format_distance_suffix_meters(float(detection.distance_m))
        draw_violation_roi_annotation(
            annotated,
            x1,
            y1,
            x2,
            y2,
            color,
            behavior=detection.behavior,
            scenario_id=getattr(detection, "scenario_id", None),
            confidence=float(detection.confidence),
            thickness=thickness,
            machine_kind=getattr(detection, "machine_kind", None),
            suffix=suffix,
        )
        return annotated

    @classmethod
    def _draw_crane_snapshot(
        cls,
        frame: np.ndarray,
        primary: CraneProximityDetection,
        *,
        person_bbox: Optional[list[float]] = None,
        machine_bbox: Optional[list[float]] = None,
    ) -> np.ndarray:
        """Snapshot DZ — chỉ người vi phạm + máy liên quan, không vẽ toàn bộ context."""
        annotated = frame.copy()
        _ = person_bbox if person_bbox and len(person_bbox) >= 4 else primary.bbox

        if machine_bbox and len(machine_bbox) >= 4:
            machine_det = CraneProximityDetection(
                behavior="crane",
                label=primary.label,
                scenario_id=primary.scenario_id,
                confidence=primary.confidence,
                bbox=[float(v) for v in machine_bbox],
                machine_kind=primary.machine_kind,
            )
            cls._draw_crane_bbox(annotated, machine_det, emphasis=False, copy_frame=False)

        cls._draw_crane_bbox(annotated, primary, emphasis=True, copy_frame=False)
        return annotated

    @staticmethod
    def _draw_road_bbox(frame: np.ndarray, detection: RoadDetection) -> np.ndarray:
        annotated = frame.copy()
        x1, y1, x2, y2 = [int(v) for v in detection.bbox]
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        colors = {
            "mud": (0, 180, 255),
            "water": (255, 160, 0),
            "object": (0, 140, 255),
            "unknown": (160, 160, 160),
            "mesh_missing": (0, 220, 120),  # xanh — thiếu/rách
            "mesh_torn": (0, 200, 100),
            "mesh_dirty": (14, 64, 146),  # nâu #92400e — bẩn (đồng bộ FE)
        }
        color = colors.get(detection.behavior, (0, 255, 0))
        draw_violation_roi_annotation(
            annotated,
            x1,
            y1,
            x2,
            y2,
            color,
            behavior=detection.behavior,
            scenario_id=getattr(detection, "scenario_id", None),
            confidence=float(detection.confidence),
            thickness=1,
        )
        return annotated

    @staticmethod
    def _draw_pccc_snapshot(
        frame: np.ndarray,
        detection: Detection,
        person_bbox: Optional[list[float]] = None,
    ) -> np.ndarray:
        """Snapshot PCCC — chỉ ROI vi phạm (solid). Bbox người (info) chỉ trên live overlay."""
        _ = person_bbox
        annotated = frame.copy()
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in detection.bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        color = (0, 140, 255) if detection.behavior == "smoking" else (0, 0, 255)
        draw_violation_roi_annotation(
            annotated,
            x1,
            y1,
            x2,
            y2,
            color,
            behavior=detection.behavior,
            scenario_id=getattr(detection, "scenario_id", None),
            confidence=float(detection.confidence),
            thickness=2,
        )
        return annotated

    @staticmethod
    def _draw_bbox(frame: np.ndarray, detection: Detection) -> np.ndarray:
        annotated = frame.copy()
        x1, y1, x2, y2 = [int(v) for v in detection.bbox]
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        color = (0, 140, 255) if detection.behavior == "smoking" else (0, 0, 255)
        draw_violation_roi_annotation(
            annotated,
            x1,
            y1,
            x2,
            y2,
            color,
            behavior=detection.behavior,
            scenario_id=getattr(detection, "scenario_id", None),
            confidence=float(detection.confidence),
            thickness=2,
        )
        return annotated

    def _append_to_disk(self, event: ViolationEvent) -> None:
        day = event.event_date or _event_date(event.created_at)
        path = _daily_events_file(day)
        try:
            with open(path, "a", encoding="utf-8") as f:
                f.write(event.model_dump_json() + "\n")
        except OSError as exc:
            logger.warning("Không ghi được events theo ngày (%s): %s", day, exc)

    def list_events(
        self,
        limit: int = 50,
        date: Optional[str] = None,
        camera_id: Optional[str] = None,
    ) -> list[ViolationEvent]:
        if date:
            rows = self._read_events_file(_daily_events_file(date))
            with self._lock:
                for event in self._events:
                    if (event.event_date or _event_date(event.created_at)) == date:
                        rows.append(event)
        else:
            with self._lock:
                rows = list(self._events)
        deduped = dedupe_events_by_key(
            rows,
            window_seconds=settings.event_first_seen_window_effective,
        )
        deduped.sort(key=lambda e: e.created_at, reverse=True)
        if camera_id:
            deduped = [event for event in deduped if event.camera_id == camera_id]
        return deduped[:limit]

    def get_event(self, event_id: str) -> Optional[ViolationEvent]:
        with self._lock:
            for event in self._events:
                if event.id == event_id:
                    return event
        if EVENTS_DIR.exists():
            for day_dir in sorted(EVENTS_DIR.iterdir(), reverse=True):
                if not day_dir.is_dir():
                    continue
                for event in self._read_events_file(day_dir / "events.jsonl"):
                    if event.id == event_id:
                        return event
        return None

    def list_event_dates(self) -> list[str]:
        dates: set[str] = set()
        if EVENTS_DIR.exists():
            for child in EVENTS_DIR.iterdir():
                if child.is_dir() and (child / "events.jsonl").exists():
                    dates.add(child.name)
        with self._lock:
            for event in self._events:
                if event.event_date:
                    dates.add(event.event_date)
        return sorted(dates, reverse=True)

    def newest_id(self) -> Optional[str]:
        with self._lock:
            return self._events[0].id if self._events else None

    def clear_all(self) -> dict[str, int]:
        """Xóa toàn bộ sự kiện trong RAM và trên đĩa (JSONL + snapshot)."""
        removed_memory = 0
        removed_files = 0
        with self._lock:
            removed_memory = len(self._events)
            self._events.clear()

        if LEGACY_EVENTS_FILE.exists():
            LEGACY_EVENTS_FILE.unlink(missing_ok=True)
            removed_files += 1

        if EVENTS_DIR.exists():
            for day_dir in EVENTS_DIR.iterdir():
                if not day_dir.is_dir():
                    continue
                events_file = day_dir / "events.jsonl"
                if events_file.exists():
                    events_file.unlink(missing_ok=True)
                    removed_files += 1

        if SNAPSHOT_DIR.exists():
            for jpg in SNAPSHOT_DIR.rglob("*.jpg"):
                jpg.unlink(missing_ok=True)
                removed_files += 1

        dedup_keys = self._dedup.clear()

        from .vms_loop_state import reset_all as reset_vms_loops
        from .engine_loop_reset import reset_all_engines

        reset_vms_loops()
        reset_all_engines()

        logger.info(
            "Đã xóa sự kiện: %d trong RAM, %d file trên đĩa, %d khóa dedup",
            removed_memory,
            removed_files,
            dedup_keys,
        )
        return {"memory": removed_memory, "files": removed_files, "dedup_keys": dedup_keys}

    def resolve_snapshot_path(self, event_id: str, snapshot_file: Optional[str] = None) -> Optional[Path]:
        if snapshot_file:
            dated = SNAPSHOT_DIR / snapshot_file
            if dated.exists():
                return dated
        legacy = SNAPSHOT_DIR / f"{event_id}.jpg"
        if legacy.exists():
            return legacy
        matches = list(SNAPSHOT_DIR.rglob(f"{event_id}.jpg"))
        return matches[0] if matches else None
