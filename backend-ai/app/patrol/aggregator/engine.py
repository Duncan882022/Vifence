"""Orchestrator — ingest song song identity + behavior, flush có throttle."""

from __future__ import annotations

import logging

from .behavior_pipeline import process_behavior
from .flush import finalize_session, flush_session
from .identity_pipeline import process_identity
from .session_store import get_or_create, pop_session, reset
from .tripwire import site_entry_counted
from .types import ObservationInput

logger = logging.getLogger("patrol.aggregator.engine")


def ingest_observation(**kwargs) -> str | None:
    """Điểm vào thay ``record_observation`` khi ``PATROL_USE_AGGREGATOR=1``."""
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
    session.touch(obs.ts, obs.person_bbox)

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

        due = (
            session.dirty
            or session.last_flush_at <= 0
            or (obs.ts - session.last_flush_at) >= TOUCH_MIN_INTERVAL_SEC
        )
        if due:
            flush_session(session, obs)
        return session.subject_id

    process_identity(session, obs)
    process_behavior(session, obs)
    flush_session(session, obs)
    return session.subject_id


def finalize_track(camera_id: str, track_id: str, *, now: float | None = None) -> None:
    from .lost_track_memory import stash_session

    session = pop_session(camera_id, track_id)
    if session is None:
        return
    # Giữ last_seen_at = lần quan sát cuối (touch). Không kéo ended_at tới lúc
    # drop muộn khi cam tắt lâu rồi mới finalize lúc bật lại.
    if now is not None and session.last_seen_at <= 0:
        session.last_seen_at = float(now)
    finalize_session(session)
    emb = session.best_faces[0].embedding if session.best_faces else None
    stash_session(session, embedding=emb)


def finalize_orphan_sessions(camera_id: str) -> int:
    """Session aggregator còn trong RAM nhưng tracker đã drop."""
    from .session_store import pop_all_sessions

    closed = 0
    for session in pop_all_sessions(camera_id):
        finalize_session(session)
        closed += 1
    return closed


def reset_sessions(camera_id: str | None = None) -> None:
    reset(camera_id)
