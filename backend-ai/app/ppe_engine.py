"""Debounced PPE violation events — theo từng người × từng loại lỗi (Cam A-04)."""

from __future__ import annotations

import logging
import time

import numpy as np

from .config import settings
from .events import EventStore, PersistenceDebouncer
from .ppe_analyzer import analyze_ppe_frame
from .schemas import PpeDetection, ViolationEvent
from .track_matching import assign_person_track_id
from .violation_thresholds import VIOLATION_MIN_CONFIDENCE

logger = logging.getLogger("ppe_engine")

_CONFIRM_SECONDS = 3.0
_REPEAT_SECONDS = settings.ppe_event_repeat_seconds
_MAX_GAP_SECONDS = 3.0
_TRACK_EXPIRE_SECONDS = 4.0
_VIOLATION_MIN_CONF = VIOLATION_MIN_CONFIDENCE
_EVENT_BEHAVIORS = frozenset({"no_helmet", "no_vest", "no_shoes"})
_MAX_TRACKS = 24


class _PpeTrack:
    __slots__ = ("episode_best", "last_bbox", "last_seen", "behavior", "person_bbox")

    def __init__(self, behavior: str) -> None:
        self.behavior = behavior
        self.episode_best: dict | None = None
        self.last_bbox: list[float] = []
        self.last_seen: float = time.time()
        self.person_bbox: list[float] = []


def _bbox_center(bbox: list[float] | tuple[float, ...]) -> tuple[float, float]:
    return (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2


def _center_inside(inner: list[float], outer: list[float]) -> bool:
    cx, cy = _bbox_center(inner)
    return outer[0] <= cx <= outer[2] and outer[1] <= cy <= outer[3]


def _person_slot(person_bbox: list[float], frame_w: int, frame_h: int) -> str:
    """Ô lưới ổn định theo vị trí — dùng khi log."""
    cx, cy = _bbox_center(person_bbox)
    gx = min(7, int(cx / max(frame_w / 8, 1)))
    gy = min(5, int(cy / max(frame_h / 6, 1)))
    return f"p{gy}{gx}"


def _match_person(violation: PpeDetection, persons: list[PpeDetection]) -> PpeDetection | None:
    best: PpeDetection | None = None
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


class PpeEngine:
    def __init__(self, store: EventStore):
        self.store = store
        self._tracks: dict[str, dict[str, _PpeTrack]] = {}
        self._gates: dict[str, dict[str, PersistenceDebouncer]] = {}

    def _tracks_for(self, camera_id: str) -> dict[str, _PpeTrack]:
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

    def process_frame(self, frame: np.ndarray, camera_id: str) -> tuple[dict, list[ViolationEvent]]:
        result = analyze_ppe_frame(frame, camera_id)
        tracks = self._tracks_for(camera_id)
        frame_h, frame_w = frame.shape[:2]
        now = time.time()
        new_events: list[ViolationEvent] = []

        persons = [
            PpeDetection.model_validate(row)
            for row in result.get("detections", [])
            if row.get("behavior") == "person"
        ]
        violations = [
            PpeDetection.model_validate(row)
            for row in result.get("detections", [])
            if row.get("behavior") in _EVENT_BEHAVIORS
            and float(row.get("confidence", 0)) >= _VIOLATION_MIN_CONF
        ]

        matched_ids: set[str] = set()

        if len(tracks) + len(violations) > _MAX_TRACKS:
            violations.sort(key=lambda d: d.confidence, reverse=True)
            violations = violations[:_MAX_TRACKS]

        for det in violations:
            person = _match_person(det, persons)
            if person is None:
                continue

            person_bbox = [float(v) for v in person.bbox]
            track_id = assign_person_track_id(
                person_bbox,
                tracks,
                behavior=det.behavior,
                frame_w=frame_w,
                frame_h=frame_h,
                max_tracks=_MAX_TRACKS,
            )
            if track_id is None:
                continue
            slot = _person_slot(person_bbox, frame_w, frame_h)

            gate = self._gate_for(camera_id, track_id)
            if track_id not in tracks:
                if len(tracks) >= _MAX_TRACKS:
                    continue
                tracks[track_id] = _PpeTrack(det.behavior)
            state = tracks[track_id]
            matched_ids.add(track_id)
            state.last_bbox = [float(v) for v in det.bbox]
            state.person_bbox = person_bbox
            state.last_seen = now

            if state.episode_best is None or det.confidence > state.episode_best["detection"].confidence:
                state.episode_best = {
                    "detection": det,
                    "frame": frame.copy(),
                    "person_bbox": person_bbox,
                }

            was_active = gate.snapshot()["active"]
            confirmed = gate.register(True)

            if confirmed and state.episode_best:
                pending = state.episode_best
                state.episode_best = None
                top_det = pending["detection"]
                if top_det.confidence >= _VIOLATION_MIN_CONF:
                    event = self.store.add_ppe(
                        top_det,
                        pending["frame"],
                        camera_id=camera_id,
                        person_bbox=pending.get("person_bbox"),
                        track_id=track_id,
                    )
                    if event:
                        new_events.append(event)
                        logger.info(
                            "PPE event [%s] %s person=%s track=%s conf=%.0f%%",
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

        result["events"] = [e.model_dump() for e in new_events]
        return result, new_events
