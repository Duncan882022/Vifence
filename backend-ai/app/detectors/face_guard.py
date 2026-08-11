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


def face_boxes_from_frame(
    frame: np.ndarray,
    *,
    score_threshold: float = 0.45,
) -> list[tuple[float, float, float, float]]:
    """Trả bbox khuôn mặt (x1,y1,x2,y2) pixel — dùng seed/collector auto-train."""
    ok, faces = detect_faces(frame, score_threshold=score_threshold)
    if not ok or faces is None or len(faces) == 0:
        return []
    h, w = frame.shape[:2]
    out: list[tuple[float, float, float, float]] = []
    for face in faces:
        x, y, fw, fh = float(face[0]), float(face[1]), float(face[2]), float(face[3])
        x1, y1 = max(0.0, x), max(0.0, y)
        x2, y2 = min(float(w), x + fw), min(float(h), y + fh)
        if x2 - x1 >= 8 and y2 - y1 >= 8:
            out.append((x1, y1, x2, y2))
    return out
