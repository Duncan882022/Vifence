"""Danh tính tuần tra — `pers-xxxx` (Người) và `iden-xxxx` (Định danh).

Một bảng `persons`, phân biệt bằng `status`. Định danh là *trạng thái* của một
người chứ không phải thực thể khác, nên tách hai bảng chỉ đẻ ra một phép join.

Vector khuôn mặt nằm thẳng trong SQLite. Cách cũ dựng lại embedding từ ảnh JPG
mỗi lần khởi động — vừa chậm vừa mất mọi khuôn mặt bắt được từ camera mà chưa
kịp lưu ảnh.
"""

from __future__ import annotations

import sqlite3
import time
from typing import Any, Sequence

import numpy as np

from . import db

# Ngưỡng nhận lại người cũ. Đặt chặt là chủ ý: nhầm hai người thành một thì
# chấm công ghi sai người và rất khó phát hiện, còn cấp trùng mã thì người trực
# gộp lại được ngay trong popup.
MATCH_MIN_SIMILARITY = 0.62
# Phải hơn ứng viên kế tiếp ngần này mới dám nhận — đám đông đội mũ giống nhau
# hay cho ra vài khuôn mặt cùng điểm.
MATCH_MIN_MARGIN = 0.05
# Trần số vector giữ cho mỗi người. Nhiều góc mặt thì nhận chắc hơn, nhưng quá
# nhiều chỉ làm chậm vòng so khớp mà không thêm thông tin.
MAX_FACES_PER_PERSON = 12

STATUS_PERSON = "person"
STATUS_IDENTIFIED = "identified"


def _fmt_pers(seq: int) -> str:
    return f"pers-{seq:04d}"


def _fmt_iden(seq: int) -> str:
    return f"iden-{seq:04d}"


def _to_blob(vec: Sequence[float]) -> tuple[bytes, int]:
    arr = np.asarray(vec, dtype=np.float32).ravel()
    norm = float(np.linalg.norm(arr))
    if norm > 0:
        arr = arr / norm
    return arr.tobytes(), int(arr.size)


def _from_blob(blob: bytes, dim: int) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32, count=dim)


# ---------------------------------------------------------------------------
# Đọc


def get_person(pers_id: str) -> dict[str, Any] | None:
    """Đọc một người, tự đi theo alias nếu mã đã bị gộp."""
    pid = resolve_alias(pers_id)
    row = db.query_one("SELECT * FROM persons WHERE pers_id = ?", (pid,))
    return dict(row) if row else None


def resolve_alias(pers_id: str) -> str:
    row = db.query_one(
        "SELECT pers_id FROM person_aliases WHERE old_pers_id = ?", (pers_id,)
    )
    return str(row["pers_id"]) if row else pers_id


def list_persons(status: str | None = None) -> list[dict[str, Any]]:
    if status:
        rows = db.query(
            "SELECT * FROM persons WHERE status = ? ORDER BY created_at DESC", (status,)
        )
    else:
        rows = db.query("SELECT * FROM persons ORDER BY created_at DESC")
    return [dict(r) for r in rows]


def display_name(person: dict[str, Any] | None) -> str:
    """Nhãn hiện trên ROI và thẻ sự kiện."""
    if not person:
        return "Đối tượng"
    if person.get("status") == STATUS_IDENTIFIED:
        name = (person.get("full_name") or "").strip()
        return name or str(person.get("iden_code") or person["pers_id"])
    return str(person["pers_id"])


# ---------------------------------------------------------------------------
# Khớp khuôn mặt


def _load_face_index() -> list[tuple[str, np.ndarray]]:
    rows = db.query("SELECT pers_id, embedding, dim FROM person_faces")
    return [(str(r["pers_id"]), _from_blob(r["embedding"], int(r["dim"]))) for r in rows]


