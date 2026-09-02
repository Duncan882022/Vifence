"""Flush session buffer → SQLite (một lần ghi / tick, không theo frame)."""

from __future__ import annotations

import json
import logging

from .. import daystore, db
from ..sink import (
    _gate_observation_commit,
    _resolve_observation_gps,
    snapshot_score,
    track_accumulation_window_seconds,
)
from .serialize import build_event_payload
from .tripwire import site_entry_counted
from .types import ObservationInput, TrackSession

logger = logging.getLogger("patrol.aggregator.flush")

FLUSH_MIN_INTERVAL_SEC = 10.0
APPEARANCE_WRITE_MIN_INTERVAL_SEC = 2.0


def _frame_size_from_obs(obs: ObservationInput) -> tuple[int, int]:
    if obs.frame is not None:
        h, w = obs.frame.shape[:2]
        return int(w), int(h)
    return 1280, 720


def _object_commit_allowed(obs: ObservationInput, *, has_face: bool) -> bool:
    """Chặn ghi thẻ Đối tượng cho biển hiệu / vật tĩnh YOLO nhầm."""
    if obs.person_bbox is None:
        return False
    from ...patrol_flight_mode import is_patrol_flycam_aerial, is_patrol_helmet_like
    from ...patrol_person_visibility import patrol_object_commit_allowed

    frame_w, frame_h = _frame_size_from_obs(obs)
    flycam = is_patrol_flycam_aerial(obs.camera_id)
    proximity = (
        not is_patrol_helmet_like(obs.camera_id)
        and not flycam
        and obs.camera_id.startswith("DR-")
    )
    return patrol_object_commit_allowed(
        obs.person_bbox,
        frame_w,
        frame_h,
        face_eligible=bool(obs.face_eligible or has_face),
        flycam=flycam,
        proximity_flycam=proximity,
    )


def _needs_flush(session: TrackSession, *, finalize: bool) -> bool:
    """Một lần chốt khi vào khung; chỉ ghi lại khi finalize hoặc thay đổi đáng kể."""
    if finalize:
        return True
    if not session.committed:
        return session.dirty or session.appearance_row_id is None
    return session.dirty


def _card_has_snapshot(subject_id: str, ts: float) -> bool:
    """Thẻ ngày đã có JPG — dùng để ép chụp lần đầu cho Đối tượng."""
    from .. import identity

    date = db.today_vn(ts)
    from ...patrol_ids import is_person_subject_id

    if is_person_subject_id(subject_id):
        pid = identity.resolve_alias(subject_id)
        row = db.query_one(
            "SELECT snapshot_path FROM daily_events WHERE event_date = ? AND pers_id = ?",
            (date, pid),
        )
    else:
        row = db.query_one(
            "SELECT snapshot_path FROM daily_objects WHERE event_date = ? AND obj_id = ?",
            (date, subject_id),
        )
    return bool(row and (row["snapshot_path"] or "").strip())


def _appearance_row_has_snapshot(row_id: int) -> bool:
    row = db.query_one(
        "SELECT snapshot_path FROM appearances WHERE id = ?",
        (row_id,),
    )
    return bool(row and str(row["snapshot_path"] or "").strip())


def _within_accumulation_window(session: TrackSession, now: float) -> bool:
    if session.started_at <= 0:
        return False
    return (now - session.started_at) <= track_accumulation_window_seconds()


def _snapshot_observation(session: TrackSession, obs: ObservationInput) -> ObservationInput:
    """Trong cửa sổ tích lũy — chốt frame score cao nhất, không frame cuối."""
    if not _within_accumulation_window(session, obs.ts):
        return obs
    best = session.best_observation
    if best is not None and best.frame is not None and best.person_bbox is not None:
        return best
    return obs


