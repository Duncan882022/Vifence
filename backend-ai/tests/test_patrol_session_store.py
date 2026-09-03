"""Session store — track song song không được mượn thẻ của nhau."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol.aggregator import session_store  # noqa: E402
from app.patrol.aggregator.types import TrackSession  # noqa: E402


class TestSessionStoreHasNoBboxBorrowing(unittest.TestCase):
    def setUp(self) -> None:
        session_store.reset()

    def tearDown(self) -> None:
        session_store.reset()

    def test_no_bbox_based_subject_borrowing_api(self) -> None:
        """Không còn đường nào lấy chủ thể của track khác dựa trên bbox.

        Bbox chồng nhau không chứng minh cùng một người: hai công nhân đứng sát
        nhau, hoặc người sau bước vào đúng chỗ người trước vừa rời, đều tạo ra
        bbox chồng. Gán chung chủ thể ở đó là gộp nhầm hai người thành một.
        """
        for removed in (
            "borrow_overlapping_person_subject",
            "borrow_parallel_object_subject",
            "resolve_parallel_object_subject",
        ):
            self.assertFalse(
                hasattr(session_store, removed),
                f"{removed} suy đoán cùng-người từ bbox — trái luật đếm lượt gặp",
            )

    def test_link_subject_session_only_shares_row_within_same_subject(self) -> None:
        now = 1000.0
        other = TrackSession(
            camera_id="HC-02",
            track_id="ptk-1",
            zone_id=None,
            started_at=now - 5,
            last_seen_at=now - 1,
            bbox=(100.0, 100.0, 200.0, 400.0),
            session_id="sess-hc02-a",
        )
        other.subject_id = "obj-19700101-0001"
        other.appearance_row_id = 7
        session_store._sessions["HC-02|ptk-1"] = other  # noqa: SLF001

        fresh = TrackSession(
            camera_id="HC-02",
            track_id="ptk-2",
            zone_id=None,
            started_at=now,
            last_seen_at=now,
            bbox=(110.0, 110.0, 210.0, 410.0),
            session_id="sess-hc02-b",
        )
        fresh.subject_id = "obj-19700101-0002"
        session_store.link_subject_session(fresh)

        self.assertIsNone(fresh.appearance_row_id, "thẻ khác nhau không dùng chung dòng")


if __name__ == "__main__":
    unittest.main()
