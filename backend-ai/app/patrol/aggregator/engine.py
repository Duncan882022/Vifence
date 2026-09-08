"""Orchestrator — ingest song song identity + behavior, flush có throttle."""

from __future__ import annotations

import logging

from ...config import settings
from .behavior_pipeline import process_behavior
from .face_assess import enrich_observation_face
from .flush import finalize_session, flush_session, write_person_card
from .identity_pipeline import process_identity
from .person_commit import (
    maybe_commit_person,
    maybe_commit_person_from_lifecycle,
    maybe_commit_returning_person,
)
from .session_store import get_or_create, pop_session, reset
from .tripwire import site_entry_counted
from .types import ObservationInput

logger = logging.getLogger("patrol.aggregator.engine")


def _apply_encounter_split(session, ts: float) -> None:
    session.appearance_row_id = None
    session.luot_snapshot_captured = False
    session.luot_key = None
    session.started_at = ts
    session.committed = False
    session.person_committed = False
    session.face_checks_disabled = False
    session.lifecycle_state = "ACTIVE"
    session.last_flush_at = 0.0
    session.last_face_assess_at = 0.0
    from .session_store import _new_session_id

    session.session_id = _new_session_id(session.camera_id, session.track_id)
    session.dirty = True


def _maybe_split_encounter(session, ts: float) -> None:
    """Sau khi rời khung >45s (tắt phát sóng, mất track) — lượt gặp mới trên cùng camera."""
    from ...patrol_stream_lifecycle import split_sessions_after_stream_resume

    if split_sessions_after_stream_resume(
        session.camera_id,
        obs_ts=ts,
        current_session=session,
    ):
        return
    if not session.committed:
        return
    if session.last_seen_at <= 0 or ts <= session.last_seen_at + 1e-6:
        return
    from ..presence import GAP_FALLBACK_SEC

    if ts - session.last_seen_at <= GAP_FALLBACK_SEC:
        return
    _apply_encounter_split(session, ts)


def _maybe_update_best_observation(session, obs: ObservationInput) -> None:
    """Giữ frame score cao nhất — không drop frame cũ khi chưa có frame tốt hơn."""
    if obs.frame is None or obs.person_bbox is None:
        return
    from ..sink import snapshot_score

    score = snapshot_score(face_quality=obs.face_quality, confidence=obs.confidence)
    # Lifecycle: đã có mặt re-ID — không để khung lưng (YOLO conf cao) thay thế.
    if not obs.face_eligible:
        if session.best_face_observation is not None:
            return
        if (
            session.best_observation is not None
            and session.best_observation.face_eligible
        ):
            return
    if session.best_observation is None or score >= session.best_observation_score:
        session.best_observation = obs
        session.best_observation_score = score


def _flush_due(session, obs: ObservationInput) -> bool:
    """Chốt DB có kiểm soát — không ghi mỗi frame trong cửa sổ 2s."""
    from ..daystore import TOUCH_MIN_INTERVAL_SEC
    from ..sink import track_accumulation_window_seconds

    if session.dirty and session.last_flush_at <= 0:
        return True
    if session.last_flush_at > 0 and (obs.ts - session.last_flush_at) >= TOUCH_MIN_INTERVAL_SEC:
        return True
    win = track_accumulation_window_seconds()
    if (
        session.committed
        and session.started_at > 0
        and session.last_flush_at > 0
        and session.best_observation is not None
        and (obs.ts - session.started_at) >= win
        and (session.last_flush_at - session.started_at) < win
    ):
        return True
    return False


def _remember_lifecycle(session, obs: ObservationInput) -> None:
    wid = (obs.lifecycle_worker_id or "").strip()
    tier = (obs.lifecycle_tier or "").strip()
    if wid:
        session.last_lifecycle_worker_id = wid
    if tier:
        session.last_lifecycle_tier = tier
    if obs.worker_name:
        session.last_worker_name = obs.worker_name


