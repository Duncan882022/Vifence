"""Hồ sơ bản nháp — sgc-* → tk-* draft, xác minh → identified."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import db, identity  # noqa: E402


class PatrolDraftProfileTests(unittest.TestCase):
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

    def test_sgc_maps_to_single_draft_profile(self) -> None:
        sgc = "sgc-00000042"
        p1 = identity.ensure_draft_for_sgc(sgc)
        p2 = identity.ensure_draft_for_sgc(sgc)
        self.assertEqual(p1, p2)
        self.assertEqual(p1, "tk-0000042")
        row = identity.get_person(p1)
        assert row is not None
        self.assertEqual(row["status"], identity.STATUS_DRAFT)
        self.assertEqual(row["employee_code"], "tk-0000042")

    def test_verify_draft_promotes_to_identified(self) -> None:
        sgc = "sgc-00000099"
        pers_id = identity.ensure_draft_for_sgc(sgc)
        verified = identity.verify_draft_profile(
            pers_id,
            full_name="An",
            employee_code="NV001",
            contractor="SGC",
        )
        self.assertEqual(verified["status"], identity.STATUS_IDENTIFIED)
        self.assertEqual(verified["full_name"], "An")
        self.assertEqual(verified["employee_code"], "NV001")
        self.assertNotIn("iden_code", verified)


if __name__ == "__main__":
    unittest.main()
