"""Debounced road-analysis events — bùn / nước / vật thể (Cam A-03)."""

from __future__ import annotations

import logging
import time
import uuid

import numpy as np

from .events import EventStore, PersistenceDebouncer
from .road_analyzer import (
    EVENT_MIN_CONFIDENCE,
    _bbox_iou,
    analyze_road_frame,
    episode_snapshot_score,
)
from .schemas import RoadDetection, ViolationEvent
from .unknown_detection import UNKNOWN_LABEL

logger = logging.getLogger("road_analysis_engine")

# Xác nhận sau 3s detect liên tục; lặp snapshot mỗi 10 phút nếu vẫn phát hiện
_ROAD_CONFIRM_SECONDS = 3.0
_ROAD_REPEAT_SECONDS = 600.0
_ROAD_MAX_GAP_SECONDS = 3.0
_ROAD_MIN_CONFIDENCE = EVENT_MIN_CONFIDENCE
_BEHAVIOR_MIN_CONFIDENCE: dict[str, float] = {
    "mud": EVENT_MIN_CONFIDENCE,
    "water": EVENT_MIN_CONFIDENCE,
    "object": EVENT_MIN_CONFIDENCE,
}
_TRACK_IOU_MATCH = 0.32
_TRACK_EXPIRE_SECONDS = 4.0
_MAX_TRACKS = 12


class _TrackState:
    __slots__ = ("debouncer", "episode_best", "last_bbox", "last_seen", "behavior", "object_kind")

    def __init__(self, behavior: str, object_kind: str | None = None):
        self.behavior = behavior
        self.object_kind = object_kind
        self.debouncer = PersistenceDebouncer(
            min_duration_seconds=_ROAD_CONFIRM_SECONDS,
            cooldown_seconds=_ROAD_REPEAT_SECONDS,
            max_gap_seconds=_ROAD_MAX_GAP_SECONDS,
            one_event_per_episode=False,
        )
        self.episode_best: dict | None = None
        self.last_bbox: list[float] = []
        self.last_seen: float = time.time()


class RoadAnalysisEngine:
    """Phân tích lòng đường + debounce theo từng vùng detect (track)."""

    def __init__(self, store: EventStore):
        self.store = store
        self._tracks: dict[str, dict[str, _TrackState]] = {}

    def _tracks_for(self, camera_id: str) -> dict[str, _TrackState]:
        if camera_id not in self._tracks:
            self._tracks[camera_id] = {}
        return self._tracks[camera_id]

    def _match_track(
        self,
        tracks: dict[str, _TrackState],
        det: RoadDetection,
    ) -> str:
        best_id: str | None = None
        best_iou = _TRACK_IOU_MATCH
        for track_id, state in tracks.items():
            if state.behavior != det.behavior or not state.last_bbox:
                continue
            if det.behavior == "object" and det.object_kind and state.object_kind != det.object_kind:
                continue
            iou = _bbox_iou(state.last_bbox, det.bbox)
            if iou > best_iou:
                best_iou = iou
                best_id = track_id
        if best_id:
            return best_id
        suffix = f"-{det.object_kind}" if det.behavior == "object" and det.object_kind else ""
        return f"{det.behavior}{suffix}-{uuid.uuid4().hex[:8]}"

    def _expire_stale_tracks(self, tracks: dict[str, _TrackState], now: float) -> None:
        stale = [
            tid for tid, state in tracks.items()
            if now - state.last_seen > _TRACK_EXPIRE_SECONDS
        ]
        for tid in stale:
            tracks.pop(tid, None)

    def process_frame(self, frame: np.ndarray, camera_id: str) -> tuple[dict, list[ViolationEvent]]:
        result = analyze_road_frame(frame, camera_id)
        detections_raw = result.get("detections", [])
        tracks = self._tracks_for(camera_id)
        frame_h, frame_w = frame.shape[:2]
        now = time.time()

        dets: list[RoadDetection] = []
        for row in detections_raw:
            det = RoadDetection.model_validate(row)
            if det.behavior == "unknown" or det.label == UNKNOWN_LABEL:
                continue
            min_conf = _BEHAVIOR_MIN_CONFIDENCE.get(det.behavior, _ROAD_MIN_CONFIDENCE)
            if det.confidence >= min_conf:
                dets.append(det)

        matched_ids: set[str] = set()
        new_events: list[ViolationEvent] = []

        if len(tracks) + len(dets) > _MAX_TRACKS:
            dets.sort(key=lambda d: d.confidence, reverse=True)
            dets = dets[:_MAX_TRACKS]

        for det in dets:
            track_id = self._match_track(tracks, det)
            if track_id not in tracks:
                if len(tracks) >= _MAX_TRACKS:
                    continue
                tracks[track_id] = _TrackState(det.behavior, det.object_kind)
            state = tracks[track_id]
            matched_ids.add(track_id)
            state.last_bbox = [float(v) for v in det.bbox]
            state.last_seen = now

            quality = episode_snapshot_score(det.behavior, det, frame_w, frame_h)
            if quality >= 0:
                if state.episode_best is None or quality > state.episode_best["quality"]:
                    state.episode_best = {
                        "quality": quality,
                        "detection": det,
                        "frame": frame.copy(),
                    }

            was_active = state.debouncer.snapshot()["active"]
            confirmed = state.debouncer.register(True)

            if confirmed and state.episode_best:
                pending = state.episode_best
                state.episode_best = None
                top_det = pending["detection"]
                if top_det.confidence < EVENT_MIN_CONFIDENCE:
                    continue
                snap_frame = pending["frame"]
                event = self.store.add_road(top_det, snap_frame, camera_id=camera_id)
                new_events.append(event)
                logger.info(
                    "Road event [%s] %s track=%s conf=%.2f bbox=%s",
                    event.scenario_id,
                    event.scenario_name,
                    track_id,
                    event.confidence,
                    [int(v) for v in top_det.bbox],
                )
            elif was_active and not state.debouncer.snapshot()["active"]:
                state.episode_best = None

        for track_id, state in list(tracks.items()):
            if track_id in matched_ids:
                continue
            was_active = state.debouncer.snapshot()["active"]
            state.debouncer.register(False)
            if was_active and not state.debouncer.snapshot()["active"]:
                state.episode_best = None

        self._expire_stale_tracks(tracks, now)
        result["events"] = [e.model_dump() for e in new_events]
        return result, new_events