def _luot_needs_snapshot(session: TrackSession, *, now: float) -> bool:
    """Một JPG/lượt — trong cửa sổ 2s vẫn thay nếu có frame đẹp hơn."""
    if _within_accumulation_window(session, now):
        return True
    if session.luot_snapshot_captured:
        return False
    rid = session.appearance_row_id
    if rid is not None and _appearance_row_has_snapshot(rid):
        session.luot_snapshot_captured = True
        return False
    return True


def _write_snapshot(session: TrackSession, obs: ObservationInput) -> tuple[str | None, float]:
    if obs.frame is None or obs.person_bbox is None or not session.subject_id:
        return None, 0.0
    from .. import sink
    from ...patrol_identity_lifecycle import tier_for_worker_id
    from ...patrol_person_visibility import patrol_snapshot_draw_bbox

    shot_obs = _snapshot_observation(session, obs)
    frame_w, frame_h = _frame_size_from_obs(shot_obs)
    draw_bbox = patrol_snapshot_draw_bbox(
        tuple(shot_obs.person_bbox),
        frame_w,
        frame_h,
    )

    score = snapshot_score(
        face_quality=shot_obs.face_quality,
        confidence=shot_obs.confidence,
    )
    tier = (shot_obs.lifecycle_tier or "").strip() or None
    worker_id = (shot_obs.lifecycle_worker_id or "").strip() or None
    if not tier and worker_id:
        inferred = tier_for_worker_id(worker_id)
        if inferred != "object":
            tier = inferred
    force = not _card_has_snapshot(session.subject_id, shot_obs.ts)
    path = sink._maybe_write_snapshot(  # noqa: SLF001
        session.subject_id,
        shot_obs.frame,
        draw_bbox,
        score=score,
        tier=tier,
        worker_id=worker_id,
        worker_name=shot_obs.worker_name,
        capture_ts=shot_obs.ts,
        face_eligible=shot_obs.face_eligible,
        force=force,
        luot_key=sink.CARD_SNAPSHOT_LUOT,
    )
    if path is None and force:
        path = sink._write_snapshot(  # noqa: SLF001
            session.subject_id,
            shot_obs.frame,
            draw_bbox,
            score=score,
            tier=tier,
            worker_id=worker_id,
            worker_name=shot_obs.worker_name,
            capture_ts=shot_obs.ts,
            face_eligible=shot_obs.face_eligible,
            luot_key=sink.CARD_SNAPSHOT_LUOT,
        )
    return path, score if path else 0.0


