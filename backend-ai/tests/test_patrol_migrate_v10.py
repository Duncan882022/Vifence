"""Nâng CSDL đang chạy lên v10 — sổ cái lượt gặp, không mất dữ liệu cũ."""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.patrol import db

# Lược đồ v9 rút gọn — đúng những bảng mà v10 đụng tới.
_V9_SCHEMA = """
CREATE TABLE daily_objects (
  event_date     TEXT NOT NULL,
  obj_id         TEXT NOT NULL,
  first_seen     REAL NOT NULL,
  last_seen      REAL NOT NULL,
  snapshot_path  TEXT,
  snapshot_score REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (event_date, obj_id)
);
CREATE TABLE appearances (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date      TEXT NOT NULL,
  subject_id      TEXT NOT NULL,
  camera_id       TEXT NOT NULL,
  zone_id         TEXT,
  started_at      REAL NOT NULL,
  ended_at        REAL NOT NULL,
  qualified       INTEGER NOT NULL DEFAULT 1,
  presence_seq    INTEGER NOT NULL DEFAULT 1,
  counted         INTEGER NOT NULL DEFAULT 0
);
PRAGMA user_version=9;
"""


class MigrateV10Test(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._path = Path(self._tmp.name) / "patrol.db"
        conn = sqlite3.connect(str(self._path))
        conn.executescript(_V9_SCHEMA)
        conn.execute(
            "INSERT INTO daily_objects"
            "(event_date, obj_id, first_seen, last_seen, snapshot_path, snapshot_score)"
            " VALUES('2026-09-03','obj-20260903-0001', 1.0, 2.0, 'a.jpg', 0.4)"
        )
        conn.execute(
            "INSERT INTO appearances"
            "(event_date, subject_id, camera_id, started_at, ended_at)"
            " VALUES('2026-09-03','obj-20260903-0001','HC-01', 1.0, 2.0)"
        )
        conn.commit()
        conn.close()

        db.close()
        self._prev_dir, self._prev_file = db.DATA_DIR, db.DB_FILE
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = self._path

    def tearDown(self) -> None:
        db.close()
        db.DATA_DIR, db.DB_FILE = self._prev_dir, self._prev_file
        self._tmp.cleanup()

    def test_upgrade_keeps_rows_and_adds_the_ledger(self) -> None:
        conn = db.get_conn()
        self.assertEqual(int(conn.execute("PRAGMA user_version").fetchone()[0]), 10)

        obj = conn.execute("SELECT * FROM daily_objects").fetchone()
        self.assertEqual(obj["obj_id"], "obj-20260903-0001")
        self.assertIsNone(obj["promoted_to"])

        app_row = conn.execute("SELECT * FROM appearances").fetchone()
        self.assertIsNone(app_row["end_reason"])

        self.assertEqual(conn.execute("SELECT COUNT(*) FROM sightings").fetchone()[0], 0)

    def test_upgrade_is_idempotent(self) -> None:
        db.get_conn()
        db.close()
        conn = db.get_conn()
        self.assertEqual(int(conn.execute("PRAGMA user_version").fetchone()[0]), 10)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM daily_objects").fetchone()[0], 1)

    def test_ledger_rejects_a_second_row_for_the_same_session(self) -> None:
        from app.patrol import daystore

        for _ in range(2):
            daystore.record_sighting(
                event_date="2026-09-03",
                subject_id="obj-20260903-0001",
                camera_id="HC-01",
                zone_id=None,
                track_id="ptk0001:person",
                session_id="sess-HC-01-a",
                started_at=1.0,
                ended_at=9.0,
                end_reason="exit_edge",
                qualified=True,
                now=9.0,
            )

        rows = daystore.list_sightings("2026-09-03")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["ended_at"], 9.0)


if __name__ == "__main__":
    unittest.main()
