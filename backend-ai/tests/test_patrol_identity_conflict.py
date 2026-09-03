"""Một thẻ = một đối tượng — không ai ở hai chỗ cùng lúc."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.patrol import daystore, db, identity, identity_conflict


def _vec(seed: int, dim: int = 128) -> list[float]:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim).astype(np.float32)
    return (v / np.linalg.norm(v)).tolist()


def _row(
    track_id: str,
    camera_id: str,
    started_at: float,
    ended_at: float,
) -> dict[str, object]:
    return {
        "track_id": track_id,
        "camera_id": camera_id,
        "started_at": started_at,
        "ended_at": ended_at,
    }


class ConflictRuleTests(unittest.TestCase):
    def test_same_camera_overlapping_tracks_conflict(self) -> None:
        a = _row("ptk-1", "HC-01", 100.0, 130.0)
        b = _row("ptk-2", "HC-01", 110.0, 140.0)
        self.assertTrue(identity_conflict.rows_conflict(a, b))

    def test_different_cameras_never_conflict(self) -> None:
        """Trễ luồng giữa hai mũ — chồng thời gian không kết luận được gì."""
        a = _row("ptk-1", "HC-01", 100.0, 130.0)
        b = _row("ptk-2", "HC-02", 110.0, 140.0)
        self.assertFalse(identity_conflict.rows_conflict(a, b))

    def test_same_track_never_conflicts_with_itself(self) -> None:
        a = _row("ptk-1", "HC-01", 100.0, 130.0)
        b = _row("ptk-1", "HC-01", 110.0, 140.0)
        self.assertFalse(identity_conflict.rows_conflict(a, b))

    def test_sequential_tracks_do_not_conflict(self) -> None:
        """Cùng người bị cắt track rồi bắt lại — nối tiếp, không chồng."""
        a = _row("ptk-1", "HC-01", 100.0, 130.0)
        b = _row("ptk-2", "HC-01", 132.0, 160.0)
        self.assertFalse(identity_conflict.rows_conflict(a, b))

    def test_sub_second_overlap_is_treated_as_timing_noise(self) -> None:
        a = _row("ptk-1", "HC-01", 100.0, 130.0)
        b = _row("ptk-2", "HC-01", 129.7, 160.0)
        self.assertFalse(identity_conflict.rows_conflict(a, b))


class SelectSingleSubjectTests(unittest.TestCase):
    def test_drops_track_that_shares_a_frame_with_anchor(self) -> None:
        rows = [
            _row("ptk-1", "HC-01", 100.0, 200.0),
            _row("ptk-2", "HC-01", 120.0, 180.0),
        ]
        kept = identity_conflict.select_single_subject_rows(rows, anchor_track_id="ptk-1")
        self.assertEqual([r["track_id"] for r in kept], ["ptk-1"])

    def test_keeps_same_person_across_cameras(self) -> None:
        """Một người đi qua hai mũ — vẫn phải nằm chung một thẻ."""
        rows = [
            _row("ptk-1", "HC-01", 100.0, 130.0),
            _row("ptk-2", "HC-02", 140.0, 170.0),
        ]
        kept = identity_conflict.select_single_subject_rows(rows, anchor_track_id="ptk-1")
        self.assertEqual([r["track_id"] for r in kept], ["ptk-1", "ptk-2"])

    def test_keeps_sequential_relay_on_same_camera(self) -> None:
        rows = [
            _row("ptk-1", "HC-01", 100.0, 130.0),
            _row("ptk-2", "HC-01", 135.0, 160.0),
        ]
        kept = identity_conflict.select_single_subject_rows(rows, anchor_track_id="ptk-1")
        self.assertEqual([r["track_id"] for r in kept], ["ptk-1", "ptk-2"])

    def test_anchor_defaults_to_latest_appearance(self) -> None:
        """Không chỉ định neo — bám lượt mới nhất, đó là thứ thẻ đang hiện."""
        rows = [
            _row("ptk-old", "HC-01", 100.0, 200.0),
            _row("ptk-new", "HC-01", 150.0, 400.0),
        ]
        kept = identity_conflict.select_single_subject_rows(rows)
        self.assertEqual([r["track_id"] for r in kept], ["ptk-new"])

    def test_rows_without_track_id_are_kept(self) -> None:
        rows = [
            _row("", "HC-01", 100.0, 130.0),
            _row("ptk-1", "HC-01", 140.0, 170.0),
        ]
        kept = identity_conflict.select_single_subject_rows(rows)
        self.assertEqual(len(kept), 2)

    def test_empty_input_returns_empty(self) -> None:
        self.assertEqual(identity_conflict.select_single_subject_rows([]), [])


class SplitTrackTests(unittest.TestCase):
    def test_overlapping_boxes_look_like_one_person(self) -> None:
        self.assertTrue(
            identity_conflict.looks_like_split_track(
                [100.0, 100.0, 200.0, 400.0], [110.0, 105.0, 205.0, 395.0],
            )
        )

    def test_disjoint_boxes_are_two_people(self) -> None:
        self.assertFalse(
            identity_conflict.looks_like_split_track(
                [100.0, 100.0, 200.0, 400.0], [400.0, 100.0, 500.0, 400.0],
            )
        )

    def test_missing_box_keeps_legacy_merge_behaviour(self) -> None:
        self.assertTrue(identity_conflict.looks_like_split_track(None, [1.0, 2.0, 3.0, 4.0]))


class MergeGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        db.get_conn()
        identity._invalidate_face_index()  # noqa: SLF001

    def tearDown(self) -> None:
        db.close()
        identity._invalidate_face_index()  # noqa: SLF001
        self._tmp.cleanup()

    def _appearance(self, subject_id: str, track_id: str, start: float, end: float) -> None:
        daystore.upsert_track_appearance(
            appearance_id=None,
            event_date=db.today_vn(start),
            subject_id=subject_id,
            camera_id="HC-01",
            zone_id=None,
            track_id=track_id,
            session_id=f"sess-{track_id}",
            started_at=start,
            ended_at=end,
            gps_lat=None,
            gps_lng=None,
            payload_json="{}",
            interactions_json="[]",
            snapshot_path=None,
        )

    def test_merge_refused_when_both_seen_in_one_frame(self) -> None:
        a, _ = identity.observe_face(_vec(11), quality=0.8)
        b, _ = identity.observe_face(_vec(22), quality=0.8)
        self._appearance(a, "ptk-a", 1_000.0, 1_060.0)
        self._appearance(b, "ptk-b", 1_010.0, 1_070.0)

        self.assertFalse(identity.merge_persons(a, b))
        self.assertIsNotNone(identity.get_person(b))
        rows = db.query("SELECT subject_id FROM appearances WHERE subject_id = ?", (b,))
        self.assertEqual(len(rows), 1)

    def test_merge_allowed_for_sequential_appearances(self) -> None:
        a, _ = identity.observe_face(_vec(11), quality=0.8)
        b, _ = identity.observe_face(_vec(22), quality=0.8)
        self._appearance(a, "ptk-a", 1_000.0, 1_060.0)
        self._appearance(b, "ptk-b", 1_100.0, 1_160.0)

        self.assertTrue(identity.merge_persons(a, b))
        self.assertEqual(identity.resolve_alias(b), a)


if __name__ == "__main__":
    unittest.main()
