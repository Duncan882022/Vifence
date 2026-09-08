"""Commit sớm Người/Định danh khi best face đủ — lục hồ sơ → upsert/tạo mới → abandon."""

from __future__ import annotations

import logging

from ...config import settings
from .. import daystore, identity
from .identity_pipeline import (
    MIN_QUALITY_FOR_NEW_IDENTITY,
    MIN_QUALITY_FOR_SEARCH,
    _human_face_promotion_allowed,
    _note_best_frame,
    _pick_search_embedding,
)
from .types import IdentityType, ObservationInput, PersonIdentity, TrackSession

logger = logging.getLogger("patrol.aggregator.person_commit")


def _commit_min_quality() -> float:
    return float(getattr(settings, "patrol_person_commit_min_quality", 0.62) or 0.62)


def _commit_fast_quality() -> float:
    return float(getattr(settings, "patrol_person_commit_fast_quality", 0.75) or 0.75)


def _observation_gps(obs: ObservationInput) -> tuple[float | None, float | None]:
    from ...patrol_gps_sim import resolve_patrol_observation_gps

    return resolve_patrol_observation_gps(obs.camera_id, at_ts=obs.ts)


def _best_commit_embedding(
    session: TrackSession,
    obs: ObservationInput,
) -> tuple[tuple[float, ...], float, ObservationInput] | None:
    """Embedding + obs nguồn tốt nhất cho commit."""
    work_obs = obs
    emb = obs.face_embedding
    quality = float(obs.face_quality or 0.0)
    picked = _pick_search_embedding(session)
    if picked is not None:
        p_emb, p_q = picked
        if emb is None or p_q > quality:
            emb, quality = p_emb, p_q
    if emb is None or quality < MIN_QUALITY_FOR_SEARCH:
        return None
    if not obs.face_eligible and picked is None:
        return None
    if picked is not None and (emb is obs.face_embedding or quality <= float(obs.face_quality or 0)):
        pass
    elif not _human_face_promotion_allowed(obs):
        if picked is None:
            return None
        work_obs = _observation_from_best_face(session, obs)
        if work_obs is None or not _human_face_promotion_allowed(work_obs):
            return None
    return emb, quality, work_obs


def _observation_from_best_face(
    session: TrackSession,
    obs: ObservationInput,
) -> ObservationInput | None:
    if not session.best_faces or session.best_faces[0].embedding is None:
        return obs if obs.face_eligible else None
    best = session.best_faces[0]
    return ObservationInput(
        camera_id=obs.camera_id,
        track_id=obs.track_id,
        ts=best.captured_at or obs.ts,
        person_bbox=obs.person_bbox,
        zone_id=obs.zone_id,
        face_embedding=best.embedding,
        face_quality=float(best.quality),
        face_eligible=True,
        confidence=obs.confidence,
        frame=obs.frame,
        lifecycle_tier=obs.lifecycle_tier,
        lifecycle_worker_id=obs.lifecycle_worker_id,
        worker_name=obs.worker_name,
        touched_object_id=obs.touched_object_id,
        density_only=obs.density_only,
    )


def should_attempt_person_commit(session: TrackSession, obs: ObservationInput) -> bool:
    if session.person_committed or session.is_abandoned():
        return False
    picked = _best_commit_embedding(session, obs)
    if picked is None:
        return False
    _emb, quality, _work = picked
    min_q = _commit_min_quality()
    if quality >= min_q:
        return True
    duration = session.duration_seconds
    min_track = float(getattr(settings, "patrol_object_finalize_min_track_sec", 0.75) or 0.75)
    if duration < min_track and quality >= _commit_fast_quality():
        return True
    return False


