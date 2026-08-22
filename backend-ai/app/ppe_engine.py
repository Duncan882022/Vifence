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
from .worker_identity.detection_enrich import copy_worker_identity
from .snapshot_sync import build_snapshot_episode, merge_episode_best, resync_ppe_episode
from .violation_thresholds import VIOLATION_CONFIRM_SECONDS, VIOLATION_MAX_GAP_SECONDS, VIOLATION_MIN_CONFIDENCE

logger = logging.getLogger("ppe_engine")

_CONFIRM_SECONDS = VIOLATION_CONFIRM_SECONDS
_REPEAT_SECONDS = settings.ppe_event_repeat_seconds
_MAX_GAP_SECONDS = VIOLATION_MAX_GAP_SECONDS
_TRACK_EXPIRE_SECONDS = 4.0
_VIOLATION_MIN_CONF = VIOLATION_MIN_CONFIDENCE
_EVENT_BEHAVIORS = frozenset({"no_helmet", "no_vest", "no_shoes"})
_MAX_TRACKS = 36


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


def _person_match_region(person_bbox: list[float], behavior: str) -> list[float]:
    """Vùng ghép vi phạm ↔ person — mũ có thể nằm trên đỉnh bbox YOLO."""
    x1, y1, x2, y2 = (float(v) for v in person_bbox)
    ph = max(y2 - y1, 1.0)
    if behavior == "no_helmet":
        return [x1, max(0.0, y1 - ph * 0.38), x2, y2]
    return [x1, y1, x2, y2]


def _match_person(violation: PpeDetection, persons: list[PpeDetection]) -> PpeDetection | None:
    best: PpeDetection | None = None
    best_area = float("inf")
    for person in persons:
        pb = person.bbox
        region = _person_match_region(pb, violation.behavior)
        if not _center_inside(violation.bbox, region):
            continue
        area = (pb[2] - pb[0]) * (pb[3] - pb[1])
        if area < best_area:
            best_area = area
            best = person
    return best


def _is_violation_track_id(track_id: str) -> bool:
    return any(track_id.endswith(f":{behavior}") for behavior in _EVENT_BEHAVIORS)


