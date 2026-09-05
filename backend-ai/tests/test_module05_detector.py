"""Unit tests — detector.py bbox chuẩn hoá Module 05."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.detector import (  # noqa: E402
    MODULE05_BYTETRACK_MAX_AGE,
    denormalize_bbox,
    format_module05_detection,
    format_module05_detections,
    is_normalized_bbox,
    normalize_bbox,
)


class DetectorNormalizeTests(unittest.TestCase):
    FW, FH = 1920, 1080

    def test_pixel_to_normalized(self) -> None:
        out = normalize_bbox([192.0, 108.0, 384.0, 540.0], self.FW, self.FH)
        self.assertAlmostEqual(out[0], 0.1)
        self.assertAlmostEqual(out[1], 0.1)
        self.assertAlmostEqual(out[2], 0.2)
        self.assertAlmostEqual(out[3], 0.5)

    def test_roundtrip(self) -> None:
        pixel = [100.0, 50.0, 400.0, 600.0]
        norm = normalize_bbox(pixel, self.FW, self.FH)
        self.assertTrue(is_normalized_bbox(norm))
        back = denormalize_bbox(norm, self.FW, self.FH)
        self.assertAlmostEqual(back[0], pixel[0])
        self.assertAlmostEqual(back[3], pixel[3])

    def test_format_module05_detection_schema(self) -> None:
        row = {
            "behavior": "person",
            "worker_id": "sgc-00000042",
            "worker_name": "sgc-00000042",
            "label": "person",
            "confidence": 0.88,
            "bbox": [960.0, 540.0, 1060.0, 840.0],
            "track_id": "PTR-00001",
            "tier": "object",
        }
        det = format_module05_detection(row, self.FW, self.FH)
        self.assertEqual(det["id"], "sgc-00000042")
        self.assertEqual(det["label"], "person")
        self.assertAlmostEqual(det["confidence"], 0.88)
        self.assertTrue(is_normalized_bbox(det["bbox"]))
        self.assertEqual(det["track_id"], "PTR-00001")

    def test_format_list_filters_non_person(self) -> None:
        rows = format_module05_detections(
            [
                {"behavior": "person", "bbox": [0, 0, 10, 10], "confidence": 0.5, "worker_id": "sgc-1"},
                {"behavior": "hard_hat", "bbox": [0, 0, 10, 10], "confidence": 0.9},
            ],
            100,
            100,
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], "sgc-1")

    def test_bytetrack_max_age_constant(self) -> None:
        self.assertEqual(MODULE05_BYTETRACK_MAX_AGE, 5)

    def test_track_id_not_used_as_worker_id(self) -> None:
        row = {
            "behavior": "person",
            "track_id": "ptk0007:person",
            "worker_id": "",
            "confidence": 0.75,
            "bbox": [100.0, 100.0, 200.0, 400.0],
        }
        det = format_module05_detection(row, self.FW, self.FH)
        self.assertEqual(det["worker_id"], "")
        self.assertEqual(det["id"], "")

    def test_worker_id_preserved_over_track_id(self) -> None:
        row = {
            "behavior": "person",
            "track_id": "ptk0007:person",
            "worker_id": "sgc-00000042",
            "confidence": 0.75,
            "bbox": [100.0, 100.0, 200.0, 400.0],
        }
        det = format_module05_detection(row, self.FW, self.FH)
        self.assertEqual(det["worker_id"], "sgc-00000042")
        self.assertEqual(det["track_id"], "ptk0007:person")

    def test_format_preserves_uptier_fields_for_roi(self) -> None:
        row = {
            "behavior": "person",
            "worker_id": "tk-00000430",
            "confidence": 0.82,
            "bbox": [100.0, 100.0, 200.0, 400.0],
            "track_id": "ptk0001",
            "tier": "person",
            "face_eligible": True,
            "promoted_from_object": True,
            "promoted_from": ["obj-20260904-0002"],
            "peak_group": True,
            "peak_group_index": 2,
            "peak_group_size": 5,
        }
        det = format_module05_detection(row, self.FW, self.FH)
        self.assertTrue(det["face_eligible"])
        self.assertTrue(det["promoted_from_object"])
        self.assertEqual(det["promoted_from"], ["obj-20260904-0002"])
        self.assertTrue(det["peak_group"])
        self.assertEqual(det["peak_group_index"], 2)
        self.assertEqual(det["peak_group_size"], 5)


if __name__ == "__main__":
    unittest.main()
