"""Peak time — đám đông: chỉ lượt gặp trừ khi mặt rõ."""

from __future__ import annotations

import unittest

from app.config import settings
from app.patrol.peak_time import (
    is_peak_time,
    peak_identity_allowed,
    reset_peak_time,
    update_peak_time_density,
)


class PatrolPeakTimeTest(unittest.TestCase):
    def setUp(self) -> None:
        reset_peak_time()
        self._prev = settings.patrol_peak_time_enabled
        settings.patrol_peak_time_enabled = True

    def tearDown(self) -> None:
        settings.patrol_peak_time_enabled = self._prev
        reset_peak_time()

    def test_enter_at_20_exit_at_15_hysteresis(self) -> None:
        self.assertFalse(update_peak_time_density("HC-01", 19))
        self.assertTrue(update_peak_time_density("HC-01", 20))
        self.assertTrue(is_peak_time("HC-01"))
        self.assertTrue(update_peak_time_density("HC-01", 18))
        self.assertTrue(is_peak_time("HC-01"))
        self.assertFalse(update_peak_time_density("HC-01", 15))
        self.assertFalse(is_peak_time("HC-01"))

    def test_peak_identity_requires_face_score(self) -> None:
        self.assertFalse(
            peak_identity_allowed(face_eligible=False, face_quality=0.9, confidence=0.9),
        )
        self.assertFalse(
            peak_identity_allowed(face_eligible=True, face_quality=0.2, confidence=0.2),
        )
        self.assertTrue(
            peak_identity_allowed(face_eligible=True, face_quality=0.8, confidence=0.9),
        )


if __name__ == "__main__":
    unittest.main()
