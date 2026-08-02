from __future__ import annotations

import threading
from pathlib import Path

import cv2
import numpy as np

_LOCK = threading.Lock()
_ONNX_PATH = str(Path(__file__).resolve().parent / "face_detection_yunet.onnx")
_detector: cv2.FaceDetectorYN | None = None
_detector_failed = False


def detect_faces(frame: np.ndarray, *, score_threshold: float = 0.5):
    """Gọi YuNet an toàn giữa luồng mobile HTTP và luồng camera local."""
    global _detector, _detector_failed  # noqa: PLW0603
    if _detector_failed:
        return False, None
    if _detector is None:
        try:
            _detector = cv2.FaceDetectorYN_create(
                _ONNX_PATH, "", (320, 320), score_threshold=score_threshold,
            )
        except Exception:  # noqa: BLE001
            _detector_failed = True
            return False, None

    h, w = frame.shape[:2]
    with _LOCK:
        _detector.setInputSize((w, h))
        return _detector.detect(frame)
