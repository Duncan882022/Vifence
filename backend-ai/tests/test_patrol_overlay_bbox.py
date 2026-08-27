"""Patrol overlay bbox — YOLO thô, không cắt chân PPE."""

from __future__ import annotations

import unittest

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


if __name__ == "__main__":
    unittest.main()
