"""Ba tầng — pers/iden/sgc semantics và nhãn snapshot."""

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
    def test_pers_maps_to_person_tier(self) -> None:
        self.assertEqual(patrol_tier_label("pers-0007"), "person")
        self.assertEqual(tier_for_worker_id("pers-0007"), TIER_PERSON)

    def test_iden_maps_to_identity_tier(self) -> None:
        self.assertEqual(patrol_tier_label("iden-0003"), "identity")
        self.assertEqual(tier_for_worker_id("iden-0003"), TIER_IDENTITY)

    def test_sgc_maps_to_person_tier(self) -> None:
        self.assertEqual(patrol_tier_label("sgc-00000007"), "person")
        self.assertEqual(tier_for_worker_id("sgc-00000007"), TIER_PERSON)

    def test_empty_maps_to_object(self) -> None:
        self.assertEqual(patrol_tier_label(""), "object")
        self.assertEqual(tier_for_worker_id(""), TIER_OBJECT)

    def test_snapshot_label_hides_technical_codes(self) -> None:
        self.assertEqual(
            format_patrol_person_snapshot_label("sgc-00000007", "sgc-00000007"),
            "Người",
        )
        self.assertEqual(
            format_patrol_person_snapshot_label("pers-0007", "pers-0007"),
            "Người",
        )


if __name__ == "__main__":
    unittest.main()
