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

from .crane_detection_catalog import CRANE_CATALOG_STYLES
from .config import settings
from .event_dedup import EventDedupRegistry, build_dedup_key, dedupe_events_by_key
from .schemas import ATGT_SCENARIO_META, Detection, PpeDetection, RoadDetection, CraneProximityDetection, ViolationEvent

logger = logging.getLogger("events")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SNAPSHOT_DIR = DATA_DIR / "snapshots"
EVENTS_DIR = DATA_DIR / "events"
LEGACY_EVENTS_FILE = DATA_DIR / "events.jsonl"


def _event_date(ts: Optional[float] = None) -> str:
    return datetime.fromtimestamp(ts or time.time()).strftime("%Y-%m-%d")


def _daily_events_file(date: str) -> Path:
    folder = EVENTS_DIR / date
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "events.jsonl"


def _daily_snapshot_dir(date: str) -> Path:
    folder = SNAPSHOT_DIR / date
    folder.mkdir(parents=True, exist_ok=True)
    return folder


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

    def register(self, hit: bool) -> bool:
        now = time.time()

        if hit and self._last_hit_at is not None and now - self._last_hit_at > self.max_gap_seconds:
            self._reset_episode()

        if hit:
            if self._active_since is None:
                self._active_since = now
            self._last_hit_at = now
        elif self._last_hit_at is not None and now - self._last_hit_at > self.max_gap_seconds:
            self._reset_episode()

        if not hit or self._active_since is None:
            return False

        if self.one_event_per_episode and self._logged_this_episode:
            return False

        if now - self._active_since < self.min_duration_seconds:
            return False

        if not self.one_event_per_episode and now - self._last_confirmed_at < self.cooldown_seconds:
            return False

        self._last_confirmed_at = now
        if self.one_event_per_episode:
            self._logged_this_episode = True
        return True

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


class Debouncer:
    """Legacy hit-window debouncer — giữ cho tương thích test."""

    def __init__(self, hits: int, window: int, cooldown_seconds: float):
        self.hits_required = hits
        self.window = deque(maxlen=window)
        self.cooldown_seconds = cooldown_seconds
        self._last_confirmed_at: float = 0.0

    def register(self, hit: bool) -> bool:
        self.window.append(hit)
        if sum(self.window) < self.hits_required:
            return False
        now = time.time()
        if now - self._last_confirmed_at < self.cooldown_seconds:
            return False
        self._last_confirmed_at = now
        return True


