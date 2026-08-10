"""Debounced mesh cover events — BPTC-001 (Lưới bao che thiếu/rách/bẩn)."""

from __future__ import annotations

import logging
import time

import numpy as np

from .config import settings
from .events import EventStore, PersistenceDebouncer
from .mesh_analyzer import MESH_VIOLATION_BEHAVIORS, analyze_mesh_frame
from .road_roi_config import get_mesh_zones_for_camera
from .schemas import RoadDetection, ViolationEvent
from .snapshot_sync import merge_episode_best
from .violation_thresholds import get_threshold

logger = logging.getLogger("mesh_analysis_engine")

_MESH_THRESHOLD = get_threshold("BPTC-001")
_MESH_CONFIRM_SECONDS = _MESH_THRESHOLD.confirm_seconds
_MESH_REPEAT_SECONDS = settings.road_event_repeat_seconds
_MESH_MAX_GAP_SECONDS = _MESH_THRESHOLD.max_gap_seconds
_MESH_MIN_CONFIDENCE = _MESH_THRESHOLD.min_confidence
_TRACK_EXPIRE_SECONDS = 4.0
_MAX_TRACKS = 8


class _MeshTrack:
    __slots__ = ("behavior", "episode_best", "last_bbox", "last_seen")

    def __init__(self, behavior: str) -> None:
        self.behavior = behavior
        self.episode_best: dict | None = None
        self.last_bbox: list[float] = []
        self.last_seen: float = time.time()


class MeshAnalysisEngine:
    """Phân tích lưới bao che + debounce → ghi sự kiện BPTC-001."""

    def __init__(self, store: EventStore):
        self.store = store
        self._tracks: dict[str, dict[str, _MeshTrack]] = {}
        self._gates: dict[str, dict[str, PersistenceDebouncer]] = {}

    def _tracks_for(self, camera_id: str) -> dict[str, _MeshTrack]:
        if camera_id not in self._tracks:
            self._tracks[camera_id] = {}
        return self._tracks[camera_id]

    def _gate_for(self, camera_id: str, track_id: str, behavior: str) -> PersistenceDebouncer:
        if camera_id not in self._gates:
            self._gates[camera_id] = {}
        if track_id not in self._gates[camera_id]:
            self._gates[camera_id][track_id] = PersistenceDebouncer(
                min_duration_seconds=_MESH_CONFIRM_SECONDS,
                cooldown_seconds=_MESH_REPEAT_SECONDS,
                max_gap_seconds=_MESH_MAX_GAP_SECONDS,
                one_event_per_episode=True,
            )
        return self._gates[camera_id][track_id]

    def _stable_track_id(self, det: RoadDetection, frame_w: int, frame_h: int) -> str:
        bx = det.bbox
        cx = min(7, int(((bx[0] + bx[2]) / 2) / max(frame_w / 8, 1)))
        cy = min(5, int(((bx[1] + bx[3]) / 2) / max(frame_h / 6, 1)))
        return f"{det.behavior}:p{cy}{cx}"

    def _episode_score(self, det: RoadDetection) -> float:
        return det.confidence * 1000.0

    def process_frame(
        self,
        frame: np.ndarray,
        camera_id: str,
        *,
        capture_frame: np.ndarray | None = None,
    ) -> tuple[dict, list[ViolationEvent]]:
        snapshot_source = capture_frame if capture_frame is not None else frame
        h, w = frame.shape[:2]
        mesh_zones = get_mesh_zones_for_camera(camera_id)
        zone_polygon = mesh_zones[0]["polygon"] if mesh_zones else None

        raw = analyze_mesh_frame(frame, camera_id, zone_polygon=zone_polygon)
        dets = [
            det for det in raw
            if det.behavior in MESH_VIOLATION_BEHAVIORS
            and det.confidence >= _MESH_MIN_CONFIDENCE
        ]

        tracks = self._tracks_for(camera_id)
        now = time.time()
        matched_ids: set[str] = set()
        new_events: list[ViolationEvent] = []

        if len(tracks) + len(dets) > _MAX_TRACKS:
            dets.sort(key=lambda d: d.confidence, reverse=True)
            dets = dets[:_MAX_TRACKS]

        for det in dets:
            track_id = self._stable_track_id(det, w, h)
            gate = self._gate_for(camera_id, track_id, det.behavior)
            if track_id not in tracks:
                if len(tracks) >= _MAX_TRACKS:
                    continue
                tracks[track_id] = _MeshTrack(det.behavior)
            state = tracks[track_id]
            matched_ids.add(track_id)
            state.last_bbox = [float(v) for v in det.bbox]
            state.last_seen = now

            quality = self._episode_score(det)
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
                snap_frame = pending["frame"]
                event = self.store.add_road(
                    top_det,
                    snap_frame,
                    camera_id=camera_id,
                    track_id=track_id,
                )
                if event:
                    new_events.append(event)
                    logger.info(
                        "Mesh event [%s] %s track=%s conf=%.2f bbox=%s",
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
            gate = self._gate_for(camera_id, track_id, state.behavior)
            was_active = gate.snapshot()["active"]
            gate.register(False)
            if was_active and not gate.snapshot()["active"]:
                state.episode_best = None

        stale = [
            tid for tid, state in tracks.items()
            if now - state.last_seen > _TRACK_EXPIRE_SECONDS
        ]
        for tid in stale:
            tracks.pop(tid, None)

        fe_zones = [
            {
                "id": z["id"],
                "label": z["label"],
                "type": z["type"],
                "polygon": z["polygon"],
            }
            for z in mesh_zones
        ]

        result = {
            "type": "result",
            "camera_id": camera_id,
            "width": w,
            "height": h,
            "roi_zones": fe_zones,
            "metrics": {
                "mesh_violations": len(dets),
                "mesh_behaviors": sorted({d.behavior for d in dets}),
            },
            "detections": [d.model_dump() for d in raw],
            "events": [e.model_dump() for e in new_events],
        }
        return result, new_events
