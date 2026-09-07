"""Lọc ROI person FP trên xe máy đỗ — HC-01 bodycam."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_person_visibility import (  # noqa: E402
    motorcycle_seat_like_fp_box,
    patrol_object_commit_allowed,
    patrol_person_meets_display_gate,
    person_box_likely_rider_on_vehicle,
    person_box_overlaps_vehicle_fp,
)

FW, FH = 1280, 720


def _box(x1f: float, y1f: float, x2f: float, y2f: float):
    return (FW * x1f, FH * y1f, FW * x2f, FH * y2f)


class TestMotorcycleSeatHeuristic(unittest.TestCase):
    def test_horizontal_bike_seat_is_fp(self):
        seat = _box(0.35, 0.52, 0.58, 0.68)
        self.assertTrue(motorcycle_seat_like_fp_box(seat, FW, FH))
        self.assertFalse(patrol_person_meets_display_gate(seat, FW, FH))

    def test_parked_motorcycle_row_is_fp(self):
        """HC-01 live obj-0014/0015 — YOLO person trên xe đỗ."""
        from app.patrol_person_visibility import (
            parked_motorcycle_row_fp_box,
            patrol_object_commit_allowed,
            upper_canopy_fp_box,
        )

        w, h = 960, 540
        moto_a = (461.0, 134.0, 531.0, 284.0)
        moto_b = (463.0, 139.0, 536.0, 295.0)
        tree = (241.0, 89.0, 327.0, 241.0)
        self.assertTrue(parked_motorcycle_row_fp_box(moto_a, w, h))
        self.assertTrue(parked_motorcycle_row_fp_box(moto_b, w, h))
        self.assertFalse(patrol_object_commit_allowed(moto_a, w, h))
        self.assertFalse(patrol_object_commit_allowed(moto_b, w, h))
        self.assertTrue(upper_canopy_fp_box(tree, w, h))
        self.assertFalse(patrol_object_commit_allowed(tree, w, h))

    def test_standing_person_not_fp(self):
        person = _box(0.40, 0.20, 0.58, 0.72)
        self.assertFalse(motorcycle_seat_like_fp_box(person, FW, FH))
        self.assertTrue(patrol_person_meets_display_gate(person, FW, FH))

    def test_seated_person_on_chair_not_fp(self):
        seated = _box(0.38, 0.55, 0.62, 0.88)
        self.assertFalse(motorcycle_seat_like_fp_box(seated, FW, FH))
        self.assertTrue(patrol_person_meets_display_gate(seated, FW, FH))


class TestVehicleOverlapFilter(unittest.TestCase):
    def test_person_on_seat_inside_motorcycle_box_rejected(self):
        motorcycle = _box(0.30, 0.45, 0.70, 0.75)
        seat_fp = _box(0.38, 0.52, 0.58, 0.68)
        self.assertFalse(person_box_likely_rider_on_vehicle(seat_fp, motorcycle))
        self.assertTrue(
            person_box_overlaps_vehicle_fp(seat_fp, [motorcycle], FW, FH),
        )
        self.assertFalse(
            patrol_person_meets_display_gate(
                seat_fp, FW, FH, vehicle_boxes=[motorcycle],
            ),
        )

    def test_rider_with_tall_box_kept(self):
        motorcycle = _box(0.30, 0.50, 0.65, 0.82)
        rider = _box(0.42, 0.22, 0.58, 0.68)
        self.assertTrue(person_box_likely_rider_on_vehicle(rider, motorcycle))
        self.assertFalse(
            person_box_overlaps_vehicle_fp(rider, [motorcycle], FW, FH),
        )
        self.assertTrue(
            patrol_person_meets_display_gate(
                rider, FW, FH, vehicle_boxes=[motorcycle],
            ),
        )


class TestObjectCommitVehicleGate(unittest.TestCase):
    """Ghi thẻ obj-* — không bypass lọc xe khi face_eligible (pseudo-face trên xe)."""

    def test_seat_on_motorcycle_rejected_even_with_face_eligible(self):
        motorcycle = _box(0.30, 0.45, 0.70, 0.75)
        seat_fp = _box(0.38, 0.52, 0.58, 0.68)
        self.assertFalse(
            patrol_object_commit_allowed(
                seat_fp,
                FW,
                FH,
                face_eligible=True,
                vehicle_boxes=[motorcycle],
            ),
        )

    def test_standing_person_commit_allowed(self):
        person = _box(0.40, 0.20, 0.58, 0.72)
        self.assertTrue(
            patrol_object_commit_allowed(person, FW, FH, face_eligible=False),
        )


if __name__ == "__main__":
    unittest.main()
