"""Sync SQLite identified profile → worker gallery bindings (no snapshot JPG)."""

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

from app.patrol import db, identity  # noqa: E402
from app.patrol.enroll_images import (  # noqa: E402
    promote_enroll_session_to_gallery,
    save_enroll_session_face_image,
)
from app.patrol.gallery_sync import sync_person_to_gallery  # noqa: E402


class GallerySyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._root = Path(self._tmpdir.name)
        self._old_db = db.DB_FILE
        db.DB_FILE = self._root / "patrol_test.db"
        db.close()
        db.get_conn()

        self._gallery_root = self._root / "worker_gallery"
        self._bindings = self._root / "patrol_identity_bindings.json"
        self._snap_dir = self._root / "patrol_snapshots"
        self._session_images = self._root / "enroll_session_images"

        from app.patrol import sink

        self._old_snap = sink.SNAPSHOT_DIR
        sink.SNAPSHOT_DIR = self._snap_dir

        self._patches = [
            patch("app.worker_identity.gallery._BASE", self._gallery_root),
            patch("app.patrol_identity_store.BINDINGS_FILE", self._bindings),
            patch("app.patrol_identity_store.DATA_DIR", self._root),
            patch("app.patrol.enroll_images.SESSION_IMAGES_ROOT", self._session_images),
        ]
        for p in self._patches:
            p.start()
        from app import patrol_identity_store

        patrol_identity_store._state = None

    def tearDown(self) -> None:
        from app.patrol import sink

        sink.SNAPSHOT_DIR = self._old_snap
        for p in reversed(self._patches):
            p.stop()
        db.close()
        db.DB_FILE = self._old_db
        self._tmpdir.cleanup()

    def test_sync_identified_person_binds_without_snapshot_jpg(self) -> None:
        row = identity.import_identity(
            full_name="Duncan",
            employee_code="SGC-6688",
            contractor="SGC",
            source="self_enroll",
        )
        pers_id = str(row["pers_id"])

        snap_dir = self._snap_dir / "2026-08-28"
        snap_dir.mkdir(parents=True)
        img = np.zeros((120, 160, 3), dtype=np.uint8)
        cv2.imwrite(str(snap_dir / f"{pers_id}.jpg"), img)

        out = sync_person_to_gallery(pers_id)
        self.assertTrue(out["ok"])
        self.assertEqual(out["gallery_worker_id"], "p-SGC-6688")
        self.assertFalse(out["face_enrolled"])

        from app.worker_identity.gallery import get_enrollment_status

        enrollment = get_enrollment_status("p-SGC-6688")
        self.assertEqual(enrollment["poses_captured"], 0)

    def test_promote_enroll_session_writes_four_selfie_jpgs(self) -> None:
        session_id = identity.create_enroll_session()
        img = np.zeros((240, 240, 3), dtype=np.uint8)
        cv2.rectangle(img, (80, 60), (160, 180), (200, 180, 160), -1)
        for slot in (1, 2, 3, 4):
            emb = np.random.randn(512).astype(np.float32)
            emb /= np.linalg.norm(emb)
            identity.add_enroll_session_face(session_id, emb.tolist(), pose_slot=slot)
            save_enroll_session_face_image(session_id, slot, img)

        out = promote_enroll_session_to_gallery(
            session_id,
            gallery_worker_id="p-SGC-6688",
            worker_name="Duncan",
            employee_code="SGC-6688",
            contractor_name="SGC",
        )
        self.assertEqual(out["poses_enrolled"], 4)

        from app.worker_identity.gallery import get_enrollment_status

        enrollment = get_enrollment_status("p-SGC-6688")
        self.assertTrue(enrollment["complete"])
        self.assertEqual(enrollment["poses_captured"], 4)

    def test_sync_all_identified_on_startup(self) -> None:
        row1 = identity.import_identity(
            full_name="Alice",
            employee_code="SGC-1001",
            contractor="SGC",
            source="self_enroll",
        )
        row2 = identity.import_identity(
            full_name="Bob",
            employee_code="SGC-1002",
            contractor="SGC",
            source="self_enroll",
        )
        snap_dir = self._snap_dir / "2026-08-28"
        snap_dir.mkdir(parents=True)
        img = np.zeros((120, 160, 3), dtype=np.uint8)
        cv2.imwrite(str(snap_dir / f"{row1['pers_id']}.jpg"), img)

        from app.patrol.gallery_sync import sync_all_identified_to_gallery

        out = sync_all_identified_to_gallery()
        self.assertTrue(out["ok"])
        self.assertEqual(out["total"], 2)
        self.assertEqual(out["synced"], 2)

    def test_gallery_stats_ignore_person_faces_vector_count(self) -> None:
        row = identity.import_identity(
            full_name="Duncan",
            employee_code="SGC-6688",
            contractor="SGC",
            source="self_enroll",
        )
        pers_id = str(row["pers_id"])
        for seed in (0.1, 0.2, 0.3):
            vec = np.random.default_rng(int(seed * 1000)).standard_normal(512).astype(np.float32)
            vec /= np.linalg.norm(vec)
            identity.add_face_angle(pers_id, vec.tolist(), quality=1.0, camera_id="HC-02")

        self.assertEqual(identity.face_count(pers_id), 3)
        stats = identity.gallery_enrollment_stats("SGC-6688")
        self.assertEqual(stats["face_count"], 0)
        self.assertFalse(stats["complete"])

        enrollment = identity.get_scan_enrollment(pers_id)
        self.assertEqual(enrollment["faces_captured"], 0)
        self.assertFalse(enrollment["complete"])
        self.assertFalse(any(p["captured"] for p in enrollment["poses"]))


if __name__ == "__main__":
    unittest.main()
