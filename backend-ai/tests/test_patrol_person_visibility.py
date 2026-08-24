"""Unit tests — patrol upper-body visibility gate."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_person_visibility import (
    legs_only_person_box,
    patrol_person_meets_detection_gate,
    resolve_patrol_person_snapshot_bbox,
    upper_body_third_with_head_visible,
    _is_edge_sliver_person_box,
)  # noqa: E402


class TestPatrolPersonVisibility(unittest.TestCase):
    def test_full_upper_body_passes(self):
        fw, fh = 1280, 720
        bbox = (fw * 0.40, fh * 0.20, fw * 0.60, fh * 0.55)
        self.assertTrue(upper_body_third_with_head_visible(bbox, fw, fh))

    def test_legs_only_fails(self):
        fw, fh = 1280, 720
        bbox = (fw * 0.45, fh * 0.80, fw * 0.52, fh * 0.92)
        self.assertTrue(legs_only_person_box(bbox, fw, fh))
        self.assertFalse(upper_body_third_with_head_visible(bbox, fw, fh))
        self.assertFalse(patrol_person_meets_detection_gate(bbox, fw, fh))

    def test_feet_at_bottom_fails(self):
        fw, fh = 1280, 720
        feet = (fw * 0.30, fh * 0.58, fw * 0.72, fh * 0.96)
        self.assertTrue(legs_only_person_box(feet, fw, fh))
        self.assertIsNone(
            resolve_patrol_person_snapshot_bbox(None, feet, fw, fh, camera_id="HC-02"),
        )

    def test_head_cropped_fails(self):
        fw, fh = 1280, 720
        bbox = (fw * 0.42, -fh * 0.15, fw * 0.58, fh * 0.45)
        self.assertFalse(upper_body_third_with_head_visible(bbox, fw, fh))

    def test_face_dominant_bypasses_upper_body(self):
        fw, fh = 1280, 720
        close = (fw * 0.20, fh * 0.10, fw * 0.80, fh * 0.70)
        self.assertTrue(
            patrol_person_meets_detection_gate(
                close, fw, fh, face_dominant=True,
            )
        )

    def test_narrow_strip_fails(self):
        fw, fh = 1280, 720
        strip = (fw * 0.02, fh * 0.15, fw * 0.05, fh * 0.55)
        self.assertFalse(patrol_person_meets_detection_gate(strip, fw, fh))

    def test_edge_hand_sliver_rejects_snapshot(self):
        fw, fh = 1280, 720
        hand_corner = (1012.0, 3.0, 1279.0, 283.0)
        self.assertTrue(_is_edge_sliver_person_box(hand_corner, fw, fh))
        self.assertIsNone(
            resolve_patrol_person_snapshot_bbox(
                None, hand_corner, fw, fh, camera_id="HC-02",
            ),
        )

    def test_upper_body_crop_height_threshold(self):
        fw, fh = 1280, 720
        bbox = (fw * 0.40, fh * 0.20, fw * 0.60, fh * 0.55)
        ph = bbox[3] - bbox[1]
        upper_h = ph * 0.38
        self.assertGreaterEqual(upper_h, fh * 0.10)
        self.assertTrue(upper_body_third_with_head_visible(bbox, fw, fh))


if __name__ == "__main__":
    unittest.main()
