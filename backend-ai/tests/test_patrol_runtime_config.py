"""Tests — patrol runtime config payload."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol.runtime_config import patrol_runtime_payload  # noqa: E402


class TestPatrolRuntimeConfig(unittest.TestCase):
    @patch("app.patrol.runtime_config.settings")
    def test_delay_from_settings_seconds(self, settings) -> None:
        settings.patrol_live_roi_delay_seconds = 4.5
        payload = patrol_runtime_payload()
        self.assertEqual(payload["live_roi_delay_ms"], 4500)
        self.assertEqual(payload["overlay_pipeline_lag_ms"], 4500)
        self.assertIn("server_time_ms", payload)


if __name__ == "__main__":
    unittest.main()
