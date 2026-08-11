"""Debounced crane-proximity events — theo từng người × máy gần nhất (Cam A-04)."""

from __future__ import annotations

import logging
import time

import numpy as np

from .config import settings
from .crane_proximity_analyzer import analyze_crane_proximity_frame
from .crane_roi_config import EVENT_MIN_CONFIDENCE
from .events import EventStore, PersistenceDebouncer
from .schemas import CraneProximityDetection, ViolationEvent
from .snapshot_sync import build_snapshot_episode, merge_episode_best
from .violation_thresholds import VIOLATION_CONFIRM_SECONDS, VIOLATION_MAX_GAP_SECONDS
from .track_matching import assign_person_track_id, bbox_iou
from .worker_identity.detection_enrich import copy_worker_identity

logger = logging.getLogger("crane_proximity_engine")

_CONFIRM_SECONDS = VIOLATION_CONFIRM_SECONDS
_REPEAT_SECONDS = settings.crane_event_repeat_seconds
_MAX_GAP_SECONDS = VIOLATION_MAX_GAP_SECONDS
_TRACK_EXPIRE_SECONDS = 4.0
_MAX_TRACKS = 16


class _ProximityTrack:
    __slots__ = ("episode_best", "last_bbox", "last_seen", "person_bbox", "machine_bbox")

    def __init__(self) -> None:
        self.episode_best: dict | None = None
        self.last_bbox: list[float] = []
        self.last_seen: float = time.time()
        self.person_bbox: list[float] = []
        self.machine_bbox: list[float] = []


def _center_inside(inner: list[float], outer: list[float]) -> bool:
    cx = (inner[0] + inner[2]) / 2
    cy = (inner[1] + inner[3]) / 2
    return outer[0] <= cx <= outer[2] and outer[1] <= cy <= outer[3]


def _match_person(
    violation: CraneProximityDetection,
    persons: list[CraneProximityDetection],
) -> CraneProximityDetection | None:
    vb = violation.bbox
    best: CraneProximityDetection | None = None
    best_iou = 0.18
    for person in persons:
        pb = person.bbox
        if not _center_inside(vb, pb):
            iou = bbox_iou(vb, pb)
            if iou > best_iou:
                best_iou = iou
                best = person
            continue
        iou = bbox_iou(vb, pb)
        if iou > best_iou:
            best_iou = iou
            best = person
    return best


class CraneProximityEngine:
    def __init__(self, store: EventStore):
        self.store = store
        self._tracks: dict[str, dict[str, _ProximityTrack]] = {}
        self._gates: dict[str, dict[str, PersistenceDebouncer]] = {}

    def _tracks_for(self, camera_id: str) -> dict[str, _ProximityTrack]:
        if camera_id not in self._tracks:
            self._tracks[camera_id] = {}
        return self._tracks[camera_id]

    def _gate_for(self, camera_id: str, track_id: str) -> PersistenceDebouncer:
        if camera_id not in self._gates:
            self._gates[camera_id] = {}
        if track_id not in self._gates[camera_id]:
            self._gates[camera_id][track_id] = PersistenceDebouncer(
                min_duration_seconds=_CONFIRM_SECONDS,
                cooldown_seconds=settings.event_repeat_seconds(_REPEAT_SECONDS),
                max_gap_seconds=_MAX_GAP_SECONDS,
                one_event_per_episode=settings.event_log_one_per_episode,
            )
        return self._gates[camera_id][track_id]

    def process_frame(
        self,
        frame: np.ndarray,
        camera_id: str,
        *,
        capture_frame: np.ndarray | None = None,
    ) -> tuple[dict, list[ViolationEvent]]:
        snapshot_source = capture_frame if capture_frame is not None else frame
        result = analyze_crane_proximity_frame(frame, camera_id)
        tracks = self._tracks_for(camera_id)
        frame_h, frame_w = frame.shape[:2]
        now = time.time()
        new_events: list[ViolationEvent] = []

        persons = [
            CraneProximityDetection.model_validate(row)
            for row in result.get("detections", [])
            if row.get("behavior") == "person"
        ]
        violations = [
            CraneProximityDetection.model_validate(row)
            for row in result.get("detections", [])
            if row.get("behavior") == "crane_proximity"
            and float(row.get("confidence", 0)) >= EVENT_MIN_CONFIDENCE
        ]

        matched_ids: set[str] = set()
        assigned_this_frame: set[str] = set()

        if len(tracks) + len(violations) > _MAX_TRACKS:
            violations.sort(key=lambda d: d.confidence, reverse=True)
            violations = violations[:_MAX_TRACKS]

        for det in violations:
            person = _match_person(det, persons)
            if person is not None:
                copy_worker_identity(person, det)
            person_bbox = [float(v) for v in (person.bbox if person else det.bbox)]
            machine_bbox = (
                [float(v) for v in det.machine_bbox]
                if det.machine_bbox and len(det.machine_bbox) >= 4
                else None
            )

            track_id = assign_person_track_id(
                person_bbox,
                tracks,
                behavior="proximity",
                frame_w=frame_w,
                frame_h=frame_h,
                max_tracks=_MAX_TRACKS,
                blocked_tracks=assigned_this_frame,
            )
            if track_id is None:
                continue
            assigned_this_frame.add(track_id)

            gate = self._gate_for(camera_id, track_id)
            if track_id not in tracks:
                if len(tracks) >= _MAX_TRACKS:
                    continue
                tracks[track_id] = _ProximityTrack()
            state = tracks[track_id]
            matched_ids.add(track_id)
            state.last_bbox = [float(v) for v in det.bbox]
            state.person_bbox = person_bbox
            state.machine_bbox = machine_bbox or []
            state.last_seen = now

            state.episode_best = merge_episode_best(
                state.episode_best,
                detection=det,
                analyze_frame=frame,
                capture_frame=snapshot_source,
                person_bbox=person_bbox,
                extra={"machine_bbox": machine_bbox},
            )

            was_active = gate.snapshot()["active"]
            confirmed = gate.register(True)
            if confirmed and state.episode_best:
                pending = state.episode_best
                state.episode_best = None
                top_det = pending["detection"]
                if top_det.confidence >= EVENT_MIN_CONFIDENCE:
                    event = self.store.add_crane(
                        top_det,
                        pending["frame"],
                        camera_id=camera_id,
                        person_bbox=pending.get("person_bbox"),
                        machine_bbox=pending.get("machine_bbox"),
                        track_id=track_id,
                    )
                    if event:
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

        for track_id, state in list(tracks.items()):
            if track_id in matched_ids:
                continue
            gate = self._gate_for(camera_id, track_id)
            was_active = gate.snapshot()["active"]
            gate.register(False)
            if was_active and not gate.snapshot()["active"]:
                state.episode_best = None

        for track_id, state in list(tracks.items()):
            if now - state.last_seen > _TRACK_EXPIRE_SECONDS:
                tracks.pop(track_id, None)

        result["events"] = [e.model_dump() for e in new_events]
        return result, new_events