def flush_session(
    session: TrackSession,
    obs: ObservationInput,
    *,
    finalize: bool = False,
) -> None:
    """INSERT/UPDATE aggregated appearance + card ngoài (throttled)."""
    from .session_store import link_subject_session, resolve_parallel_object_subject

    if not _needs_flush(session, finalize=finalize):
        return
    now = obs.ts
    if (
        not finalize
        and not session.committed
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
        if (
            obs.person_bbox is not None
            and not _object_commit_allowed(obs, has_face=has_face)
        ):
            return
        gps_lat, gps_lng = _resolve_observation_gps(session.camera_id, at_ts=now)

        event_date = db.today_vn(now)
        parallel = resolve_parallel_object_subject(
            session.camera_id,
            session.started_at,
            now,
            event_date,
            bbox=obs.person_bbox,
        )
        if parallel:
            session.subject_id = parallel
            link_subject_session(session)
        else:
            obj_id = daystore.touch_object(
                None,
                camera_id=session.camera_id,
                zone_id=session.zone_id,
                now=now,
                seen_since=session.started_at if session.last_flush_at <= 0 else None,
                gps_lat=gps_lat,
                gps_lng=gps_lng,
                skip_appearance=True,
            )
            session.subject_id = obj_id
            link_subject_session(session)

    subject_id = session.subject_id
    if not subject_id:
        return

    gps_lat, gps_lng = _resolve_observation_gps(session.camera_id, at_ts=now)
    if site_entry_counted(session, gps_lat=gps_lat, gps_lng=gps_lng):
        session.counted = True

    worker_id = (obs.lifecycle_worker_id or "").strip() or None
    tier_at = (obs.lifecycle_tier or "").strip() or None
    if not tier_at and worker_id:
        from ...patrol_identity_lifecycle import tier_for_worker_id

        inferred = tier_for_worker_id(worker_id)
        if inferred != "object":
            tier_at = inferred

    payload = build_event_payload(session, tier_at_observation=tier_at)
    payload_json = json.dumps(payload, ensure_ascii=False)
    interactions_json = json.dumps(
        [i.to_dict() for i in session.interactions],
        ensure_ascii=False,
    )

    path, shot_score = (None, 0.0)

    if (
        subject_id
        and obs.frame is not None
        and obs.person_bbox is not None
        and _luot_needs_snapshot(session, now=now)
    ):
        shot_obs = _snapshot_observation(session, obs)
        path, shot_score = _write_snapshot(session, shot_obs)
        if path:
            session.luot_snapshot_captured = not _within_accumulation_window(session, now)

    from .identity_pipeline import try_promote_object_after_snapshot

    try_promote_object_after_snapshot(
        session,
        _snapshot_observation(session, obs),
        snapshot_path=path,
        snapshot_score=shot_score,
    )
    subject_id = session.subject_id or subject_id

    skip_appearance = True
    from ...patrol_ids import is_person_subject_id

    if is_person_subject_id(subject_id):
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
            skip_appearance=skip_appearance,
        )
    else:
        daystore.touch_object(
            subject_id,
            camera_id=session.camera_id,
            zone_id=session.zone_id,
            snapshot_path=path,
            snapshot_score=shot_score,
            now=now,
            seen_since=session.started_at if session.last_flush_at <= 0 else None,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
            skip_appearance=skip_appearance,
        )

    link_subject_session(session)

    if session.appearance_row_id is None:
        extend_id = daystore.find_extendable_track_appearance_row(
            db.today_vn(now),
            subject_id,
            session.camera_id,
            session.last_seen_at,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
        )
        if extend_id is not None:
            session.appearance_row_id = extend_id
        else:
            overlap_id = daystore.find_overlapping_appearance_row(
                db.today_vn(now),
                subject_id,
                session.camera_id,
                session.started_at,
                session.last_seen_at,
                session_id=session.session_id,
                track_id=session.track_id,
            )
            if overlap_id is not None:
                session.appearance_row_id = overlap_id

    if (
        session.committed
        and session.appearance_row_id is not None
        and not finalize
        and session.last_flush_at > 0
        and (now - session.last_flush_at) < APPEARANCE_WRITE_MIN_INTERVAL_SEC
    ):
        win = track_accumulation_window_seconds()
        at_win_end = (
            session.started_at > 0
            and (now - session.started_at) >= win
            and (session.last_flush_at - session.started_at) < win
            and session.best_observation is not None
        )
        if not at_win_end:
            session.dirty = False
            return

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
    session.committed = True
    session.dirty = False

    if subject_id.startswith("obj-"):
        daystore.coalesce_subject_appearances(
            subject_id,
            db.today_vn(now),
            camera_id=session.camera_id,
        )
    elif subject_id.startswith("tk-") or subject_id.startswith("pers-"):
        daystore.coalesce_subject_appearances(
            subject_id,
            db.today_vn(now),
            camera_id=session.camera_id,
        )


def finalize_session(session: TrackSession) -> None:
    """Đóng session khi ByteTrack mất track."""
    fallback = ObservationInput(
        camera_id=session.camera_id,
        track_id=session.track_id,
        ts=session.last_seen_at,
        zone_id=session.zone_id,
    )
    obs = session.best_observation if (
        session.best_observation is not None
        and session.best_observation.frame is not None
    ) else fallback
    session.dirty = True
    flush_session(session, obs, finalize=True)
    logger.debug(
        "finalized track %s subject %s duration %.1fs interactions %d",
        session.track_id,
        session.subject_id,
        session.duration_seconds,
        len(session.interactions),
    )
