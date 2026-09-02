"""Tests — borrow_overlapping_person_subject."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol.aggregator import session_store  # noqa: E402
from app.patrol.aggregator.types import TrackSession  # noqa: E402


class TestBorrowOverlappingPersonSubject(unittest.TestCase):
    def setUp(self) -> None:
        session_store.reset()

    def tearDown(self) -> None:
        session_store.reset()

    def test_returns_pers_when_bbox_overlaps(self) -> None:
        now = 1000.0
        existing = TrackSession(
            camera_id="HC-02",
            track_id="ptk-1",
            zone_id=None,
            started_at=now - 5,
            last_seen_at=now - 1,
            bbox=(100.0, 100.0, 200.0, 400.0),
            session_id="sess-hc02-a",
        )
        existing.subject_id = "pers-0042"
        session_store._sessions["HC-02|ptk-1"] = existing  # noqa: SLF001

        found = session_store.borrow_overlapping_person_subject(
            "HC-02",
            now,
            bbox=(110.0, 110.0, 210.0, 410.0),
        )
        self.assertEqual(found, "pers-0042")


if __name__ == "__main__":
    unittest.main()
