"""Luồng định danh — cache ptk-* → bỏ re-gallery khi đã resolve."""

from __future__ import annotations

import logging

from .. import daystore, identity
from .types import BestFaceFrame, IdentityType, ObservationInput, PersonIdentity, TrackSession

logger = logging.getLogger("patrol.aggregator.identity")

MAX_BEST_FRAMES = 3
MIN_QUALITY_FOR_SEARCH = 0.55


def _map_worker_to_identity(
    worker_id: str | None,
    confidence: float,
) -> PersonIdentity:
    wid = (worker_id or "").strip()
    if not wid:
        return PersonIdentity(identity_type=IdentityType.UNKNOWN, confidence=0.0)
    from ...person_identity_registry import is_sgc_worker_id

    if is_sgc_worker_id(wid) or wid.startswith("sgc-"):
        return PersonIdentity(
            person_id=wid,
            identity_type=IdentityType.ANONYMOUS,
            confidence=confidence,
        )
    return PersonIdentity(
        person_id=wid,
        identity_type=IdentityType.KNOWN,
        confidence=confidence,
    )


def _note_best_frame(session: TrackSession, obs: ObservationInput) -> None:
    if not obs.face_eligible or obs.face_embedding is None:
        return
    frame = BestFaceFrame(
        quality=float(obs.face_quality),
        captured_at=obs.ts,
        embedding=obs.face_embedding,
    )
    session.best_faces.append(frame)
    session.best_faces.sort(key=lambda f: f.quality, reverse=True)
    if len(session.best_faces) > MAX_BEST_FRAMES:
        session.best_faces = session.best_faces[:MAX_BEST_FRAMES]


def _pick_search_embedding(session: TrackSession) -> tuple[tuple[float, ...], float] | None:
    if not session.best_faces:
        return None
    best = session.best_faces[0]
    if best.embedding is None or best.quality < MIN_QUALITY_FOR_SEARCH:
        return None
    return best.embedding, best.quality


def _ensure_pers_for_worker(
    worker_id: str | None,
    *,
    tier: str | None,
    now: float,
) -> str | None:
    """Map gallery/tk → pers_id (tk-* hoặc gallery); tạo hồ sơ SQLite nếu cần."""
    wid = (worker_id or "").strip()
    if not wid:
        return None

    from ...patrol_identity_lifecycle import TIER_IDENTITY, TIER_PERSON
    from ..sink import _ensure_profile_for_tk, _pers_id_for_lifecycle

    resolved_tier = (tier or "").strip() or TIER_PERSON
    if resolved_tier not in (TIER_PERSON, TIER_IDENTITY):
        resolved_tier = TIER_IDENTITY if resolved_tier == TIER_IDENTITY else TIER_PERSON

    pers_id = _pers_id_for_lifecycle(resolved_tier, wid, now=now)
    if pers_id:
        return pers_id

    from ...person_identity_registry import is_sgc_worker_id

    if is_sgc_worker_id(wid):
        return _ensure_profile_for_tk(wid, now=now)

    from ...patrol_entity import is_patrol_gallery_id, resolve_patrol_gallery_id_for_worker
    from ...patrol_identity_store import lookup_patrol_identity

    gallery = wid if is_patrol_gallery_id(wid) else resolve_patrol_gallery_id_for_worker(wid)
    if not gallery:
        return None

    row = lookup_patrol_identity(gallery)
    if not row:
        return None

    return identity.ensure_identified_for_gallery(
        gallery,
        full_name=str(row.get("worker_name") or gallery).strip(),
        employee_code=str(row.get("employee_code") or "").strip(),
        contractor=str(row.get("contractor_name") or "").strip(),
        identified_by="gallery_match",
        now=now,
    )


def _may_assign_pers_subject(session: TrackSession, obs: ObservationInput) -> bool:
    """Chỉ gán pers-* khi có mặt hoặc session đã thăng từ face trước đó."""
    if obs.face_eligible:
        return True
    current = (session.subject_id or "").strip()
    from ...patrol_ids import is_person_subject_id

    if is_person_subject_id(current):
        return True
    if session.best_faces:
        return True
    return False


