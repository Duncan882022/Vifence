"""Unit tests — phiên quét mặt tự phục vụ (scan-first)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import db, identity  # noqa: E402


def _fake_embedding(seed: float) -> list[float]:
    import numpy as np

    # Vector 128-dim giả — đủ khác nhau để không bị dedupe.
    rng = np.random.default_rng(int(seed * 1000))
    vec = rng.standard_normal(128).astype(np.float32)
    vec /= np.linalg.norm(vec)
    return vec.tolist()


class TestPatrolSelfEnroll(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._old_db = db.DB_FILE
        db.DB_FILE = Path(self._tmpdir.name) / "patrol_test.db"
        db.close()
        db.get_conn()

    def tearDown(self) -> None:
        db.close()
        db.DB_FILE = self._old_db
        self._tmpdir.cleanup()

    def test_scan_first_then_complete_profile(self) -> None:
        session_id = identity.create_enroll_session()
        self.assertTrue(session_id)

        for slot, seed in enumerate((0.2, 0.6, 0.9, 0.95), start=1):
            added = identity.add_enroll_session_face(
                session_id, _fake_embedding(seed), pose_slot=slot,
            )
            self.assertTrue(added)

        enrollment = identity.get_enroll_session_enrollment(session_id)
        assert enrollment is not None
        self.assertTrue(enrollment["complete"])

        row = identity.complete_enroll_session(
            session_id,
            full_name="Nguyễn Văn A",
            employee_code="NV-SELF-001",
            contractor="Vincons",
        )
        self.assertEqual(row["full_name"], "Nguyễn Văn A")
        self.assertEqual(row["employee_code"], "NV-SELF-001")
        self.assertEqual(row["contractor"], "Vincons")
        self.assertEqual(row["origin"], "self_enroll")
        self.assertGreaterEqual(identity.face_count(row["pers_id"]), 4)

        self.assertIsNone(identity.get_enroll_session_enrollment(session_id))

    def test_complete_requires_four_angles(self) -> None:
        session_id = identity.create_enroll_session()
        identity.add_enroll_session_face(session_id, _fake_embedding(0.3), pose_slot=1)
        with self.assertRaises(ValueError):
            identity.complete_enroll_session(
                session_id,
                full_name="Test",
                employee_code="NV-X",
            )


if __name__ == "__main__":
    unittest.main()
