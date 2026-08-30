"""Flush session buffer → SQLite (một lần ghi / tick, không theo frame)."""

from __future__ import annotations

import json
import logging

from .. import daystore, db
from ..sink import _gate_observation_commit, _resolve_observation_gps, snapshot_score
from .serialize import build_event_payload
from .tripwire import site_entry_counted
from .types import ObservationInput, TrackSession

logger = logging.getLogger("patrol.aggregator.flush")

FLUSH_MIN_INTERVAL_SEC = 10.0


def _write_snapshot(session: TrackSession, obs: ObservationInput) -> tuple[str | None, float]:
    if obs.frame is None or obs.person_bbox is None or not session.subject_id:
        return None, 0.0
    from .. import sink

    score = snapshot_score(face_quality=obs.face_quality, confidence=obs.confidence)
    path = sink._maybe_write_snapshot(  # noqa: SLF001
        session.subject_id,
        obs.frame,
        obs.person_bbox,
        score=score,
        tier=obs.lifecycle_tier,
        worker_id=obs.lifecycle_worker_id,
        worker_name=obs.worker_name,
        capture_ts=obs.ts,
    )
    return path, score if path else 0.0


def flush_session(
    session: TrackSession,
    obs: ObservationInput,
    *,
    finalize: bool = False,
) -> None:
    """INSERT/UPDATE aggregated appearance + card ngoài (throttled)."""
    if not session.dirty and not finalize:
        return
    now = obs.ts
    if (
        not finalize
        and session.last_flush_at > 0
        and (now - session.last_flush_at) < FLUSH_MIN_INTERVAL_SEC
    ):
        return

    key = session.session_key
    if session.subject_id is None:
        has_face = bool(session.best_faces) or obs.face_eligible
        ok, _anchor = _gate_observation_commit(key, has_face=has_face, now=now)
        if not ok and not finalize:
            return
        gps_lat, gps_lng = _resolve_observation_gps(session.camera_id, at_ts=now)
        obj_id = daystore.touch_object(
            None,
            camera_id=session.camera_id,
            zone_id=session.zone_id,
            now=now,
            seen_since=session.started_at if session.last_flush_at <= 0 else None,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
        )
        session.subject_id = obj_id

    subject_id = session.subject_id
    if not subject_id:
        return

    gps_lat, gps_lng = _resolve_observation_gps(session.camera_id, at_ts=now)
    if site_entry_counted(session, gps_lat=gps_lat, gps_lng=gps_lng):
        session.counted = True

    payload = build_event_payload(session)
    payload_json = json.dumps(payload, ensure_ascii=False)
    interactions_json = json.dumps(
        [i.to_dict() for i in session.interactions],
        ensure_ascii=False,
    )

    path, shot_score = (None, 0.0)
    if subject_id.startswith("pers-"):
        if obs.face_eligible:
            path, shot_score = _write_snapshot(session, obs)
        daystore.touch_person_event(
            subject_id,
            camera_id=session.camera_id,
            zone_id=session.zone_id,
            snapshot_path=path,
            snapshot_score=shot_score,
            face_eligible=obs.face_eligible,
            now=now,
            seen_since=session.started_at if session.last_flush_at <= 0 else None,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
        )
    else:
        daystore.touch_object(
            subject_id,
            camera_id=session.camera_id,
            zone_id=session.zone_id,
            now=now,
            seen_since=session.started_at if session.last_flush_at <= 0 else None,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
        )

    row_id = daystore.upsert_track_appearance(
        appearance_id=session.appearance_row_id,
        event_date=db.today_vn(now),
        subject_id=subject_id,
        camera_id=session.camera_id,
        zone_id=session.zone_id,
        track_id=session.track_id,
        session_id=session.session_id or "",
        started_at=session.started_at,
        ended_at=session.last_seen_at,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
        payload_json=payload_json,
        interactions_json=interactions_json,
        snapshot_path=path,
        counted=session.counted,
        finalize=finalize,
    )
    session.appearance_row_id = row_id
    session.last_flush_at = now
    session.dirty = False


def finalize_session(session: TrackSession) -> None:
    """Đóng session khi ByteTrack mất track."""
    dummy = ObservationInput(
        camera_id=session.camera_id,
        track_id=session.track_id,
        ts=session.last_seen_at,
        zone_id=session.zone_id,
    )
    session.dirty = True
    flush_session(session, dummy, finalize=True)
    logger.debug(
        "finalized track %s subject %s duration %.1fs interactions %d",
        session.track_id,
        session.subject_id,
        session.duration_seconds,
        len(session.interactions),
    )
