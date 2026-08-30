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
    """Map gallery/sgc/pers → pers-*; tạo hồ sơ SQLite nếu gallery đã biết."""
    wid = (worker_id or "").strip()
    if not wid:
        return None

    from ...patrol_identity_lifecycle import TIER_IDENTITY, TIER_PERSON
    from ..sink import _ensure_pers_for_sgc, _pers_id_for_lifecycle

    resolved_tier = (tier or "").strip() or TIER_PERSON
    if resolved_tier not in (TIER_PERSON, TIER_IDENTITY):
        resolved_tier = TIER_IDENTITY if resolved_tier == TIER_IDENTITY else TIER_PERSON

    pers_id = _pers_id_for_lifecycle(resolved_tier, wid, now=now)
    if pers_id:
        return pers_id

    from ...person_identity_registry import is_sgc_worker_id

    if is_sgc_worker_id(wid):
        return _ensure_pers_for_sgc(wid, now=now)

    from ...patrol_entity import is_patrol_gallery_id, resolve_patrol_gallery_id_for_worker
    from ...patrol_identity_store import lookup_patrol_identity

    gallery = wid if is_patrol_gallery_id(wid) else resolve_patrol_gallery_id_for_worker(wid)
    if not gallery:
        return None

    row = lookup_patrol_identity(gallery)
    if not row:
        return None

    pers_id = identity.create_person(origin="gallery", now=now)
    identity.identify(
        pers_id,
        full_name=str(row.get("worker_name") or gallery).strip(),
        employee_code=str(row.get("employee_code") or "").strip() or None,
        contractor=str(row.get("contractor_name") or "").strip() or None,
        identified_by="gallery_match",
        now=now,
    )
    return pers_id


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
    session.dirty = True


def _maybe_promote_object_subject(session: TrackSession, obs: ObservationInput) -> None:
    if not (session.subject_id or "").startswith("obj-"):
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
        pers_id = _ensure_pers_for_worker(worker_id, tier=tier, now=obs.ts)
        if pers_id:
            _assign_pers_subject(session, pers_id, now=obs.ts)
            return


def process_identity(session: TrackSession, obs: ObservationInput) -> str | None:
    """Cập nhật session; trả pers-* / obj-* subject_id nếu có."""
    if obs.density_only:
        return session.subject_id

    if session.identity_resolved and session.subject_id:
        _maybe_promote_object_subject(session, obs)
        if (
            obs.face_eligible
            and obs.face_embedding is not None
            and session.subject_id.startswith("pers-")
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
        session.dirty = True
        return session.subject_id

    _note_best_frame(session, obs)

    if obs.lifecycle_worker_id and not session.identity_resolved:
        session.identity = _map_worker_to_identity(obs.lifecycle_worker_id, obs.confidence)
        pers_id = _ensure_pers_for_worker(
            obs.lifecycle_worker_id,
            tier=obs.lifecycle_tier,
            now=obs.ts,
        )
        if pers_id:
            _assign_pers_subject(session, pers_id, now=obs.ts)
        session.identity_resolved = True

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

    _maybe_promote_object_subject(session, obs)
    return session.subject_id


def ensure_object_subject(session: TrackSession, obj_id: str) -> None:
    if session.subject_id is None:
        session.subject_id = obj_id
        session.identity = PersonIdentity(
            person_id=obj_id,
            identity_type=IdentityType.UNKNOWN,
            confidence=0.0,
        )
