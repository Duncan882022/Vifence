"""Debounced crane-proximity events — Cam A-04 (≥ 3s)."""

from __future__ import annotations

import logging
import time
import uuid

import numpy as np

from .crane_proximity_analyzer import analyze_crane_proximity_frame
from .crane_roi_config import EVENT_MIN_CONFIDENCE
from .events import EventStore, PersistenceDebouncer
from .road_analyzer import _bbox_iou
from .schemas import CraneProximityDetection, ViolationEvent

logger = logging.getLogger("crane_proximity_engine")

_CONFIRM_SECONDS = 3.0
_REPEAT_SECONDS = 600.0
_MAX_GAP_SECONDS = 3.0
_TRACK_IOU_MATCH = 0.28
_TRACK_EXPIRE_SECONDS = 4.0


class _ProximityTrack:
    __slots__ = ("debouncer", "episode_best", "last_bbox", "last_seen")

    def __init__(self) -> None:
        self.debouncer = PersistenceDebouncer(
            min_duration_seconds=_CONFIRM_SECONDS,
            cooldown_seconds=_REPEAT_SECONDS,
            max_gap_seconds=_MAX_GAP_SECONDS,
            one_event_per_episode=False,
        )
        self.episode_best: dict | None = None
        self.last_bbox: list[float] = []
        self.last_seen: float = time.time()


class CraneProximityEngine:
    def __init__(self, store: EventStore):
        self.store = store
        self._tracks: dict[str, dict[str, _ProximityTrack]] = {}

    def _tracks_for(self, camera_id: str) -> dict[str, _ProximityTrack]:
        if camera_id not in self._tracks:
            self._tracks[camera_id] = {}
        return self._tracks[camera_id]

    def _match_track(self, tracks: dict[str, _ProximityTrack], det: CraneProximityDetection) -> str:
        best_id: str | None = None
        best_iou = _TRACK_IOU_MATCH
        for track_id, state in tracks.items():
            if not state.last_bbox:
                continue
            iou = _bbox_iou(state.last_bbox, det.bbox)
            if iou > best_iou:
                best_iou = iou
                best_id = track_id
        return best_id or f"prox-{uuid.uuid4().hex[:8]}"

    def process_frame(self, frame: np.ndarray, camera_id: str) -> tuple[dict, list[ViolationEvent]]:
        result = analyze_crane_proximity_frame(frame, camera_id)
        tracks = self._tracks_for(camera_id)
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

        matched: set[str] = set()
        for det in violations:
            track_id = self._match_track(tracks, det)
            if track_id not in tracks:
                tracks[track_id] = _ProximityTrack()
            state = tracks[track_id]
            matched.add(track_id)
            state.last_bbox = [float(v) for v in det.bbox]
            state.last_seen = now

            if state.episode_best is None or det.confidence > state.episode_best["detection"].confidence:
                state.episode_best = {"detection": det, "frame": frame.copy()}

            confirmed = state.debouncer.register(True)
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

        for track_id, state in list(tracks.items()):
            if track_id in matched:
                continue
            state.debouncer.register(False)
            if not state.debouncer.snapshot()["active"]:
                state.episode_best = None
            if now - state.last_seen > _TRACK_EXPIRE_SECONDS:
                tracks.pop(track_id, None)

        result["events"] = [e.model_dump() for e in new_events]
        return result, new_events
