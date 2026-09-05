"""Sổ các thẻ Người đã thăng hạng từ Đối tượng trong ngày.

Dùng cho nhãn ROI trên camera: sau khi ghi hồ sơ, live hiển thị mã `obj-*`
gốc thay vì nhãn chung "Người". Tra SQLite mỗi khung thì tốn — giữ cache theo ngày.
"""

from __future__ import annotations

import threading

_lock = threading.RLock()
_by_date: dict[str, set[str]] = {}
_obj_ids_by_date: dict[str, dict[str, tuple[str, ...]]] = {}


def _load(date: str) -> tuple[set[str], dict[str, tuple[str, ...]]]:
    from . import db

    rows = db.query(
        "SELECT obj_id, promoted_to FROM daily_objects"
        " WHERE event_date = ? AND promoted_to IS NOT NULL"
        " ORDER BY promoted_at ASC",
        (date,),
    )
    promoted: set[str] = set()
    by_subject: dict[str, list[str]] = {}
    for row in rows:
        pid = str(row["promoted_to"] or "").strip()
        oid = str(row["obj_id"] or "").strip()
        if not pid or not oid:
            continue
        promoted.add(pid)
        bucket = by_subject.setdefault(pid, [])
        if oid not in bucket:
            bucket.append(oid)
    return promoted, {k: tuple(v) for k, v in by_subject.items()}


def _ensure_loaded(date: str) -> None:
    with _lock:
        if date in _by_date and date in _obj_ids_by_date:
            return
    promoted, obj_map = _load(date)
    with _lock:
        known = _by_date.setdefault(date, set())
        known |= promoted
        obj_known = _obj_ids_by_date.setdefault(date, {})
        for pid, ids in obj_map.items():
            merged = list(obj_known.get(pid, ()))
            for oid in ids:
                if oid not in merged:
                    merged.append(oid)
            obj_known[pid] = tuple(merged)


def mark_promoted(subject_id: str, date: str, object_id: str | None = None) -> None:
    sid = (subject_id or "").strip()
    if not sid:
        return
    with _lock:
        _by_date.setdefault(date, set()).add(sid)
        if object_id:
            oid = str(object_id).strip()
            if oid:
                by_subj = _obj_ids_by_date.setdefault(date, {})
                cur = list(by_subj.get(sid, ()))
                if oid not in cur:
                    cur.append(oid)
                by_subj[sid] = tuple(cur)


def was_promoted(subject_id: str, date: str) -> bool:
    sid = (subject_id or "").strip()
    if not sid:
        return False
    _ensure_loaded(date)
    with _lock:
        return sid in _by_date.get(date, set())


def promoted_object_ids(subject_id: str, date: str) -> list[str]:
    sid = (subject_id or "").strip()
    if not sid:
        return []
    _ensure_loaded(date)
    with _lock:
        return list(_obj_ids_by_date.get(date, {}).get(sid, ()))


def reset() -> None:
    with _lock:
        _by_date.clear()
        _obj_ids_by_date.clear()
