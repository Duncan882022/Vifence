"""Tests appearance repair from disk snapshots."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

from app.patrol import db, daystore, identity
from app.patrol.appearance_repair import parse_snapshot_filename, repair_day_appearance_history
from app.patrol import sink


def _vec(seed: int, dim: int = 128) -> list[float]:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim).astype(np.float32)
    return (v / np.linalg.norm(v)).tolist()


class ParseSnapshotFilenameTest(unittest.TestCase):
    def test_pers_id(self) -> None:
        out = parse_snapshot_filename("pers-0042-1735000000123.jpg")
        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out[0], "pers-0042")
        self.assertAlmostEqual(out[1], 1735000000.123, places=3)

    def test_gallery_id(self) -> None:
        out = parse_snapshot_filename("p-DUNCAN-1735000000456.jpg")
        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out[0], "p-DUNCAN")


class AppearanceRepairTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()

    def tearDown(self) -> None:
        db.close()
        self._tmp.cleanup()

    def test_repair_splits_merged_row_from_disk(self) -> None:
        pers_id, _ = identity.observe_face(_vec(401), quality=0.8)
        date = db.today_vn(1_735_000_000.0)
        t1 = 1_735_000_000.0
        t2 = 1_735_000_240.0

        with db.tx() as conn:
            conn.execute(
                "INSERT INTO appearances"
                "(event_date, subject_id, camera_id, zone_id, started_at, ended_at,"
                " gps_lat, gps_lng, qualified, presence_seq, snapshot_path)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (
                    date, pers_id, "HC-02", "ZONE_SITE", t1, t2,
                    20.933, 106.923, 1, 1, f"{date}/{pers_id}-merged.jpg",
                ),
            )

        folder = sink.SNAPSHOT_DIR / date
        folder.mkdir(parents=True, exist_ok=True)
        for ts, name in (
            (t1, f"{pers_id}-{int(t1 * 1000)}.jpg"),
            (t2, f"{pers_id}-{int(t2 * 1000)}.jpg"),
        ):
            (folder / name).write_bytes(b"fake")

        out = repair_day_appearance_history(date)
        self.assertEqual(out["inserted"], 2)
        self.assertGreaterEqual(out["removed"], 1)

        hist = daystore.list_appearances(pers_id, date)
        snaps = [s for s in hist["segments"] if s.get("snapshot_path")]
        self.assertEqual(len(snaps), 2)
        self.assertEqual(snaps[0]["started_at"], t1)
        self.assertEqual(snaps[1]["started_at"], t2)


if __name__ == "__main__":
    unittest.main()
