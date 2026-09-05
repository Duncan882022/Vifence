"""Luồng định danh — cache ptk-* → bỏ re-gallery khi đã resolve."""

from __future__ import annotations

import logging

from .. import daystore, identity
from .types import BestFaceFrame, IdentityType, ObservationInput, PersonIdentity, TrackSession

logger = logging.getLogger("patrol.aggregator.identity")

MAX_BEST_FRAMES = 3
MIN_QUALITY_FOR_SEARCH = 0.55


def _frame_size(obs: ObservationInput) -> tuple[int, int]:
    if obs.frame is not None:
        h, w = obs.frame.shape[:2]
        return int(w), int(h)
    # Không suy frame từ bbox — tỉ lệ diện tích sẽ luôn ~1/9 và lọc nền không chạy.
    return 1280, 720


def _human_face_promotion_allowed(obs: ObservationInput) -> bool:
    """Chặn FP cây/kệ — chỉ thăng Người khi bbox giống người thật."""
    if obs.person_bbox is None:
        return False
    frame_w, frame_h = _frame_size(obs)
    from ...patrol_person_visibility import patrol_anonymous_identity_allowed

    return patrol_anonymous_identity_allowed(
        tuple(obs.person_bbox),
        frame_w,
        frame_h,
        face_quality=float(obs.face_quality or 0.0),
        face_eligible=bool(obs.face_eligible),
    )


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


def _best_face_embedding(
    session: TrackSession,
    obs: ObservationInput,
) -> tuple[tuple[float, ...], float] | None:
    """Embedding + quality tốt nhất — obs hiện tại hoặc best_faces session."""
    emb = obs.face_embedding
    quality = float(obs.face_quality or 0.0)
    picked = _pick_search_embedding(session)
    if picked is not None:
        p_emb, p_q = picked
        if emb is None or p_q > quality:
            emb, quality = p_emb, p_q
    if emb is None or quality < MIN_QUALITY_FOR_SEARCH:
        return None
    return emb, quality


def _known_face_match(
    session: TrackSession,
    obs: ObservationInput,
) -> tuple[str | None, float]:
    """Khớp SQLite draft/identified hoặc gallery JPG — tránh obj trùng tk."""
    picked = _best_face_embedding(session, obs)
    if picked is None:
        return None, 0.0
    emb, _quality = picked
    matched, sim = identity.match_face_for_observe(emb)
    if matched:
        return identity.resolve_alias(matched), sim
    gallery_pid, gsim = identity.match_gallery_embedding_for_observe(
        emb,
        camera_id=obs.camera_id,
    )
    if gallery_pid:
        return identity.resolve_alias(gallery_pid), gsim
    return None, 0.0


def _existing_tk_profile_for_worker(worker_id: str | None) -> str | None:
    """tk/sgc trên ROI → pers_id nếu hồ sơ đã có — không tạo draft mới."""
    wid = (worker_id or "").strip()
    if not wid:
        return None
    from ...person_identity_registry import is_sgc_worker_id

    if not is_sgc_worker_id(wid):
        return None
    from ...patrol_ids import normalize_track_id

    tk = normalize_track_id(wid)
    found = identity.lookup_bound_profile_for_tk(tk) or identity.lookup_profile_by_tk(tk)
    if not found:
        return None
    return identity.resolve_alias(found)


def resolve_subject_from_face_match(
    session: TrackSession,
    obs: ObservationInput,
    *,
    now: float,
) -> str | None:
    """Gán pers-* từ khớp mặt có sẵn — gọi trước touch_object để không tạo obj-*."""
    if session.subject_id:
        from ...patrol_ids import is_person_subject_id

        if is_person_subject_id(session.subject_id):
            return session.subject_id

    known, _sim = _known_face_match(session, obs)
    if not known:
        return None

    picked = _best_face_embedding(session, obs)
    if picked is None:
        return known

    emb, quality = picked
    wid = (obs.lifecycle_worker_id or "").strip()
    from ...person_identity_registry import is_sgc_worker_id

    pref_tk = wid if is_sgc_worker_id(wid) else None
    try:
        pers_id, _created = identity.observe_face(
            emb,
            quality=max(quality, MIN_QUALITY_FOR_SEARCH),
            camera_id=obs.camera_id,
            now=now,
            frame=obs.frame,
            person_bbox=obs.person_bbox,
            preferred_tk=pref_tk,
        )
    except Exception:  # noqa: BLE001
        logger.exception("resolve_subject_from_face_match observe_face failed")
        return known

    session.identity = PersonIdentity(
        person_id=pers_id,
        identity_type=IdentityType.KNOWN,
        confidence=min(0.99, max(quality, MIN_QUALITY_FOR_SEARCH)),
    )
    session.identity_resolved = True
    session.subject_id = pers_id
    logger.info(
        "aggregator face-match assign %s track %s (skip obj create)",
        pers_id,
        session.track_id,
    )
    return pers_id


