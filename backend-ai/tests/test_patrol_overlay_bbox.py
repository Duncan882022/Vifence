"""Patrol overlay bbox — YOLO thô, không cắt chân PPE."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.patrol import db, sink
from app.patrol_person_visibility import patrol_person_overlay_bbox


class PatrolOverlayBboxTests(unittest.TestCase):
    FW, FH = 1280, 720

    def test_keeps_full_yolo_box_when_feet_not_assessable(self) -> None:
        """Trước đây `_visible_person_display_bbox` cắt còn 72% — patrol không làm vậy."""
        half_body = (320.0, 180.0, 620.0, 680.0)
        out = patrol_person_overlay_bbox(half_body, self.FW, self.FH)
        self.assertAlmostEqual(out[0], half_body[0])
        self.assertAlmostEqual(out[1], half_body[1])
        self.assertAlmostEqual(out[2], half_body[2])
        self.assertAlmostEqual(out[3], half_body[3])

    def test_clips_to_frame_only(self) -> None:
        overflow = (-20.0, -10.0, 1300.0, 730.0)
        out = patrol_person_overlay_bbox(overflow, self.FW, self.FH)
        self.assertEqual(out, (0.0, 0.0, float(self.FW), float(self.FH)))

    def test_expands_partial_back_turn_slice(self) -> None:
        """YOLO quay lưng hay trả mảnh lưng–bụng — ROI phải kéo xuống gần full người."""
        upper_back = (420.0, 220.0, 620.0, 420.0)
        out = patrol_person_overlay_bbox(upper_back, self.FW, self.FH)
        self.assertGreater(out[3] - out[1], upper_back[3] - upper_back[1] + 80.0)


    def test_clips_crowd_box_for_snapshot(self) -> None:
        """YOLO crowd 80% khung — snapshot phải thu ≤40%."""
        from app.patrol_person_visibility import patrol_snapshot_draw_bbox

        crowd = (0.0, 80.0, 1280.0, 620.0)
        out = patrol_snapshot_draw_bbox(crowd, self.FW, self.FH)
        area = (out[2] - out[0]) * (out[3] - out[1]) / (self.FW * self.FH)
        self.assertLessEqual(area, 0.40)

    def test_snapshot_shrink_keeps_head(self) -> None:
        """Người gần bodycam cao hơn 55% khung — thu nhỏ không được cắt mất đầu."""
        from app.patrol_person_visibility import patrol_snapshot_draw_bbox

        # Người ngồi choán 72% chiều cao khung — trước đây bị thu quanh tâm.
        sitting = (264.0, 193.0, 711.0, 713.0)
        out = patrol_snapshot_draw_bbox(sitting, self.FW, self.FH)
        self.assertAlmostEqual(out[1], sitting[1], delta=1.0)
        self.assertLess(out[3], sitting[3])

    def test_snapshot_shrink_keeps_head_for_crowd_box(self) -> None:
        """Cả bbox crowd bị thu mạnh cũng giữ mép trên."""
        from app.patrol_person_visibility import patrol_snapshot_draw_bbox

        crowd = (0.0, 80.0, 1280.0, 620.0)
        out = patrol_snapshot_draw_bbox(crowd, self.FW, self.FH)
        self.assertAlmostEqual(out[1], crowd[1], delta=1.0)

    def test_one_jpg_per_card(self) -> None:
        """Cùng thẻ obj — ghi đè 1 file, không spam timestamp."""
        with tempfile.TemporaryDirectory() as tmp:
            db.close()
            db.DATA_DIR = Path(tmp)
            db.DB_FILE = Path(tmp) / "patrol.db"
            sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
            db.get_conn()
            sink.reset()

            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            bbox = (100.0, 80.0, 220.0, 400.0)
            p1 = sink._write_snapshot(  # noqa: SLF001
                "obj-test",
                frame,
                bbox,
                luot_key=sink.CARD_SNAPSHOT_LUOT,
                capture_ts=1_000.0,
            )
            p2 = sink._write_snapshot(  # noqa: SLF001
                "obj-test",
                frame,
                bbox,
                luot_key=sink.CARD_SNAPSHOT_LUOT,
                capture_ts=1_001.0,
            )
            self.assertEqual(p1, p2)
            self.assertTrue(p1.endswith("obj-test.jpg"))
            files = list(sink.SNAPSHOT_DIR.rglob("obj-test*.jpg"))
            self.assertEqual(len(files), 1)


if __name__ == "__main__":
    unittest.main()
