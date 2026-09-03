"""Quét mặt đăng ký — embed toàn khung selfie, không crop patrol live."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol.api import _embed_face_b64  # noqa: E402
from app.worker_identity.recognizer import embed_enrollment_selfie  # noqa: E402


def _fake_frame() -> np.ndarray:
    return np.zeros((480, 640, 3), dtype=np.uint8)


class PatrolEnrollmentEmbedTests(unittest.TestCase):
    def test_embed_enrollment_uses_full_frame_path(self) -> None:
        fake_vec = np.ones(128, dtype=np.float32)
        with patch(
            "app.worker_identity.face_embedder.embed_face_image",
            return_value=fake_vec,
        ) as mock_embed:
            out = embed_enrollment_selfie(_fake_frame())
        self.assertIsNotNone(out)
        mock_embed.assert_called_once()

    def test_embed_face_b64_returns_none_on_invalid(self) -> None:
        self.assertIsNone(_embed_face_b64("not-valid-b64!!!"))

    def test_embed_face_b64_delegates_to_enrollment_selfie(self) -> None:
        import base64
        import cv2

        frame = _fake_frame()
        _, buf = cv2.imencode(".jpg", frame)
        b64 = base64.b64encode(buf.tobytes()).decode("ascii")
        fake_vec = np.ones(128, dtype=np.float32)
        with patch(
            "app.worker_identity.recognizer.embed_enrollment_selfie",
            return_value=fake_vec,
        ) as mock_enroll:
            out = _embed_face_b64(b64)
        self.assertIsNotNone(out)
        self.assertEqual(len(out), 128)
        mock_enroll.assert_called_once()


if __name__ == "__main__":
    unittest.main()
