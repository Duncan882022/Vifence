"""Tier theo worker_id site-wide — kế thừa qua cam/track khác."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from patrol_gallery_stub import FakeGalleryMixin  # noqa: E402

from app.patrol_identity_lifecycle import (  # noqa: E402
    TIER_IDENTITY,
    observe,
    reset,
)


class TestGlobalWorkerTier(FakeGalleryMixin, unittest.TestCase):
    hr_profiles = {"p-SGC-6688": "Duncan"}

    def setUp(self) -> None:
        super().setUp()
        reset()

    def tearDown(self) -> None:
        reset()

    def test_dr_inherits_identity_after_hc_track_expired(self) -> None:
        # Quan sát cùng mốc thời gian bị khử trùng, nên phải bước thời gian ra
        # thì ba lần gọi mới tính là ba frame và đủ hit để lên Định danh.
        for i in range(3):
            observe(
                "HC-01",
                "trk-1",
                worker_id="p-SGC-6688",
                worker_name="Duncan",
                now=float(i + 1),
            )
        reset("HC-01")

        dr = observe(
            "DR-03",
            "trk-dr",
            worker_id="p-SGC-6688",
            worker_name="p-SGC-6688",
            now=4.0,
        )
        self.assertEqual(dr.tier, TIER_IDENTITY)
        self.assertEqual(dr.worker_name, "Duncan")


if __name__ == "__main__":
    unittest.main()
