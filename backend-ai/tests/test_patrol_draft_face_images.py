"""Crop mặt JPG cho hồ sơ bản nháp tk-* từ camera tuần tra."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import db, identity, sink  # noqa: E402
from app.patrol.draft_face_images import (  # noqa: E402
    DRAFT_FACE_ROOT,
    resolve_draft_face_path,
    save_draft_face_crop,
)


def _vec(seed: float) -> list[float]:
    rng = np.random.default_rng(int(seed * 1000))
    v = rng.standard_normal(128).astype(np.float32)
    v /= float(np.linalg.norm(v))
    return v.tolist()


class DraftFaceImagesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmpdir.name)
        db.DB_FILE = db.DATA_DIR / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        import app.patrol.draft_face_images as draft_mod

        draft_mod.DRAFT_FACE_ROOT = db.DATA_DIR / "draft_face_images"
        db.get_conn()

    def tearDown(self) -> None:
        db.close()
        self._tmpdir.cleanup()

    def test_save_and_resolve_draft_face_crop(self) -> None:
        img = np.zeros((80, 60, 3), dtype=np.uint8)
        img[:, :] = (40, 120, 200)
        rel = save_draft_face_crop("tk-0000001", img, ts=1_700_000.0)
        self.assertIsNotNone(rel)
        assert rel is not None
        self.assertTrue(rel.startswith("draft-face/tk-0000001/"))
        full = resolve_draft_face_path(rel)
        self.assertIsNotNone(full)
        assert full is not None
        self.assertTrue(full.is_file())
        loaded = cv2.imread(str(full))
        self.assertIsNotNone(loaded)

    def test_resolve_snapshot_path_includes_draft_faces(self) -> None:
        img = np.zeros((64, 64, 3), dtype=np.uint8)
        rel = save_draft_face_crop("tk-0000002", img, ts=1_700_001.0)
        assert rel is not None
        full = sink.resolve_snapshot_path(rel)
        self.assertIsNotNone(full)

    def test_add_face_angle_stores_image_path_for_patrol_camera(self) -> None:
        pers_id, _ = identity.observe_face(_vec(9.0), quality=0.85, camera_id="HC-02")
        fake_crop = np.zeros((96, 72, 3), dtype=np.uint8)
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        bbox = [40.0, 20.0, 200.0, 220.0]

        with patch(
            "app.worker_identity.recognizer.extract_patrol_face_crop_bgr",
            return_value=fake_crop,
        ):
            added = identity.add_face_angle(
                pers_id,
                _vec(9.1),
                quality=0.9,
                camera_id="HC-02",
                now=1_700_002.0,
                frame=frame,
                person_bbox=bbox,
            )

        self.assertTrue(added)
        rows = db.query(
            "SELECT image_path, camera_id FROM person_faces WHERE pers_id = ?"
            " AND camera_id = 'HC-02' AND image_path IS NOT NULL",
            (pers_id,),
        )
        self.assertGreaterEqual(len(rows), 1)
        path = str(rows[-1]["image_path"])
        self.assertTrue(path.startswith("draft-face/"))
        self.assertIsNotNone(sink.resolve_snapshot_path(path))

    def test_get_scan_enrollment_includes_draft_faces(self) -> None:
        pers_id, _ = identity.observe_face(_vec(10.0), quality=0.85, camera_id="DR-01")
        fake_crop = np.zeros((88, 66, 3), dtype=np.uint8)
        frame = np.zeros((200, 300, 3), dtype=np.uint8)
        bbox = [30.0, 10.0, 180.0, 190.0]

        with patch(
            "app.worker_identity.recognizer.extract_patrol_face_crop_bgr",
            return_value=fake_crop,
        ):
            identity.add_face_angle(
                pers_id,
                _vec(10.1),
                quality=0.88,
                camera_id="DR-01",
                now=1_700_003.0,
                frame=frame,
                person_bbox=bbox,
            )

        enrollment = identity.get_scan_enrollment(pers_id)
        self.assertIn("draft_faces", enrollment)
        self.assertGreaterEqual(len(enrollment["draft_faces"]), 1)
        self.assertEqual(enrollment["draft_faces"][0]["camera_id"], "DR-01")


if __name__ == "__main__":
    unittest.main()
