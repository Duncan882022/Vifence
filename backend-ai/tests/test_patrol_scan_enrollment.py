"""Quét mặt UI — x/4 phải đếm gallery selfie, không gom vector patrol."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import db, identity, sink  # noqa: E402


def _vec(seed: float) -> list[float]:
    import numpy as np

    rng = np.random.default_rng(int(seed * 1000))
    v = rng.standard_normal(128).astype(np.float32)
    v /= float(np.linalg.norm(v))
    return v.tolist()


class ScanEnrollmentProgressTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmpdir.name)
        db.DB_FILE = db.DATA_DIR / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()

    def tearDown(self) -> None:
        db.close()
        self._tmpdir.cleanup()

    def test_identified_uses_hr_vectors_not_patrol_bodycam(self) -> None:
        pers_id = identity.import_identity(
            full_name="Duncan",
            employee_code="NV001",
            contractor="SGC",
            source="hr_create",
            now=1_000.0,
        )["pers_id"]
        for i in range(3):
            identity.add_face_angle(
                pers_id,
                _vec(0.1 + i),
                quality=1.0,
                camera_id="SCAN",
                now=1_000.0 + i,
            )
        for i in range(4):
            identity.add_face(
                pers_id,
                _vec(0.5 + i),
                quality=0.9,
                camera_id="HC-02",
            )
        self.assertEqual(identity.face_count(pers_id), 7)

        enrollment = identity.get_scan_enrollment(pers_id)
        self.assertEqual(enrollment["faces_captured"], 3)
        self.assertTrue(enrollment["complete"])
        self.assertEqual(enrollment["face_records"], 7)

    def test_person_tier_counts_hr_scan_vectors_only(self) -> None:
        pers_id, _ = identity.observe_face(_vec(2.0), quality=0.85, camera_id="HC-02")
        identity.add_face_angle(pers_id, _vec(2.1), quality=0.9, camera_id="HC-02")
        identity.add_face_angle(pers_id, _vec(2.2), quality=0.9, camera_id="SCAN")
        identity.add_face_angle(pers_id, _vec(2.3), quality=0.9, camera_id="SCAN")

        enrollment = identity.get_scan_enrollment(pers_id)
        self.assertEqual(enrollment["faces_captured"], 2)
        self.assertFalse(enrollment["complete"])


if __name__ == "__main__":
    unittest.main()
