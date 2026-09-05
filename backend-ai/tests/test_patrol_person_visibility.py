"""Unit tests — patrol upper-body visibility gate."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_person_visibility import (
    legs_only_person_box,
    mid_frame_torso_sliver,
    patrol_anonymous_identity_allowed,
    patrol_object_commit_allowed,
    patrol_person_meets_detection_gate,
    patrol_person_meets_display_gate,
    resolve_patrol_person_snapshot_bbox,
    signboard_like_fp_box,
    upper_body_third_with_head_visible,
    vertical_structure_fp_box,
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

    def test_mid_body_without_head_fails(self):
        fw, fh = 1280, 720
        torso = (fw * 0.35, fh * 0.42, fw * 0.65, fh * 0.72)
        self.assertFalse(upper_body_third_with_head_visible(torso, fw, fh))

    def test_face_dominant_bypasses_upper_body(self):
        fw, fh = 1280, 720
        close = (fw * 0.20, fh * 0.10, fw * 0.80, fh * 0.70)
        self.assertTrue(
            patrol_person_meets_detection_gate(
                close, fw, fh, face_dominant=True,
            )
        )

    def test_mid_frame_torso_not_bypassed_by_face_dominant(self):
        """Bụng/đùi giữa khung rộng hơn cao — không phải cận mặt, không ghi sự kiện."""
        fw, fh = 1280, 720
        torso = (fw * 0.35, fh * 0.42, fw * 0.65, fh * 0.72)
        self.assertTrue(mid_frame_torso_sliver(torso, fh))
        self.assertFalse(
            patrol_person_meets_detection_gate(torso, fw, fh, face_dominant=True)
        )

    def test_mid_frame_torso_passes_when_face_seen(self):
        """Backend thấy mặt thật thì vẫn tính — hình học không được lấn quyền."""
        fw, fh = 1280, 720
        torso = (fw * 0.35, fh * 0.42, fw * 0.65, fh * 0.72)
        self.assertTrue(
            patrol_person_meets_detection_gate(torso, fw, fh, face_eligible=True)
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

    def test_upper_billboard_sign_rejected(self):
        fw, fh = 1280, 720
        sign = (fw * 0.15, fh * 0.05, fw * 0.85, fh * 0.28)
        self.assertTrue(signboard_like_fp_box(sign, fw, fh))
        self.assertFalse(patrol_person_meets_display_gate(sign, fw, fh))
        self.assertFalse(patrol_person_meets_detection_gate(sign, fw, fh))
        self.assertFalse(patrol_object_commit_allowed(sign, fw, fh))

    def test_side_sign_upper_frame_rejected(self):
        fw, fh = 1280, 720
        sign = (fw * 0.55, fh * 0.08, fw * 0.92, fh * 0.32)
        self.assertTrue(signboard_like_fp_box(sign, fw, fh))
        self.assertFalse(patrol_object_commit_allowed(sign, fw, fh))

    def test_standing_person_not_sign_fp(self):
        fw, fh = 1280, 720
        person = (fw * 0.40, fh * 0.20, fw * 0.60, fh * 0.55)
        self.assertFalse(signboard_like_fp_box(person, fw, fh))
        self.assertTrue(patrol_object_commit_allowed(person, fw, fh))

    def test_sign_fp_blocked_from_anonymous_identity(self):
        fw, fh = 1280, 720
        sign = (fw * 0.15, fh * 0.05, fw * 0.85, fh * 0.28)
        self.assertFalse(
            patrol_anonymous_identity_allowed(sign, fw, fh, face_quality=0.9),
        )

    def test_standing_person_allowed_anonymous_identity(self):
        fw, fh = 1280, 720
        person = (fw * 0.40, fh * 0.20, fw * 0.60, fh * 0.55)
        self.assertTrue(
            patrol_anonymous_identity_allowed(
                person, fw, fh, face_quality=0.9, face_eligible=True,
            ),
        )

    def test_partial_face_turning_allowed(self):
        fw, fh = 1280, 720
        person = (fw * 0.40, fh * 0.20, fw * 0.60, fh * 0.55)
        self.assertTrue(
            patrol_anonymous_identity_allowed(
                person, fw, fh, face_quality=0.52, face_eligible=True,
            ),
        )

    def test_utility_pedestal_edge_rejected(self):
        """Trụ/thùng điện sát mép — FP obj0077."""
        fw, fh = 1290, 658
        pole = (fw * 0.82, fh * 0.35, fw * 0.92, fh * 0.72)
        self.assertTrue(vertical_structure_fp_box(pole, fw, fh))
        self.assertFalse(patrol_object_commit_allowed(pole, fw, fh))


if __name__ == "__main__":
    unittest.main()
