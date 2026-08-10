"""Debounced ATGT events — vượt tốc độ theo xe + làn phân cách cứng (Cam A-03)."""

from __future__ import annotations

import logging
import time

import numpy as np

from .atgt_analyzer import (
    _HARD_MEDIAN_CONF,
    _SOFT_MEDIAN_CONF,
    analyze_atgt_frame,
)
from .config import settings
from .events import EventStore, PersistenceDebouncer
from .atgt_plate_reader import read_vehicle_plate
from .schemas import Detection, ViolationEvent
from .snapshot_sync import build_snapshot_episode, frame_scale, merge_episode_best, scale_bbox
from .violation_thresholds import VIOLATION_CONFIRM_SECONDS, VIOLATION_MAX_GAP_SECONDS, VIOLATION_MIN_CONFIDENCE

logger = logging.getLogger("atgt_engine")

_CONFIRM_SECONDS = VIOLATION_CONFIRM_SECONDS
_REPEAT_SECONDS = settings.atgt_event_repeat_seconds
_MAX_GAP_SECONDS = VIOLATION_MAX_GAP_SECONDS
_MIN_CONF = VIOLATION_MIN_CONFIDENCE
_MAX_TRACKS = 12
_TRACK_EXPIRE_SECONDS = 4.0
_EVENT_BEHAVIORS = frozenset({"speeding", "no_soft_median"})


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


def _lane_present(detections: list[Detection], frame_w: int, frame_h: int) -> bool:
    for det in detections:
        if det.behavior == "soft_median" and det.confidence >= _SOFT_MEDIAN_CONF:
            return True
        if det.behavior != "hard_median" or det.confidence < _HARD_MEDIAN_CONF:
            continue
        x1, y1, x2, y2 = det.bbox
        span = max(float(x2 - x1), 0.0)
        if span >= frame_w * 0.34:
            return True
    return False


def _enrich_vehicle_plates(
    frame: np.ndarray,
    detections: list[Detection],
    *,
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
        plate = read_vehicle_plate(source, bbox)
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

    def _gate_for(self, camera_id: str, track_id: str) -> PersistenceDebouncer:
        if camera_id not in self._gates:
            self._gates[camera_id] = {}
        if track_id not in self._gates[camera_id]:
            self._gates[camera_id][track_id] = PersistenceDebouncer(
                min_duration_seconds=_CONFIRM_SECONDS,
                cooldown_seconds=_REPEAT_SECONDS,
                max_gap_seconds=_MAX_GAP_SECONDS,
                one_event_per_episode=True,
            )
        return self._gates[camera_id][track_id]

    def _collect_detections(self, frame: np.ndarray, camera_id: str) -> list[Detection]:
        return analyze_atgt_frame(frame, camera_id)

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
            ocr_frame=snapshot_source if capture_frame is not None else None,
            ocr_scale=(sx, sy),
        )
        tracks = self._tracks_for(camera_id)
        frame_h, frame_w = frame.shape[:2]
        now = time.time()
        new_events: list[ViolationEvent] = []
        matched_ids: set[str] = set()

        vehicles = [d for d in detections if d.behavior == "vehicle"]
        violations = [
            d for d in detections
            if d.behavior in _EVENT_BEHAVIORS and d.confidence >= _MIN_CONF
        ]

        for det in violations:
            if det.behavior == "no_soft_median" and _lane_present(detections, frame_w, frame_h):
                continue
            vehicle_bbox: list[float] | None = None
            if det.behavior == "speeding":
                vehicle = _match_vehicle(det, vehicles)
                if vehicle is None:
                    continue
                vehicle_bbox = [float(v) for v in vehicle.bbox]
                slot = _vehicle_slot(vehicle_bbox, frame_w, frame_h)
                track_id = f"{slot}:speeding"
            else:
                slot = "lane"
                track_id = "lane:no_soft_median"
            if track_id not in tracks:
                if len(tracks) >= _MAX_TRACKS:
                    continue
                tracks[track_id] = _AtgtTrack()
                self._gate_for(camera_id, track_id).reset()
            state = tracks[track_id]
            matched_ids.add(track_id)
            if vehicle_bbox:
                state.vehicle_bbox = vehicle_bbox
            state.last_seen = now
            gate = self._gate_for(camera_id, track_id)
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
                if not top.vehicle_plate and pending.get("vehicle_bbox"):
                    retry_plate = read_vehicle_plate(
                        pending["frame"],
                        pending["vehicle_bbox"],
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
            gate = self._gate_for(camera_id, track_id)
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