def resolve_subject_from_known_tk(
    session: TrackSession,
    obs: ObservationInput,
    *,
    now: float,
) -> str | None:
    """Gán pers-* từ tk ROI khi hồ sơ đã có — camera khác, chưa kịp khớp mặt."""
    if session.subject_id:
        from ...patrol_ids import is_person_subject_id

        if is_person_subject_id(session.subject_id):
            return session.subject_id

    pers_id = _existing_tk_profile_for_worker(obs.lifecycle_worker_id)
    if not pers_id:
        return None

    session.identity = _map_worker_to_identity(
        (obs.lifecycle_worker_id or "").strip(),
        obs.confidence,
    )
    session.identity_resolved = True
    session.subject_id = pers_id
    logger.info(
        "aggregator tk-bind assign %s track %s cam %s (skip obj create)",
        pers_id,
        session.track_id,
        obs.camera_id,
    )
    return pers_id


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
    from ...patrol_identity_store import lookup_patrol_identity_any

    gallery = wid if is_patrol_gallery_id(wid) else resolve_patrol_gallery_id_for_worker(wid)
    if not gallery:
        return None

    row = lookup_patrol_identity_any(gallery)
    if not row:
        return None

    emp = str(row.get("employee_code") or "").strip()
    if emp:
        found = identity.find_by_employee_code(emp)
        if found:
            return str(found["pers_id"])

    resolved = identity.pers_id_for_gallery_worker(gallery)
    if resolved:
        return resolved[0]

    hr = identity.hr_profile_for_gallery(gallery)
    if hr:
        return str(hr["pers_id"])

    return None


def _has_face_promotion_evidence(session: TrackSession, obs: ObservationInput) -> bool:
    """Có embedding mặt đã lưu — khung hiện tại hoặc best_faces trong session."""
    if obs.face_eligible:
        return True
    if not session.best_faces:
        return False
    best = session.best_faces[0]
    return best.embedding is not None and best.quality >= MIN_QUALITY_FOR_SEARCH


def _may_assign_pers_subject(session: TrackSession, obs: ObservationInput) -> bool:
    """Chỉ gán pers-* khi có mặt hoặc session đã thăng từ face trước đó."""
    current = (session.subject_id or "").strip()
    from ...patrol_ids import is_person_subject_id

    if is_person_subject_id(current):
        return True
    if _existing_tk_profile_for_worker(obs.lifecycle_worker_id):
        return True
    return _has_face_promotion_evidence(session, obs)


def _may_promote_to_person(session: TrackSession, obs: ObservationInput) -> bool:
    """obj-* → tk/pers: bằng chứng mặt + bbox người thật (nới khi đã khớp gallery/SQLite)."""
    if not _may_assign_pers_subject(session, obs):
        return False
    if _known_face_match(session, obs)[0]:
        return True
    if obs.face_eligible:
        if obs.face_embedding is not None:
            return _human_face_promotion_allowed(obs)
        return True
    return bool(session.best_faces)


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


def _promote_object_with_face_evidence(session: TrackSession, obs: ObservationInput) -> bool:
    """Đối tượng đã thấy mặt (face_eligible) → thẻ Người pers-*."""
    if not (session.subject_id or "").startswith("obj-"):
        return False

    emb = obs.face_embedding
    quality = float(obs.face_quality or 0.0)
    if emb is None and session.best_faces:
        best = session.best_faces[0]
        if best.embedding is not None and best.quality >= MIN_QUALITY_FOR_SEARCH:
            emb = best.embedding
            quality = max(quality, float(best.quality))

    wid = (obs.lifecycle_worker_id or session.identity.person_id or "").strip()
    from ...person_identity_registry import is_sgc_worker_id

    if is_sgc_worker_id(wid):
        if not _may_promote_to_person(session, obs):
            return False
        if emb is None:
            picked = _pick_search_embedding(session)
            if picked is None:
                return False
            emb, quality = picked
        pers_id = _ensure_pers_for_worker(
            wid,
            tier=obs.lifecycle_tier or "person",
            now=obs.ts,
        )
        if pers_id:
            _assign_pers_subject(session, pers_id, now=obs.ts)
            session.identity_resolved = True
            return True

    if emb is None:
        return False

    known, _sim = _known_face_match(session, obs)
    if not known and not obs.face_eligible:
        return False
    if not known and not _human_face_promotion_allowed(obs):
        return False

    try:
        from ...person_identity_registry import is_sgc_worker_id

        pref_tk = wid if is_sgc_worker_id(wid) else None
        pers_id, _ = identity.observe_face(
            emb,
            quality=max(quality, MIN_QUALITY_FOR_SEARCH),
            camera_id=obs.camera_id,
            now=obs.ts,
            preferred_tk=pref_tk,
        )
    except Exception:  # noqa: BLE001
        logger.exception("aggregator observe_face promote obj failed")
        return False

    _assign_pers_subject(session, pers_id, now=obs.ts)
    session.identity = PersonIdentity(
        person_id=pers_id,
        identity_type=IdentityType.KNOWN,
        confidence=min(0.99, max(quality, MIN_QUALITY_FOR_SEARCH)),
    )
    session.identity_resolved = True
    return True


