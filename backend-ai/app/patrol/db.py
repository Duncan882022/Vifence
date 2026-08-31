"""SQLite cho Module 05 — một file, không tiến trình phụ, không phụ thuộc mới.

Vì sao SQLite chứ không phải file JSON như trước: thao tác thăng tầng (Đối
tượng bắt được mặt → trở thành Người) phải sửa bốn nơi cùng lúc. Với JSON thì
không có transaction chung, đứt giữa chừng là dữ liệu lệch — mà thao tác này
chạy liên tục cả ngày. Ngoài ra file JSON phải ghi lại toàn bộ mỗi lần chạm
vào một bản ghi, đúng kiểu tải làm lộ nhược điểm.
"""

from __future__ import annotations

import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DB_FILE = DATA_DIR / "patrol.db"

_SCHEMA_VERSION = 8

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None

VN_TZ = timezone(timedelta(hours=7))


def today_vn(ts: float | None = None) -> str:
    """Ngày làm việc theo giờ VN — cùng mốc cắt ngày với `events.py`."""
    return datetime.fromtimestamp(ts or time.time(), tz=VN_TZ).strftime("%Y-%m-%d")


_SCHEMA = """
-- Hồ sơ tuần tra: pers_id = tk-* (draft) hoặc gallery id p-* (identified).
-- Không còn pers-0001 / iden-0001 tự sinh.
CREATE TABLE IF NOT EXISTS persons (
  pers_id       TEXT PRIMARY KEY,
  status        TEXT NOT NULL,
  full_name     TEXT,
  employee_code TEXT UNIQUE,
  contractor    TEXT,
  origin        TEXT NOT NULL DEFAULT 'camera',
  first_seen    REAL,
  last_seen     REAL,
  identified_at REAL,
  identified_by TEXT,
  created_at    REAL NOT NULL,
  CHECK (status IN ('draft', 'identified')),
  CHECK (
    (status = 'identified') = (
      employee_code IS NOT NULL
      AND employee_code NOT LIKE 'tk-%'
      AND employee_code NOT LIKE 'sgc-%'
    )
  )
);

-- Một người nhiều khuôn mặt (nhiều góc, nhiều nguồn) — 1:N thật.
CREATE TABLE IF NOT EXISTS person_faces (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pers_id    TEXT NOT NULL REFERENCES persons(pers_id) ON DELETE CASCADE,
  embedding  BLOB NOT NULL,
  dim        INTEGER NOT NULL,
  quality    REAL NOT NULL DEFAULT 0,
  image_path TEXT,
  source     TEXT NOT NULL DEFAULT 'camera',
  camera_id  TEXT,
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_person_faces_pers ON person_faces(pers_id);

-- Nhận diện khuôn mặt luôn có lúc cấp hai mã cho cùng một người (góc nghiêng,
-- thiếu sáng). Gộp lại thì mã cũ vẫn phải tra ra đúng người.
CREATE TABLE IF NOT EXISTS person_aliases (
  old_pers_id TEXT PRIMARY KEY,
  pers_id     TEXT NOT NULL REFERENCES persons(pers_id) ON DELETE CASCADE,
  merged_at   REAL NOT NULL
);

-- Đối tượng: chưa thấy mặt nên không có gì để nhận lại vào hôm sau. Sống trong
-- ngày rồi xoá.
CREATE TABLE IF NOT EXISTS daily_objects (
  event_date     TEXT NOT NULL,
  obj_id         TEXT NOT NULL,
  first_seen     REAL NOT NULL,
  last_seen      REAL NOT NULL,
  snapshot_path  TEXT,
  snapshot_score REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (event_date, obj_id)
);

-- Một người một thẻ mỗi ngày. Khoá chính chính là ràng buộc đó, nên không cần
-- lớp gộp trùng nào ở phía trên nữa.
CREATE TABLE IF NOT EXISTS daily_events (
  event_date     TEXT NOT NULL,
  pers_id        TEXT NOT NULL REFERENCES persons(pers_id) ON DELETE CASCADE,
  first_seen     REAL NOT NULL,
  last_seen      REAL NOT NULL,
  snapshot_path  TEXT,
  snapshot_score REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (event_date, pers_id)
);
CREATE INDEX IF NOT EXISTS ix_daily_events_date ON daily_events(event_date);

-- Lịch sử xuất hiện — nội dung popup. Chủ thể đa hình (obj-… hoặc pers-…) nên
-- dùng index thay khoá ngoại; dọn dẹp đằng nào cũng theo ngày.
CREATE TABLE IF NOT EXISTS appearances (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date      TEXT NOT NULL,
  subject_id      TEXT NOT NULL,
  camera_id       TEXT NOT NULL,
  zone_id         TEXT,
  started_at      REAL NOT NULL,
  ended_at        REAL NOT NULL,
  gps_lat         REAL,
  gps_lng         REAL,
  gps_lat_end     REAL,
  gps_lng_end     REAL,
  qualified       INTEGER NOT NULL DEFAULT 1,
  presence_seq    INTEGER NOT NULL DEFAULT 1,
  source_cameras  TEXT,
  snapshot_path   TEXT
);
CREATE INDEX IF NOT EXISTS ix_appearances_subject
  ON appearances(event_date, subject_id);

-- Bộ đếm cấp mã. Không bao giờ lùi, kể cả sau khi xoá dữ liệu: mã cũ còn nằm
-- trong ảnh chụp và báo cáo đã xuất.
CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- Phiên quét mặt tự phục vụ (công nhân quét trước, nhập hồ sơ sau).
CREATE TABLE IF NOT EXISTS enroll_sessions (
  session_id TEXT PRIMARY KEY,
  created_at REAL NOT NULL,
  expires_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS enroll_session_faces (
  session_id TEXT NOT NULL REFERENCES enroll_sessions(session_id) ON DELETE CASCADE,
  slot       INTEGER NOT NULL,
  embedding  BLOB NOT NULL,
  dim        INTEGER NOT NULL,
  quality    REAL NOT NULL DEFAULT 1.0,
  created_at REAL NOT NULL,
  PRIMARY KEY (session_id, slot)
);
CREATE INDEX IF NOT EXISTS ix_enroll_sessions_expires ON enroll_sessions(expires_at);
"""


