"""GPS tuần tra — neo tâm công trường + delta thiết bị."""
from __future__ import annotations

import unittest

from app.patrol_gps_sim import (
    map_patrol_device_gps_to_site,
    patrol_site_center_fallback,
    reset_patrol_gps_anchors,
)
from app.patrol_site_geometry import PATROL_SITE_CENTER, is_point_in_site


class PatrolGpsSimTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_patrol_gps_anchors()

    def test_first_fix_anchors_at_site_center(self) -> None:
        lat, lng = map_patrol_device_gps_to_site("HC-01", 21.0285, 105.8542)
        self.assertEqual((lat, lng), PATROL_SITE_CENTER)

    def test_delta_moves_inside_site(self) -> None:
        map_patrol_device_gps_to_site("HC-01", 21.0285, 105.8542)
        lat, lng = map_patrol_device_gps_to_site("HC-01", 21.02852, 105.85425)
        self.assertTrue(is_point_in_site(lat, lng))
        self.assertNotEqual((lat, lng), PATROL_SITE_CENTER)

    def test_each_camera_has_own_anchor(self) -> None:
        map_patrol_device_gps_to_site("HC-01", 21.0285, 105.8542)
        map_patrol_device_gps_to_site("HC-02", 21.0300, 105.8600)
        lat1, lng1 = map_patrol_device_gps_to_site("HC-01", 21.02855, 105.8543)
        lat2, lng2 = map_patrol_device_gps_to_site("HC-02", 21.03005, 105.86005)
        self.assertTrue(is_point_in_site(lat1, lng1))
        self.assertTrue(is_point_in_site(lat2, lng2))

    def test_site_center_fallback(self) -> None:
        self.assertEqual(patrol_site_center_fallback(), PATROL_SITE_CENTER)


if __name__ == "__main__":
    unittest.main()
