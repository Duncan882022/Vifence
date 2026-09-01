"""Bindings — alias tk-* / obj-* không được trùng giữa nhiều gallery worker."""

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
            alias_keys=["tk-0000001"],
        )
        patrol_identity_store.bind_patrol_identity(
            gallery_worker_id="p-SGC-6688",
            worker_name="Duncan",
            employee_code="SGC-6688",
            contractor_name="SGC",
            alias_keys=["tk-0000001"],
        )

        rows = {r["gallery_worker_id"]: r for r in patrol_identity_store.list_patrol_identity_bindings()}
        self.assertNotIn("tk-0000001", rows["p-NV01"]["aliases"])
        self.assertIn("tk-0000001", rows["p-SGC-6688"]["aliases"])

    @patch("app.patrol_identity_store._gallery_binding_has_hr")
    @patch("app.patrol.identity.hr_profile_for_employee_code")
    def test_lookup_requires_hr_profile(
        self,
        mock_hr: object,
        mock_has_hr: object,
    ) -> None:
        mock_has_hr.return_value = False
        patrol_identity_store.bind_patrol_identity(
            gallery_worker_id="p-SGC-6688",
            worker_name="Duncan",
            employee_code="SGC-6688",
            contractor_name="SGC",
            alias_keys=["tk-0000042"],
        )
        self.assertIsNone(patrol_identity_store.lookup_gallery_worker("tk-0000042"))
        mock_has_hr.return_value = True
        mock_hr.return_value = {
            "full_name": "Duncan",
            "status": "identified",
            "employee_code": "SGC-6688",
        }
        self.assertEqual(
            patrol_identity_store.lookup_gallery_worker("tk-0000042"),
            "p-SGC-6688",
        )

    def test_normalize_alias_converts_legacy_sgc_to_tk(self) -> None:
        self.assertEqual(
            patrol_identity_store.normalize_alias_key("sgc-00000042"),
            "tk-0000042",
        )

    @patch("app.patrol.identity.hr_profile_for_employee_code")
    def test_tk_alias_resolves_only_with_hr_profile(self, mock_hr: object) -> None:
        patrol_identity_store.bind_patrol_identity(
            gallery_worker_id="p-NV001",
            worker_name="Nguyễn Văn A",
            employee_code="NV001",
            contractor_name="",
            alias_keys=["tk-0000001"],
        )
        mock_hr.return_value = {
            "full_name": "Nguyễn Văn A",
            "status": "identified",
            "employee_code": "NV001",
        }
        self.assertEqual(
            patrol_identity_store.lookup_gallery_worker("tk-0000001"),
            "p-NV001",
        )

    def test_prune_stale_gallery_bindings(self) -> None:
        patrol_identity_store.bind_patrol_identity(
            gallery_worker_id="p-NV001",
            worker_name="Nguyễn Văn A",
            employee_code="NV001",
            contractor_name="",
            alias_keys=["tk-0000001", "p-NV001"],
        )
        out = patrol_identity_store.prune_stale_gallery_bindings()
        self.assertEqual(out["pruned_count"], 1)
        self.assertIn("p-NV001", out["pruned_gallery_workers"])
        self.assertIsNone(patrol_identity_store.lookup_gallery_worker("tk-0000001"))
        self.assertEqual(patrol_identity_store.list_patrol_identity_bindings(), [])


if __name__ == "__main__":
    unittest.main()
