"""Unit tests — chế độ bay flycam theo độ cao."""

from __future__ import annotations

import unittest

from app.patrol_flight_mode import (
    PatrolFlightMode,
    is_patrol_helmet_like,
    resolve_patrol_flight_mode,
    update_patrol_drone_altitude,
)


class PatrolFlightModeTests(unittest.TestCase):
    def setUp(self) -> None:
        from app import patrol_flight_mode as mod

        mod._altitude_state.clear()
        mod._mode_state.clear()

    def test_high_altitude_is_aerial_density_only(self) -> None:
        update_patrol_drone_altitude("DR-03", 80.0)
        self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.AERIAL)

    def test_low_altitude_is_proximity_ai(self) -> None:
        update_patrol_drone_altitude("DR-03", 18.0)
        self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.PROXIMITY)

    def test_hysteresis_between_bands(self) -> None:
        update_patrol_drone_altitude("DR-03", 18.0)
        self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.PROXIMITY)
        update_patrol_drone_altitude("DR-03", 30.0)
        self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.PROXIMITY)

    def test_helmet_like_cameras(self) -> None:
        self.assertTrue(is_patrol_helmet_like("HC-01"))
        self.assertTrue(is_patrol_helmet_like("HC-02"))
        update_patrol_drone_altitude("DR-03", 80.0)
        self.assertFalse(is_patrol_helmet_like("DR-03"))
        update_patrol_drone_altitude("DR-03", 18.0)
        self.assertTrue(is_patrol_helmet_like("DR-03"))


if __name__ == "__main__":
    unittest.main()
