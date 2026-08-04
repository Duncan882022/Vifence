"""Debounced crane-proximity events — Cam A-04 (≥ 3s, lặp 2 giờ)."""

from __future__ import annotations

import logging
import time

import numpy as np

from .config import settings
from .crane_proximity_analyzer import analyze_crane_proximity_frame
from .crane_roi_config import EVENT_MIN_CONFIDENCE
from .events import EventStore, PersistenceDebouncer
from .schemas import CraneProximityDetection, ViolationEvent

logger = logging.getLogger("crane_proximity_engine")

_CONFIRM_SECONDS = 3.0
_REPEAT_SECONDS = settings.crane_event_repeat_seconds
_MAX_GAP_SECONDS = 3.0
_TRACK_EXPIRE_SECONDS = 4.0


class _ProximityTrack:
    __slots__ = ("episode_best", "last_bbox", "last_seen")

    def __init__(self) -> None:
        self.episode_best: dict | None = None
        self.last_bbox: list[float] = []
        self.last_seen: float = time.time()


class CraneProximityEngine:
    def __init__(self, store: EventStore):
        self.store = store
        self._tracks: dict[str, dict[str, _ProximityTrack]] = {}
        self._gates: dict[str, PersistenceDebouncer] = {}

    def _tracks_for(self, camera_id: str) -> dict[str, _ProximityTrack]:
        if camera_id not in self._tracks:
            self._tracks[camera_id] = {}
        return self._tracks[camera_id]

    def _gate_for(self, camera_id: str) -> PersistenceDebouncer:
        if camera_id not in self._gates:
            self._gates[camera_id] = PersistenceDebouncer(
                min_duration_seconds=_CONFIRM_SECONDS,
                cooldown_seconds=_REPEAT_SECONDS,
                max_gap_seconds=_MAX_GAP_SECONDS,
                one_event_per_episode=False,
            )
        return self._gates[camera_id]

    def process_frame(self, frame: np.ndarray, camera_id: str) -> tuple[dict, list[ViolationEvent]]:
        result = analyze_crane_proximity_frame(frame, camera_id)
        tracks = self._tracks_for(camera_id)
        gate = self._gate_for(camera_id)
        now = time.time()
        new_events: list[ViolationEvent] = []

        violations = [
            CraneProximityDetection.model_validate(row)
            for row in result.get("detections", [])
            if row.get("behavior") == "crane_proximity"
            and float(row.get("confidence", 0)) >= EVENT_MIN_CONFIDENCE
        ]
        frame_context = [
            CraneProximityDetection.model_validate(row)
            for row in result.get("detections", [])
        ]

        track_id = "proximity"
        if violations:
            best = max(violations, key=lambda d: d.confidence)
            if track_id not in tracks:
                tracks[track_id] = _ProximityTrack()
            state = tracks[track_id]
            state.last_bbox = [float(v) for v in best.bbox]
            state.last_seen = now

            if state.episode_best is None or best.confidence > state.episode_best["detection"].confidence:
                state.episode_best = {"detection": best, "frame": frame.copy()}

            was_active = gate.snapshot()["active"]
            confirmed = gate.register(True)
            if confirmed and state.episode_best:
                pending = state.episode_best
                state.episode_best = None
                top_det = pending["detection"]
                if top_det.confidence >= EVENT_MIN_CONFIDENCE:
                    event = self.store.add_crane(
                        top_det, pending["frame"], camera_id=camera_id, context=frame_context,
                    )
                    new_events.append(event)
                    logger.info(
                        "Crane proximity [%s] track=%s dist=%.2fm conf=%.0f%%",
                        event.id,
                        track_id,
                        top_det.distance_m or 0,
                        top_det.confidence * 100,
                    )
            elif was_active and not gate.snapshot()["active"]:
                state.episode_best = None
        else:
            was_active = gate.snapshot()["active"]
            gate.register(False)
            if was_active and not gate.snapshot()["active"]:
                if track_id in tracks:
                    tracks[track_id].episode_best = None

        for tid, state in list(tracks.items()):
            if now - state.last_seen > _TRACK_EXPIRE_SECONDS:
                tracks.pop(tid, None)

        result["events"] = [e.model_dump() for e in new_events]
        return result, new_events