def commit_person_from_evidence(
    session: TrackSession,
    obs: ObservationInput,
    embedding: tuple[float, ...],
    quality: float,
) -> str:
    """SQLite → gallery → observe_face (tạo mới draft)."""
    wid = (obs.lifecycle_worker_id or "").strip()
    from ...person_identity_registry import is_sgc_worker_id
    from ...patrol_identity_lifecycle import tier_for_worker_id

    tier = (obs.lifecycle_tier or "").strip() or (tier_for_worker_id(wid) if wid else "")
    if wid and tier == "identity":
        person = identity.get_person(identity.resolve_alias(wid))
        if person and person.get("status") == identity.STATUS_IDENTIFIED:
            pid = identity.resolve_alias(wid)
            identity.add_face_angle(
                pid,
                embedding,
                quality=max(float(quality), MIN_QUALITY_FOR_SEARCH),
                camera_id=obs.camera_id,
                frame=obs.frame,
                person_bbox=obs.person_bbox,
            )
            from .. import db

            with db.tx() as c:
                c.execute(
                    "UPDATE persons SET last_seen = ? WHERE pers_id = ?",
                    (obs.ts, pid),
                )
            session.identity = PersonIdentity(
                person_id=pid,
                identity_type=IdentityType.KNOWN,
                confidence=min(0.99, max(float(quality), MIN_QUALITY_FOR_SEARCH)),
            )
            return pid

    pref_tk = wid if is_sgc_worker_id(wid) else None
    gps_lat, gps_lng = _observation_gps(obs)
    q = max(float(quality), MIN_QUALITY_FOR_SEARCH)
    pers_id, _created = identity.observe_face(
        embedding,
        quality=q,
        camera_id=obs.camera_id,
        now=obs.ts,
        frame=obs.frame,
        person_bbox=obs.person_bbox,
        preferred_tk=pref_tk,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
    )
    pers_id = identity.resolve_alias(pers_id)
    if wid and is_sgc_worker_id(wid):
        from ..sink import _bind_tk_profile

        _bind_tk_profile(wid, pers_id)
    session.identity = PersonIdentity(
        person_id=pers_id,
        identity_type=IdentityType.KNOWN,
        confidence=min(0.99, q),
    )
    return pers_id


def _remember_lifecycle(session: TrackSession, obs: ObservationInput) -> None:
    wid = (obs.lifecycle_worker_id or "").strip()
    tier = (obs.lifecycle_tier or "").strip()
    if wid:
        session.last_lifecycle_worker_id = wid
    if tier:
        session.last_lifecycle_tier = tier
    if obs.worker_name:
        session.last_worker_name = obs.worker_name


def _observation_with_session_lifecycle(
    session: TrackSession,
    obs: ObservationInput,
) -> ObservationInput:
    """Finalize fallback — bổ sung tk tier từ session nếu obs thiếu."""
    if (obs.lifecycle_worker_id or obs.lifecycle_tier):
        return obs
    if not (session.last_lifecycle_worker_id or session.last_lifecycle_tier):
        return obs
    return ObservationInput(
        camera_id=obs.camera_id,
        track_id=obs.track_id,
        ts=obs.ts,
        person_bbox=obs.person_bbox,
        zone_id=obs.zone_id,
        face_embedding=obs.face_embedding,
        face_quality=obs.face_quality,
        face_eligible=obs.face_eligible,
        confidence=obs.confidence,
        frame=obs.frame,
        lifecycle_tier=session.last_lifecycle_tier,
        lifecycle_worker_id=session.last_lifecycle_worker_id,
        worker_name=session.last_worker_name or obs.worker_name,
        touched_object_id=obs.touched_object_id,
        density_only=obs.density_only,
    )


