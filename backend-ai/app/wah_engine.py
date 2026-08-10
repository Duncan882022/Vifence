"""Debounced WAH events — theo từng người (Cam A-04), giống PPE."""

from __future__ import annotations

import logging
import time

import numpy as np

from .config import settings
from .events import EventStore, PersistenceDebouncer
from .schemas import Detection, ViolationEvent
from .track_matching import assign_person_track_id
from .snapshot_sync import build_snapshot_episode, merge_episode_best
from .violation_thresholds import VIOLATION_CONFIRM_SECONDS, VIOLATION_MAX_GAP_SECONDS, VIOLATION_MIN_CONFIDENCE
from .wah_analyzer import analyze_wah_frame

logger = logging.getLogger("wah_engine")

_CONFIRM_SECONDS = VIOLATION_CONFIRM_SECONDS
_REPEAT_SECONDS = settings.wah_event_repeat_seconds
_MAX_GAP_SECONDS = VIOLATION_MAX_GAP_SECONDS
_EVENT_BEHAVIOR = "no_harness"
_MIN_CONF = VIOLATION_MIN_CONFIDENCE
_MAX_TRACKS = 12
_TRACK_EXPIRE_SECONDS = 4.0


class _WahTrack:
    __slots__ = ("episode_best", "last_seen", "person_bbox")

    def __init__(self) -> None:
        self.episode_best: dict | None = None
        self.last_seen: float = time.time()
        self.person_bbox: list[float] = []


def _bbox_center(bbox: list[float] | tuple[float, ...]) -> tuple[float, float]:
    return (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2


def _center_inside(inner: list[float], outer: list[float]) -> bool:
    cx, cy = _bbox_center(inner)
    return outer[0] <= cx <= outer[2] and outer[1] <= cy <= outer[3]


def _match_person(violation: Detection, persons: list[Detection]) -> Detection | None:
    best: Detection | None = None
    best_area = float("inf")
    for person in persons:
        pb = person.bbox
        if not _center_inside(violation.bbox, pb):
            continue
        area = (pb[2] - pb[0]) * (pb[3] - pb[1])
        if area < best_area:
            best_area = area
            best = person
    return best


def _harness_on_person(person_bbox: list[float], harnesses: list[Detection]) -> bool:
    pb = tuple(person_bbox)
    for harness in harnesses:
        if _center_inside(harness.bbox, pb):
            return True
    return False


class WahEngine:
    def __init__(self, store: EventStore):
        self.store = store
        self._tracks: dict[str, dict[str, _WahTrack]] = {}
        self._gates: dict[str, dict[str, PersistenceDebouncer]] = {}

    def _tracks_for(self, camera_id: str) -> dict[str, _WahTrack]:
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
        return analyze_wah_frame(frame, camera_id)

    def process_frame(
        self,
        frame: np.ndarray,
        camera_id: str,
        *,
        capture_frame: np.ndarray | None = None,
    ) -> tuple[dict, list[ViolationEvent]]:
        snapshot_source = capture_frame if capture_frame is not None else frame
        detections = self._collect_detections(frame, camera_id)
        tracks = self._tracks_for(camera_id)
        frame_h, frame_w = frame.shape[:2]
        now = time.time()
        new_events: list[ViolationEvent] = []

        persons = [d for d in detections if d.behavior == "person"]
        harnesses = [d for d in detections if d.behavior == "safety_harness"]
        violations: list[Detection] = []
        for det in detections:
            if det.behavior != _EVENT_BEHAVIOR or det.confidence < _MIN_CONF:
                continue
            person = _match_person(det, persons)
            if person is None:
                continue
            if _harness_on_person(person.bbox, harnesses):
                continue
            violations.append(det)

        if len(tracks) + len(violations) > _MAX_TRACKS:
            violations.sort(key=lambda d: d.confidence, reverse=True)
            violations = violations[: max(0, _MAX_TRACKS - len(tracks))]

        matched_ids: set[str] = set()
        assigned_this_frame: set[str] = set()

        for det in violations:
            person = _match_person(det, persons)
            if person is None:
                continue

            person_bbox = [float(v) for v in person.bbox]
            track_id = assign_person_track_id(
                person_bbox,
                tracks,
                behavior=_EVENT_BEHAVIOR,
                frame_w=frame_w,
                frame_h=frame_h,
                max_tracks=_MAX_TRACKS,
                blocked_tracks=assigned_this_frame,
            )
            if track_id is None:
                continue
            assigned_this_frame.add(track_id)
            slot = track_id.split(":")[0]

            if track_id not in tracks:
                if len(tracks) >= _MAX_TRACKS:
                    continue
                tracks[track_id] = _WahTrack()

            state = tracks[track_id]
            matched_ids.add(track_id)
            state.person_bbox = person_bbox
            state.last_seen = now

            gate = self._gate_for(camera_id, track_id)

            state.episode_best = merge_episode_best(
                state.episode_best,
                detection=det,
                analyze_frame=frame,
                capture_frame=snapshot_source,
                person_bbox=person_bbox,
            )

            was_active = gate.snapshot()["active"]
            confirmed = gate.register(True)

            if confirmed and state.episode_best:
                pending = state.episode_best
                state.episode_best = None
                top_det = pending["detection"]
                if top_det.confidence >= _MIN_CONF:
                    event = self.store.add_wah(
                        top_det,
                        pending["frame"],
                        camera_id=camera_id,
                        person_bbox=pending.get("person_bbox"),
                        track_id=track_id,
                    )
                    if event:
                        new_events.append(event)
                        logger.info(
                            "WAH event [%s] %s person=%s track=%s conf=%.0f%%",
                            event.id,
                            event.scenario_name,
                            slot,
                            track_id,
                            event.confidence * 100,
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

        payload = {
            "type": "result",
            "camera_id": camera_id,
            "width": int(frame.shape[1]),
            "height": int(frame.shape[0]),
            "detections": [d.model_dump() for d in detections],
            "events": [e.model_dump() for e in new_events],
        }
        return payload, new_events
