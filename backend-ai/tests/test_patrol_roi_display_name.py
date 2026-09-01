"""ROI nhãn — tier identity phải hiện tên HR, không từ binding ảo."""

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
        self.assertTrue(is_technical_patrol_worker_label("tk-00000001"))
        self.assertTrue(is_technical_patrol_worker_label("p-SGC-6688"))
        self.assertFalse(is_technical_patrol_worker_label("Duncan"))

    @patch("app.patrol.identity.hr_profile_for_employee_code")
    @patch("app.patrol_identity_store.lookup_patrol_identity")
    @patch("app.patrol_identity_store.lookup_gallery_worker")
    def test_hr_name_wins_over_gallery_code(
        self,
        mock_lookup_gallery: object,
        mock_lookup_identity: object,
        mock_hr_by_code: object,
    ) -> None:
        mock_lookup_gallery.return_value = None
        mock_lookup_identity.return_value = {
            "worker_name": "Duncan",
            "employee_code": "SGC-6688",
        }
        mock_hr_by_code.return_value = {
            "full_name": "Duncan",
            "status": "identified",
        }
        name = resolve_patrol_worker_display_name("p-SGC-6688", "p-SGC-6688")
        self.assertEqual(name, "Duncan")

    def test_stale_binding_worker_name_not_shown_for_track(self) -> None:
        from app import patrol_identity_store

        patrol_identity_store._state = {
            "version": 1,
            "by_gallery_worker": {
                "p-NV001": {
                    "gallery_worker_id": "p-NV001",
                    "worker_name": "Nguyễn Văn A",
                    "employee_code": "NV001",
                    "aliases": ["p-NV001", "tk-0000001"],
                },
            },
            "alias_to_gallery": {
                "p-NV001": "p-NV001",
                "tk-0000001": "p-NV001",
            },
        }
        name = resolve_patrol_worker_display_name("tk-0000001", "Nguyễn Văn A")
        self.assertEqual(name, "Người")
        patrol_identity_store._state = None

    def test_tk_without_binding_shows_nguoi(self) -> None:
        self.assertEqual(resolve_patrol_worker_display_name("tk-0000099", ""), "Người")
        self.assertEqual(patrol_tier_label("tk-0000099"), "person")


if __name__ == "__main__":
    unittest.main()