class EventStore:
    """Lưu event RAM + JSONL theo ngày + snapshot ảnh theo ngày."""

    def __init__(self, max_in_memory: int = 200):
        self._events: deque[ViolationEvent] = deque(maxlen=max_in_memory)
        self._lock = threading.Lock()
        self._dedup = EventDedupRegistry(settings.event_rapid_dedup_seconds)
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

    def _finalize_event(
        self,
        event: ViolationEvent,
        annotated: np.ndarray,
        dedup_key: str,
        log_template: str,
        *log_args: object,
    ) -> Optional[ViolationEvent]:
        if self._dedup.should_skip(dedup_key):
            return None

        event.dedup_key = dedup_key
        event_date = event.event_date or _event_date(event.created_at)
        h, w = annotated.shape[:2]
        event.frame_width = int(w)
        event.frame_height = int(h)
        snapshot_name = f"{event_date}/{event.id}.jpg"
        snapshot_path = _daily_snapshot_dir(event_date) / f"{event.id}.jpg"
        cv2.imwrite(str(snapshot_path), annotated)
        event.snapshot_file = snapshot_name

        with self._lock:
            self._events.appendleft(event)
        self._append_to_disk(event)
        self._dedup.register(dedup_key, event.created_at)
        logger.info(log_template, *log_args)
        return event

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
        annotated = self._draw_bbox(frame, detection)
        return self._finalize_event(
            event,
            annotated,
            key,
            "Sự kiện mới [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
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
        annotated = self._draw_road_bbox(frame, detection)
        return self._finalize_event(
            event,
            annotated,
            key,
            "Sự kiện road [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
        )

    def add_crane(
        self,
        detection: CraneProximityDetection,
        frame: np.ndarray,
        *,
        camera_id: str = "A-04",
        context: Optional[list[CraneProximityDetection]] = None,
        dedup_key: Optional[str] = None,
    ) -> Optional[ViolationEvent]:
        event_date = _event_date()
        event = ViolationEvent.from_crane_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        key = dedup_key or build_dedup_key(camera_id, event.scenario_id, "proximity")
        annotated = self._draw_crane_snapshot(frame, detection, context)
        return self._finalize_event(
            event,
            annotated,
            key,
            "Sự kiện crane [%s]: %s (%s) conf=%.2f dist=%s",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
            getattr(detection, "distance_m", None),
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
        event_date = _event_date()
        event = ViolationEvent.from_ppe_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        if person_bbox and len(person_bbox) >= 4:
            event.subject_bbox = [float(v) for v in person_bbox]
        stable_track = track_id or detection.behavior
        key = dedup_key or build_dedup_key(camera_id, event.scenario_id, stable_track)
        annotated = self._draw_ppe_snapshot(frame, detection, person_bbox)
        return self._finalize_event(
            event,
            annotated,
            key,
            "Sự kiện PPE [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
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
        annotated = self._draw_wah_snapshot(frame, detection, person_bbox)
        return self._finalize_event(
            event,
            annotated,
            key,
            "Sự kiện WAH [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
        )

    @classmethod
    def _draw_wah_snapshot(
        cls,
        frame: np.ndarray,
        detection: Detection,
        person_bbox: Optional[list[float]] = None,
    ) -> np.ndarray:
        annotated = frame.copy()
        h, w = frame.shape[:2]
        if person_bbox and len(person_bbox) >= 4:
            px1, py1, px2, py2 = [int(v) for v in person_bbox]
            px1, py1 = max(0, px1), max(0, py1)
            px2, py2 = min(w - 1, px2), min(h - 1, py2)
            cv2.rectangle(annotated, (px1, py1), (px2, py2), (255, 200, 80), 1)
        x1, y1, x2, y2 = [int(v) for v in detection.bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        color = (0, 140, 255)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{detection.label} {detection.confidence * 100:.0f}%"
        cv2.putText(
            annotated, label, (x1, max(y1 - 8, 12)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
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
        plate = getattr(detection, "vehicle_plate", None)
        stable_track = track_id or (plate if plate else detection.behavior)
        key = dedup_key or build_dedup_key(camera_id, event.scenario_id, stable_track)
        annotated = self._draw_atgt_snapshot(frame, detection, vehicle_bbox)
        return self._finalize_event(
            event,
            annotated,
            key,
            "Sự kiện ATGT [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
        )

    @classmethod
    def _draw_atgt_snapshot(
        cls,
        frame: np.ndarray,
        detection: Detection,
        vehicle_bbox: Optional[list[float]] = None,
    ) -> np.ndarray:
        annotated = frame.copy()
        h, w = frame.shape[:2]
        if vehicle_bbox and len(vehicle_bbox) >= 4:
            vx1, vy1, vx2, vy2 = [int(v) for v in vehicle_bbox]
            vx1, vy1 = max(0, vx1), max(0, vy1)
            vx2, vy2 = min(w - 1, vx2), min(h - 1, vy2)
            cv2.rectangle(annotated, (vx1, vy1), (vx2, vy2), (180, 180, 180), 1)
        x1, y1, x2, y2 = [int(v) for v in detection.bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        colors = {
            "speeding": (0, 120, 255),
            "hard_median": (255, 200, 0),
            "no_soft_median": (200, 80, 255),
        }
        color = colors.get(detection.behavior, (0, 200, 255))
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        meta = ATGT_SCENARIO_META.get(detection.behavior, {})
        snapshot_banners = {
            "speeding": "ATGT-002 · Phuong tien vuot qua toc do quy dinh",
            "no_soft_median": "ATGT-004 · Khong to chuc phan lan, luong giao thong",
        }
        base = snapshot_banners.get(
            detection.behavior,
            meta.get("scenario_id", "ATGT"),
        )
        plate = getattr(detection, "vehicle_plate", None)
        if plate and detection.behavior == "speeding":
            base = f"{base} · {plate}"
        banner = f"{base} · {detection.confidence * 100:.0f}%"
        cv2.rectangle(annotated, (0, 0), (w - 1, 28), (8, 40, 60), -1)
        cv2.putText(
            annotated, banner, (8, 20),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1,
        )
        return annotated

    @classmethod
    def _draw_ppe_snapshot(
        cls,
        frame: np.ndarray,
        detection: PpeDetection,
        person_bbox: Optional[list[float]] = None,
    ) -> np.ndarray:
        annotated = frame.copy()
        if person_bbox and len(person_bbox) >= 4:
            px1, py1, px2, py2 = [int(v) for v in person_bbox]
            h, w = frame.shape[:2]
            px1, py1 = max(0, px1), max(0, py1)
            px2, py2 = min(w - 1, px2), min(h - 1, py2)
            cv2.rectangle(annotated, (px1, py1), (px2, py2), (255, 200, 80), 1)
        return cls._draw_ppe_bbox(annotated, detection, copy_frame=False)

    @staticmethod
    def _draw_ppe_bbox(
        frame: np.ndarray,
        detection: PpeDetection,
        *,
        copy_frame: bool = True,
    ) -> np.ndarray:
        annotated = frame.copy() if copy_frame else frame
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
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{detection.label} {detection.confidence * 100:.0f}%"
        cv2.putText(
            annotated, label, (x1, max(y1 - 8, 12)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2,
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
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, thickness)
        dist = f" · {detection.distance_m:.2f}m" if detection.distance_m is not None else ""
        label = f"{detection.label} {detection.confidence * 100:.0f}%{dist}"
        cv2.putText(
            annotated, label, (x1, max(y1 - 8, 12)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2,
        )
        return annotated

    @classmethod
    def _draw_crane_snapshot(
        cls,
        frame: np.ndarray,
        primary: CraneProximityDetection,
        context: Optional[list[CraneProximityDetection]] = None,
    ) -> np.ndarray:
        annotated = frame.copy()
        for det in context or []:
            if det.behavior == primary.behavior and det.bbox == primary.bbox:
                continue
            cls._draw_crane_bbox(annotated, det, emphasis=False, copy_frame=False)
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
            "mesh_missing": (0, 220, 120),
            "mesh_torn": (0, 180, 80),
            "mesh_dirty": (40, 180, 40),
        }
        color = colors.get(detection.behavior, (0, 255, 0))
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{detection.label} {detection.confidence:.2f}"
        cv2.putText(
            annotated, label, (x1, max(y1 - 8, 12)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2,
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
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{detection.label} {detection.confidence:.2f}"
        cv2.putText(
            annotated, label, (x1, max(y1 - 8, 12)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
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

    def list_events(self, limit: int = 50, date: Optional[str] = None) -> list[ViolationEvent]:
        if date:
            rows = self._read_events_file(_daily_events_file(date))
        else:
            with self._lock:
                rows = list(self._events)
        deduped = dedupe_events_by_key(rows)
        deduped.sort(key=lambda e: e.created_at, reverse=True)
        return deduped[:limit]

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

        logger.info(
            "Đã xóa sự kiện: %d trong RAM, %d file trên đĩa",
            removed_memory,
            removed_files,
        )
        return {"memory": removed_memory, "files": removed_files}

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