def match_face(embedding: Sequence[float]) -> tuple[str | None, float]:
    """Tìm người khớp khuôn mặt. Trả `(pers_id, similarity)` hoặc `(None, best)`.

    Gộp theo người trước khi so cách biệt: một người có nhiều vector, nếu tính
    cách biệt trên từng vector thì hai góc mặt của **cùng một người** lại tự
    triệt tiêu nhau và không bao giờ đủ margin.
    """
    index = _load_face_index()
    if not index:
        return None, 0.0

    probe = np.asarray(embedding, dtype=np.float32).ravel()
    norm = float(np.linalg.norm(probe))
    if norm <= 0:
        return None, 0.0
    probe = probe / norm

    best_by_person: dict[str, float] = {}
    for pers_id, vec in index:
        if vec.size != probe.size:
            continue
        sim = float(np.dot(probe, vec))
        if sim > best_by_person.get(pers_id, -1.0):
            best_by_person[pers_id] = sim

    if not best_by_person:
        return None, 0.0

    ranked = sorted(best_by_person.items(), key=lambda kv: kv[1], reverse=True)
    best_id, best_sim = ranked[0]
    rival = ranked[1][1] if len(ranked) > 1 else -1.0

    if best_sim < MATCH_MIN_SIMILARITY:
        return None, best_sim
    if rival > -1.0 and (best_sim - rival) < MATCH_MIN_MARGIN:
        return None, best_sim
    return best_id, best_sim


def add_face(
    pers_id: str,
    embedding: Sequence[float],
    *,
    quality: float = 0.0,
    source: str = "camera",
    camera_id: str | None = None,
    image_path: str | None = None,
    conn: sqlite3.Connection | None = None,
) -> None:
    blob, dim = _to_blob(embedding)
    now = time.time()
    pid = resolve_alias(pers_id)

    def _run(c: sqlite3.Connection) -> None:
        c.execute(
            "INSERT INTO person_faces"
            "(pers_id, embedding, dim, quality, image_path, source, camera_id, created_at)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (pid, blob, dim, float(quality), image_path, source, camera_id, now),
        )
        # Giữ các vector chất lượng cao nhất, bỏ phần đuôi.
        c.execute(
            "DELETE FROM person_faces WHERE id IN ("
            "  SELECT id FROM person_faces WHERE pers_id = ?"
            "  ORDER BY quality DESC, created_at DESC LIMIT -1 OFFSET ?"
            ")",
            (pid, MAX_FACES_PER_PERSON),
        )

    if conn is not None:
        _run(conn)
    else:
        with db.tx() as c:
            _run(c)


# ---------------------------------------------------------------------------
# Ghi


def create_person(
    *,
    origin: str = "camera",
    now: float | None = None,
    conn: sqlite3.Connection | None = None,
) -> str:
    ts = now or time.time()

    def _run(c: sqlite3.Connection) -> str:
        seq = db.next_counter(c, "pers")
        pers_id = _fmt_pers(seq)
        c.execute(
            "INSERT INTO persons(pers_id, status, origin, first_seen, last_seen, created_at)"
            " VALUES(?,?,?,?,?,?)",
            (pers_id, STATUS_PERSON, origin, ts, ts, ts),
        )
        return pers_id

    if conn is not None:
        return _run(conn)
    with db.tx() as c:
        return _run(c)


def touch_person(pers_id: str, now: float | None = None) -> None:
    ts = now or time.time()
    pid = resolve_alias(pers_id)
    with db.tx() as c:
        c.execute(
            "UPDATE persons SET last_seen = ?,"
            " first_seen = COALESCE(first_seen, ?) WHERE pers_id = ?",
            (ts, ts, pid),
        )


