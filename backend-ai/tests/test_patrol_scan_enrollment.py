"""Quét mặt UI — x/4 phải đếm gallery selfie, không gom vector patrol."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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

    def test_identified_uses_gallery_poses_not_patrol_vectors(self) -> None:
        pers_id = identity.import_identity(
            full_name="Duncan",
            employee_code="SGC001",
            contractor="SGC",
            source="hr_create",
            now=1_000.0,
        )["pers_id"]
        identity.identify(
            pers_id,
            full_name="Duncan",
            employee_code="SGC001",
            contractor="SGC",
            identified_by="test",
            now=1_000.0,
        )
        for i in range(7):
            identity.add_face(
                pers_id,
                _vec(0.1 + i),
                quality=0.9,
                camera_id="HC-02",
            )
        self.assertEqual(identity.face_count(pers_id), 7)

        with patch(
            "app.worker_identity.gallery.get_enrollment_status",
            return_value={
                "poses_captured": 4,
                "complete": True,
                "poses": [
                    {"slot": 1, "label": "Chính diện", "captured": True},
                    {"slot": 2, "label": "Quay trái", "captured": True},
                    {"slot": 3, "label": "Quay phải", "captured": True},
                    {"slot": 4, "label": "Cúi xuống", "captured": True},
                ],
            },
        ):
            enrollment = identity.get_scan_enrollment(pers_id)

        self.assertEqual(enrollment["faces_captured"], 4)
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
