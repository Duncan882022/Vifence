"""Live bundle — stream datetime + GPS metadata."""

from __future__ import annotations

import re
import unittest
from unittest.mock import MagicMock, patch

from app.patrol_runtime import (
    build_patrol_gps_bundle,
    build_patrol_live_bundle_payload,
    build_patrol_stream_meta,
    format_vn_datetime,
    update_patrol_gps,
)


class PatrolLiveBundleMetaTests(unittest.TestCase):
    def test_format_vn_datetime(self) -> None:
        # 2026-09-01 08:30:45 UTC = 15:30:45 VN (+7)
        text = format_vn_datetime(1756715445.0)
        self.assertRegex(text, r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$")
        self.assertIn("15:30:45", text)

    def test_build_patrol_stream_meta(self) -> None:
        meta = build_patrol_stream_meta(1756715445.0)
        self.assertEqual(meta["timestamp"], 1756715445.0)
        self.assertRegex(meta["datetime_vn"], r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$")
        self.assertRegex(meta["server_time"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$")

    def test_build_patrol_gps_bundle(self) -> None:
        update_patrol_gps("HC-02", 21.0285, 105.8542, heading=90.0)
        bundle = build_patrol_gps_bundle(["HC-02"])
        row = bundle["HC-02"]
        self.assertIsNotNone(row["gps_lat"])
        self.assertIsNotNone(row["gps_lng"])
        self.assertEqual(row["heading"], 90.0)
        self.assertIsNotNone(row["updated_at"])
        self.assertRegex(str(row["datetime_vn"]), r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$")

    @patch("app.patrol_runtime.merge_workforce_snapshots")
    @patch("app.patrol_runtime.build_patrol_aggregate_metrics_payload")
    @patch("app.patrol_runtime.apply_vms_stream_online")
    def test_live_bundle_payload_includes_stream_and_gps(
        self,
        mock_apply_vms,
        mock_metrics,
        mock_workforce,
    ) -> None:
        mock_metrics.return_value = {
            "cameras": [
                {
                    "camera_id": "HC-02",
                    "stream_online": True,
                    "person_count": 1,
                    "identified_workers": 0,
                    "person_events_today": 0,
                    "gps_lat": 21.0,
                    "gps_lng": 105.0,
                    "heading": 45.0,
                },
            ],
            "backend_reachable": True,
            "stream_online": True,
            "person_count": 1,
            "identified_workers": 0,
            "worker_names": [],
            "person_events_today": 0,
        }
        mock_apply_vms.side_effect = lambda m, _w: m
        mock_workforce.return_value = {
            "helmets": {},
            "objects": {},
            "zonePopulation": {},
            "heatPoints": [],
            "events": [],
            "server_time": "2026-09-01T15:30:45+07:00",
        }
        update_patrol_gps("HC-02", 21.0285, 105.8542, heading=45.0)

        payload = build_patrol_live_bundle_payload(
            ["HC-02"],
            store=MagicMock(),
            vms_workers={},
        )

        self.assertTrue(payload["ok"])
        self.assertIn("stream", payload)
        self.assertRegex(payload["stream"]["datetime_vn"], r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$")
        self.assertIn("gps", payload)
        self.assertIn("HC-02", payload["gps"])
        self.assertIsNotNone(payload["gps"]["HC-02"]["gps_lat"])
        self.assertEqual(payload["gps"]["HC-02"]["heading"], 45.0)
        self.assertIsNotNone(payload["server_time"])


if __name__ == "__main__":
    unittest.main()
