"""Module 05 — khóa dedup / master entity cho patrol person events."""

from __future__ import annotations

from .person_identity_registry import is_sgc_worker_id


def is_patrol_pers_id(worker_id: str | None) -> bool:
    return (worker_id or "").strip().lower().startswith("pers-")


def is_patrol_iden_id(worker_id: str | None) -> bool:
    return (worker_id or "").strip().lower().startswith("iden-")


def is_patrol_gallery_id(worker_id: str | None) -> bool:
    wid = (worker_id or "").strip()
    if not wid or wid == "unknown" or is_sgc_worker_id(wid):
        return False
    wl = wid.lower()
    if wl.startswith(("pers-", "iden-")):
        return False
    if wl.startswith("p-"):
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


def is_patrol_track_technical_id(worker_id: str | None) -> bool:
    """True nếu là mã track ByteTrack — không phải định danh nhân sự."""
    s = (worker_id or "").strip()
    if not s:
        return False
    sl = s.lower()
    if sl.startswith("ptk"):
        return True
    if sl.endswith(":person"):
        slot = sl.split(":", 1)[0]
        if slot.startswith("p") and len(slot) > 1 and slot[1:].isdigit():
            return True
    return False


def resolve_patrol_gallery_id_for_worker(worker_id: str | None) -> str | None:
    """pers/iden/sgc/alias → mã gallery p-* khi đã bind hoặc đã định danh SQLite."""
    wid = (worker_id or "").strip()
    if not wid or wid == "unknown" or is_patrol_track_technical_id(wid):
        return None
    if wid.lower().startswith("p-") and is_patrol_gallery_id(wid):
        return wid
    if wid.lower().startswith(("pers-", "iden-")):
        try:
            from .patrol import identity as patrol_identity
            from .patrol_identity_store import lookup_gallery_worker, patrol_gallery_worker_id

            person = patrol_identity.get_person(wid)
            if person and person.get("status") == patrol_identity.STATUS_IDENTIFIED:
                emp = str(person.get("employee_code") or "").strip()
                if emp:
                    return patrol_gallery_worker_id(emp)
            gallery = lookup_gallery_worker(wid)
            if gallery:
                return gallery
        except Exception:
            pass
        return None
    try:
        from .patrol_identity_store import lookup_gallery_worker

        gallery = lookup_gallery_worker(wid)
        if gallery:
            return gallery
    except Exception:
        return None
    return None


def patrol_tier_label(worker_id: str | None) -> str:
    """
    Phân tier patrol person (chỉ áp dụng cho detection behavior=person):
    - identity: gallery / profile đã xác minh (p-*, pers identified, iden-*)
    - person: đã phân biệt A≠B (sgc-* hoặc pers-* chưa gallery)
    - object: chưa đủ tiêu chí nhận diện
    """
    wid = (worker_id or "").strip()
    if not wid or wid == "unknown" or is_patrol_track_technical_id(wid):
        return "object"
    if wid.lower().startswith("pers-"):
        try:
            from .patrol import identity as patrol_identity

            person = patrol_identity.get_person(wid)
            if person:
                if person.get("status") == patrol_identity.STATUS_IDENTIFIED:
                    return "identity"
                return "person"
        except Exception:
            pass
        try:
            from .patrol_identity_store import lookup_gallery_worker

            if lookup_gallery_worker(wid):
                return "identity"
        except Exception:
            pass
        return "object"
    if wid.lower().startswith("iden-"):
        return "identity"
    if resolve_patrol_gallery_id_for_worker(wid) or is_patrol_gallery_id(wid):
        return "identity"
    if is_patrol_iden_id(wid):
        return "identity"
    if is_sgc_worker_id(wid) or is_patrol_pers_id(wid):
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
        return resolve_patrol_worker_display_name(wid, wname)
    if is_sgc_worker_id(wid) or is_patrol_pers_id(wid):
        return "Người"
    oid = (object_id or "").strip()
    if oid.lower().startswith("pers-"):
        try:
            from .patrol import identity as patrol_identity

            person = patrol_identity.get_person(oid)
            if person and person.get("status") == patrol_identity.STATUS_IDENTIFIED:
                return resolve_patrol_worker_display_name(
                    str(person.get("employee_code") or oid),
                    str(person.get("full_name") or ""),
                )
            if person:
                return "Người"
        except Exception:  # noqa: BLE001
            pass
    if oid.upper().startswith("OBJ-"):
        return "Đối tượng"
    return "Đối tượng"


def is_technical_patrol_worker_label(label: str | None) -> bool:
    """True nếu chuỗi là mã kỹ thuật (sgc/p-/pers-) — không phải tên người."""
    s = (label or "").strip()
    if not s or s.lower() == "unknown":
        return True
    sl = s.lower()
    return sl.startswith(("sgc-", "p-", "pers-", "iden-", "obj-", "ptk"))


def resolve_patrol_worker_display_name(
    worker_id: str | None,
    worker_name: str | None = None,
) -> str:
    """Tên hiển thị ROI — ưu tiên binding/SQLite, không trả mã khi đã định danh."""
    wid = (worker_id or "").strip()
    wname = (worker_name or "").strip()

    if wname and not is_technical_patrol_worker_label(wname) and wname != wid:
        return wname

    if wid:
        try:
            from .patrol_identity_store import lookup_gallery_worker, lookup_patrol_identity

            for key in (wid, lookup_gallery_worker(wid) or ""):
                if not key:
                    continue
                row = lookup_patrol_identity(key)
                if row:
                    name = str(row.get("worker_name") or "").strip()
                    if name and not is_technical_patrol_worker_label(name):
                        return name
        except Exception:
            pass

        if wid.lower().startswith("pers-"):
            try:
                from .patrol import identity as patrol_identity

                person = patrol_identity.get_person(wid)
                if person and person.get("status") == patrol_identity.STATUS_IDENTIFIED:
                    name = patrol_identity.display_name(person)
                    if name and not is_technical_patrol_worker_label(name):
                        return name
            except Exception:
                pass

    if wname and wname != wid:
        return wname
    return wid or "Đối tượng"
