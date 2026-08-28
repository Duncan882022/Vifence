"""Sync SQLite identified profile → worker gallery + bindings."""

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

        from app.patrol import sink

        self._old_snap = sink.SNAPSHOT_DIR
        sink.SNAPSHOT_DIR = self._snap_dir

        self._patches = [
            patch("app.worker_identity.gallery._BASE", self._gallery_root),
            patch("app.patrol_identity_store.BINDINGS_FILE", self._bindings),
            patch("app.patrol_identity_store.DATA_DIR", self._root),
            patch("app.patrol.gallery_sync.SNAPSHOT_DIR", self._snap_dir),
            patch("app.patrol.sink.SNAPSHOT_DIR", self._snap_dir),
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

    def test_sync_identified_person_enrolls_gallery_from_snapshot(self) -> None:
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
        self.assertTrue(out["face_enrolled"])

        from app.patrol_identity_store import list_patrol_identity_bindings, lookup_patrol_identity

        bindings = list_patrol_identity_bindings()
        self.assertEqual(len(bindings), 1)
        self.assertEqual(bindings[0]["worker_name"], "Duncan")
        row_bind = lookup_patrol_identity("p-SGC-6688")
        self.assertIsNotNone(row_bind)
        self.assertIn(pers_id, row_bind["aliases"])

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


if __name__ == "__main__":
    unittest.main()