def observe_face(
    embedding: Sequence[float],
    *,
    quality: float = 0.0,
    camera_id: str | None = None,
    now: float | None = None,
) -> tuple[str, bool]:
    """Thấy một khuôn mặt → trả `(pers_id, vừa tạo mới)`.

    Khớp được người cũ thì chỉ bổ sung vector khi góc mặt này rõ hơn hẳn — mỗi
    frame thêm một vector sẽ làm phình bảng mà không thêm thông tin.
    """
    ts = now or time.time()
    matched, sim = match_face(embedding)
    if matched:
        with db.tx() as c:
            c.execute(
                "UPDATE persons SET last_seen = ? WHERE pers_id = ?", (ts, matched)
            )
            row = c.execute(
                "SELECT COUNT(*) n, COALESCE(MAX(quality), 0) q"
                " FROM person_faces WHERE pers_id = ?",
                (matched,),
            ).fetchone()
            if int(row["n"]) < MAX_FACES_PER_PERSON and quality > float(row["q"]) * 1.1:
                add_face(
                    matched,
                    embedding,
                    quality=quality,
                    camera_id=camera_id,
                    conn=c,
                )
        return matched, False

    with db.tx() as c:
        pers_id = create_person(origin="camera", now=ts, conn=c)
        add_face(pers_id, embedding, quality=quality, camera_id=camera_id, conn=c)
    return pers_id, True


def identify(
    pers_id: str,
    *,
    full_name: str,
    employee_code: str,
    contractor: str = "",
    identified_by: str = "",
    now: float | None = None,
) -> dict[str, Any]:
    """Gán tên cho một Người → chuyển sang Định danh, cấp `iden-xxxx`.

    Mã nhân viên đã thuộc về người khác nghĩa là nhận diện đã cấp hai mã cho
    cùng một người — gộp lại thay vì báo lỗi. Đây là tình huống thường gặp chứ
    không phải ngoại lệ: một góc nghiêng thiếu sáng là đủ để tuột ngưỡng khớp.
    """
    ts = now or time.time()
    pid = resolve_alias(pers_id)
    code = employee_code.strip()

    existing = db.query_one(
        "SELECT * FROM persons WHERE employee_code = ? AND pers_id <> ?", (code, pid)
    )
    if existing is not None:
        keep = str(existing["pers_id"])
        merge_persons(keep, pid, now=ts)
        pid = keep

    with db.tx() as c:
        row = c.execute("SELECT * FROM persons WHERE pers_id = ?", (pid,)).fetchone()
        if row is None:
            raise KeyError(f"Không có người {pers_id}")

        iden_code = row["iden_code"]
        if not iden_code:
            iden_code = _fmt_iden(db.next_counter(c, "iden"))

        c.execute(
            "UPDATE persons SET status = ?, iden_code = ?, full_name = ?,"
            " employee_code = ?, contractor = ?, identified_at = ?, identified_by = ?"
            " WHERE pers_id = ?",
            (
                STATUS_IDENTIFIED,
                iden_code,
                full_name.strip(),
                code or None,
                contractor.strip(),
                ts,
                identified_by.strip(),
                pid,
            ),
        )

    result = get_person(pid)
    assert result is not None
    return result


