"""GPS merge + ghost card guard — patrol daystore / identity."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.patrol import db, daystore, identity


class PatrolNearbyMergeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmpdir.name)
        db.DB_FILE = Path(self._tmpdir.name) / "patrol.db"
        db.get_conn()

    def tearDown(self) -> None:
        db.close()
        self._tmpdir.cleanup()

    def test_find_nearby_person_same_gps_bucket(self) -> None:
        date = "2026-09-05"
        ts = 1_700_000_000.0
        lat, lng = 20.928444, 106.873611

        with db.tx() as conn:
            conn.execute(
                "INSERT INTO persons(pers_id, status, employee_code, origin,"
                " first_seen, last_seen, created_at)"
                " VALUES(?,?,?,?,?,?,?)",
                ("tk-0000025", identity.STATUS_DRAFT, "tk-0000025", "tk", ts, ts, ts),
            )
            conn.execute(
                "INSERT INTO daily_events"
                "(event_date, pers_id, first_seen, last_seen, snapshot_path, snapshot_score)"
                " VALUES(?,?,?,?,?,?)",
                (date, "tk-0000025", ts - 10, ts, f"{date}/tk-0000025-1.jpg", 2.1),
            )
            conn.execute(
                "INSERT INTO appearances"
                "(event_date, subject_id, camera_id, started_at, ended_at,"
                " gps_lat, gps_lng, qualified, presence_seq, source_cameras)"
                " VALUES(?,?,?,?,?,?,?,?,?,?)",
                (date, "tk-0000025", "HC-01", ts - 10, ts, lat, lng, 1, 1, "HC-01"),
            )

        found = daystore.find_nearby_person_pers_id(
            date, lat, lng, ts + 30, exclude_pers="tk-0000024",
        )
        self.assertEqual(found, "tk-0000025")

    def test_find_same_site_person_after_long_gap(self) -> None:
        """Vào lại cùng GPS sau khi rời — không bị giới hạn 120s."""
        date = "2026-09-05"
        ts_first = 1_700_000_000.0
        ts_return = ts_first + 600.0
        lat, lng = 20.928444, 106.873611

        with db.tx() as conn:
            conn.execute(
                "INSERT INTO persons(pers_id, status, employee_code, origin,"
                " first_seen, last_seen, created_at)"
                " VALUES(?,?,?,?,?,?,?)",
                ("tk-0000001", identity.STATUS_DRAFT, "tk-0000001", "tk", ts_first, ts_first, ts_first),
            )
            conn.execute(
                "INSERT INTO daily_events"
                "(event_date, pers_id, first_seen, last_seen, snapshot_path, snapshot_score)"
                " VALUES(?,?,?,?,?,?)",
                (date, "tk-0000001", ts_first, ts_first, f"{date}/tk-0000001-1.jpg", 2.0),
            )
            conn.execute(
                "INSERT INTO appearances"
                "(event_date, subject_id, camera_id, started_at, ended_at,"
                " gps_lat, gps_lng, qualified, presence_seq, source_cameras)"
                " VALUES(?,?,?,?,?,?,?,?,?,?)",
                (date, "tk-0000001", "HC-01", ts_first, ts_first, lat, lng, 1, 1, "HC-01"),
            )

        found = daystore.find_nearby_person_pers_id(
            date, lat, lng, ts_return, exclude_pers="tk-0000002", within_sec=120.0,
        )
        self.assertIsNone(found)
        same_site = daystore.find_same_site_person_today(
            date, lat, lng, exclude_pers="tk-0000002",
        )
        self.assertEqual(same_site, "tk-0000001")

    def test_touch_person_skips_ghost_card_without_snapshot(self) -> None:
        date = "2026-09-05"
        ts = 1_700_000_100.0
        with db.tx() as conn:
            conn.execute(
                "INSERT INTO persons(pers_id, status, employee_code, origin,"
                " first_seen, last_seen, created_at)"
                " VALUES(?,?,?,?,?,?,?)",
                ("tk-0000099", identity.STATUS_DRAFT, "tk-0000099", "tk", ts, ts, ts),
            )

        daystore.touch_person_event(
            "tk-0000099",
            camera_id="HC-01",
            snapshot_path=None,
            snapshot_score=0.0,
            face_eligible=False,
            now=ts,
            skip_appearance=True,
        )
        row = db.query_one(
            "SELECT pers_id FROM daily_events WHERE event_date = ? AND pers_id = ?",
            (date, "tk-0000099"),
        )
        self.assertIsNone(row)


if __name__ == "__main__":
    unittest.main()
