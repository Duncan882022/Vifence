"""Tier ROI đồng bộ giữa HC-01 và HC-02 cho cùng worker_id."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_identity_lifecycle import (  # noqa: E402
    TIER_IDENTITY,
    TIER_PERSON,
    observe,
    reset,
)


class TestSiblingTierLifecycle(unittest.TestCase):
    def setUp(self) -> None:
        reset()

    def tearDown(self) -> None:
        reset()

    def test_hc02_inherits_identity_tier_from_hc01(self) -> None:
        # HC-01 đã lên Định danh cho Duncan.
        for _ in range(2):
            observe(
                "HC-01",
                "trk-1",
                worker_id="p-SGC-6688",
                worker_name="Duncan",
            )
        hc01 = observe("HC-01", "trk-1", worker_id="p-SGC-6688", worker_name="Duncan")
        self.assertEqual(hc01.tier, TIER_IDENTITY)

        # HC-02 thấy cùng worker_id lần đầu — không phải chờ lại 2 frame.
        hc02 = observe(
            "HC-02",
            "trk-9",
            worker_id="p-SGC-6688",
            worker_name="p-SGC-6688",
        )
        self.assertEqual(hc02.tier, TIER_IDENTITY)
        self.assertEqual(hc02.worker_name, "Duncan")

    def test_hc02_inherits_person_tier_from_hc01(self) -> None:
        observe("HC-01", "trk-1", worker_id="sgc-00000430", worker_name="sgc-00000430")
        hc02 = observe("HC-02", "trk-2", worker_id="sgc-00000430", worker_name="")
        self.assertEqual(hc02.tier, TIER_PERSON)


if __name__ == "__main__":
    unittest.main()
