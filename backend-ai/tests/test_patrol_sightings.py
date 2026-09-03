"""Sổ cái lượt gặp — một track kết thúc là một dòng, ghi rồi không sửa lại."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.patrol import daystore, db, identity, sink
from app.patrol_tracker import (
    END_REASON_EXIT_EDGE,
    END_REASON_LOST,
    END_REASON_STREAM_OFFLINE,
)

# Đồng bộ config.py — min-commit ngắn; 2s là cửa sổ frame đẹp.
_MIN_OBJECT_COMMIT = 0.35
_PERSON_BOX = [85.0, 62.0, 225.0, 425.0]


class PatrolSightingsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()
        sink.reset()

    def tearDown(self) -> None:
        sink.reset()
        db.close()
        self._tmp.cleanup()

    def _see_object(self, track_id: str, *, t0: float, camera_id: str = "HC-01") -> str:
        sink.record_observation(
            camera_id=camera_id,
            track_id=track_id,
            person_bbox=_PERSON_BOX,
            now=t0,
        )
        return str(
            sink.record_observation(
                camera_id=camera_id,
                track_id=track_id,
                person_bbox=_PERSON_BOX,
                now=t0 + _MIN_OBJECT_COMMIT + 0.15,
            )
        )

    def test_finalized_track_writes_one_sighting(self) -> None:
        t0 = 1_000.0
        obj_id = self._see_object("ptk0001:person", t0=t0)
        sink.forget_track(
            "HC-01", "ptk0001:person", now=t0 + 3.0, end_reason=END_REASON_EXIT_EDGE,
        )

        rows = daystore.list_sightings(db.today_vn(t0))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["subject_id"], obj_id)
        self.assertEqual(rows[0]["subject_kind"], "object")
        self.assertEqual(rows[0]["end_reason"], END_REASON_EXIT_EDGE)
        self.assertEqual(rows[0]["qualified"], 1)

    def test_each_track_is_its_own_sighting(self) -> None:
        """Gặp lại sau khi ra khỏi khung là lượt mới — đúng đặc tả nghiệp vụ."""
        t0 = 1_000.0
        first = self._see_object("ptk0001:person", t0=t0)
        sink.forget_track(
            "HC-01", "ptk0001:person", now=t0 + 3.0, end_reason=END_REASON_EXIT_EDGE,
        )
        second = self._see_object("ptk0002:person", t0=t0 + 60.0)
        sink.forget_track(
            "HC-01", "ptk0002:person", now=t0 + 63.0, end_reason=END_REASON_EXIT_EDGE,
        )

        self.assertNotEqual(first, second)
        rows = daystore.list_sightings(db.today_vn(t0))
        self.assertEqual(len(rows), 2)
        self.assertEqual(daystore.day_stats(db.today_vn(t0))["object_sighting_count"], 2)

    def test_two_cameras_seeing_one_person_are_two_sightings(self) -> None:
        """Nhiều mũ cùng thấy một người vẫn là nhiều lượt — không có dedup Đối tượng."""
        t0 = 1_000.0
        self._see_object("ptk0001:person", t0=t0, camera_id="HC-01")
        self._see_object("ptk0001:person", t0=t0, camera_id="HC-02")
        sink.forget_track("HC-01", "ptk0001:person", now=t0 + 3.0)
        sink.forget_track("HC-02", "ptk0001:person", now=t0 + 3.0)

        stats = daystore.day_stats(db.today_vn(t0))
        self.assertEqual(stats["object_sighting_count"], 2)

    def test_finalizing_the_same_session_twice_keeps_one_row(self) -> None:
        """Cam tắt gọi forget_track rồi quét nốt session mồ côi — vẫn một lượt."""
        t0 = 1_000.0
        self._see_object("ptk0001:person", t0=t0)
        sink.forget_track("HC-01", "ptk0001:person", now=t0 + 3.0)

        from app.patrol.aggregator.engine import finalize_orphan_sessions

        finalize_orphan_sessions("HC-01", end_reason=END_REASON_STREAM_OFFLINE)

        self.assertEqual(len(daystore.list_sightings(db.today_vn(t0))), 1)

    def test_stream_offline_sightings_are_reported_apart(self) -> None:
        """Lượt đóng vì mất tín hiệu không nói lên điều gì về công trường."""
        t0 = 1_000.0
        self._see_object("ptk0001:person", t0=t0)
        sink.forget_track(
            "HC-01",
            "ptk0001:person",
            now=t0 + 3.0,
            end_reason=END_REASON_STREAM_OFFLINE,
        )
        self._see_object("ptk0002:person", t0=t0 + 60.0)
        sink.forget_track(
            "HC-01", "ptk0002:person", now=t0 + 63.0, end_reason=END_REASON_EXIT_EDGE,
        )

        stats = daystore.day_stats(db.today_vn(t0))
        self.assertEqual(stats["object_sighting_count"], 1)
        self.assertEqual(stats["sightings_stream_offline"], 1)

    def test_fleeting_detection_leaves_no_ledger_row(self) -> None:
        t0 = 1_000.0
        sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person", person_bbox=_PERSON_BOX, now=t0,
        )
        sink.forget_track("HC-01", "ptk0001:person", now=t0 + 0.2)

        self.assertEqual(daystore.list_sightings(db.today_vn(t0)), [])

    def test_long_track_that_never_committed_is_kept_as_unqualified(self) -> None:
        """Bám được mà không chốt nổi thẻ vẫn vào sổ — đó là phần đang bỏ sót."""
        t0 = 1_000.0
        # Cột giàn giáo dựng đứng: YOLO gọi là người suốt 5 giây, cổng ghi thẻ
        # chặn lại. Track có thật, thẻ thì không.
        pole = [600.0, 200.0, 660.0, 500.0]
        for step in range(6):
            sink.record_observation(
                camera_id="HC-01",
                track_id="ptk0001:person",
                person_bbox=pole,
                now=t0 + step,
            )
        sink.forget_track("HC-01", "ptk0001:person", now=t0 + 5.0)

        self.assertEqual(daystore.list_objects(db.today_vn(t0)), [])
        rows = daystore.list_sightings(db.today_vn(t0))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["subject_kind"], "unqualified")
        self.assertEqual(rows[0]["qualified"], 0)

        stats = daystore.day_stats(db.today_vn(t0))
        self.assertEqual(stats["object_sighting_count"], 0)
        self.assertEqual(stats["sightings_unqualified"], 1)
        self.assertEqual(stats["sightings_total"], 1)

    def test_end_reason_defaults_when_the_caller_does_not_say(self) -> None:
        t0 = 1_000.0
        self._see_object("ptk0001:person", t0=t0)
        sink.forget_track("HC-01", "ptk0001:person", now=t0 + 3.0)

        rows = daystore.list_sightings(db.today_vn(t0))
        self.assertEqual(rows[0]["end_reason"], END_REASON_LOST)


class PatrolObjectPromotionTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()
        sink.reset()

    def tearDown(self) -> None:
        sink.reset()
        db.close()
        self._tmp.cleanup()

    def test_promotion_marks_the_object_card_instead_of_deleting_it(self) -> None:
        t0 = 1_000.0
        date = db.today_vn(t0)
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=t0)
        identity.ensure_draft_for_tk("tk-0000001", now=t0)

        daystore.promote_object(obj_id, "tk-0000001", now=t0 + 1.0)

        self.assertEqual(daystore.list_objects(date), [])
        row = db.query_one(
            "SELECT promoted_to, promoted_at FROM daily_objects"
            " WHERE event_date = ? AND obj_id = ?",
            (date, obj_id),
        )
        self.assertEqual(row["promoted_to"], "tk-0000001")
        self.assertGreater(float(row["promoted_at"]), 0.0)

    def test_promoting_twice_does_not_move_history_a_second_time(self) -> None:
        t0 = 1_000.0
        date = db.today_vn(t0)
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=t0)
        identity.ensure_draft_for_tk("tk-0000001", now=t0)
        identity.ensure_draft_for_tk("tk-0000002", now=t0)

        daystore.promote_object(obj_id, "tk-0000001", now=t0 + 1.0)
        daystore.promote_object(obj_id, "tk-0000002", now=t0 + 2.0)

        row = db.query_one(
            "SELECT promoted_to FROM daily_objects WHERE event_date = ? AND obj_id = ?",
            (date, obj_id),
        )
        self.assertEqual(row["promoted_to"], "tk-0000001")
        self.assertEqual(len(daystore.list_person_events(date)), 1)

    def test_promoted_card_no_longer_counts_as_an_object(self) -> None:
        t0 = 1_000.0
        date = db.today_vn(t0)
        obj_id = daystore.touch_object(
            None, camera_id="HC-01", now=t0, snapshot_path="a.jpg", snapshot_score=0.4,
        )
        self.assertEqual(daystore.day_stats(date)["object_card_count"], 1)

        identity.ensure_draft_for_tk("tk-0000001", now=t0)
        daystore.promote_object(obj_id, "tk-0000001", now=t0 + 1.0)

        self.assertEqual(daystore.day_stats(date)["object_card_count"], 0)


if __name__ == "__main__":
    unittest.main()
