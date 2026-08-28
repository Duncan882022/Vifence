"""Danh tính tuần tra — `pers-xxxx` (Người) và `iden-xxxx` (Định danh).

Một bảng `persons`, phân biệt bằng `status`. Định danh là *trạng thái* của một
người chứ không phải thực thể khác, nên tách hai bảng chỉ đẻ ra một phép join.

Vector khuôn mặt nằm thẳng trong SQLite. Cách cũ dựng lại embedding từ ảnh JPG
mỗi lần khởi động — vừa chậm vừa mất mọi khuôn mặt bắt được từ camera mà chưa
kịp lưu ảnh.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
import time
from typing import Any, Sequence

import numpy as np

from . import db

logger = logging.getLogger("patrol.identity")

# Ngưỡng nhận lại người cũ.
#
# Đo trên dữ liệu thật của bodycam: hai lần thấy **cùng một người** ở góc khác
# nhau chỉ đạt tương đồng 0,39 (trung vị) tới 0,60 (cao nhất). Khuôn mặt chụp
# từ mũ đội đầu vốn nhỏ, nhoè và lệch góc, nên embedding rời rạc hơn hẳn ảnh
# chân dung. Để 0,62 là gần như không bao giờ khớp — đúng cái đã làm một người
# bị tách thành pers-0001 … pers-0011.
MATCH_MIN_SIMILARITY = 0.52
# Phải hơn ứng viên kế tiếp ngần này mới dám nhận.
#
# Giữ nhỏ có lý do: khi một người lỡ bị tách thành vài mã, các mã đó trở thành
# "đối thủ" của nhau và biên độ lớn sẽ chặn mọi lần khớp — càng tách càng không
# gộp lại được. Người trực gộp tay được, còn nhập nhầm hai người thì khó thấy,
# nên vẫn giữ một khoảng cách tối thiểu.
MATCH_MIN_MARGIN = 0.03
# Trần số vector giữ cho mỗi người. Nhiều góc mặt thì nhận chắc hơn hẳn: lần
# gặp sau chỉ cần khớp **một** góc bất kỳ trong số đã lưu.
MAX_FACES_PER_PERSON = 24
# Góc mới giống góc đã có tới mức này thì không thêm — không mang thêm thông
# tin mà chỉ làm chậm vòng so khớp.
FACE_ANGLE_DEDUPE_SIM = 0.88

STATUS_PERSON = "person"
STATUS_IDENTIFIED = "identified"


def _sync_gallery_after_identify(pers_id: str) -> None:
    """SQLite → worker_gallery + bindings để overlay live nhận tên."""
    try:
        from .gallery_sync import sync_person_to_gallery

        sync_person_to_gallery(pers_id)
    except Exception:  # noqa: BLE001
        logger.warning("gallery_sync skipped for %s", pers_id, exc_info=True)


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


SCAN_FACES_REQUIRED = 3
SCAN_POSE_LABELS = ("Chính diện", "Nghiêng trái", "Nghiêng phải")


def find_by_employee_code(employee_code: str) -> dict[str, Any] | None:
    code = employee_code.strip()
    if not code:
        return None
    row = db.query_one("SELECT * FROM persons WHERE employee_code = ?", (code,))
    return dict(row) if row else None


def face_count(pers_id: str) -> int:
    pid = resolve_alias(pers_id)
    row = db.query_one(
        "SELECT COUNT(*) AS c FROM person_faces WHERE pers_id = ?", (pid,)
    )
    return int(row["c"]) if row else 0


def get_scan_enrollment(pers_id: str) -> dict[str, Any]:
    """Trạng thái quét mặt cho trang enroll — 3 góc tối thiểu."""
    pid = resolve_alias(pers_id)
    person = get_person(pid)
    count = face_count(pid)
    rows = db.query(
        "SELECT id, quality, source, created_at FROM person_faces"
        " WHERE pers_id = ? ORDER BY created_at ASC",
        (pid,),
    )
    poses: list[dict[str, Any]] = []
    for slot in range(1, SCAN_FACES_REQUIRED + 1):
        captured = count >= slot
        poses.append({
            "slot": slot,
            "label": SCAN_POSE_LABELS[slot - 1],
            "captured": captured,
        })
    return {
        "pers_id": pid,
        "full_name": person.get("full_name") if person else None,
        "employee_code": person.get("employee_code") if person else None,
        "contractor": person.get("contractor") if person else None,
        "status": person.get("status") if person else None,
        "faces_captured": count,
        "faces_required": SCAN_FACES_REQUIRED,
        "complete": count >= SCAN_FACES_REQUIRED,
        "poses": poses,
        "face_records": len(rows),
    }


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


# Bảng khuôn mặt đổi hiếm (chỉ khi gặp người mới hoặc gán tên) nhưng bị đọc ở
# mỗi khung hình của mỗi camera. Giữ bản dựng sẵn trong RAM, huỷ khi có ghi.
_face_index: list[tuple[str, np.ndarray]] | None = None
_face_index_lock = threading.Lock()


def _invalidate_face_index() -> None:
    global _face_index
    with _face_index_lock:
        _face_index = None


def _load_face_index() -> list[tuple[str, np.ndarray]]:
    global _face_index
    with _face_index_lock:
        if _face_index is not None:
            return _face_index
    rows = db.query("SELECT pers_id, embedding, dim FROM person_faces")
    built = [
        (str(r["pers_id"]), _from_blob(r["embedding"], int(r["dim"]))) for r in rows
    ]
    with _face_index_lock:
        _face_index = built
    return built


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
    _invalidate_face_index()


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


def add_face_angle(
    pers_id: str,
    embedding: Sequence[float],
    *,
    quality: float = 0.0,
    camera_id: str | None = None,
    now: float | None = None,
) -> bool:
    """Bổ sung một góc mặt cho người đã biết. Trả True nếu có lưu thêm.

    Chỉ nhận góc **khác** với những gì đã có. Điều kiện cũ ("rõ hơn hẳn góc tốt
    nhất") gần như không bao giờ đúng — điểm chất lượng nằm quanh 0.86–0.93 nên
    đòi hơn 1,1 lần là bất khả — và hậu quả là mỗi người mãi chỉ có đúng một
    vector. Một vector thì gặp lại ở góc khác là trượt.
    """
    ts = now or time.time()
    pid = resolve_alias(pers_id)

    rows = db.query(
        "SELECT embedding, dim FROM person_faces WHERE pers_id = ?", (pid,)
    )
    if len(rows) >= MAX_FACES_PER_PERSON:
        return False

    probe = np.asarray(embedding, dtype=np.float32).ravel()
    norm = float(np.linalg.norm(probe))
    if norm <= 0:
        return False
    probe = probe / norm

    for r in rows:
        vec = _from_blob(r["embedding"], int(r["dim"]))
        if vec.size == probe.size and float(np.dot(probe, vec)) > FACE_ANGLE_DEDUPE_SIM:
            return False

    add_face(pid, embedding, quality=quality, camera_id=camera_id)
    with db.tx() as c:
        c.execute("UPDATE persons SET last_seen = ? WHERE pers_id = ?", (ts, pid))
    return True


def observe_face(
    embedding: Sequence[float],
    *,
    quality: float = 0.0,
    camera_id: str | None = None,
    now: float | None = None,
) -> tuple[str, bool]:
    """Thấy một khuôn mặt của track **chưa biết là ai** → `(pers_id, vừa tạo)`.

    Chỉ gọi khi một track lần đầu bắt được mặt. Track đã có chủ thì dùng
    `add_face_angle` — xem ghi chú ở `sink.record_observation`.
    """
    ts = now or time.time()
    matched, _sim = match_face(embedding)
    if matched:
        pid = resolve_alias(matched)
        with db.tx() as c:
            c.execute(
                "UPDATE persons SET last_seen = ? WHERE pers_id = ?", (ts, pid)
            )
        add_face_angle(
            pid, embedding, quality=quality, camera_id=camera_id, now=ts
        )
        return pid, False

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
    _sync_gallery_after_identify(pid)
    return result


def update_profile(
    pers_id: str,
    *,
    full_name: str,
    employee_code: str,
    contractor: str = "",
) -> dict[str, Any]:
    """Cập nhật hồ sơ đã import — không đổi mã định danh nội bộ."""
    pid = resolve_alias(pers_id)
    row = get_person(pid)
    if row is None:
        raise KeyError("not_found")

    name = full_name.strip()
    code = employee_code.strip()
    if not name or not code:
        raise ValueError("missing_fields")

    existing = db.query_one(
        "SELECT pers_id FROM persons WHERE employee_code = ? AND pers_id <> ?",
        (code, pid),
    )
    if existing is not None:
        raise ValueError("duplicate_employee_code")

    with db.tx() as c:
        c.execute(
            "UPDATE persons SET full_name = ?, employee_code = ?, contractor = ?"
            " WHERE pers_id = ?",
            (name, code, contractor.strip(), pid),
        )

    result = get_person(pid)
    assert result is not None
    return result


def delete_person(pers_id: str) -> bool:
    """Xóa hồ sơ và vector khuôn mặt (CASCADE)."""
    pid = resolve_alias(pers_id)
    with db.tx() as c:
        cur = c.execute("DELETE FROM persons WHERE pers_id = ?", (pid,))
        deleted = cur.rowcount > 0
    if deleted:
        _invalidate_face_index()
    return deleted


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
    _invalidate_face_index()


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
    if result.get("status") == STATUS_IDENTIFIED:
        _sync_gallery_after_identify(pers_id)
    return result


# ---------------------------------------------------------------------------
# Phiên quét mặt tự phục vụ — quét trước, nhập hồ sơ (Excel fields) sau.


ENROLL_SESSION_TTL_SEC = 3600.0


def _purge_expired_enroll_sessions(now: float | None = None) -> None:
    ts = now or time.time()
    with db.tx() as c:
        c.execute("DELETE FROM enroll_sessions WHERE expires_at <= ?", (ts,))


def create_enroll_session(now: float | None = None) -> str:
    import uuid

    _purge_expired_enroll_sessions(now)
    ts = now or time.time()
    session_id = uuid.uuid4().hex
    with db.tx() as c:
        c.execute(
            "INSERT INTO enroll_sessions(session_id, created_at, expires_at)"
            " VALUES(?,?,?)",
            (session_id, ts, ts + ENROLL_SESSION_TTL_SEC),
        )
    return session_id


def _get_enroll_session_row(session_id: str, now: float | None = None) -> dict[str, Any] | None:
    _purge_expired_enroll_sessions(now)
    row = db.query_one(
        "SELECT * FROM enroll_sessions WHERE session_id = ?",
        (session_id.strip(),),
    )
    if row is None:
        return None
    ts = now or time.time()
    if float(row["expires_at"]) <= ts:
        with db.tx() as c:
            c.execute("DELETE FROM enroll_sessions WHERE session_id = ?", (session_id,))
        return None
    return dict(row)


def get_enroll_session_enrollment(session_id: str) -> dict[str, Any] | None:
    if _get_enroll_session_row(session_id) is None:
        return None
    rows = db.query(
        "SELECT slot FROM enroll_session_faces WHERE session_id = ? ORDER BY slot ASC",
        (session_id.strip(),),
    )
    captured_slots = {int(r["slot"]) for r in rows}
    count = len(captured_slots)
    poses: list[dict[str, Any]] = []
    for slot in range(1, SCAN_FACES_REQUIRED + 1):
        poses.append({
            "slot": slot,
            "label": SCAN_POSE_LABELS[slot - 1],
            "captured": slot in captured_slots,
        })
    return {
        "session_id": session_id.strip(),
        "faces_captured": count,
        "faces_required": SCAN_FACES_REQUIRED,
        "complete": count >= SCAN_FACES_REQUIRED,
        "poses": poses,
        "face_records": count,
    }


def add_enroll_session_face(
    session_id: str,
    embedding: Sequence[float],
    *,
    pose_slot: int | None = None,
    now: float | None = None,
) -> bool:
    if _get_enroll_session_row(session_id, now) is None:
        return False

    probe = np.asarray(embedding, dtype=np.float32).ravel()
    norm = float(np.linalg.norm(probe))
    if norm <= 0:
        return False
    probe = probe / norm

    sid = session_id.strip()
    rows = db.query(
        "SELECT slot, embedding, dim FROM enroll_session_faces WHERE session_id = ?",
        (sid,),
    )
    for r in rows:
        vec = _from_blob(r["embedding"], int(r["dim"]))
        if vec.size == probe.size and float(np.dot(probe, vec)) > FACE_ANGLE_DEDUPE_SIM:
            return False

    slot = int(pose_slot or (len(rows) + 1))
    if slot < 1 or slot > SCAN_FACES_REQUIRED:
        return False

    blob, dim = _to_blob(probe)
    ts = now or time.time()
    with db.tx() as c:
        c.execute(
            "INSERT INTO enroll_session_faces(session_id, slot, embedding, dim, quality, created_at)"
            " VALUES(?,?,?,?,?,?)"
            " ON CONFLICT(session_id, slot) DO UPDATE SET"
            " embedding=excluded.embedding, dim=excluded.dim, quality=excluded.quality,"
            " created_at=excluded.created_at",
            (sid, slot, blob, dim, 1.0, ts),
        )
        c.execute(
            "UPDATE enroll_sessions SET expires_at = ? WHERE session_id = ?",
            (ts + ENROLL_SESSION_TTL_SEC, sid),
        )
    return True


def complete_enroll_session(
    session_id: str,
    *,
    full_name: str,
    employee_code: str,
    contractor: str = "",
    now: float | None = None,
) -> dict[str, Any]:
    """Gắn vector phiên quét vào hồ sơ — cùng schema import Excel."""
    if _get_enroll_session_row(session_id, now) is None:
        raise ValueError("session_not_found")

    enrollment = get_enroll_session_enrollment(session_id)
    if enrollment is None or not enrollment["complete"]:
        raise ValueError("incomplete_enrollment")

    sid = session_id.strip()
    face_rows = db.query(
        "SELECT embedding, dim FROM enroll_session_faces"
        " WHERE session_id = ? ORDER BY slot ASC",
        (sid,),
    )
    if len(face_rows) < SCAN_FACES_REQUIRED:
        raise ValueError("incomplete_enrollment")

    row = import_identity(
        full_name=full_name,
        employee_code=employee_code,
        contractor=contractor,
        embedding=None,
        source="self_enroll",
        now=now,
    )
    pers_id = str(row["pers_id"])
    ts = now or time.time()
    for fr in face_rows:
        vec = _from_blob(fr["embedding"], int(fr["dim"]))
        add_face_angle(
            pers_id,
            vec.tolist(),
            quality=1.0,
            camera_id="SELF_ENROLL",
            now=ts,
        )

    with db.tx() as c:
        c.execute("DELETE FROM enroll_sessions WHERE session_id = ?", (sid,))

    result = get_person(pers_id)
    assert result is not None
    _sync_gallery_after_identify(pers_id)
    return result
