"""Bindings — alias không được trùng giữa nhiều gallery worker."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import patrol_identity_store  # noqa: E402


class PatrolIdentityBindingsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._root = Path(self._tmpdir.name)
        self._bindings = self._root / "patrol_identity_bindings.json"
        self._patches = [
            patch("app.patrol_identity_store.BINDINGS_FILE", self._bindings),
            patch("app.patrol_identity_store.DATA_DIR", self._root),
        ]
        for p in self._patches:
            p.start()
        patrol_identity_store._state = None

    def tearDown(self) -> None:
        for p in reversed(self._patches):
            p.stop()
        patrol_identity_store._state = None
        self._tmpdir.cleanup()

    def test_bind_steals_shared_alias_from_other_worker(self) -> None:
        patrol_identity_store.bind_patrol_identity(
            gallery_worker_id="p-NV01",
            worker_name="An",
            employee_code="NV01",
            contractor_name="",
            alias_keys=["pers-0001", "iden-0001"],
        )
        patrol_identity_store.bind_patrol_identity(
            gallery_worker_id="p-SGC-6688",
            worker_name="Duncan",
            employee_code="SGC-6688",
            contractor_name="SGC",
            alias_keys=["pers-0001", "iden-0001"],
        )

        rows = {r["gallery_worker_id"]: r for r in patrol_identity_store.list_patrol_identity_bindings()}
        self.assertNotIn("pers-0001", rows["p-NV01"]["aliases"])
        self.assertIn("pers-0001", rows["p-SGC-6688"]["aliases"])
        self.assertEqual(
            patrol_identity_store.lookup_gallery_worker("pers-0001"),
            "p-SGC-6688",
        )


if __name__ == "__main__":
    unittest.main()