def _maybe_promote_object_subject(session: TrackSession, obs: ObservationInput) -> None:
    if not (session.subject_id or "").startswith("obj-"):
        return
    if not _may_promote_to_person(session, obs):
        return

    if _promote_object_with_face_evidence(session, obs):
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
        from ...patrol_identity_lifecycle import TIER_OBJECT, TIER_PERSON, tier_for_worker_id

        resolved_tier = (tier or "").strip()
        if not resolved_tier or resolved_tier == TIER_OBJECT:
            inferred = tier_for_worker_id(worker_id)
            if inferred != TIER_OBJECT:
                resolved_tier = inferred
        if resolved_tier not in (TIER_PERSON, "identity"):
            continue
        pers_id = _ensure_pers_for_worker(worker_id, tier=resolved_tier or None, now=obs.ts)
        if pers_id:
            _assign_pers_subject(session, pers_id, now=obs.ts)
            session.identity_resolved = True
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
                    frame=obs.frame,
                    person_bbox=obs.person_bbox,
                )
            except Exception:  # noqa: BLE001
                logger.debug("add_face_angle skip", exc_info=True)
        return session.subject_id

    _note_best_frame(session, obs)

    wid = (obs.lifecycle_worker_id or "").strip()
    from ...person_identity_registry import is_sgc_worker_id

    # tk-* trên ROI: khớp mặt trước — tránh tk-01/tk-02 cùng người thành 2 draft.
    if not session.identity_resolved and wid and is_sgc_worker_id(wid):
        if _may_promote_to_person(session, obs):
            emb = obs.face_embedding
            quality = float(obs.face_quality or 0.0)
            if emb is None:
                picked = _pick_search_embedding(session)
                if picked is not None:
                    emb, quality = picked
            if emb is not None and _human_face_promotion_allowed(obs):
                try:
                    pers_id, created = identity.observe_face(
                        emb,
                        quality=max(quality, MIN_QUALITY_FOR_SEARCH),
                        camera_id=obs.camera_id,
                        now=obs.ts,
                        frame=obs.frame,
                        person_bbox=obs.person_bbox,
                        preferred_tk=wid,
                    )
                    from ..sink import _bind_tk_profile

                    _bind_tk_profile(wid, pers_id)
                    _assign_pers_subject(session, pers_id, now=obs.ts)
                    session.identity = PersonIdentity(
                        person_id=pers_id,
                        identity_type=IdentityType.KNOWN,
                        confidence=min(0.99, max(quality, MIN_QUALITY_FOR_SEARCH)),
                    )
                    session.identity_resolved = True
                    if created:
                        logger.info(
                            "aggregator tk observe new pers %s track %s wid %s",
                            pers_id,
                            session.track_id,
                            wid,
                        )
                except Exception:  # noqa: BLE001
                    logger.exception("aggregator observe_face tk failed")
            else:
                pers_id = _ensure_pers_for_worker(wid, tier=obs.lifecycle_tier, now=obs.ts)
                if pers_id:
                    _assign_pers_subject(session, pers_id, now=obs.ts)
                    session.identity = _map_worker_to_identity(wid, obs.confidence)
                    session.identity_resolved = True

    if not session.identity_resolved:
        picked = _best_face_embedding(session, obs)
        known, _sim = _known_face_match(session, obs) if picked else (None, 0.0)
        if picked is not None and (known or _human_face_promotion_allowed(obs)):
            emb, quality = picked
            try:
                from ...person_identity_registry import is_sgc_worker_id

                pref_tk = wid if is_sgc_worker_id(wid) else None
                pers_id, created = identity.observe_face(
                    emb,
                    quality=quality,
                    camera_id=obs.camera_id,
                    now=obs.ts,
                    frame=obs.frame,
                    person_bbox=obs.person_bbox,
                    preferred_tk=pref_tk,
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
        from ...patrol_identity_lifecycle import TIER_OBJECT, TIER_PERSON

        lifecycle_tier = (obs.lifecycle_tier or "").strip()
        if lifecycle_tier == TIER_OBJECT:
            lifecycle_tier = ""
        if _may_promote_to_person(session, obs) and lifecycle_tier in (TIER_PERSON, "identity", ""):
            inferred = lifecycle_tier
            if not inferred or inferred == TIER_OBJECT:
                from ...patrol_identity_lifecycle import tier_for_worker_id

                inferred = tier_for_worker_id(obs.lifecycle_worker_id)
            if inferred in (TIER_PERSON, "identity"):
                from ...person_identity_registry import is_sgc_worker_id

                lwid = (obs.lifecycle_worker_id or "").strip()
                emb = obs.face_embedding
                quality = float(obs.face_quality or 0.0)
                if emb is None:
                    picked = _pick_search_embedding(session)
                    if picked is not None:
                        emb, quality = picked

                pers_id: str | None = None
                if (
                    lwid
                    and is_sgc_worker_id(lwid)
                    and emb is not None
                    and _human_face_promotion_allowed(obs)
                ):
                    try:
                        pers_id, _ = identity.observe_face(
                            emb,
                            quality=max(quality, MIN_QUALITY_FOR_SEARCH),
                            camera_id=obs.camera_id,
                            now=obs.ts,
                            frame=obs.frame,
                            person_bbox=obs.person_bbox,
                            preferred_tk=lwid,
                        )
                        from ..sink import _bind_tk_profile

                        _bind_tk_profile(lwid, pers_id)
                    except Exception:  # noqa: BLE001
                        logger.exception("aggregator observe_face lifecycle tk failed")

                if not pers_id:
                    session.identity = _map_worker_to_identity(lwid, obs.confidence)
                    pers_id = _ensure_pers_for_worker(
                        lwid,
                        tier=inferred,
                        now=obs.ts,
                    )
                if pers_id:
                    _assign_pers_subject(session, pers_id, now=obs.ts)
                    session.identity_resolved = True
                else:
                    session.dirty = True
            else:
                session.dirty = True
        else:
            session.dirty = True

    _maybe_promote_object_subject(session, obs)
    _maybe_upgrade_pers_subject(session, obs)
    return session.subject_id


def try_promote_object_after_snapshot(
    session: TrackSession,
    obs: ObservationInput,
    *,
    snapshot_path: str | None,
    snapshot_score: float,
) -> None:
    """obj có JPG mặt đủ điểm nhưng chưa lên Người — repair trước khi ghi thẻ."""
    sid = (session.subject_id or "").strip()
    if not sid.startswith("obj-"):
        return
    if not (snapshot_path or "").strip():
        return
    if float(snapshot_score or 0) < daystore.PERSON_LIST_MIN_SNAPSHOT_SCORE:
        return
    if not obs.face_eligible:
        return

    _maybe_promote_object_subject(session, obs)
    if not (session.subject_id or "").startswith("obj-"):
        return

    emb = obs.face_embedding
    quality = float(obs.face_quality or 0.0)
    if emb is None and session.best_faces:
        best = session.best_faces[0]
        if best.embedding is not None and best.quality >= MIN_QUALITY_FOR_SEARCH:
            emb = best.embedding
            quality = max(quality, float(best.quality))

    if emb is not None:
        wid = (obs.lifecycle_worker_id or session.identity.person_id or "").strip()
        from ...person_identity_registry import is_sgc_worker_id

        pref_tk = wid if is_sgc_worker_id(wid) else None
        try:
            pers_id, _created = identity.observe_face(
                emb,
                quality=max(quality, MIN_QUALITY_FOR_SEARCH),
                camera_id=obs.camera_id,
                now=obs.ts,
                frame=obs.frame,
                person_bbox=obs.person_bbox,
                preferred_tk=pref_tk,
            )
            _assign_pers_subject(session, pers_id, now=obs.ts)
            session.identity_resolved = True
            logger.info(
                "aggregator snapshot repair promote %s -> %s track %s",
                sid,
                pers_id,
                session.track_id,
            )
            return
        except Exception:  # noqa: BLE001
            logger.exception("aggregator snapshot observe_face repair failed")

    logger.warning(
        "aggregator snapshot repair skip %s track %s — no embedding to match gallery",
        sid,
        session.track_id,
    )


def ensure_object_subject(session: TrackSession, obj_id: str) -> None:
    if session.subject_id is None:
        session.subject_id = obj_id
        session.identity = PersonIdentity(
            person_id=obj_id,
            identity_type=IdentityType.UNKNOWN,
            confidence=0.0,
        )