def merge_persons(keep_id: str, drop_id: str, *, now: float | None = None) -> None:
    """Gộp hai mã của cùng một người. Mã bị bỏ vẫn tra ra được qua alias."""
    ts = now or time.time()
    keep = resolve_alias(keep_id)
    drop = resolve_alias(drop_id)
    if keep == drop:
        return

    with db.tx() as c:
        # Khuôn mặt dồn hết về một mối — càng nhiều góc càng nhận chắc.
        c.execute("UPDATE person_faces SET pers_id = ? WHERE pers_id = ?", (keep, drop))

        # Thẻ trùng ngày phải gộp chứ không thể dời: khoá chính chặn.
        dup_dates = [
            r["event_date"]
            for r in c.execute(
                "SELECT d.event_date FROM daily_events d"
                " WHERE d.pers_id = ? AND EXISTS ("
                "   SELECT 1 FROM daily_events k"
                "   WHERE k.pers_id = ? AND k.event_date = d.event_date)",
                (drop, keep),
            ).fetchall()
        ]
        for date in dup_dates:
            c.execute(
                "UPDATE daily_events SET"
                "  first_seen = MIN(first_seen, (SELECT first_seen FROM daily_events"
                "     WHERE pers_id = ? AND event_date = ?)),"
                "  last_seen  = MAX(last_seen,  (SELECT last_seen FROM daily_events"
                "     WHERE pers_id = ? AND event_date = ?))"
                " WHERE pers_id = ? AND event_date = ?",
                (drop, date, drop, date, keep, date),
            )
            c.execute(
                "DELETE FROM daily_events WHERE pers_id = ? AND event_date = ?",
                (drop, date),
            )
        c.execute("UPDATE daily_events SET pers_id = ? WHERE pers_id = ?", (keep, drop))
        c.execute(
            "UPDATE appearances SET subject_id = ? WHERE subject_id = ?", (keep, drop)
        )

        keep_row = c.execute(
            "SELECT first_seen, last_seen FROM persons WHERE pers_id = ?", (keep,)
        ).fetchone()
        drop_row = c.execute(
            "SELECT first_seen, last_seen FROM persons WHERE pers_id = ?", (drop,)
        ).fetchone()
        if keep_row and drop_row:
            firsts = [v for v in (keep_row["first_seen"], drop_row["first_seen"]) if v]
            lasts = [v for v in (keep_row["last_seen"], drop_row["last_seen"]) if v]
            c.execute(
                "UPDATE persons SET first_seen = ?, last_seen = ? WHERE pers_id = ?",
                (min(firsts) if firsts else ts, max(lasts) if lasts else ts, keep),
            )

        c.execute("UPDATE person_aliases SET pers_id = ? WHERE pers_id = ?", (keep, drop))
        c.execute("DELETE FROM persons WHERE pers_id = ?", (drop,))
        c.execute(
            "INSERT OR REPLACE INTO person_aliases(old_pers_id, pers_id, merged_at)"
            " VALUES(?,?,?)",
            (drop, keep, ts),
        )


def import_identity(
    *,
    full_name: str,
    employee_code: str,
    contractor: str = "",
    embedding: Sequence[float] | None = None,
    image_path: str | None = None,
    source: str = "excel",
    now: float | None = None,
) -> dict[str, Any]:
    """Nhập hồ sơ có sẵn (Excel / trang quét mặt) — chưa từng gặp ngoài hiện trường.

    `first_seen` để trống cho tới lần camera thấy thật. Chạy lại cùng file thì
    cập nhật tại chỗ nhờ `employee_code` là khoá duy nhất.
    """
    ts = now or time.time()
    code = employee_code.strip()
    existing = db.query_one("SELECT * FROM persons WHERE employee_code = ?", (code,))

    with db.tx() as c:
        if existing is None:
            seq = db.next_counter(c, "pers")
            pers_id = _fmt_pers(seq)
            iden_code = _fmt_iden(db.next_counter(c, "iden"))
            c.execute(
                "INSERT INTO persons(pers_id, status, iden_code, full_name,"
                " employee_code, contractor, origin, identified_at, created_at)"
                " VALUES(?,?,?,?,?,?,?,?,?)",
                (
                    pers_id,
                    STATUS_IDENTIFIED,
                    iden_code,
                    full_name.strip(),
                    code or None,
                    contractor.strip(),
                    source,
                    ts,
                    ts,
                ),
            )
        else:
            pers_id = str(existing["pers_id"])
            c.execute(
                "UPDATE persons SET full_name = ?, contractor = ? WHERE pers_id = ?",
                (full_name.strip(), contractor.strip(), pers_id),
            )

        if embedding is not None:
            add_face(
                pers_id,
                embedding,
                quality=1.0,
                source=source,
                image_path=image_path,
                conn=c,
            )

    result = get_person(pers_id)
    assert result is not None
    return result
