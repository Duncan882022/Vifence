"""Unit tests — ai_engine NMS + config."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ai_engine import _nms_person_boxes, person_infer_config  # noqa: E402


class AiEngineConfigTests(unittest.TestCase):
    def test_default_imgsz_and_thresholds(self) -> None:
        cfg = person_infer_config()
        self.assertEqual(cfg.imgsz, 1280)
        self.assertAlmostEqual(cfg.conf_threshold, 0.12)
        self.assertAlmostEqual(cfg.iou_threshold, 0.5)
        self.assertGreaterEqual(cfg.max_det, 80)
        self.assertTrue(cfg.letterbox)


class AiEngineNmsTests(unittest.TestCase):
    def test_nms_keeps_two_separated_people(self) -> None:
        boxes = [
            ([100.0, 100.0, 200.0, 400.0], 0.8),
            ([520.0, 110.0, 620.0, 410.0], 0.75),
        ]
        kept = _nms_person_boxes(boxes, iou_threshold=0.5)
        self.assertEqual(len(kept), 2)

    def test_nms_merges_duplicate_same_person(self) -> None:
        boxes = [
            ([100.0, 100.0, 200.0, 400.0], 0.82),
            ([105.0, 102.0, 198.0, 398.0], 0.76),
        ]
        kept = _nms_person_boxes(boxes, iou_threshold=0.5)
        self.assertEqual(len(kept), 1)
        self.assertAlmostEqual(kept[0][1], 0.82)


if __name__ == "__main__":
    unittest.main()
