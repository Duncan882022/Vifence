"""Position engine — EKF + map matching (spec §6)."""
from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_site_geometry import (  # noqa: E402
    PATROL_SITE_CENTER,
    is_point_in_site,
    snap_point_to_site,
)
from app.position_engine import HelmetPositionTracker, fuse_helmet_pose, map_match_position  # noqa: E402


class TestMapMatching(unittest.TestCase):
    def test_inside_unchanged(self):
        lat, lng = PATROL_SITE_CENTER
        out_lat, out_lng, inside = snap_point_to_site(lat, lng)
        self.assertTrue(inside)
        self.assertAlmostEqual(out_lat, lat, places=5)
        self.assertAlmostEqual(out_lng, lng, places=5)

    def test_outside_snaps_to_boundary(self):
        lat, lng = 20.95, 106.95
        self.assertFalse(is_point_in_site(lat, lng))
        out_lat, out_lng, inside = snap_point_to_site(lat, lng)
        self.assertFalse(inside)
        self.assertTrue(is_point_in_site(out_lat, out_lng))


class TestHelmetEkf(unittest.TestCase):
    def setUp(self):
        self.tracker = HelmetPositionTracker()

    def test_ekf_smooths_jitter(self):
        base_lat, base_lng = PATROL_SITE_CENTER
        d_lat = 0.5 / 111_320.0
        readings = [
            (base_lat, base_lng),
            (base_lat + d_lat, base_lng),
            (base_lat - d_lat, base_lng),
            (base_lat + d_lat * 0.5, base_lng),
        ]
        outs = []
        for i, (la, ln) in enumerate(readings):
            lat, lon, _, method = self.tracker.fuse_helmet_pose(
                "HC-02", lat=la, lon=ln, heading=90.0, ts=float(i),
            )
            self.assertIsNotNone(lat)
            self.assertIsNotNone(lon)
            outs.append((lat, lon))
            self.assertIn(method, ("ekf", "ekf_map"))
        spread_raw = max(r[0] for r in readings) - min(r[0] for r in readings)
        spread_fused = max(o[0] for o in outs) - min(o[0] for o in outs)
        self.assertLess(spread_fused, spread_raw)

    def test_imu_predict_between_gps(self):
        lat, lng = PATROL_SITE_CENTER
        self.tracker.fuse_helmet_pose("HC-02", lat=lat, lon=lng, heading=0.0, ts=0.0)
        lat2, lon2, heading, method = self.tracker.fuse_helmet_pose(
            "HC-02", heading=45.0, ts=0.02,
        )
        self.assertIsNotNone(lat2)
        self.assertIsNotNone(lon2)
        self.assertEqual(method, "imu_only")
        self.assertAlmostEqual(heading, 45.0, places=1)

    def test_map_match_helper(self):
        lat, lng = map_match_position(PATROL_SITE_CENTER[0], PATROL_SITE_CENTER[1])
        self.assertTrue(is_point_in_site(lat, lng))


class TestWorkforceIntegration(unittest.TestCase):
    def test_update_helmet_uses_ekf(self):
        from app.workforce_engine import WorkforceEngine

        eng = WorkforceEngine()
        pose = eng.update_helmet(
            "HC-02",
            lat=PATROL_SITE_CENTER[0],
            lon=PATROL_SITE_CENTER[1],
            heading=120.0,
            online=True,
        )
        self.assertIn(pose.position_method, ("ekf", "ekf_map", "map"))
        self.assertIsNotNone(pose.lat)
        self.assertIsNotNone(pose.lon)
        self.assertTrue(is_point_in_site(pose.lat, pose.lon))


if __name__ == "__main__":
    unittest.main(verbosity=2)
