"""Module 05 — khóa dedup / master entity cho patrol person events."""

from __future__ import annotations

from .person_identity_registry import is_sgc_worker_id
from .patrol_ids import is_anonymous_track_id, is_tk_worker_id, normalize_track_id


def is_patrol_gallery_id(worker_id: str | None) -> bool:
    wid = (worker_id or "").strip()
    if not wid or wid == "unknown" or is_anonymous_track_id(wid):
        return False
    wl = wid.lower()
    if wl.startswith("obj-"):
        return False
    try:
        from .patrol_identity_store import lookup_patrol_identity

        if lookup_patrol_identity(wid) is not None:
            return True
    except Exception:
        pass
    if wl.startswith("p-"):
        try:
            from .worker_identity.gallery import registry_rows

            return any(str(r.get("worker_id") or "").strip() == wid for r in registry_rows())
        except Exception:
            return False
    return False


def _resolve_patrol_tk_canonical(
    worker_id: str | None,
    object_id: str | None,
) -> str | None:
    """Một tk-* = một người — khóa dedup khi cùng track ẩn danh."""
    for raw in (worker_id, object_id):
        tk = normalize_track_id(raw)
        if tk and is_anonymous_track_id(tk):
            return tk.lower()
    try:
        from .patrol_identity_store import lookup_gallery_worker, lookup_patrol_identity
    except Exception:
        return None
    for alias in (worker_id, object_id):
        if not alias:
            continue
        gallery = lookup_gallery_worker(alias)
        if not gallery:
            continue
        row = lookup_patrol_identity(gallery) or {}
        for key in row.get("aliases") or []:
            tk = normalize_track_id(str(key))
            if tk and is_anonymous_track_id(tk):
                return tk.lower()
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
    """Stable id cho dedup_key — tk canonical > gallery > OBJ > slot > track."""
    tk_key = _resolve_patrol_tk_canonical(worker_id, object_id)
    if tk_key:
        return tk_key
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
    """Master id cho appearance log — tk canonical > gallery > OBJ > track."""
    tk_key = _resolve_patrol_tk_canonical(worker_id, object_id)
    if tk_key:
        return tk_key
    wid = (worker_id or "").strip()
    if is_patrol_gallery_id(wid):
        return wid
    tk = normalize_track_id(wid)
    if tk and is_anonymous_track_id(tk):
        return tk.lower()
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
    """tk/p-/alias → mã gallery p-* khi đã bind (draft hoặc identified)."""
    wid = (worker_id or "").strip()
    if not wid or wid == "unknown" or is_patrol_track_technical_id(wid):
        return None
    if wid.lower().startswith("p-") and is_patrol_gallery_id(wid):
        return wid
    try:
        from .patrol_identity_store import lookup_gallery_worker_raw

        gallery = lookup_gallery_worker_raw(wid)
        if gallery:
            return gallery
    except Exception:
        return None
    return None


def patrol_tier_label(worker_id: str | None) -> str:
    """
    Phân tier patrol person (behavior=person):
    - identity: gallery p-* đã xác minh HR
    - person: tk-* (draft / re-id)
    - object: chưa đủ tiêu chí
    """
    wid = (worker_id or "").strip()
    if not wid or wid == "unknown" or is_patrol_track_technical_id(wid):
        return "object"
    if wid.lower().startswith("p-"):
        return "identity" if is_patrol_gallery_id(wid) else "person"
    if resolve_patrol_gallery_id_for_worker(wid) or is_patrol_gallery_id(wid):
        return "identity"
    tk = normalize_track_id(wid)
    if tk and is_anonymous_track_id(tk):
        return "person"
    return "object"


def format_patrol_person_snapshot_label(
    worker_id: str | None,
    worker_name: str | None,
    object_id: str | None = None,
) -> str:
    """Nhãn snapshot — mã ID (+ tên định danh), không chỉ loại chung."""
    wid = (worker_id or "").strip()
    wname = (worker_name or "").strip()
    oid = (object_id or "").strip()

    if is_patrol_gallery_id(wid):
        display = resolve_patrol_worker_display_name(wid, wname)
        code = wid
        if display and display != code and not is_technical_patrol_worker_label(display):
            return f"{code} {display}"
        return code or display

    tk = normalize_track_id(wid)
    if tk and is_anonymous_track_id(tk):
        return tk

    if oid.upper().startswith("OBJ-"):
        return oid

    if oid and not oid.upper().startswith("OBJ-"):
        try:
            from .patrol import identity as patrol_identity

            person = patrol_identity.get_person(oid)
            if person and person.get("status") == patrol_identity.STATUS_IDENTIFIED:
                code = str(person.get("employee_code") or oid).strip()
                name = str(person.get("full_name") or "").strip()
                if name and not is_technical_patrol_worker_label(name):
                    return f"{code} {name}"
                return code
            if person:
                return oid
        except Exception:  # noqa: BLE001
            pass

    if wid:
        return wid
    if oid:
        return oid
    return "Đối tượng"


def is_technical_patrol_worker_label(label: str | None) -> bool:
    """True nếu chuỗi là mã kỹ thuật (sgc/p-/pers-) — không phải tên người."""
    s = (label or "").strip()
    if not s or s.lower() == "unknown":
        return True
    sl = s.lower()
    return sl.startswith(("tk-", "sgc-", "p-", "obj-", "ptk"))


def resolve_patrol_worker_display_name(
    worker_id: str | None,
    worker_name: str | None = None,
) -> str:
    """Tên hiển thị ROI — chỉ tên từ hồ sơ HR import, không từ binding gallery ảo."""
    wid = (worker_id or "").strip()
    wname = (worker_name or "").strip()

    if wid:
        try:
            from .patrol import identity as patrol_identity
            from .patrol_identity_store import lookup_gallery_worker, lookup_patrol_identity

            for key in (wid, lookup_gallery_worker(wid) or ""):
                if not key:
                    continue
                row = lookup_patrol_identity(key)
                if row:
                    code = str(row.get("employee_code") or "").strip()
                    if code:
                        person = patrol_identity.hr_profile_for_employee_code(code)
                        if person:
                            name = str(person.get("full_name") or "").strip()
                            if name and not is_technical_patrol_worker_label(name):
                                return name
        except Exception:
            pass

        if wname and not is_technical_patrol_worker_label(wname) and wname != wid:
            try:
                from .patrol import identity as patrol_identity

                hr = patrol_identity.hr_profile_for_gallery(wid)
                if hr and str(hr.get("full_name") or "").strip() == wname:
                    return wname
            except Exception:
                pass

        if wid.lower().startswith("p-") and not is_patrol_gallery_id(wid):
            return "Người"

        if is_patrol_gallery_id(wid) or is_anonymous_track_id(wid):
            return "Người"

    if wid and is_tk_worker_id(wid):
        return "Người"

    if wname and not is_technical_patrol_worker_label(wname) and wname != wid:
        return wname

    return wid or "Đối tượng"
