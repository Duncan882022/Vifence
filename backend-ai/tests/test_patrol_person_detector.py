"""Regression — person detector singleton + patrol frame không crash."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class PatrolPersonDetectorTests(unittest.TestCase):
    def test_ppe_analyzer_person_detector_global(self) -> None:
        import app.ppe_analyzer as ppe

        ppe._person_detector = None
        mock_det = MagicMock()
        with patch.object(ppe, "PersonDetector", return_value=mock_det):
            d1 = ppe._get_person_detector()
            d2 = ppe._get_person_detector()
        self.assertIs(d1, d2)
        mock_det.load.assert_called_once()

    def test_person_analyzer_own_detector(self) -> None:
        import app.patrol.person_analyzer as pa

        pa._person_detector = None
        mock_det = MagicMock()
        mock_det.predict.return_value = []
        with patch.object(pa, "PersonDetector", return_value=mock_det):
            d1 = pa._get_person_detector()
            d2 = pa._get_person_detector()
        self.assertIs(d1, d2)
        mock_det.load.assert_called_once()

    def test_analyze_patrol_frame_hc01_no_crash(self) -> None:
        from app.patrol_engine import analyze_patrol_frame

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        mock_det = MagicMock()
        mock_det.predict.return_value = []
        with patch(
            "app.patrol.person_analyzer._get_person_detector",
            return_value=mock_det,
        ):
            result = analyze_patrol_frame(frame, "HC-01")
        self.assertIn("detections", result)
        self.assertIsInstance(result["detections"], list)

    def test_assign_track_ids_egomotion_import(self) -> None:
        from app.patrol.person_analyzer import assign_patrol_track_ids

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        mock_det = MagicMock()
        with patch(
            "app.patrol.person_analyzer._get_person_detector",
            return_value=mock_det,
        ):
            ids = assign_patrol_track_ids(
                "HC-01",
                [((10.0, 10.0, 100.0, 200.0), 0.9)],
                frame=frame,
            )
        self.assertEqual(len(ids), 1)


    def test_analyze_patrol_frame_with_person_detection(self) -> None:
        from app.patrol_engine import analyze_patrol_frame

        frame = __import__("numpy").random.randint(0, 255, (720, 1280, 3), dtype=__import__("numpy").uint8)
        mock_box = MagicMock()
        mock_box.bbox = (400, 100, 600, 500)
        mock_box.confidence = 0.85
        mock_det = MagicMock()
        mock_det.predict.return_value = [mock_box]
        with patch(
            "app.patrol.person_analyzer._get_person_detector",
            return_value=mock_det,
        ):
            result = analyze_patrol_frame(frame, "HC-01")
        self.assertEqual(len(result.get("detections") or []), 1)
        self.assertGreaterEqual(int(result.get("metrics", {}).get("display_person_count") or 0), 1)


if __name__ == "__main__":
    unittest.main()