def maybe_commit_person_from_lifecycle(
    session: TrackSession,
    obs: ObservationInput,
    *,
    finalize: bool = False,
) -> str | None:
    """Bridge tier Người live (tk-*) → daily_events khi chưa commit qua mặt."""
    if session.person_committed or session.is_abandoned():
        return session.subject_id

    wid = (obs.lifecycle_worker_id or "").strip()
    tier = (obs.lifecycle_tier or "").strip()
    if not wid:
        return None

    from ...patrol_identity_lifecycle import TIER_IDENTITY, TIER_PERSON, tier_for_worker_id
    from ...person_identity_registry import is_sgc_worker_id

    if not tier:
        tier = tier_for_worker_id(wid)
    if tier not in (TIER_PERSON, TIER_IDENTITY):
        return None

    gps_lat, gps_lng = _observation_gps(obs)

    if tier == TIER_IDENTITY or not is_sgc_worker_id(wid):
        from ..sink import _pers_id_for_lifecycle

        pers_id = _pers_id_for_lifecycle(tier, wid, now=obs.ts)
        if not pers_id:
            return None
        pers_id = identity.resolve_alias(pers_id)
        from ...patrol_ids import normalize_track_id

        tk = normalize_track_id(wid)
        if tk and is_sgc_worker_id(tk):
            from ..sink import _bind_tk_profile

            _bind_tk_profile(tk, pers_id)
    else:
        from ...patrol_ids import normalize_track_id

        tk = normalize_track_id(wid)
        if not tk:
            return None
        pers_id = identity.ensure_draft_for_tk(
            tk,
            now=obs.ts,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
            camera_id=obs.camera_id,
            face_eligible=obs.face_eligible,
        )
        from ..sink import _bind_tk_profile

        _bind_tk_profile(tk, pers_id)

    session.mark_person_committed(pers_id)
    from .flush import write_person_card

    write_person_card(session, obs, first_commit=True, finalize=finalize)
    from .session_store import link_pers_session

    link_pers_session(session)
    logger.info(
        "lifecycle person commit %s track %s tier %s finalize=%s",
        pers_id,
        session.track_id,
        tier,
        finalize,
    )
    return pers_id


def maybe_commit_person(
    session: TrackSession,
    obs: ObservationInput,
    *,
    allow_recover: bool = False,
) -> str | None:
    """Thử commit person card; trả pers_id nếu thành công."""
    if session.person_committed:
        return session.subject_id

    work_obs = obs
    if allow_recover and obs.frame is not None and obs.person_bbox is not None:
        from ...worker_identity.recognizer import recover_patrol_face_embedding

        bbox = [float(v) for v in obs.person_bbox]
        recovered = recover_patrol_face_embedding(obs.frame, bbox, camera_id=obs.camera_id)
        if recovered is not None:
            emb_list, score = recovered
            work_obs = ObservationInput(
                camera_id=obs.camera_id,
                track_id=obs.track_id,
                ts=obs.ts,
                person_bbox=obs.person_bbox,
                zone_id=obs.zone_id,
                face_embedding=tuple(float(x) for x in emb_list),
                face_quality=float(score),
                face_eligible=True,
                confidence=obs.confidence,
                frame=obs.frame,
                lifecycle_tier=obs.lifecycle_tier,
                lifecycle_worker_id=obs.lifecycle_worker_id,
                worker_name=obs.worker_name,
                touched_object_id=obs.touched_object_id,
                density_only=obs.density_only,
            )
            _note_best_frame(session, work_obs)

    if not should_attempt_person_commit(session, work_obs):
        return None

    picked = _best_commit_embedding(session, work_obs)
    if picked is None:
        return None
    emb, quality, commit_obs = picked

    try:
        pers_id = commit_person_from_evidence(session, commit_obs, emb, quality)
    except Exception:  # noqa: BLE001
        logger.exception("person commit observe_face failed track %s", session.track_id)
        return None

    session.mark_person_committed(pers_id)
    from .flush import write_person_card

    write_person_card(session, commit_obs, first_commit=True)
    from .session_store import link_pers_session

    link_pers_session(session)
    logger.info(
        "person commit %s track %s camera %s",
        pers_id,
        session.track_id,
        session.camera_id,
    )
    return pers_id


