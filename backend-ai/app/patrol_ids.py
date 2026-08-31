"""Patrol ID vocabulary — tk (track/re-ID), gallery, obj.

Một người chỉ cần một mã hiển thị:
- tk-*     — chưa định danh / bản nháp
- p-* / NV — gallery / nhân sự đã biết
- obj-*    — lượt gặp silhouette
"""

from __future__ import annotations


def format_tk(seq: int) -> str:
    return f"tk-{int(seq):07d}"


def is_tk_worker_id(worker_id: str | None) -> bool:
    return bool(worker_id and str(worker_id).strip().lower().startswith("tk-"))


def is_legacy_sgc_worker_id(worker_id: str | None) -> bool:
    return bool(worker_id and str(worker_id).strip().lower().startswith("sgc-"))


def is_anonymous_track_id(worker_id: str | None) -> bool:
    return is_tk_worker_id(worker_id) or is_legacy_sgc_worker_id(worker_id)


def normalize_track_id(worker_id: str | None) -> str:
    """Chuẩn hoá mã track — sgc-* cũ → tk-* (cùng số)."""
    raw = (worker_id or "").strip().lower()
    if not raw:
        return ""
    if raw.startswith("tk-"):
        return raw
    if raw.startswith("sgc-"):
        digits = raw[4:].lstrip("0") or "0"
        try:
            return format_tk(int(digits))
        except ValueError:
            return raw.replace("sgc-", "tk-", 1)
    return raw


# Back-compat alias — callers migrate to is_tk_worker_id / is_anonymous_track_id.
def is_sgc_worker_id(worker_id: str | None) -> bool:
    return is_anonymous_track_id(worker_id)


def is_person_subject_id(subject_id: str | None) -> bool:
    """True nếu subject_id là hồ sơ người (tk-*, p-*, pers-* legacy) — không phải obj-*."""
    sid = (subject_id or "").strip()
    if not sid or sid.lower().startswith("obj-"):
        return False
    sl = sid.lower()
    if sl.startswith(("tk-", "pers-", "iden-", "p-")):
        return True
    return is_anonymous_track_id(sid)
