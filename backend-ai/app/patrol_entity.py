"""Module 05 — khóa dedup / master entity cho patrol person events."""

from __future__ import annotations

from .person_identity_registry import is_sgc_worker_id


def is_patrol_gallery_id(worker_id: str | None) -> bool:
    wid = (worker_id or "").strip()
    if not wid or wid == "unknown" or is_sgc_worker_id(wid):
        return False
    if wid.lower().startswith("p-"):
        return True
    try:
        from .patrol_identity_store import lookup_patrol_identity

        return lookup_patrol_identity(wid) is not None
    except Exception:
        return False


def resolve_patrol_dedup_stable_id(
    worker_id: str | None,
    object_id: str | None,
    track_id: str | None,
) -> str:
    """Stable id cho dedup_key — gallery/sgc > OBJ > track."""
    wid = (worker_id or "").strip()
    if wid and wid not in ("unknown", ""):
        return wid
    oid = (object_id or "").strip()
    if oid.upper().startswith("OBJ-"):
        return oid
    tid = (track_id or "").strip()
    return tid or "person"


def resolve_patrol_master_id(
    worker_id: str | None,
    object_id: str | None,
    track_id: str | None,
) -> str:
    """Master id cho appearance log — gallery > sgc > OBJ > track."""
    wid = (worker_id or "").strip()
    if is_patrol_gallery_id(wid):
        return wid
    if is_sgc_worker_id(wid):
        return wid.lower()
    oid = (object_id or "").strip()
    if oid.upper().startswith("OBJ-"):
        return oid.upper()
    tid = (track_id or "").strip()
    return tid or "unknown"


def patrol_tier_label(worker_id: str | None, face_confidence: float | None = None) -> str:
    """
    Phân tier patrol person:
    - identity: đã định danh (gallery match)
    - person: sgc-* ID hoặc face detected > 0.5
    - object: không nhận diện được
    """
    wid = (worker_id or "").strip()
    if is_patrol_gallery_id(wid):
        return "identity"
    if is_sgc_worker_id(wid):
        return "person"
    # Nếu detect được khuôn mặt với confidence > 0.5 → chắc chắn là NGƯỜI
    if face_confidence is not None and face_confidence > 0.5:
        return "person"
    return "object"


def format_patrol_person_snapshot_label(
    worker_id: str | None,
    worker_name: str | None,
    object_id: str | None = None,
) -> str:
    """Nhãn ROI snapshot PERS-001 — Đối tượng / Người / tên định danh."""
    wid = (worker_id or "").strip()
    wname = (worker_name or "").strip()
    if is_patrol_gallery_id(wid):
        return wname or wid
    if is_sgc_worker_id(wid):
        return wid
    oid = (object_id or "").strip()
    if oid.upper().startswith("OBJ-"):
        return oid
    return "Đối tượng"
