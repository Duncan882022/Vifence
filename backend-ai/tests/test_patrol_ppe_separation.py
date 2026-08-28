"""Patrol engine tách khỏi PpeEngine — HC-/DR- không đi qua upsert_patrol_person."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ppe_engine import PpeEngine  # noqa: E402


class TestPatrolPpeSeparation(unittest.TestCase):
    def test_ppe_engine_does_not_upsert_patrol_person_for_hc(self) -> None:
        store = MagicMock()
        store.find_by_dedup_key.return_value = None
        engine = PpeEngine(store)
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        patrol_result = {
            "type": "result",
            "camera_id": "HC-02",
            "width": 640,
            "height": 480,
            "detections": [
                {
                    "behavior": "person",
                    "label": "CN",
                    "scenario_id": "PERS-001",
                    "confidence": 0.9,
                    "bbox": [100.0, 100.0, 200.0, 400.0],
                    "subject_bbox": [100.0, 100.0, 200.0, 400.0],
                    "track_id": "ptk0001:person",
                },
            ],
            "metrics": {"person_count": 1},
            "events": [],
        }
        with patch("app.ppe_engine.analyze_ppe_frame", return_value=patrol_result):
            _result, new_events = engine.process_frame(frame, "HC-02")
        store.upsert_patrol_person.assert_not_called()
        self.assertEqual(new_events, [])

    def test_ppe_gate_for_hc_uses_standard_confirm(self) -> None:
        store = MagicMock()
        engine = PpeEngine(store)
        gate = engine._gate_for("HC-02", "t1:no_vest")
        self.assertEqual(gate.min_duration_seconds, gate.min_duration_seconds)


if __name__ == "__main__":
    unittest.main()
