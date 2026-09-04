"""Sổ các thẻ Người đã thăng hạng từ Đối tượng trong ngày.

Dùng cho nhãn ROI trên camera: người dùng cần thấy ngay thẻ nào vừa lên hạng,
vì đó là lời giải thích cho việc một thẻ Người mang ảnh badge "Đối tượng". Tra
`daily_objects.promoted_to` mỗi khung thì tốn một truy vấn cho mỗi hộp trên mỗi
khung, nên giữ trong bộ nhớ và chỉ nạp từ SQLite một lần cho mỗi ngày.
"""

from __future__ import annotations

import threading

_lock = threading.RLock()
_by_date: dict[str, set[str]] = {}


def _load(date: str) -> set[str]:
    from . import db

    rows = db.query(
        "SELECT DISTINCT promoted_to FROM daily_objects"
        " WHERE event_date = ? AND promoted_to IS NOT NULL",
        (date,),
    )
    return {str(r["promoted_to"]) for r in rows if r["promoted_to"]}


def mark_promoted(subject_id: str, date: str) -> None:
    sid = (subject_id or "").strip()
    if not sid:
        return
    with _lock:
        _by_date.setdefault(date, set()).add(sid)


def was_promoted(subject_id: str, date: str) -> bool:
    sid = (subject_id or "").strip()
    if not sid:
        return False
    with _lock:
        known = _by_date.get(date)
    if known is None:
        # Nạp ngoài lock: truy vấn SQLite trong lock sẽ chặn luồng phân tích.
        loaded = _load(date)
        with _lock:
            known = _by_date.setdefault(date, set())
            known |= loaded
    return sid in known


def reset() -> None:
    with _lock:
        _by_date.clear()
