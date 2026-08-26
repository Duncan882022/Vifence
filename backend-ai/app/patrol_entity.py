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


def _resolve_patrol_sgc_canonical(
    worker_id: str | None,
    object_id: str | None,
) -> str | None:
    """Một sgc-* = một người — dùng làm khóa dedup dù gán nhiều tên/OBJ."""
    wid = (worker_id or "").strip()
    oid = (object_id or "").strip()
    if is_sgc_worker_id(wid):
        return wid.lower()
    if is_sgc_worker_id(oid):
        return oid.lower()
    try:
        from .patrol_identity_store import lookup_gallery_worker, lookup_patrol_identity
    except Exception:
        return None
    for alias in (wid, oid):
        if not alias:
            continue
        if alias.lower().startswith("sgc-"):
            return alias.lower()
        gallery = lookup_gallery_worker(alias)
        if not gallery:
            continue
        row = lookup_patrol_identity(gallery) or {}
        for key in row.get("aliases") or []:
            key_s = str(key).strip()
            if is_sgc_worker_id(key_s):
                return key_s.lower()
    return None


def resolve_patrol_dedup_stable_id(
    worker_id: str | None,
    object_id: str | None,
    track_id: str | None,
    *,
    person_bbox: list[float] | tuple[float, ...] | None = None,
    frame_w: int = 0,
    frame_h: int = 0,
) -> str:
    """Stable id cho dedup_key — sgc canonical > gallery > OBJ > slot > track."""
    sgc = _resolve_patrol_sgc_canonical(worker_id, object_id)
    if sgc:
        return sgc
    wid = (worker_id or "").strip()
    if wid and wid not in ("unknown", ""):
        return wid
    oid = (object_id or "").strip()
    if oid.upper().startswith("OBJ-"):
        return oid
    tid = (track_id or "").strip()
    # Track của `patrol_tracker` bám đúng một người suốt lượt xuất hiện, nên tự
    # nó đã là khoá dedup tốt nhất khi chưa có mã định danh nào.
    if tid.startswith("ptk"):
        return f"track:{tid}"
    if tid.endswith(":person"):
        slot = tid.split(":")[0]
        if slot.startswith("p"):
            return f"slot:{slot}"
    if person_bbox and len(person_bbox) >= 4 and frame_w > 0 and frame_h > 0:
        from .track_matching import _person_slot

        return f"slot:{_person_slot(list(person_bbox), frame_w, frame_h)}"
    return tid or "person"


def resolve_patrol_master_id(
    worker_id: str | None,
    object_id: str | None,
    track_id: str | None,
) -> str:
    """Master id cho appearance log — sgc canonical > gallery > OBJ > track."""
    sgc = _resolve_patrol_sgc_canonical(worker_id, object_id)
    if sgc:
        return sgc
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


def patrol_tier_label(worker_id: str | None) -> str:
    """
    Phân tier patrol person (chỉ áp dụng cho detection behavior=person):
    - identity: gallery / profile đã xác minh
    - person: mã sgc-* ổn định (re-id)
    - object: người chưa đủ tiêu chí nhận diện (chưa có sgc/gallery)
    """
    wid = (worker_id or "").strip()
    if is_patrol_gallery_id(wid):
        return "identity"
    if is_sgc_worker_id(wid):
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
