"""Debounced road-analysis events — bùn / nước / vật thể (Cam A-03)."""

from __future__ import annotations

import logging
import time

import cv2
import numpy as np

from .config import settings
from .events import EventStore, PersistenceDebouncer
from .mesh_analyzer import MESH_VIOLATION_BEHAVIORS
from .road_analyzer import (
    EVENT_MIN_CONFIDENCE,
    _is_valid_object_box,
    analyze_road_frame,
    episode_snapshot_score,
)
from .schemas import RoadDetection, ViolationEvent
from .snapshot_sync import merge_episode_best
from .unknown_detection import UNKNOWN_LABEL

logger = logging.getLogger("road_analysis_engine")

# Xác nhận thống nhất 2s trước khi ghi sự kiện
from .violation_thresholds import VIOLATION_CONFIRM_SECONDS, VIOLATION_MAX_GAP_SECONDS, get_threshold

_ROAD_CONFIRM_SECONDS = VIOLATION_CONFIRM_SECONDS
_ROAD_REPEAT_SECONDS = settings.road_event_repeat_seconds
_ROAD_MAX_GAP_SECONDS = VIOLATION_MAX_GAP_SECONDS
_ROAD_SCENARIO_BY_BEHAVIOR: dict[str, str] = {
    "mud": "BPTC-007",
    "water": "BPTC-008",
    "object": "BPTC-009",
}
_BEHAVIOR_CONFIRM_SECONDS: dict[str, float] = {
    "mud": get_threshold("BPTC-007").confirm_seconds,
    "water": get_threshold("BPTC-008").confirm_seconds,
    "object": get_threshold("BPTC-009").confirm_seconds,
}
_ROAD_MIN_CONFIDENCE = EVENT_MIN_CONFIDENCE
_BEHAVIOR_MIN_CONFIDENCE: dict[str, float] = {
    "mud": get_threshold("BPTC-007").min_confidence,
    "water": get_threshold("BPTC-008").min_confidence,
    "object": get_threshold("BPTC-009").min_confidence,
}
_TRACK_EXPIRE_SECONDS = 4.0
_MAX_TRACKS = 12


class _TrackState:
    __slots__ = ("episode_best", "last_bbox", "last_seen", "behavior", "object_kind")

    def __init__(self, behavior: str, object_kind: str | None = None):
        self.behavior = behavior
        self.object_kind = object_kind
        self.episode_best: dict | None = None
        self.last_bbox: list[float] = []
        self.last_seen: float = time.time()


