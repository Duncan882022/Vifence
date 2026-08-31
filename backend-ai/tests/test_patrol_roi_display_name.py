"""ROI nhãn — tier identity phải hiện tên, không mã sgc/p-*."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_entity import (  # noqa: E402
    is_technical_patrol_worker_label,
    patrol_tier_label,
    resolve_patrol_worker_display_name,
)


class PatrolDisplayNameTests(unittest.TestCase):
    def test_technical_labels(self) -> None:
        self.assertTrue(is_technical_patrol_worker_label("sgc-00000001"))
        self.assertTrue(is_technical_patrol_worker_label("p-SGC-6688"))
        self.assertFalse(is_technical_patrol_worker_label("Duncan"))

    @patch("app.patrol_identity_store.lookup_patrol_identity")
    @patch("app.patrol_identity_store.lookup_gallery_worker")
    def test_binding_name_wins_over_code(
        self,
        mock_lookup_gallery: object,
        mock_lookup_identity: object,
    ) -> None:
        mock_lookup_gallery.return_value = None
        mock_lookup_identity.return_value = {
            "worker_name": "Duncan",
            "employee_code": "SGC-6688",
        }
        name = resolve_patrol_worker_display_name("p-SGC-6688", "p-SGC-6688")
        self.assertEqual(name, "Duncan")

    @patch("app.patrol_identity_store._is_verified_patrol_alias", return_value=False)
    def test_stale_pers_binding_does_not_show_duncan(self, _verified: object) -> None:
        from app import patrol_identity_store

        with patch.object(
            patrol_identity_store,
            "BINDINGS_FILE",
            ROOT / "data" / "patrol_identity_bindings.json",
        ):
            patrol_identity_store._state = {
                "version": 1,
                "by_gallery_worker": {
                    "p-SGC-6688": {
                        "gallery_worker_id": "p-SGC-6688",
                        "worker_name": "Duncan",
                        "employee_code": "SGC-6688",
                        "aliases": ["p-SGC-6688", "pers-0001"],
                    },
                },
                "alias_to_gallery": {
                    "p-SGC-6688": "p-SGC-6688",
                    "pers-0001": "p-SGC-6688",
                },
            }
            name = resolve_patrol_worker_display_name("pers-0001", "")
            self.assertEqual(name, "pers-0001")
            anonymous = {"pers_id": "pers-0001", "status": "person"}
            with patch("app.patrol.identity.get_person", return_value=anonymous):
                self.assertEqual(patrol_tier_label("pers-0001"), "person")
            patrol_identity_store._state = None


if __name__ == "__main__":
    unittest.main()
