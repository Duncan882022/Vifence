"""patrol_entity — khóa dedup canonical theo tk."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_entity import (  # noqa: E402
    is_patrol_track_technical_id,
    patrol_tier_label,
    resolve_patrol_dedup_stable_id,
    resolve_patrol_gallery_id_for_worker,
    resolve_patrol_master_id,
)


class PatrolEntityTkCanonicalTests(unittest.TestCase):
    def test_gallery_and_obj_share_tk_dedup_key(self) -> None:
        bindings = {
            "version": 1,
            "by_gallery_worker": {
                "p-DUNCAN": {
                    "gallery_worker_id": "p-DUNCAN",
                    "worker_name": "Duncan",
                    "employee_code": "DUNCAN",
                    "aliases": ["tk-0000005", "p-DUNCAN", "OBJ-BE1346"],
                },
            },
            "alias_to_gallery": {
                "tk-0000005": "p-DUNCAN",
                "p-DUNCAN": "p-DUNCAN",
                "OBJ-BE1346": "p-DUNCAN",
            },
        }
        with patch("app.patrol_identity_store._load", return_value=bindings):
            with patch("app.patrol_identity_store._gallery_binding_has_hr", return_value=True):
                with patch("app.patrol_identity_store.lookup_gallery_worker", side_effect=lambda a: "p-DUNCAN" if a in ("p-DUNCAN", "OBJ-BE1346", "tk-0000005") else None):
                    with patch("app.patrol_identity_store.lookup_patrol_identity", return_value=bindings["by_gallery_worker"]["p-DUNCAN"]):
                        tk_key = resolve_patrol_dedup_stable_id(
                            "tk-0000005",
                            "OBJ-CDE0C9",
                            "p01:person",
                        )
                        gallery_key = resolve_patrol_dedup_stable_id(
                            "p-DUNCAN",
                            "OBJ-BE1346",
                            "p02:person",
                        )
        self.assertEqual(tk_key, "tk-0000005")
        self.assertEqual(gallery_key, "tk-0000005")
        self.assertEqual(tk_key, gallery_key)

    def test_master_id_prefers_tk(self) -> None:
        mid = resolve_patrol_master_id("p-TRUNG", "OBJ-20260824-CDE0C9", "p01:person")
        with patch("app.patrol_identity_store.lookup_gallery_worker", return_value=None):
            mid2 = resolve_patrol_master_id("tk-0000010", None, "p01:person")
        self.assertEqual(mid2, "tk-0000010")
        self.assertTrue(mid.startswith("OBJ-") or mid == "p-TRUNG")

    def test_track_technical_id_detection(self) -> None:
        self.assertTrue(is_patrol_track_technical_id("ptk0007:person"))
        self.assertTrue(is_patrol_track_technical_id("ptk0042"))
        self.assertFalse(is_patrol_track_technical_id("tk-00000042"))
        self.assertFalse(is_patrol_track_technical_id("p-SGC-6688"))

    def test_patrol_tier_label_rejects_track_id(self) -> None:
        self.assertEqual(patrol_tier_label("ptk0007:person"), "object")

    def test_patrol_tier_label_gallery(self) -> None:
        bindings = {
            "version": 1,
            "by_gallery_worker": {
                "p-SGC-6688": {
                    "gallery_worker_id": "p-SGC-6688",
                    "worker_name": "Duncan",
                    "employee_code": "SGC-6688",
                    "aliases": ["p-SGC-6688", "tk-0000001"],
                },
            },
            "alias_to_gallery": {
                "p-SGC-6688": "p-SGC-6688",
                "tk-0000001": "p-SGC-6688",
            },
        }
        with patch("app.patrol_identity_store._load", return_value=bindings):
            with patch("app.patrol_identity_store._gallery_binding_has_hr", return_value=True):
                with patch("app.patrol_entity.is_patrol_gallery_id", return_value=True):
                    with patch(
                        "app.patrol_identity_store.lookup_gallery_worker",
                        return_value="p-SGC-6688",
                    ):
                        self.assertEqual(patrol_tier_label("p-SGC-6688"), "identity")
                        self.assertEqual(patrol_tier_label("tk-0000001"), "identity")
                        self.assertEqual(
                            resolve_patrol_gallery_id_for_worker("tk-0000001"),
                            "p-SGC-6688",
                        )
        with patch("app.patrol_identity_store._load", return_value=bindings):
            with patch("app.patrol_identity_store._gallery_binding_has_hr", return_value=False):
                with patch(
                    "app.patrol_identity_store.lookup_gallery_worker_raw", return_value=None,
                ):
                    self.assertEqual(patrol_tier_label("tk-0000001"), "person")
                    self.assertIsNone(resolve_patrol_gallery_id_for_worker("tk-0000001"))

    def test_patrol_tier_label_tk_is_person(self) -> None:
        self.assertEqual(patrol_tier_label("tk-00000042"), "person")

    @patch("app.patrol_identity_store.lookup_gallery_worker_raw", return_value="p-IDEN3")
    def test_patrol_tier_label_gallery_alias_is_identity(self, _lookup: object) -> None:
        self.assertEqual(patrol_tier_label("tk-0000003"), "identity")


if __name__ == "__main__":
    unittest.main()