def _assign_pers_subject(session: TrackSession, pers_id: str, *, now: float) -> None:
    obj_id = (session.subject_id or "").strip()
    if obj_id.startswith("obj-"):
        daystore.promote_object(obj_id, pers_id, now=now)
        logger.info(
            "aggregator promote %s -> %s track %s",
            obj_id,
            pers_id,
            session.track_id,
        )
    session.subject_id = pers_id
    from .session_store import link_subject_session

    link_subject_session(session)
    session.dirty = True


def _maybe_promote_object_subject(session: TrackSession, obs: ObservationInput) -> None:
    if not (session.subject_id or "").startswith("obj-"):
        return
    if not _may_assign_pers_subject(session, obs):
        return

    candidates: list[tuple[str | None, str | None]] = [
        (obs.lifecycle_tier, obs.lifecycle_worker_id),
    ]
    pid = (session.identity.person_id or "").strip()
    if pid and session.identity.identity_type in (IdentityType.KNOWN, IdentityType.ANONYMOUS):
        from ...patrol_identity_lifecycle import TIER_IDENTITY, TIER_PERSON

        tier = obs.lifecycle_tier or (
            TIER_IDENTITY if session.identity.identity_type == IdentityType.KNOWN else TIER_PERSON
        )
        candidates.append((tier, pid))

    for tier, worker_id in candidates:
        if not worker_id:
            continue
        from ...patrol_identity_lifecycle import TIER_OBJECT, tier_for_worker_id

        resolved_tier = (tier or "").strip()
        if not resolved_tier or resolved_tier == TIER_OBJECT:
            inferred = tier_for_worker_id(worker_id)
            if inferred != TIER_OBJECT:
                resolved_tier = inferred
        pers_id = _ensure_pers_for_worker(worker_id, tier=resolved_tier or None, now=obs.ts)
        if pers_id:
            _assign_pers_subject(session, pers_id, now=obs.ts)
            return


def _maybe_upgrade_pers_subject(session: TrackSession, obs: ObservationInput) -> None:
    """pers-* tạm (sgc) → hồ sơ gallery/identified đã có — gộp thẻ ngày."""
    current = (session.subject_id or "").strip()
    from ...patrol_ids import is_person_subject_id

    if not is_person_subject_id(current):
        return
    wid = (obs.lifecycle_worker_id or "").strip()
    if not wid:
        return

    from ...patrol_entity import is_patrol_gallery_id, resolve_patrol_gallery_id_for_worker
    from ...person_identity_registry import is_sgc_worker_id

    tier = (obs.lifecycle_tier or "").strip() or None
    lookup_id = wid
    if is_sgc_worker_id(wid) and not is_patrol_gallery_id(wid):
        gallery = resolve_patrol_gallery_id_for_worker(wid)
        if not gallery:
            return
        lookup_id = gallery
        tier = tier or "identity"

    canonical = _ensure_pers_for_worker(lookup_id, tier=tier, now=obs.ts)
    if not canonical or canonical == current:
        return

    keep_row = identity.get_person(canonical)
    drop_row = identity.get_person(current)
    if keep_row is None:
        return

    def _rank(row: dict | None) -> int:
        if row is None:
            return 0
        return 2 if row.get("status") == identity.STATUS_IDENTIFIED else 1

    if _rank(keep_row) < _rank(drop_row):
        return

    identity.merge_persons(canonical, current, now=obs.ts)
    session.subject_id = identity.resolve_alias(canonical)
    session.identity = PersonIdentity(
        person_id=session.subject_id,
        identity_type=(
            IdentityType.KNOWN
            if keep_row.get("status") == identity.STATUS_IDENTIFIED
            else IdentityType.ANONYMOUS
        ),
        confidence=max(session.identity.confidence, obs.confidence),
    )
    from .session_store import link_subject_session

    link_subject_session(session)
    from .. import db as patrol_db

    daystore.coalesce_subject_appearances(
        session.subject_id,
        patrol_db.today_vn(obs.ts),
        camera_id=session.camera_id,
    )
    session.dirty = True
    logger.info(
        "aggregator upgrade pers %s -> %s track %s",
        current,
        session.subject_id,
        session.track_id,
    )


