"""Khẩu trang che miệng/mũi — không eligible cho tab Người / pers-*."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.worker_identity.recognizer import _assess_patrol_face_crop, _face_likely_masked  # noqa: E402


def _synthetic_face(*, masked: bool) -> np.ndarray:
    """Mặt giả: trên da, dưới da hoặc khẩu trang trắng."""
    crop = np.zeros((80, 60, 3), dtype=np.uint8)
    crop[8:32, 10:50] = (180, 160, 210)
    if masked:
        crop[34:72, 8:52] = (250, 250, 250)
    else:
        crop[34:72, 10:50] = (175, 155, 205)
    return crop


def _fake_yu_net_face(crop: np.ndarray) -> list[list[float]]:
    h, w = crop.shape[:2]
    return [[0.0, 0.0, float(w), float(h), 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.90]]


class PatrolFaceMaskTests(unittest.TestCase):
    def test_heuristic_detects_surgical_mask(self) -> None:
        self.assertTrue(_face_likely_masked(_synthetic_face(masked=True)))

    def test_unmasked_face_not_rejected(self) -> None:
        self.assertFalse(_face_likely_masked(_synthetic_face(masked=False)))

    def test_masked_crop_not_eligible_even_when_yu_net_passes(self) -> None:
        crop = _synthetic_face(masked=True)

        def _detect(_search: np.ndarray, score_threshold: float = 0.5) -> tuple[bool, np.ndarray | None]:
            _ = score_threshold
            return True, np.array(_fake_yu_net_face(_search), dtype=np.float32)

        with patch("app.worker_identity.recognizer.detect_faces", side_effect=_detect), patch(
            "app.worker_identity.recognizer.embed_aligned_face",
            return_value=np.ones(512, dtype=np.float32),
        ):
            vec, _score, eligible = _assess_patrol_face_crop(
                crop,
                camera_id="HC-02",
                selfie_mode=True,
            )
        self.assertFalse(eligible)
        self.assertIsNone(vec)


if __name__ == "__main__":
    unittest.main()
