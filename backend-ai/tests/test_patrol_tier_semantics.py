"""Ba tầng — tk/p/gallery semantics và nhãn snapshot."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_entity import (  # noqa: E402
    format_patrol_person_snapshot_label,
    patrol_tier_label,
)
from app.patrol_identity_lifecycle import (  # noqa: E402
    TIER_IDENTITY,
    TIER_OBJECT,
    TIER_PERSON,
    tier_for_worker_id,
)


class PatrolTierSemanticsTests(unittest.TestCase):
    def test_tk_maps_to_person_tier(self) -> None:
        self.assertEqual(patrol_tier_label("tk-0000007"), "person")
        self.assertEqual(tier_for_worker_id("tk-0000007"), TIER_PERSON)

    def test_gallery_maps_to_identity_tier(self) -> None:
        from unittest.mock import patch

        with patch("app.patrol_entity.is_patrol_gallery_id", return_value=True):
            self.assertEqual(patrol_tier_label("p-DUNCAN"), "identity")
            self.assertEqual(tier_for_worker_id("p-DUNCAN"), TIER_IDENTITY)

    def test_sgc_maps_to_person_tier(self) -> None:
        self.assertEqual(patrol_tier_label("sgc-00000007"), "person")
        self.assertEqual(tier_for_worker_id("sgc-00000007"), TIER_PERSON)

    def test_empty_maps_to_object(self) -> None:
        self.assertEqual(patrol_tier_label(""), "object")
        self.assertEqual(tier_for_worker_id(""), TIER_OBJECT)

    def test_snapshot_label_shows_track_id(self) -> None:
        self.assertEqual(
            format_patrol_person_snapshot_label("sgc-00000007", "sgc-00000007"),
            "tk-0000007",
        )
        self.assertEqual(
            format_patrol_person_snapshot_label("tk-0000007", "tk-0000007"),
            "tk-0000007",
        )

    def test_snapshot_label_identified_pers_without_worker_id(self) -> None:
        import tempfile
        from pathlib import Path

        from app.patrol import db, identity

        tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(tmp.name)
        db.DB_FILE = Path(tmp.name) / "patrol.db"
        db.get_conn()
        pers_id, _ = identity.observe_face([0.4] * 128, quality=0.9)
        identity.identify(pers_id, full_name="Duncan", employee_code="NV6688")
        self.assertEqual(
            format_patrol_person_snapshot_label(None, None, pers_id),
            "NV6688 Duncan",
        )
        db.close()
        tmp.cleanup()


if __name__ == "__main__":
    unittest.main()