def process_identity(session: TrackSession, obs: ObservationInput) -> str | None:
    """Cập nhật session; trả pers-* / obj-* subject_id nếu có."""
    if obs.density_only:
        return session.subject_id

    if session.identity_resolved and session.subject_id:
        from ...patrol_ids import is_person_subject_id

        _maybe_promote_object_subject(session, obs)
        _maybe_upgrade_pers_subject(session, obs)
        if (
            obs.face_eligible
            and obs.face_embedding is not None
            and is_person_subject_id(session.subject_id)
            and not session.committed
        ):
            try:
                identity.add_face_angle(
                    session.subject_id,
                    obs.face_embedding,
                    quality=obs.face_quality,
                    camera_id=obs.camera_id,
                )
            except Exception:  # noqa: BLE001
                logger.debug("add_face_angle skip", exc_info=True)
        return session.subject_id

    _note_best_frame(session, obs)

    wid = (obs.lifecycle_worker_id or "").strip()
    from ...person_identity_registry import is_sgc_worker_id

    # sgc-* đã ổn định trên ROI → một hồ sơ bản nháp, không tạo pers-* rời.
    if not session.identity_resolved and wid and is_sgc_worker_id(wid):
        if _may_assign_pers_subject(session, obs):
            pers_id = _ensure_pers_for_worker(wid, tier=obs.lifecycle_tier, now=obs.ts)
            if pers_id:
                _assign_pers_subject(session, pers_id, now=obs.ts)
                session.identity = _map_worker_to_identity(wid, obs.confidence)
                session.identity_resolved = True
                if obs.face_eligible and obs.face_embedding is not None:
                    try:
                        identity.add_face_angle(
                            pers_id,
                            obs.face_embedding,
                            quality=obs.face_quality,
                            camera_id=obs.camera_id,
                        )
                    except Exception:  # noqa: BLE001
                        logger.debug("add_face_angle draft skip", exc_info=True)

    if not session.identity_resolved:
        picked = _pick_search_embedding(session)
        if picked is not None:
            emb, quality = picked
            try:
                pers_id, created = identity.observe_face(
                    emb,
                    quality=quality,
                    camera_id=obs.camera_id,
                    now=obs.ts,
                )
                if wid and is_sgc_worker_id(wid):
                    from ..sink import _bind_tk_profile

                    _bind_tk_profile(wid, pers_id)
                _assign_pers_subject(session, pers_id, now=obs.ts)
                session.identity = PersonIdentity(
                    person_id=pers_id,
                    identity_type=IdentityType.KNOWN,
                    confidence=min(0.99, quality),
                )
                session.identity_resolved = True
                if created:
                    logger.info(
                        "aggregator identity new pers %s track %s",
                        pers_id,
                        session.track_id,
                    )
            except Exception:  # noqa: BLE001
                logger.exception("aggregator observe_face failed")

    if obs.lifecycle_worker_id and not session.identity_resolved:
        if _may_assign_pers_subject(session, obs):
            session.identity = _map_worker_to_identity(obs.lifecycle_worker_id, obs.confidence)
            pers_id = _ensure_pers_for_worker(
                obs.lifecycle_worker_id,
                tier=obs.lifecycle_tier,
                now=obs.ts,
            )
            if pers_id:
                _assign_pers_subject(session, pers_id, now=obs.ts)
            else:
                session.dirty = True
            session.identity_resolved = True
        else:
            session.dirty = True

    _maybe_promote_object_subject(session, obs)
    _maybe_upgrade_pers_subject(session, obs)
    return session.subject_id


def ensure_object_subject(session: TrackSession, obj_id: str) -> None:
    if session.subject_id is None:
        session.subject_id = obj_id
        session.identity = PersonIdentity(
            person_id=obj_id,
            identity_type=IdentityType.UNKNOWN,
            confidence=0.0,
        )
