"""Ghi Đối tượng chỉ lúc finalize — vét cạn mặt trước khi touch_object."""

from __future__ import annotations

import logging

from ...config import settings
from .. import daystore, identity
from .person_commit import maybe_commit_person
from .types import ObservationInput, TrackSession

logger = logging.getLogger("patrol.aggregator.object_finalize")


def pre_object_match_guard(embedding: tuple[float, ...]) -> str | None:
    """Tránh obj khi embedding đã khớp hồ sơ hôm nay."""
    if not getattr(settings, "patrol_pre_object_match_enabled", True):
        return None
    matched, _sim = identity.match_face_for_observe(embedding)
    if matched:
        return identity.resolve_alias(matched)
    return None


def _min_track_sec() -> float:
    return float(getattr(settings, "patrol_object_finalize_min_track_sec", 0.75) or 0.75)


def finalize_object_if_needed(
    session: TrackSession,
    obs: ObservationInput,
    *,
    finalize_at: float | None = None,
) -> str | None:
    """Retry person commit rồi ghi obj-* nếu vẫn chưa có thẻ người."""
    if session.person_committed:
        return None

    late_pers = maybe_commit_person(session, obs, allow_recover=True)
    if late_pers:
        return None

    from .person_commit import maybe_commit_person_from_lifecycle

    if maybe_commit_person_from_lifecycle(session, obs, finalize=True):
        return None

    now = float(finalize_at if finalize_at is not None else obs.ts)
    duration = max(0.0, now - session.started_at) if session.started_at > 0 else 0.0
    if duration < _min_track_sec():
        return None

    if session.best_faces and session.best_faces[0].embedding is not None:
        guard = pre_object_match_guard(session.best_faces[0].embedding)
        if guard:
            session.mark_person_committed(guard)
            from .flush import write_person_card

            write_person_card(session, obs, first_commit=True)
            return None

    from .flush import _object_commit_allowed

    if not _object_commit_allowed(obs, has_face=bool(session.best_faces)):
        return None

    from ..sink import _resolve_observation_gps

    gps_lat, gps_lng = _resolve_observation_gps(session.camera_id, at_ts=now)
    obj_id = daystore.touch_object(
        None,
        camera_id=session.camera_id,
        zone_id=session.zone_id,
        now=now,
        seen_since=session.started_at,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
        skip_appearance=True,
    )
    session.subject_id = obj_id
    session.committed = True
    session.lifecycle_state = "FINALIZED"
    logger.info(
        "object finalize %s track %s duration %.1fs",
        obj_id,
        session.track_id,
        duration,
    )
    return obj_id