_APPEARANCE_V2_COLUMNS: tuple[tuple[str, str], ...] = (
    ("gps_lat", "REAL"),
    ("gps_lng", "REAL"),
    ("gps_lat_end", "REAL"),
    ("gps_lng_end", "REAL"),
    ("qualified", "INTEGER NOT NULL DEFAULT 1"),
    ("presence_seq", "INTEGER NOT NULL DEFAULT 1"),
    ("source_cameras", "TEXT"),
)


def _migrate_schema(conn: sqlite3.Connection) -> None:
    """Nâng cấp DB cũ — thêm cột presence/GPS vào appearances."""
    version = int(conn.execute("PRAGMA user_version").fetchone()[0])
    if version >= _SCHEMA_VERSION:
        return
    if version < 2:
        cols = {
            str(r[1])
            for r in conn.execute("PRAGMA table_info(appearances)").fetchall()
        }
        for name, typedef in _APPEARANCE_V2_COLUMNS:
            if name not in cols:
                conn.execute(f"ALTER TABLE appearances ADD COLUMN {name} {typedef}")
        conn.execute("PRAGMA user_version=2")
        conn.commit()
    from .migrate import (
        migrate_to_v3,
        migrate_to_v4,
        migrate_to_v5,
        migrate_to_v6,
        migrate_to_v7,
        migrate_to_v8,
    )

    migrate_to_v3(conn)
    migrate_to_v4(conn)
    migrate_to_v5(conn)
    migrate_to_v6(conn)
    migrate_to_v7(conn)
    migrate_to_v8(conn)


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_FILE), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # WAL: luồng AI ghi trong khi request HTTP đọc mà không chặn nhau.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(_SCHEMA)
    _migrate_schema(conn)
    return conn


def get_conn() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            _conn = _connect()
        return _conn


class _Tx:
    """Transaction có khoá — SQLite chịu một người ghi tại một thời điểm."""

    def __enter__(self) -> sqlite3.Connection:
        _lock.acquire()
        self._conn = get_conn()
        return self._conn

    def __exit__(self, exc_type, exc, tb) -> None:
        try:
            if exc_type is None:
                self._conn.commit()
            else:
                self._conn.rollback()
        finally:
            _lock.release()


def tx() -> _Tx:
    return _Tx()


def query(sql: str, params: tuple | dict = ()) -> list[sqlite3.Row]:
    with _lock:
        return get_conn().execute(sql, params).fetchall()


def query_one(sql: str, params: tuple | dict = ()) -> sqlite3.Row | None:
    with _lock:
        return get_conn().execute(sql, params).fetchone()


