"""Hồ sơ bản nháp — sgc-* → tk-* draft, xác minh → identified."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import db, identity  # noqa: E402
from app.worker_identity.gallery import ENROLLMENT_POSE_REQUIRED  # noqa: E402


def _vec(seed: float) -> list[float]:
    import numpy as np

    rng = np.random.default_rng(int(seed * 1000))
    v = rng.standard_normal(128).astype(np.float32)
    v /= float(np.linalg.norm(v))
    return v.tolist()


def _session_with_required_poses() -> str:
    session_id = identity.create_enroll_session()
    for slot, seed in enumerate((1.1, 1.2, 1.3), start=1):
        identity.add_enroll_session_face(session_id, _vec(seed), pose_slot=slot)
    return session_id


def _verify_vector_count(pers_id: str) -> int:
    row = db.query_one(
        "SELECT COUNT(*) AS c FROM person_faces"
        " WHERE pers_id = ? AND camera_id = 'VERIFY'",
        (pers_id,),
    )
    return int(row["c"]) if row else 0


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

    def test_verify_draft_requires_face_or_session(self) -> None:
        sgc = "sgc-00000099"
        pers_id = identity.ensure_draft_for_sgc(sgc)
        with self.assertRaises(ValueError):
            identity.verify_draft_profile(
                pers_id,
                full_name="An",
                employee_code="NV001",
                contractor="SGC",
            )

    def test_verify_draft_manual_front_image(self) -> None:
        sgc = "sgc-00000101"
        pers_id = identity.ensure_draft_for_sgc(sgc)
        verified = identity.verify_draft_profile(
            pers_id,
            full_name="Bình",
            employee_code="NV-6688",
            contractor="SGC",
            face_embedding=_vec(2.1),
        )
        self.assertEqual(verified["status"], identity.STATUS_IDENTIFIED)
        self.assertEqual(verified["full_name"], "Bình")
        self.assertEqual(verified["employee_code"], "NV-6688")
        self.assertGreaterEqual(_verify_vector_count(verified["pers_id"]), 1)
        self.assertGreaterEqual(identity._hr_enroll_vector_count(verified["pers_id"]), 1)
        self.assertLess(
            identity._hr_enroll_vector_count(verified["pers_id"]),
            ENROLLMENT_POSE_REQUIRED,
        )

    def test_verify_draft_promotes_via_enroll_session(self) -> None:
        sgc = "sgc-00000100"
        pers_id = identity.ensure_draft_for_sgc(sgc)
        session_id = _session_with_required_poses()
        verified = identity.verify_draft_profile(
            pers_id,
            full_name="An",
            employee_code="NV001",
            contractor="SGC",
            enroll_session_id=session_id,
        )
        self.assertEqual(verified["status"], identity.STATUS_IDENTIFIED)
        self.assertEqual(verified["full_name"], "An")
        self.assertEqual(verified["employee_code"], "NV001")
        self.assertGreaterEqual(
            identity._hr_enroll_vector_count(verified["pers_id"]),
            ENROLLMENT_POSE_REQUIRED,
        )
        self.assertIsNone(db.query_one(
            "SELECT session_id FROM enroll_sessions WHERE session_id = ?",
            (session_id,),
        ))


if __name__ == "__main__":
    unittest.main()
