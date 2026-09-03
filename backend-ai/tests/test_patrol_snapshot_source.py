"""Ảnh sự kiện dùng khung gốc — bbox scale ngược từ khung phân tích."""

from __future__ import annotations

import unittest

import numpy as np

from app.patrol.person_analyzer import SnapshotSource, resolve_snapshot_source


class SnapshotSourceTests(unittest.TestCase):
    def test_no_capture_frame_keeps_analyze_frame(self) -> None:
        analyze = np.zeros((360, 640, 3), dtype=np.uint8)
        shot = resolve_snapshot_source(analyze, None)
        self.assertIs(shot.frame, analyze)
        self.assertEqual((shot.scale_x, shot.scale_y), (1.0, 1.0))

    def test_same_frame_object_keeps_scale_one(self) -> None:
        analyze = np.zeros((360, 640, 3), dtype=np.uint8)
        shot = resolve_snapshot_source(analyze, analyze)
        self.assertEqual((shot.scale_x, shot.scale_y), (1.0, 1.0))

    def test_downscaled_analyze_frame_scales_bbox_back_up(self) -> None:
        """Mobile hạ khung về 640px — ảnh lưu vẫn là khung gốc 1280px."""
        analyze = np.zeros((360, 640, 3), dtype=np.uint8)
        capture = np.zeros((720, 1280, 3), dtype=np.uint8)
        shot = resolve_snapshot_source(analyze, capture)

        self.assertIs(shot.frame, capture)
        self.assertEqual(shot.scale_x, 2.0)
        self.assertEqual(shot.scale_y, 2.0)
        self.assertEqual(shot.bbox([10.0, 20.0, 110.0, 220.0]), [20.0, 40.0, 220.0, 440.0])

    def test_bbox_none_stays_none(self) -> None:
        shot = SnapshotSource(np.zeros((10, 10, 3), dtype=np.uint8), 2.0, 2.0)
        self.assertIsNone(shot.bbox(None))

    def test_bbox_ratio_within_frame_is_preserved(self) -> None:
        """Khung khoanh phải phủ đúng vùng tương đối như trên khung phân tích."""
        analyze = np.zeros((360, 640, 3), dtype=np.uint8)
        capture = np.zeros((1080, 1920, 3), dtype=np.uint8)
        shot = resolve_snapshot_source(analyze, capture)

        box = [64.0, 36.0, 320.0, 180.0]
        scaled = shot.bbox(box)
        assert scaled is not None
        self.assertAlmostEqual(box[0] / 640, scaled[0] / 1920)
        self.assertAlmostEqual(box[1] / 360, scaled[1] / 1080)
        self.assertAlmostEqual(box[2] / 640, scaled[2] / 1920)
        self.assertAlmostEqual(box[3] / 360, scaled[3] / 1080)


if __name__ == "__main__":
    unittest.main()
