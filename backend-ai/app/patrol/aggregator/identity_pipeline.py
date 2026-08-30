"""Luồng định danh — cache ptk-* → bỏ re-gallery khi đã resolve."""

from __future__ import annotations

import logging
from typing import Any

from .. import identity
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


def process_identity(session: TrackSession, obs: ObservationInput) -> str | None:
    """Cập nhật session; trả pers-* / obj-* subject_id nếu có."""
    if obs.density_only:
        return session.subject_id

    # Đã cache — chỉ cập nhật bbox/thời gian, không search lại
    if session.identity_resolved and session.subject_id:
        if obs.face_eligible and obs.face_embedding is not None and session.subject_id.startswith("pers-"):
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

    # Lifecycle ROI đã có worker_id từ analyzer → map pers-* trước khi flush
    if obs.lifecycle_worker_id and not session.identity_resolved:
        session.identity = _map_worker_to_identity(obs.lifecycle_worker_id, obs.confidence)
        try:
            from ..sink import _pers_id_for_lifecycle

            pers_id = _pers_id_for_lifecycle(
                obs.lifecycle_tier,
                obs.lifecycle_worker_id,
                now=obs.ts,
            )
            if pers_id:
                session.subject_id = pers_id
        except Exception:  # noqa: BLE001
            logger.debug("lifecycle pers map skip", exc_info=True)
        session.identity_resolved = True

    # Chưa resolve — chờ đủ best-frame rồi search gallery một lần
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
                session.subject_id = pers_id
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

    return session.subject_id


def ensure_object_subject(session: TrackSession, obj_id: str) -> None:
    if session.subject_id is None:
        session.subject_id = obj_id
        session.identity = PersonIdentity(
            person_id=obj_id,
            identity_type=IdentityType.UNKNOWN,
            confidence=0.0,
        )
