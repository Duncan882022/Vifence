"""tier_snapshot — profile_status cho quy tắc cam ROI live."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import db, identity  # noqa: E402
from app.patrol.tier_snapshot import build_tier_snapshot  # noqa: E402


class TierSnapshotProfileStatusTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._root = Path(self._tmpdir.name)
        self._old_db = db.DB_FILE
        self._old_data = db.DATA_DIR
        db.DB_FILE = self._root / "patrol_test.db"
        db.DATA_DIR = self._root
        db.close()
        db.get_conn()

    def tearDown(self) -> None:
        db.close()
        db.DB_FILE = self._old_db
        db.DATA_DIR = self._old_data
        self._tmpdir.cleanup()

    def test_draft_profile_status_on_tier_snapshot(self) -> None:
        identity.ensure_draft_for_tk("tk-0000042")
        snap = build_tier_snapshot(
            tier="person",
            tier_since=1_700_000_000.0,
            subject_id="tk-0000042",
            worker_id="tk-0000042",
            face_eligible=False,
            confidence=0.8,
            face_quality=0.0,
        )
        self.assertEqual(snap.profile_status, identity.STATUS_DRAFT)

    def test_no_profile_status_without_worker(self) -> None:
        snap = build_tier_snapshot(
            tier="object",
            tier_since=1_700_000_000.0,
            subject_id="",
            worker_id=None,
        )
        self.assertIsNone(snap.profile_status)


if __name__ == "__main__":
    unittest.main()