class PpeEngine:
    def __init__(self, store: EventStore):
        self.store = store
        self._tracks: dict[str, dict[str, _PpeTrack]] = {}
        self._gates: dict[str, dict[str, PersistenceDebouncer]] = {}
        self._active_segment: dict[str, str] = {}

    def _tracks_for(self, camera_id: str) -> dict[str, _PpeTrack]:
        if camera_id not in self._tracks:
            self._tracks[camera_id] = {}
        return self._tracks[camera_id]

    def _gate_for(self, camera_id: str, track_id: str) -> PersistenceDebouncer:
        if camera_id not in self._gates:
            self._gates[camera_id] = {}
        if track_id not in self._gates[camera_id]:
            behavior = track_id.split(":")[1] if ":" in track_id else ""
            confirm = _CONFIRM_SECONDS
            if behavior == "person" and camera_id.startswith("HC-"):
                confirm = 0.15
            elif camera_id.startswith("HC-"):
                # Mobile helmet — log PPE nhanh hơn cam cố định
                confirm = 0.45
            elif not settings.event_dedup_enabled() and behavior in ("no_vest", "no_shoes"):
                confirm = 0.6
            self._gates[camera_id][track_id] = PersistenceDebouncer(
                min_duration_seconds=settings.event_debounce_min_seconds(confirm),
                cooldown_seconds=settings.event_repeat_seconds(_REPEAT_SECONDS),
                max_gap_seconds=_MAX_GAP_SECONDS,
                one_event_per_episode=(
                    settings.event_log_one_per_episode
                    and not (behavior == "person" and camera_id.startswith("HC-"))
                ),
            )
        return self._gates[camera_id][track_id]

    def reset_camera(self, camera_id: str) -> None:
        self._tracks.pop(camera_id, None)
        self._gates.pop(camera_id, None)
        self._active_segment.pop(camera_id, None)

    @staticmethod
    def _resolve_segment_key(camera_id: str, source_pts_sec: float | None) -> str:
        if camera_id != "A-04" or source_pts_sec is None:
            return "default"
        t = float(source_pts_sec)
        if 9.5 <= t <= 15.0:
            return "ppe"
        if 21.0 <= t <= 25.0:
            return "wah"
        return "other"

    def process_frame(
        self,
        frame: np.ndarray,
        camera_id: str,
        *,
        capture_frame: np.ndarray | None = None,
        source_pts_sec: float | None = None,
    ) -> tuple[dict, list[ViolationEvent]]:
        seg = self._resolve_segment_key(camera_id, source_pts_sec)
        if self._active_segment.get(camera_id) != seg:
            self._tracks.pop(camera_id, None)
            self._gates.pop(camera_id, None)
            self._active_segment[camera_id] = seg

        snapshot_source = capture_frame if capture_frame is not None else frame
        from .cam04_ppe_demo import is_cam04_ppe_violation_segment

        result = analyze_ppe_frame(frame, camera_id, source_pts_sec=source_pts_sec)
        tracks = self._tracks_for(camera_id)
        frame_h, frame_w = frame.shape[:2]
        now = time.time()
        new_events: list[ViolationEvent] = []

        # Cam A-04 — chỉ log/refresh PPE-001 trong segment 9.5–15s (tránh bbox lệch reel).
        if camera_id == "A-04" and not is_cam04_ppe_violation_segment(source_pts_sec):
            for track_id in list(tracks.keys()):
                self._gate_for(camera_id, track_id).register(False)
            result["events"] = []
            return result, []

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
        from .ppe_analyzer import _is_helmet_bodycam

        if _is_helmet_bodycam(camera_id):
            violations = [det for det in violations if det.behavior != "no_shoes"]

        matched_ids: set[str] = set()
        assigned_this_frame: set[str] = set()

        if len(tracks) + len(violations) > _MAX_TRACKS:
            violations.sort(key=lambda d: d.confidence, reverse=True)
            violations = violations[:_MAX_TRACKS]

        for det in violations:
            person = _match_person(det, persons)
            if person is None:
                continue

            from .ppe_analyzer import raw_person_bbox

            person_bbox = raw_person_bbox(person)
            copy_worker_identity(person, det)
            track_id = assign_person_track_id(
                person_bbox,
                tracks,
                behavior=det.behavior,
                frame_w=frame_w,
                frame_h=frame_h,
                max_tracks=_MAX_TRACKS,
                blocked_tracks=assigned_this_frame,
            )
            if track_id is None:
                continue
            assigned_this_frame.add(track_id)
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

            state.episode_best = merge_episode_best(
                state.episode_best,
                detection=det,
                analyze_frame=frame,
                capture_frame=snapshot_source,
                person_bbox=person_bbox,
                extra=(
                    {"source_pts_sec": float(source_pts_sec)}
                    if source_pts_sec is not None
                    else None
                ),
            )

            was_active = gate.snapshot()["active"]
            confirmed = gate.register(True)

            if confirmed and state.episode_best:
                pending = resync_ppe_episode(state.episode_best, camera_id)
                state.episode_best = None
                top_det = pending["detection"]
                if top_det.confidence >= _VIOLATION_MIN_CONF:
                    from .worker_identity.detection_enrich import sanitize_ppe_event_identity

                    sanitize_ppe_event_identity(top_det)
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
            if not _is_violation_track_id(track_id):
                continue
            gate = self._gate_for(camera_id, track_id)
            was_active = gate.snapshot()["active"]
            gate.register(False)
            if was_active and not gate.snapshot()["active"]:
                state.episode_best = None

        if camera_id.startswith("HC-"):
            from .event_dedup import build_dedup_key
            from .person_identity_registry import resolve_patrol_person_identity

            person_matched: set[str] = set()
            person_assigned: set[str] = set()
            frame_persons = persons
            if len(frame_persons) > _MAX_TRACKS:
                frame_persons = sorted(frame_persons, key=lambda d: d.confidence, reverse=True)[
                    :_MAX_TRACKS
                ]

            for person in frame_persons:
                from .ppe_analyzer import raw_person_bbox

                person_bbox = raw_person_bbox(person)
                track_id = assign_person_track_id(
                    person_bbox,
                    tracks,
                    behavior="person",
                    frame_w=frame_w,
                    frame_h=frame_h,
                    max_tracks=_MAX_TRACKS,
                    blocked_tracks=person_assigned,
                )
                if track_id is None:
                    continue
                person_assigned.add(track_id)
                person_matched.add(track_id)

                if track_id not in tracks:
                    if len(tracks) >= _MAX_TRACKS:
                        continue
                    tracks[track_id] = _PpeTrack("person")
                state = tracks[track_id]
                state.last_bbox = person_bbox
                state.person_bbox = person_bbox
                state.last_seen = now

                existing_wid = (person.worker_id or "").strip()
                if existing_wid and existing_wid not in ("", "unknown"):
                    worker_id = existing_wid
                    worker_name = (person.worker_name or worker_id).strip()
                    from .person_identity_registry import bind_patrol_track_identity

                    bind_patrol_track_identity(
                        camera_id,
                        track_id,
                        worker_id,
                        person_bbox=person_bbox,
                        frame_w=frame_w,
                        frame_h=frame_h,
                    )
                else:
                    worker_id, worker_name = resolve_patrol_person_identity(
                        person,
                        camera_id,
                        track_id,
                        person_bbox=person_bbox,
                        frame_w=frame_w,
                        frame_h=frame_h,
                    )
                det = person.model_copy(
                    update={
                        "worker_id": worker_id,
                        "worker_name": worker_name,
                        "scenario_id": "PERS-001",
                    },
                )
                stable_id = (worker_id or track_id or "person").strip()
                dedup_key = build_dedup_key(camera_id, "PERS-001", stable_id)
                existing = self.store.find_by_dedup_key(dedup_key)

                gate = self._gate_for(camera_id, track_id)
                confirmed = gate.register(True)

                if existing is None and not confirmed:
                    continue

                event = self.store.upsert_patrol_person(
                    det,
                    snapshot_source,
                    camera_id=camera_id,
                    track_id=track_id,
                    allow_create=existing is None,
                )
                if event:
                    new_events.append(event)
                    if existing is None:
                        logger.info(
                            "Person event [%s] %s track=%s conf=%.0f%%",
                            event.id,
                            worker_id,
                            track_id,
                            event.confidence * 100,
                        )

            for track_id in list(tracks.keys()):
                if not track_id.endswith(":person"):
                    continue
                if track_id in person_matched:
                    continue
                self._gate_for(camera_id, track_id).register(False)

        for track_id, state in list(tracks.items()):
            if now - state.last_seen > _TRACK_EXPIRE_SECONDS:
                tracks.pop(track_id, None)

        result["events"] = [e.model_dump() for e in new_events]
        return result, new_events
