"""patrol_entity — khóa dedup canonical theo sgc."""

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


class PatrolEntitySgcCanonicalTests(unittest.TestCase):
    def test_gallery_and_obj_share_sgc_dedup_key(self) -> None:
        bindings = {
            "version": 1,
            "by_gallery_worker": {
                "p-DUNCAN": {
                    "gallery_worker_id": "p-DUNCAN",
                    "worker_name": "Duncan",
                    "aliases": ["sgc-00000005", "p-DUNCAN", "OBJ-BE1346"],
                },
            },
            "alias_to_gallery": {
                "sgc-00000005": "p-DUNCAN",
                "p-DUNCAN": "p-DUNCAN",
                "OBJ-BE1346": "p-DUNCAN",
            },
        }
        with patch("app.patrol_identity_store._load", return_value=bindings):
            with patch("app.patrol_identity_store._gallery_binding_has_hr", return_value=True):
                sgc_key = resolve_patrol_dedup_stable_id(
                    "sgc-00000005",
                    "OBJ-CDE0C9",
                    "p01:person",
                )
                gallery_key = resolve_patrol_dedup_stable_id(
                    "p-DUNCAN",
                    "OBJ-BE1346",
                    "p02:person",
                )
        self.assertEqual(sgc_key, "sgc-00000005")
        self.assertEqual(gallery_key, "sgc-00000005")
        self.assertEqual(sgc_key, gallery_key)

    def test_master_id_prefers_sgc(self) -> None:
        mid = resolve_patrol_master_id("p-TRUNG", "OBJ-20260824-CDE0C9", "p01:person")
        with patch("app.patrol_identity_store.lookup_gallery_worker", return_value=None):
            mid2 = resolve_patrol_master_id("sgc-00000010", None, "p01:person")
        self.assertEqual(mid2, "sgc-00000010")

    def test_track_technical_id_detection(self) -> None:
        self.assertTrue(is_patrol_track_technical_id("ptk0007:person"))
        self.assertTrue(is_patrol_track_technical_id("ptk0042"))
        self.assertFalse(is_patrol_track_technical_id("sgc-00000042"))
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
                    "aliases": ["p-SGC-6688", "pers-0001"],
                },
            },
            "alias_to_gallery": {
                "p-SGC-6688": "p-SGC-6688",
                "pers-0001": "p-SGC-6688",
            },
        }
        identified = {
            "pers_id": "pers-0001",
            "status": "identified",
            "full_name": "Duncan",
            "employee_code": "SGC-6688",
        }
        with patch("app.patrol_identity_store._load", return_value=bindings):
            with patch("app.patrol_identity_store._gallery_binding_has_hr", return_value=True):
                with patch("app.patrol.identity.get_person", return_value=identified):
                    self.assertEqual(patrol_tier_label("p-SGC-6688"), "identity")
                    self.assertEqual(patrol_tier_label("pers-0001"), "identity")
                    self.assertEqual(
                        resolve_patrol_gallery_id_for_worker("pers-0001"),
                        "p-SGC-6688",
                    )
        anonymous = {"pers_id": "pers-0001", "status": "person"}
        with patch("app.patrol_identity_store._load", return_value=bindings):
            with patch("app.patrol_identity_store._gallery_binding_has_hr", return_value=False):
                with patch("app.patrol.identity.get_person", return_value=anonymous):
                    self.assertEqual(patrol_tier_label("pers-0001"), "person")
                    self.assertIsNone(resolve_patrol_gallery_id_for_worker("pers-0001"))

    def test_patrol_tier_label_sgc_is_person(self) -> None:
        self.assertEqual(patrol_tier_label("sgc-00000042"), "person")

    @patch("app.patrol_identity_store.lookup_gallery_worker", return_value="p-IDEN3")
    def test_patrol_tier_label_iden_is_identity(self, _lookup: object) -> None:
        self.assertEqual(patrol_tier_label("iden-0003"), "identity")


if __name__ == "__main__":
    unittest.main()
