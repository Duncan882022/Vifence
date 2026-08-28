"""Unit tests — flycam DR-* person filter (góc cao, người nhỏ)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ppe_analyzer import (  # noqa: E402
    _PERSON_CONF_FLYCAM,
    _filter_persons,
    _is_patrol_flycam,
    _plausible_flycam_aerial,
    _plausible_person_box,
)


class TestPatrolFlycamDetection(unittest.TestCase):
    def test_is_patrol_flycam(self):
        self.assertTrue(_is_patrol_flycam("DR-03"))
        self.assertFalse(_is_patrol_flycam("HC-01"))

    def test_tiny_aerial_person_passes(self):
        fw, fh = 1280, 720
        # ~1.5% chiều cao khung — điển hình drone bay cao
        bbox = (fw * 0.49, fh * 0.40, fw * 0.51, fh * 0.415)
        self.assertTrue(_plausible_flycam_aerial(bbox, fw, fh))
        self.assertTrue(
            _plausible_person_box(bbox, fw, fh, flycam=True),
        )

    def test_large_person_passes_both_gates(self):
        fw, fh = 1280, 720
        bbox = (fw * 0.40, fh * 0.20, fw * 0.55, fh * 0.55)
        self.assertTrue(_plausible_person_box(bbox, fw, fh, flycam=True))
        self.assertTrue(_plausible_person_box(bbox, fw, fh, flycam=False))

    def test_filter_persons_accepts_low_conf_flycam(self):
        import numpy as np

        fw, fh = 1280, 720
        frame = np.zeros((fh, fw, 3), dtype=np.uint8)
        bbox = (fw * 0.49, fh * 0.40, fw * 0.51, fh * 0.415)

        class FakeDet:
            def __init__(self, conf: float):
                self.confidence = conf
                self.bbox = list(bbox)

        persons = _filter_persons(
            frame,
            "DR-03",
            [FakeDet(_PERSON_CONF_FLYCAM + 0.02)],
            strict=False,
            min_conf=_PERSON_CONF_FLYCAM,
        )
        self.assertEqual(len(persons), 1)

    def test_flycam_skips_face_assessment(self):
        import numpy as np
        from app.worker_identity.recognizer import assess_patrol_face

        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        bbox = [640.0, 360.0, 680.0, 400.0]
        vec, score, eligible = assess_patrol_face(frame, bbox, camera_id="DR-03")
        self.assertIsNone(vec)
        self.assertEqual(score, 0.0)
        self.assertFalse(eligible)


if __name__ == "__main__":
    unittest.main()
