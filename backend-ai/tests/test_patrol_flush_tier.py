"""Tests — tier_at_observation fallback in aggregator flush."""
from __future__ import annotations

import unittest

from app.patrol.aggregator.flush import _resolve_tier_at_observation


class ResolveTierAtObservationTests(unittest.TestCase):
    def test_object_subject(self) -> None:
        self.assertEqual(
            _resolve_tier_at_observation(
                "obj-20260905-0001",
                tier_at=None,
                shot_face_eligible=False,
                worker_id=None,
            ),
            "object",
        )

    def test_person_with_face(self) -> None:
        self.assertEqual(
            _resolve_tier_at_observation(
                "tk-0000022",
                tier_at=None,
                shot_face_eligible=True,
                worker_id="tk-0000022",
            ),
            "person",
        )

    def test_person_without_face_is_object(self) -> None:
        self.assertEqual(
            _resolve_tier_at_observation(
                "tk-0000099",
                tier_at=None,
                shot_face_eligible=False,
                worker_id="tk-0000099",
            ),
            "object",
        )

    def test_preserves_explicit_tier(self) -> None:
        self.assertEqual(
            _resolve_tier_at_observation(
                "tk-0000001",
                tier_at="identity",
                shot_face_eligible=True,
                worker_id="p-NV-6688",
            ),
            "identity",
        )


if __name__ == "__main__":
    unittest.main()
