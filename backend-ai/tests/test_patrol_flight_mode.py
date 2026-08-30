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
        mod._visual_scale_state.clear()

    def test_high_altitude_is_aerial_density_only(self) -> None:
        update_patrol_drone_altitude("DR-03", 80.0)
        self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.AERIAL)

    def test_low_altitude_is_proximity_ai(self) -> None:
        update_patrol_drone_altitude("DR-03", 4.5)
        self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.PROXIMITY)

    def test_hysteresis_between_bands(self) -> None:
        update_patrol_drone_altitude("DR-03", 4.0)
        self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.PROXIMITY)
        update_patrol_drone_altitude("DR-03", 5.5)
        self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.PROXIMITY)

    def test_above_6m_is_aerial(self) -> None:
        update_patrol_drone_altitude("DR-03", 7.0)
        self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.AERIAL)

    def test_helmet_like_cameras(self) -> None:
        self.assertTrue(is_patrol_helmet_like("HC-01"))
        self.assertTrue(is_patrol_helmet_like("HC-02"))
        update_patrol_drone_altitude("DR-03", 80.0)
        self.assertFalse(is_patrol_helmet_like("DR-03"))
        update_patrol_drone_altitude("DR-03", 4.0)
        self.assertTrue(is_patrol_helmet_like("DR-03"))

    def test_visual_scale_infers_proximity_without_telemetry(self) -> None:
        from app.patrol_flight_mode import note_patrol_flycam_visual_scale

        fw, fh = 1280, 720
        # Người ~8% chiều cao khung — điển hình drone bay thấp.
        large = (fw * 0.42, fh * 0.35, fw * 0.58, fh * 0.43)
        note_patrol_flycam_visual_scale("DR-03", [large], fh)
        self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.PROXIMITY)

    def test_visual_scale_tiny_person_stays_aerial(self) -> None:
        from app.patrol_flight_mode import note_patrol_flycam_visual_scale

        fw, fh = 1280, 720
        tiny = (fw * 0.49, fh * 0.40, fw * 0.51, fh * 0.415)
        note_patrol_flycam_visual_scale("DR-03", [tiny], fh)
        self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.AERIAL)

    def test_altitude_override_defaults_proximity_without_telemetry(self) -> None:
        from unittest.mock import patch

        with patch("app.patrol_flight_mode.settings") as mock_settings:
            mock_settings.patrol_flycam_proximity_max_m = 5.0
            mock_settings.patrol_flycam_aerial_min_m = 6.0
            mock_settings.patrol_drone_altitude_ttl_sec = 45.0
            mock_settings.patrol_drone_altitude_overrides = "DR-03:3"
            mock_settings.patrol_drone_default_altitude_m = None
            self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.PROXIMITY)

    def test_live_telemetry_overrides_static_default(self) -> None:
        from unittest.mock import patch

        with patch("app.patrol_flight_mode.settings") as mock_settings:
            mock_settings.patrol_flycam_proximity_max_m = 5.0
            mock_settings.patrol_flycam_aerial_min_m = 6.0
            mock_settings.patrol_drone_altitude_ttl_sec = 45.0
            mock_settings.patrol_drone_altitude_overrides = "DR-03:3"
            mock_settings.patrol_drone_default_altitude_m = None
            self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.PROXIMITY)
            update_patrol_drone_altitude("DR-03", 80.0)
            self.assertEqual(resolve_patrol_flight_mode("DR-03"), PatrolFlightMode.AERIAL)


if __name__ == "__main__":
    unittest.main()
