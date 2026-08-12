"""Debounced ATGT events — vượt tốc độ (ATGT-002) + thiếu phân làn (ATGT-004, Cam A-03).

hard_median / soft_median chỉ dùng overlay — không ghi sự kiện vi phạm.
"""

from __future__ import annotations

import logging
import time

import numpy as np

from .atgt_analyzer import (
    _HARD_MEDIAN_CONF,
    _SOFT_MEDIAN_CONF,
    _roi_mask,
    analyze_atgt_frame,
    lane_detection_inside_road,
)
from .config import settings
from .events import EventStore, PersistenceDebouncer
from .atgt_plate_reader import resolve_vehicle_plate
from .schemas import Detection, ViolationEvent
from .snapshot_sync import build_snapshot_episode, frame_scale, merge_episode_best, scale_bbox
from .violation_thresholds import VIOLATION_CONFIRM_SECONDS, VIOLATION_MAX_GAP_SECONDS, VIOLATION_MIN_CONFIDENCE, get_threshold

logger = logging.getLogger("atgt_engine")

_CONFIRM_SECONDS = VIOLATION_CONFIRM_SECONDS
_REPEAT_SECONDS = settings.atgt_event_repeat_seconds
_MAX_GAP_SECONDS = VIOLATION_MAX_GAP_SECONDS
_MIN_CONF = VIOLATION_MIN_CONFIDENCE
_MAX_TRACKS = 12
_TRACK_EXPIRE_SECONDS = 4.0
_EVENT_BEHAVIORS_ALL = frozenset({"speeding", "no_soft_median"})


def _event_behaviors() -> frozenset[str]:
    if settings.atgt_lane_violation_only:
        return frozenset({"no_soft_median"})
    return _EVENT_BEHAVIORS_ALL


class _AtgtTrack:
    __slots__ = ("episode_best", "last_seen", "vehicle_bbox")

    def __init__(self) -> None:
        self.episode_best: dict | None = None
        self.last_seen: float = time.time()
        self.vehicle_bbox: list[float] = []


