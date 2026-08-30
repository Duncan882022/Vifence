"""Orchestrator — ingest song song identity + behavior, flush có throttle."""

from __future__ import annotations

import logging

from .behavior_pipeline import process_behavior
from .flush import finalize_session, flush_session
from .identity_pipeline import process_identity
from .session_store import get_or_create, pop_session, reset
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
    )
    session.touch(obs.ts, obs.person_bbox)

    # Song song: identity ∥ behavior (không if/else loại trừ)
    process_identity(session, obs)
    process_behavior(session, obs)

    flush_session(session, obs)
    return session.subject_id


def finalize_track(camera_id: str, track_id: str, *, now: float | None = None) -> None:
    session = pop_session(camera_id, track_id)
    if session is None:
        return
    if now is not None:
        session.last_seen_at = float(now)
    finalize_session(session)


def reset_sessions(camera_id: str | None = None) -> None:
    reset(camera_id)
