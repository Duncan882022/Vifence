"""Debounced ATGT events — vượt tốc độ theo xe + làn phân cách cứng (Cam A-03)."""

from __future__ import annotations

import logging
import time

import numpy as np

from .config import settings
from .events import EventStore, PersistenceDebouncer
from .atgt_demo import match_demo_detections
from .atgt_plate_reader import read_vehicle_plate
from .schemas import Detection, ViolationEvent
from .violation_thresholds import VIOLATION_MIN_CONFIDENCE

logger = logging.getLogger("atgt_engine")

_CONFIRM_SECONDS = 0.0
_REPEAT_SECONDS = settings.atgt_event_repeat_seconds
_MAX_GAP_SECONDS = 3.0
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


def _lane_present(detections: list[Detection]) -> bool:
    return any(
        d.behavior in ("hard_median", "soft_median") and d.confidence >= 0.0
        for d in detections
    )


def _enrich_vehicle_plates(frame: np.ndarray, detections: list[Detection]) -> None:
    for det in detections:
        if det.behavior not in ("vehicle", "speeding"):
            continue
        if det.vehicle_plate:
            continue
        plate = read_vehicle_plate(frame, det.bbox)
        if not plate:
            continue
        det.vehicle_plate = plate
        if det.behavior == "vehicle":
            det.label = f"Ô tô · {plate}"


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
        demo = match_demo_detections(frame, camera_id)
        if demo:
            return demo
        return []

    def process_frame(self, frame: np.ndarray, camera_id: str) -> tuple[dict, list[ViolationEvent]]:
        detections = self._collect_detections(frame, camera_id)
        _enrich_vehicle_plates(frame, detections)
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
            if det.behavior == "no_soft_median" and _lane_present(detections):
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
            if state.episode_best is None or det.confidence > state.episode_best["detection"].confidence:
                state.episode_best = {
                    "detection": det,
                    "frame": frame.copy(),
                    "vehicle_bbox": vehicle_bbox,
                }
            confirmed = gate.register(True)
            if confirmed and state.episode_best:
                pending = state.episode_best
                state.episode_best = None
                top = pending["detection"]
                event = self.store.add_atgt(
                    top,
                    pending["frame"],
                    camera_id=camera_id,
                    vehicle_bbox=pending.get("vehicle_bbox"),
                )
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