def _bbox_center(bbox: list[float] | tuple[float, ...]) -> tuple[float, float]:
    return (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2


def _center_inside(inner: list[float], outer: list[float]) -> bool:
    cx, cy = _bbox_center(inner)
    return outer[0] <= cx <= outer[2] and outer[1] <= cy <= outer[3]


def _vehicle_slot(vehicle_bbox: list[float], frame_w: int, frame_h: int) -> str:
    cx, cy = _bbox_center(vehicle_bbox)
    gx = min(7, int(cx / max(frame_w / 8, 1)))
    gy = min(5, int(cy / max(frame_h / 6, 1)))
    return f"v{gy}{gx}"


def _match_vehicle(violation: Detection, vehicles: list[Detection]) -> Detection | None:
    best: Detection | None = None
    best_area = float("inf")
    for vehicle in vehicles:
        vb = vehicle.bbox
        if not _center_inside(violation.bbox, vb):
            continue
        area = (vb[2] - vb[0]) * (vb[3] - vb[1])
        if area < best_area:
            best_area = area
            best = vehicle
    return best


def _lane_present(
    detections: list[Detection],
    frame_w: int,
    frame_h: int,
    violation_bbox: list[float] | tuple[float, ...] | None = None,
    *,
    road_mask: np.ndarray | None = None,
) -> bool:
    """Có phân cách hợp lệ trong polygon ROAD che vùng vi phạm."""
    vcx = None
    if violation_bbox is not None and len(violation_bbox) >= 4:
        vcx = (float(violation_bbox[0]) + float(violation_bbox[2])) / 2.0
    for det in detections:
        if road_mask is not None and not lane_detection_inside_road(det.bbox, road_mask):
            continue
        if det.behavior == "soft_median" and det.confidence >= _SOFT_MEDIAN_CONF:
            x1, _y1, x2, _y2 = det.bbox
            span = max(float(x2 - x1), 0.0)
            dcx = (x1 + x2) / 2.0
            if (
                road_mask is None
                and vcx is not None
                and vcx < frame_w * 0.20
                and x1 <= frame_w * 0.05
                and span >= frame_w * 0.22
            ):
                continue
            if (
                road_mask is None
                and vcx is not None
                and dcx > frame_w * 0.55
                and vcx < frame_w * 0.42
            ):
                continue
            if vcx is not None and violation_bbox is not None:
                ix1 = max(float(violation_bbox[0]), det.bbox[0])
                iy1 = max(float(violation_bbox[1]), det.bbox[1])
                ix2 = min(float(violation_bbox[2]), det.bbox[2])
                iy2 = min(float(violation_bbox[3]), det.bbox[3])
                if ix2 <= ix1 or iy2 <= iy1:
                    continue
            return True
        if det.behavior != "hard_median" or det.confidence < _HARD_MEDIAN_CONF:
            continue
        x1, y1, x2, y2 = det.bbox
        span = max(float(x2 - x1), 0.0)
        if span >= frame_w * 0.34:
            return True
    return False


def _lane_organized_in_road(
    detections: list[Detection],
    *,
    road_mask: np.ndarray | None = None,
) -> bool:
    """Đã có phân làn (cứng/mềm) trong polygon ROAD — không ghi ATGT-004."""
    for det in detections:
        if road_mask is not None and not lane_detection_inside_road(det.bbox, road_mask):
            continue
        if det.behavior == "soft_median" and det.confidence >= _SOFT_MEDIAN_CONF:
            return True
        if det.behavior == "hard_median" and det.confidence >= _HARD_MEDIAN_CONF:
            return True
    return False


def _confirm_seconds(behavior: str) -> float:
    if settings.atgt_demo_enabled:
        if behavior == "speeding":
            return settings.atgt_demo_confirm_seconds
        if behavior == "no_soft_median":
            # VMS 6fps: mỗi giây video ≈ 1s wall — confirm ngắn để kịp log trong 1 loop.
            return min(get_threshold("ATGT-004").confirm_seconds, 0.85)
    scenario_id = "ATGT-002" if behavior == "speeding" else "ATGT-004"
    return get_threshold(scenario_id).confirm_seconds


def _max_gap_seconds(behavior: str) -> float:
    if settings.atgt_demo_enabled and behavior == "speeding":
        return settings.atgt_demo_max_gap_seconds
    return _MAX_GAP_SECONDS


def _enrich_vehicle_plates(
    frame: np.ndarray,
    detections: list[Detection],
    *,
    camera_id: str,
    ocr_frame: np.ndarray | None = None,
    ocr_scale: tuple[float, float] = (1.0, 1.0),
) -> None:
    source = ocr_frame if ocr_frame is not None else frame
    sx, sy = ocr_scale
    for det in detections:
        if det.behavior not in ("vehicle", "speeding"):
            continue
        if det.vehicle_plate:
            continue
        bbox = det.bbox
        if sx != 1.0 or sy != 1.0:
            bbox = scale_bbox(det.bbox, sx, sy)
        plate = resolve_vehicle_plate(source, bbox, camera_id=camera_id)
        if not plate:
            continue
        det.vehicle_plate = plate
        if det.behavior == "vehicle":
            det.label = f"{det.vehicle_type or 'Phương tiện'} · {plate}"


class AtgtEngine:
    def __init__(self, store: EventStore):
        self.store = store
        self._tracks: dict[str, dict[str, _AtgtTrack]] = {}
        self._gates: dict[str, dict[str, PersistenceDebouncer]] = {}

    def _tracks_for(self, camera_id: str) -> dict[str, _AtgtTrack]:
        if camera_id not in self._tracks:
            self._tracks[camera_id] = {}
        return self._tracks[camera_id]

    def _gate_for(self, camera_id: str, track_id: str, *, behavior: str) -> PersistenceDebouncer:
        if camera_id not in self._gates:
            self._gates[camera_id] = {}
        if track_id not in self._gates[camera_id]:
            self._gates[camera_id][track_id] = PersistenceDebouncer(
                min_duration_seconds=_confirm_seconds(behavior),
                cooldown_seconds=settings.event_repeat_seconds(_REPEAT_SECONDS),
                max_gap_seconds=_max_gap_seconds(behavior),
                one_event_per_episode=settings.event_log_one_per_episode,
            )
        return self._gates[camera_id][track_id]

    def _collect_detections(self, frame: np.ndarray, camera_id: str) -> list[Detection]:
        return analyze_atgt_frame(frame, camera_id)

    def reset_camera(self, camera_id: str) -> None:
        self._tracks.pop(camera_id, None)
        self._gates.pop(camera_id, None)

    def process_frame(
        self,
        frame: np.ndarray,
        camera_id: str,
        *,
        capture_frame: np.ndarray | None = None,
    ) -> tuple[dict, list[ViolationEvent]]:
        snapshot_source = capture_frame if capture_frame is not None else frame
        detections = self._collect_detections(frame, camera_id)
        sx, sy = frame_scale(frame, snapshot_source) if capture_frame is not None else (1.0, 1.0)
        _enrich_vehicle_plates(
            frame,
            detections,
            camera_id=camera_id,
            ocr_frame=snapshot_source if capture_frame is not None else None,
            ocr_scale=(sx, sy),
        )
        tracks = self._tracks_for(camera_id)
        frame_h, frame_w = frame.shape[:2]
        road_mask = _roi_mask(camera_id, frame_w, frame_h)
        lane_organized = _lane_organized_in_road(detections, road_mask=road_mask)
        now = time.time()
        new_events: list[ViolationEvent] = []
        matched_ids: set[str] = set()

        if lane_organized:
            lane_track = tracks.get("lane:no_soft_median")
            if lane_track is not None:
                self._gate_for(camera_id, "lane:no_soft_median", behavior="no_soft_median").reset()
                lane_track.episode_best = None

        vehicles = [d for d in detections if d.behavior == "vehicle"]
        violations = [
            d for d in detections
            if d.behavior in _event_behaviors()
            and d.confidence >= _MIN_CONF
        ]

        for det in violations:
            if det.behavior == "no_soft_median" and (
                lane_organized
                or _lane_present(
                    detections, frame_w, frame_h, det.bbox, road_mask=road_mask,
                )
            ):
                continue
            vehicle_bbox: list[float] | None = None
            if det.behavior == "speeding":
                vehicle = _match_vehicle(det, vehicles)
                if vehicle is not None:
                    vehicle_bbox = [float(v) for v in vehicle.bbox]
                else:
                    vehicle_bbox = [float(v) for v in det.bbox]
                slot = _vehicle_slot(vehicle_bbox, frame_w, frame_h)
                track_id = f"{slot}:speeding"
                lane_behavior = "speeding"
            else:
                slot = "lane"
                track_id = "lane:no_soft_median"
                lane_behavior = "no_soft_median"
            if track_id not in tracks:
                if len(tracks) >= _MAX_TRACKS:
                    continue
                tracks[track_id] = _AtgtTrack()
                self._gate_for(camera_id, track_id, behavior=lane_behavior).reset()
            state = tracks[track_id]
            matched_ids.add(track_id)
            if vehicle_bbox:
                state.vehicle_bbox = vehicle_bbox
            state.last_seen = now
            gate = self._gate_for(camera_id, track_id, behavior=lane_behavior)
            state.episode_best = merge_episode_best(
                state.episode_best,
                detection=det,
                analyze_frame=frame,
                capture_frame=snapshot_source,
                extra={"vehicle_bbox": vehicle_bbox},
            )
            confirmed = gate.register(True)
            if confirmed and state.episode_best:
                pending = state.episode_best
                state.episode_best = None
                top = pending["detection"]
                if top.behavior == "speeding" and settings.atgt_demo_enabled:
                    if not top.vehicle_plate and top.confidence < 0.82:
                        continue
                if not top.vehicle_plate and pending.get("vehicle_bbox"):
                    retry_plate = resolve_vehicle_plate(
                        pending["frame"],
                        pending["vehicle_bbox"],
                        camera_id=camera_id,
                    )
                    if retry_plate:
                        top = top.model_copy(update={"vehicle_plate": retry_plate})
                event = self.store.add_atgt(
                    top,
                    pending["frame"],
                    camera_id=camera_id,
                    vehicle_bbox=pending.get("vehicle_bbox"),
                    track_id=track_id,
                )
                if event:
                    new_events.append(event)
                    logger.info(
                        "ATGT %s [%s] slot=%s conf=%.0f%%",
                        top.behavior,
                        event.id,
                        slot,
                        event.confidence * 100,
                    )

        for track_id, state in list(tracks.items()):
            if track_id in matched_ids:
                continue
            if track_id.endswith(":speeding"):
                behavior = "speeding"
            else:
                behavior = "no_soft_median"
            gate = self._gate_for(camera_id, track_id, behavior=behavior)
            gate.register(False)
            if not gate.snapshot()["active"]:
                state.episode_best = None

        for track_id, state in list(tracks.items()):
            if now - state.last_seen > _TRACK_EXPIRE_SECONDS:
                tracks.pop(track_id, None)

        payload = {
            "type": "result",
            "camera_id": camera_id,
            "width": int(frame.shape[1]),
            "height": int(frame.shape[0]),
            "detections": [d.model_dump() for d in detections],
            "events": [e.model_dump() for e in new_events],
        }
        return payload, new_events
