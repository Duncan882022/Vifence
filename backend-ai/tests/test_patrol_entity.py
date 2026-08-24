"""patrol_entity — khóa dedup canonical theo sgc."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_entity import resolve_patrol_dedup_stable_id, resolve_patrol_master_id  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
