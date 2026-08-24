"""Unit tests — patrol upper-body visibility gate."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_person_visibility import upper_body_third_with_head_visible  # noqa: E402


class TestPatrolPersonVisibility(unittest.TestCase):
    def test_full_upper_body_passes(self):
        fw, fh = 1280, 720
        bbox = (fw * 0.40, fh * 0.20, fw * 0.60, fh * 0.55)
        self.assertTrue(upper_body_third_with_head_visible(bbox, fw, fh))

    def test_legs_only_fails(self):
        fw, fh = 1280, 720
        bbox = (fw * 0.45, fh * 0.80, fw * 0.52, fh * 0.92)
        self.assertFalse(upper_body_third_with_head_visible(bbox, fw, fh))

    def test_head_cropped_fails(self):
        fw, fh = 1280, 720
        # Bbox kéo lên trên — đầu nằm ngoài khung
        bbox = (fw * 0.42, -fh * 0.15, fw * 0.58, fh * 0.45)
        self.assertFalse(upper_body_third_with_head_visible(bbox, fw, fh))


if __name__ == "__main__":
    unittest.main()
