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


def _apply_encounter_split(session, ts: float) -> None:
    session.appearance_row_id = None
    session.luot_snapshot_captured = False
    # Lượt mới → file JPG mới. Giữ khoá cũ là lượt sau ghi đè ảnh lượt trước.
    session.luot_key = None
    session.started_at = ts
    session.committed = False
    session.last_flush_at = 0.0
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
    # Chưa chốt lượt đầu — gap lớn vẫn cùng track ByteTrack, giữ mốc first_seen.
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
    # Giữ last_seen_at = lần quan sát cuối (touch). Không kéo ended_at tới lúc
    # drop muộn khi cam tắt lâu rồi mới finalize lúc bật lại.
    if now is not None and session.last_seen_at <= 0:
        session.last_seen_at = float(now)
    if end_reason:
        session.end_reason = str(end_reason)
    finalize_session(session)
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


def reset_sessions(camera_id: str | None = None) -> None:
    reset(camera_id)
