"""Unit tests — websocket_server.py payload Module 05."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.websocket_server import build_detections_ws_payload  # noqa: E402


class WebSocketPayloadTests(unittest.TestCase):
    def test_patrol_camera_normalized_bbox_and_schema(self) -> None:
        overlay = {
            "width": 1280,
            "height": 720,
            "updated_at": 1_700_000_000.0,
            "detections": [
                {
                    "behavior": "person",
                    "worker_id": "sgc-00000007",
                    "label": "person",
                    "confidence": 0.91,
                    "bbox": [640.0, 360.0, 740.0, 660.0],
                    "track_id": "PTR-00002",
                },
            ],
            "roi_zones": [],
            "metrics": {"person_count": 1},
        }
        payload = build_detections_ws_payload(
            "HC-01",
            overlay,
            stream_online=True,
            revision=3,
        )
        self.assertEqual(payload["type"], "detections")
        self.assertEqual(payload["camera_id"], "HC-01")
        self.assertEqual(payload["status"], "online")
        self.assertEqual(payload["total_workers"], 1)
        self.assertTrue(payload["reset_state"])
        self.assertEqual(payload["revision"], 3)
        det = payload["detections"][0]
        self.assertEqual(det["id"], "sgc-00000007")
        self.assertAlmostEqual(det["bbox"][0], 0.5, places=2)

    def test_non_patrol_keeps_raw_detections(self) -> None:
        overlay = {
            "width": 1024,
            "height": 768,
            "updated_at": 100.0,
            "detections": [{"behavior": "no_helmet", "bbox": [1, 2, 3, 4], "confidence": 0.8}],
            "roi_zones": [],
            "metrics": {},
        }
        payload = build_detections_ws_payload("A-03", overlay, stream_online=True)
        self.assertEqual(payload["detections"][0]["bbox"], [1, 2, 3, 4])


if __name__ == "__main__":
    unittest.main()