def _ingest_deferred(**kwargs) -> str | None:
    """Luồng mới: person commit sớm, object chỉ finalize."""
    obs = ObservationInput(
        camera_id=str(kwargs.get("camera_id") or ""),
        track_id=str(kwargs.get("track_id") or ""),
        ts=float(kwargs.get("now") or __import__("time").time()),
        person_bbox=tuple(kwargs["person_bbox"]) if kwargs.get("person_bbox") else None,
        zone_id=kwargs.get("zone_id"),
        face_embedding=tuple(kwargs["face_embedding"]) if kwargs.get("face_embedding") else None,
        face_quality=float(kwargs.get("face_quality") or 0.0),
        face_eligible=bool(kwargs.get("face_eligible")),
        confidence=float(kwargs.get("confidence") or 0.0),
        frame=kwargs.get("frame"),
        lifecycle_tier=kwargs.get("lifecycle_tier"),
        lifecycle_worker_id=kwargs.get("lifecycle_worker_id"),
        worker_name=kwargs.get("worker_name"),
        touched_object_id=kwargs.get("touched_object_id"),
        density_only=bool(kwargs.get("density_only")),
    )
    if not obs.camera_id or not obs.track_id:
        return None

    if obs.density_only:
        return None

    session = get_or_create(
        obs.camera_id,
        obs.track_id,
        ts=obs.ts,
        zone_id=obs.zone_id,
        bbox=obs.person_bbox,
        face_embedding=obs.face_embedding,
    )
    _maybe_split_encounter(session, obs.ts)
    session.touch(obs.ts, obs.person_bbox)
    _maybe_update_best_observation(session, obs)
    _remember_lifecycle(session, obs)

    if not session.is_abandoned():
        if obs.face_embedding and obs.face_eligible:
            from .identity_pipeline import _note_best_frame

            _note_best_frame(session, obs)
        obs = enrich_observation_face(session, obs)
        _maybe_update_best_observation(session, obs)
        _remember_lifecycle(session, obs)
        maybe_commit_returning_person(session, obs)
        if not session.person_committed:
            maybe_commit_person(session, obs)
        if not session.person_committed:
            maybe_commit_person_from_lifecycle(session, obs, finalize=False)
        if not session.person_committed:
            from .person_commit import maybe_promote_deferred_object_session

            maybe_promote_deferred_object_session(session, obs)

    if session.person_committed:
        if obs.touched_object_id:
            process_behavior(session, obs)
        if not session.counted:
            from ..sink import _resolve_observation_gps

            gps_lat, gps_lng = _resolve_observation_gps(session.camera_id, at_ts=obs.ts)
            if site_entry_counted(session, gps_lat=gps_lat, gps_lng=gps_lng):
                session.dirty = True
        if _flush_due(session, obs):
            write_person_card(session, obs, first_commit=False)
        return session.subject_id

    if obs.touched_object_id:
        process_behavior(session, obs)
    return session.subject_id


def ingest_observation(**kwargs) -> str | None:
    """Điểm vào thay ``record_observation`` khi ``PATROL_USE_AGGREGATOR=1``."""
    if getattr(settings, "patrol_deferred_object", True):
        return _ingest_deferred(**kwargs)

    obs = ObservationInput(
        camera_id=str(kwargs.get("camera_id") or ""),
        track_id=str(kwargs.get("track_id") or ""),
        ts=float(kwargs.get("now") or __import__("time").time()),
        person_bbox=tuple(kwargs["person_bbox"]) if kwargs.get("person_bbox") else None,
        zone_id=kwargs.get("zone_id"),
        face_embedding=tuple(kwargs["face_embedding"]) if kwargs.get("face_embedding") else None,
        face_quality=float(kwargs.get("face_quality") or 0.0),
        face_eligible=bool(kwargs.get("face_eligible")),
        confidence=float(kwargs.get("confidence") or 0.0),
        frame=kwargs.get("frame"),
        lifecycle_tier=kwargs.get("lifecycle_tier"),
        lifecycle_worker_id=kwargs.get("lifecycle_worker_id"),
        worker_name=kwargs.get("worker_name"),
        touched_object_id=kwargs.get("touched_object_id"),
        density_only=bool(kwargs.get("density_only")),
    )
    if not obs.camera_id or not obs.track_id:
        return None

    session = get_or_create(
        obs.camera_id,
        obs.track_id,
        ts=obs.ts,
        zone_id=obs.zone_id,
        bbox=obs.person_bbox,
        face_embedding=obs.face_embedding,
    )
    _maybe_split_encounter(session, obs.ts)
    session.touch(obs.ts, obs.person_bbox)
    _maybe_update_best_observation(session, obs)

    if session.committed and not obs.density_only:
        process_identity(session, obs)
        if obs.touched_object_id:
            process_behavior(session, obs)
        if not session.counted:
            from ..sink import _resolve_observation_gps

            gps_lat, gps_lng = _resolve_observation_gps(session.camera_id, at_ts=obs.ts)
            if site_entry_counted(session, gps_lat=gps_lat, gps_lng=gps_lng):
                session.dirty = True
        from ..daystore import TOUCH_MIN_INTERVAL_SEC

        due = _flush_due(session, obs)
        if due:
            flush_session(session, obs)
        return session.subject_id

    if session.committed and obs.density_only:
        due = _flush_due(session, obs)
        if due:
            flush_session(session, obs)
        return session.subject_id

    process_identity(session, obs)
    process_behavior(session, obs)
    flush_session(session, obs)
    return session.subject_id


def reset_sessions(camera_id: str | None = None) -> None:
    reset(camera_id)


def finalize_track(
    camera_id: str,
    track_id: str,
    *,
    now: float | None = None,
    end_reason: str | None = None,
) -> None:
    from .lost_track_memory import stash_session

    session = pop_session(camera_id, track_id)
    if session is None:
        return
    if now is not None and session.last_seen_at <= 0:
        session.last_seen_at = float(now)
    if end_reason:
        session.end_reason = str(end_reason)
    finalize_session(session, finalize_at=now)
    emb = session.best_faces[0].embedding if session.best_faces else None
    stash_session(session, embedding=emb)


def finalize_orphan_sessions(camera_id: str, *, end_reason: str | None = None) -> int:
    """Session aggregator còn trong RAM nhưng tracker đã drop."""
    from .session_store import pop_all_sessions

    closed = 0
    for session in pop_all_sessions(camera_id):
        if end_reason:
            session.end_reason = str(end_reason)
        finalize_session(session)
        closed += 1
    return closed