def _commit_returning_person_card(
    session: TrackSession,
    obs: ObservationInput,
    pers_id: str,
    *,
    known_reason: str,
    finalize: bool = False,
    finalize_at: float | None = None,
) -> str:
    """Ghi thẻ Người cho lượt gặp lại — không tạo obj-*."""
    from ...patrol_ids import is_person_subject_id
    from .flush import write_person_card
    from .session_store import link_pers_session

    pid = identity.resolve_alias(pers_id)
    if not is_person_subject_id(pid):
        return pid

    session.subject_id = pid
    session.identity_resolved = True
    was_committed = session.person_committed

    if should_attempt_person_commit(session, obs):
        picked = _best_commit_embedding(session, obs)
        if picked is not None:
            emb, quality, commit_obs = picked
            try:
                pid = commit_person_from_evidence(session, commit_obs, emb, quality)
            except Exception:  # noqa: BLE001
                logger.exception(
                    "returning person observe_face failed track %s", session.track_id,
                )
            else:
                session.mark_person_committed(pid)
                write_person_card(
                    session,
                    commit_obs,
                    first_commit=True,
                    finalize=finalize,
                    finalize_at=finalize_at,
                )
                link_pers_session(session)
                logger.info(
                    "returning person commit %s track %s via %s+face",
                    pid,
                    session.track_id,
                    known_reason,
                )
                return pid

    if not was_committed:
        session.mark_person_committed(pid)
    write_person_card(
        session,
        obs,
        first_commit=not was_committed,
        finalize=finalize,
        finalize_at=finalize_at,
    )
    link_pers_session(session)
    logger.info(
        "returning person commit %s track %s via %s",
        pid,
        session.track_id,
        known_reason,
    )
    return pid


def maybe_promote_deferred_object_session(
    session: TrackSession,
    obs: ObservationInput,
) -> str | None:
    """Deferred mode — thăng obj-* lên Người khi lifecycle/mặt đủ trước finalize."""
    if session.person_committed or session.is_abandoned():
        return session.subject_id

    sid = (session.subject_id or "").strip()
    if not sid.startswith("obj-"):
        return None

    from ...patrol_identity_lifecycle import TIER_IDENTITY, TIER_PERSON, tier_for_worker_id

    wid = (obs.lifecycle_worker_id or session.last_lifecycle_worker_id or "").strip()
    tier = (obs.lifecycle_tier or session.last_lifecycle_tier or "").strip()
    if not tier and wid:
        tier = tier_for_worker_id(wid)

    if tier in (TIER_PERSON, TIER_IDENTITY):
        promoted = maybe_commit_person_from_lifecycle(session, obs, finalize=False)
        if promoted:
            return promoted

    if should_attempt_person_commit(session, obs):
        promoted = maybe_commit_person(session, obs, allow_recover=True)
        if promoted:
            return promoted

    return None


def maybe_commit_returning_person(
    session: TrackSession,
    obs: ObservationInput,
) -> str | None:
    """Quy tắc giám đốc: gặp lại mặt quen → cùng Người, thêm dòng lịch sử."""
    if session.person_committed or session.is_abandoned():
        return session.subject_id

    from ...patrol_ids import is_person_subject_id
    from .identity_pipeline import (
        _known_face_match,
        resolve_subject_from_face_match,
        resolve_subject_from_known_tk,
    )

    known, _sim = _known_face_match(session, obs)
    if known:
        return _commit_returning_person_card(
            session, obs, known, known_reason="face_match",
        )

    sid = (session.subject_id or "").strip()
    if not is_person_subject_id(sid):
        pers = resolve_subject_from_face_match(session, obs, now=obs.ts)
        if not pers:
            pers = resolve_subject_from_known_tk(session, obs, now=obs.ts)
        if pers:
            return _commit_returning_person_card(
                session, obs, pers, known_reason="resolve",
            )
        return None

    if session.identity_resolved and (session.best_faces or obs.face_eligible):
        return _commit_returning_person_card(
            session, obs, sid, known_reason="reclaim",
        )
    return None


def finalize_returning_person_card(
    session: TrackSession,
    obs: ObservationInput,
    *,
    finalize_at: float | None = None,
) -> bool:
    """Đóng lượt gặp lại — không hạ xuống obj-* dù chưa đủ cổng mặt mới."""
    from ...patrol_ids import is_person_subject_id

    sid = (session.subject_id or "").strip()
    if not is_person_subject_id(sid):
        return False
    _commit_returning_person_card(
        session,
        obs,
        sid,
        known_reason="finalize",
        finalize=True,
        finalize_at=finalize_at,
    )
    return True