def next_counter(conn: sqlite3.Connection, name: str) -> int:
    """Cấp số tiếp theo trong cùng transaction của caller."""
    conn.execute(
        "INSERT INTO counters(name, value) VALUES(?, 0) ON CONFLICT(name) DO NOTHING",
        (name,),
    )
    conn.execute("UPDATE counters SET value = value + 1 WHERE name = ?", (name,))
    row = conn.execute("SELECT value FROM counters WHERE name = ?", (name,)).fetchone()
    return int(row["value"])


def purge_old_days(keep_date: str | None = None) -> int:
    """Xoá dữ liệu Đối tượng của những ngày trước.

    Gọi lúc khởi động và mỗi lần sang ngày mới. Người và Định danh không đụng
    tới — chúng là thực thể bền.
    """
    today = keep_date or today_vn()
    with tx() as conn:
        cur = conn.execute("DELETE FROM daily_objects WHERE event_date < ?", (today,))
        removed = cur.rowcount or 0
        conn.execute(
            "DELETE FROM appearances WHERE event_date < ? AND subject_id LIKE 'obj-%'",
            (today,),
        )
    return removed


def purge_day(date: str | None = None) -> dict[str, Any]:
    """Xoá toàn bộ thẻ sự kiện một ngày — **giữ hồ sơ Định danh** (import Excel).

    Cũng dọn các mã `pers-*` tạm (origin=camera, chưa gán tên) không còn thẻ
    nào, để lần tuần tra sau khớp lại đúng hồ sơ thay vì kẹt pers-0003.
    """
    import shutil

    from . import identity, sink

    d = date or today_vn()
    removed: dict[str, int] = {
        "daily_events": 0,
        "daily_objects": 0,
        "appearances": 0,
        "orphan_persons": 0,
        "orphan_faces": 0,
    }

    with tx() as conn:
        removed["daily_events"] = int(
            conn.execute("DELETE FROM daily_events WHERE event_date = ?", (d,)).rowcount
            or 0
        )
        removed["daily_objects"] = int(
            conn.execute("DELETE FROM daily_objects WHERE event_date = ?", (d,)).rowcount
            or 0
        )
        removed["appearances"] = int(
            conn.execute("DELETE FROM appearances WHERE event_date = ?", (d,)).rowcount
            or 0
        )

        orphan_rows = conn.execute(
            "SELECT pers_id FROM persons"
            " WHERE status = ? AND origin = 'camera'"
            " AND pers_id NOT IN (SELECT DISTINCT pers_id FROM daily_events)",
            (identity.STATUS_DRAFT,),
        ).fetchall()
        orphan_ids = [str(r["pers_id"]) for r in orphan_rows]
        for pid in orphan_ids:
            removed["orphan_faces"] += int(
                conn.execute("DELETE FROM person_faces WHERE pers_id = ?", (pid,)).rowcount
                or 0
            )
            conn.execute("DELETE FROM person_aliases WHERE old_pers_id = ?", (pid,))
            conn.execute("DELETE FROM person_aliases WHERE pers_id = ?", (pid,))
            conn.execute("DELETE FROM persons WHERE pers_id = ?", (pid,))
            removed["orphan_persons"] += 1

    snap_dir = DATA_DIR / "patrol_snapshots" / d
    if snap_dir.is_dir():
        shutil.rmtree(snap_dir, ignore_errors=True)

    identity._invalidate_face_index()
    sink.reset()
    removed["date"] = d
    return removed


def reset_all(keep_counters: bool = True) -> dict[str, int]:
    """Xoá sạch dữ liệu tuần tra. Giữ bộ đếm để mã không bao giờ cấp lại."""
    with tx() as conn:
        counts = {
            "persons": conn.execute("SELECT COUNT(*) c FROM persons").fetchone()["c"],
            "daily_events": conn.execute(
                "SELECT COUNT(*) c FROM daily_events"
            ).fetchone()["c"],
            "daily_objects": conn.execute(
                "SELECT COUNT(*) c FROM daily_objects"
            ).fetchone()["c"],
        }
        conn.execute("DELETE FROM appearances")
        conn.execute("DELETE FROM daily_events")
        conn.execute("DELETE FROM daily_objects")
        conn.execute("DELETE FROM person_aliases")
        conn.execute("DELETE FROM person_faces")
        conn.execute("DELETE FROM enroll_session_faces")
        conn.execute("DELETE FROM enroll_sessions")
        conn.execute("DELETE FROM persons")
        if not keep_counters:
            conn.execute("DELETE FROM counters")

    from . import identity, sink

    identity._invalidate_face_index()
    sink.reset()
    return counts


def close() -> None:
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
            _conn = None


def rows_to_dicts(rows: Iterator[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]
