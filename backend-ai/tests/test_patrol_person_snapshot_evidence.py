"""Người tab — snapshot phải có face_eligible + score ≥ ngưỡng."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import daystore  # noqa: E402


class TestPersonSnapshotProvesReid(unittest.TestCase):
    def test_back_shot_without_face_fails(self) -> None:
        self.assertFalse(
            daystore.person_snapshot_proves_reid(
                snapshot_path="tk-0000001.jpg",
                snapshot_score=0.88,
                face_eligible=False,
            ),
        )

    def test_face_eligible_and_score_passes(self) -> None:
        self.assertTrue(
            daystore.person_snapshot_proves_reid(
                snapshot_path="tk-0000001.jpg",
                snapshot_score=1.4,
                face_eligible=True,
            ),
        )

    def test_high_score_without_face_still_fails(self) -> None:
        self.assertFalse(
            daystore.person_snapshot_proves_reid(
                snapshot_path="tk-0000001.jpg",
                snapshot_score=1.6,
                face_eligible=False,
            ),
        )


if __name__ == "__main__":
    unittest.main()
