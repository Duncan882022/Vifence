"""Unit tests — patrol person upsert với frame mobile downscale."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.schemas import PpeDetection  # noqa: E402
from app.snapshot_sync import frame_scale, scale_detection  # noqa: E402


class TestPatrolMobileUpsert(unittest.TestCase):
    def test_scale_detection_maps_bbox_to_capture_frame(self):
        full = np.zeros((480, 960, 3), dtype=np.uint8)
        small = np.zeros((240, 640, 3), dtype=np.uint8)
        sx, sy = frame_scale(small, full)
        self.assertAlmostEqual(sx, 1.5)
        self.assertAlmostEqual(sy, 2.0)

        det = PpeDetection(
            behavior="person",
            label="person",
            scenario_id="PERS-001",
            confidence=0.88,
            bbox=[100.0, 50.0, 200.0, 150.0],
            subject_bbox=[90.0, 40.0, 210.0, 160.0],
            worker_id="sgc-00000006",
            worker_name="sgc-00000006",
        )
        scaled = scale_detection(det, sx, sy)
        self.assertAlmostEqual(scaled.bbox[2], det.bbox[2] * sx, places=1)
        self.assertAlmostEqual(scaled.subject_bbox[2], det.subject_bbox[2] * sx, places=1)

    def test_unscaled_bbox_stays_inside_small_not_full_frame(self):
        full = np.zeros((480, 960, 3), dtype=np.uint8)
        small = np.zeros((240, 640, 3), dtype=np.uint8)
        sx, sy = frame_scale(small, full)
        det_small = PpeDetection(
            behavior="person",
            label="person",
            scenario_id="PERS-001",
            confidence=0.88,
            bbox=[100.0, 50.0, 200.0, 150.0],
            subject_bbox=[100.0, 50.0, 200.0, 150.0],
            worker_id="sgc-00000006",
            worker_name="sgc-00000006",
        )
        scaled = scale_detection(det_small, sx, sy)
        fw, fh = full.shape[1], full.shape[0]
        # Unscaled box fits small frame but is tiny on full frame (would fail snapshot crop).
        self.assertLess(det_small.bbox[2], fw * 0.25)
        self.assertGreater(scaled.bbox[2], det_small.bbox[2])
        self.assertLessEqual(scaled.bbox[2], fw)


if __name__ == "__main__":
    unittest.main()