class RoadAnalysisEngine:
    """Phân tích lòng đường + debounce theo từng loại detect (ổn định, 2 giờ/lần)."""

    def __init__(self, store: EventStore):
        self.store = store
        self._tracks: dict[str, dict[str, _TrackState]] = {}
        self._gates: dict[str, dict[str, PersistenceDebouncer]] = {}

    def _tracks_for(self, camera_id: str) -> dict[str, _TrackState]:
        if camera_id not in self._tracks:
            self._tracks[camera_id] = {}
        return self._tracks[camera_id]

    def _gate_for(self, camera_id: str, track_id: str) -> PersistenceDebouncer:
        if camera_id not in self._gates:
            self._gates[camera_id] = {}
        if track_id not in self._gates[camera_id]:
            behavior = track_id.split(":")[0] if ":" in track_id else track_id
            if behavior not in _BEHAVIOR_CONFIRM_SECONDS:
                behavior = "object"
            confirm = _BEHAVIOR_CONFIRM_SECONDS.get(behavior, _ROAD_CONFIRM_SECONDS)
            confirm = settings.event_debounce_min_seconds(confirm)
            scenario_id = _ROAD_SCENARIO_BY_BEHAVIOR.get(behavior, "BPTC-009")
            cooldown = get_threshold(scenario_id).cooldown_seconds
            self._gates[camera_id][track_id] = PersistenceDebouncer(
                min_duration_seconds=confirm,
                cooldown_seconds=settings.event_repeat_seconds(cooldown),
                max_gap_seconds=_ROAD_MAX_GAP_SECONDS,
                one_event_per_episode=settings.event_log_one_per_episode,
            )
        return self._gates[camera_id][track_id]

    def _stable_track_id(self, det: RoadDetection, frame_w: int, frame_h: int) -> str:
        """Một debouncer theo vùng — tránh gộp mọi BPTC-009 vào một log."""
        bx = det.bbox
        cx = min(7, int(((bx[0] + bx[2]) / 2) / max(frame_w / 8, 1)))
        cy = min(5, int(((bx[1] + bx[3]) / 2) / max(frame_h / 6, 1)))
        if det.behavior in ("mud", "water"):
            cx = min(3, int(((bx[0] + bx[2]) / 2) / max(frame_w / 4, 1)))
            cy = min(3, int(((bx[1] + bx[3]) / 2) / max(frame_h / 4, 1)))
        slot = f"p{cy}{cx}"
        if det.behavior == "object":
            return f"object:{slot}"
        if det.behavior in ("mud", "water"):
            return f"{det.behavior}:{slot}"
        return det.behavior

    def _expire_stale_tracks(self, tracks: dict[str, _TrackState], now: float) -> None:
        stale = [
            tid for tid, state in tracks.items()
            if now - state.last_seen > _TRACK_EXPIRE_SECONDS
        ]
        for tid in stale:
            tracks.pop(tid, None)

    def reset_camera(self, camera_id: str) -> None:
        self._tracks.pop(camera_id, None)
        self._gates.pop(camera_id, None)

    def process_frame(
        self,
        frame: np.ndarray,
        camera_id: str,
        *,
        capture_frame: np.ndarray | None = None,
        stabilize: bool = True,
        persist_events: bool | None = None,
        source_pts_sec: float | None = None,
    ) -> tuple[dict, list[ViolationEvent]]:
        _ = source_pts_sec
        if persist_events is None:
            persist_events = (
                settings.a03_bptc_event_logging_enabled
                if camera_id == "A-03"
                else True
            )
        snapshot_source = capture_frame if capture_frame is not None else frame
        result = analyze_road_frame(
            frame,
            camera_id,
            stabilize=stabilize,
            source_pts_sec=source_pts_sec,
        )
        detections_raw = result.get("detections", [])
        tracks = self._tracks_for(camera_id)
        frame_h, frame_w = frame.shape[:2]
        now = time.time()

        dets: list[RoadDetection] = []
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        for row in detections_raw:
            det = RoadDetection.model_validate(row)
            if det.behavior in MESH_VIOLATION_BEHAVIORS:
                continue
            if det.behavior == "unknown" or det.label == UNKNOWN_LABEL:
                continue
            if det.behavior == "object":
                ibox = tuple(int(v) for v in det.bbox)
                if not _is_valid_object_box(hsv, ibox, frame_w, frame_h):
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
            track_id = self._stable_track_id(det, frame_w, frame_h)
            gate = self._gate_for(camera_id, track_id)
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
                state.episode_best = merge_episode_best(
                    state.episode_best,
                    detection=det,
                    analyze_frame=frame,
                    capture_frame=snapshot_source,
                    quality=quality,
                )

            was_active = gate.snapshot()["active"]
            confirmed = gate.register(True)

            if confirmed and state.episode_best:
                pending = state.episode_best
                state.episode_best = None
                top_det = pending["detection"]
                if top_det.confidence < EVENT_MIN_CONFIDENCE:
                    continue
                snap_frame = pending["frame"]
                if not persist_events:
                    continue
                event = self.store.add_road(
                    top_det,
                    snap_frame,
                    camera_id=camera_id,
                    track_id=track_id,
                )
                if event:
                    new_events.append(event)
                    logger.info(
                        "Road event [%s] %s track=%s conf=%.2f bbox=%s",
                        event.scenario_id,
                        event.scenario_name,
                        track_id,
                        event.confidence,
                        [int(v) for v in top_det.bbox],
                    )
            elif was_active and not gate.snapshot()["active"]:
                state.episode_best = None

        for track_id, state in list(tracks.items()):
            if track_id in matched_ids:
                continue
            gate = self._gate_for(camera_id, track_id)
            was_active = gate.snapshot()["active"]
            gate.register(False)
            if was_active and not gate.snapshot()["active"]:
                state.episode_best = None

        self._expire_stale_tracks(tracks, now)
        result["events"] = [e.model_dump() for e in new_events]
        return result, new_events
