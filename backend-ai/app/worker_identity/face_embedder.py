"""Embedding khuôn mặt — SFace ONNX (128-D) thay histogram độ sáng.

Histogram xám chỉ mô tả độ sáng nên hai người khác nhau dưới cùng ánh sáng cho
vector gần như trùng nhau — nguyên nhân patrol gán nhầm danh tính. SFace sinh
vector phân biệt danh tính thật, dùng chung cho gallery match và re-id sgc.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger("worker_identity.face_embedder")

SFACE_MODEL_PATH = (
    Path(__file__).resolve().parent.parent / "detectors" / "face_recognition_sface_2021dec.onnx"
)

SFACE_EMBED_DIM = 128
HISTOGRAM_EMBED_DIM = 32
_ALIGNED_SIZE = (112, 112)
_YUNET_ROW_LEN = 15

_lock = threading.Lock()
_recognizer: object | None = None
_load_failed = False


def _get_recognizer() -> object | None:
    global _recognizer, _load_failed  # noqa: PLW0603
    if _load_failed:
        return None
    if _recognizer is not None:
        return _recognizer
    with _lock:
        if _recognizer is not None:
            return _recognizer
        if not SFACE_MODEL_PATH.exists():
            _load_failed = True
            logger.warning(
                "[face_embedder] Thiếu %s — lùi về histogram (độ chính xác thấp).",
                SFACE_MODEL_PATH,
            )
            return None
        try:
            _recognizer = cv2.FaceRecognizerSF_create(str(SFACE_MODEL_PATH), "")
        except Exception:  # noqa: BLE001
            _load_failed = True
            logger.exception("[face_embedder] Không nạp được SFace")
            return None
        logger.info("[face_embedder] SFace sẵn sàng (%d-D).", SFACE_EMBED_DIM)
    return _recognizer


def is_deep_face_model_ready() -> bool:
    """True khi SFace nạp được — quyết định bộ ngưỡng similarity đang dùng."""
    return _get_recognizer() is not None


def is_deep_embedding(vec: np.ndarray | list[float] | None) -> bool:
    if vec is None:
        return False
    return len(vec) == SFACE_EMBED_DIM


def _normalize(vec: np.ndarray) -> np.ndarray | None:
    flat = np.asarray(vec, dtype=np.float64).flatten()
    norm = float(np.linalg.norm(flat))
    if norm <= 1e-9:
        return None
    return flat / norm


def _feature(aligned_bgr: np.ndarray) -> np.ndarray | None:
    recognizer = _get_recognizer()
    if recognizer is None or aligned_bgr is None or aligned_bgr.size == 0:
        return None
    try:
        with _lock:
            raw = recognizer.feature(aligned_bgr)
    except cv2.error:
        return None
    return _normalize(raw)


def embed_aligned_face(image_bgr: np.ndarray, face_row) -> np.ndarray | None:
    """Đường tốt nhất — căn mặt bằng 5 landmark YuNet trước khi trích đặc trưng."""
    recognizer = _get_recognizer()
    if recognizer is None or image_bgr is None or image_bgr.size == 0:
        return None
    row = np.asarray(face_row, dtype=np.float32).reshape(1, -1)
    if row.shape[1] < _YUNET_ROW_LEN:
        return None
    try:
        with _lock:
            aligned = recognizer.alignCrop(image_bgr, row)
    except cv2.error:
        return None
    return _feature(aligned)


def embed_face_image(image_bgr: np.ndarray) -> np.ndarray | None:
    """Ảnh đã crop quanh mặt — tự dò landmark để căn, không có thì resize thẳng."""
    if _get_recognizer() is None or image_bgr is None or image_bgr.size == 0:
        return None

    height, width = image_bgr.shape[:2]
    if height < 12 or width < 12:
        return None

    from ..detectors.face_guard import detect_faces

    ok, faces = detect_faces(image_bgr, score_threshold=0.5)
    if ok and faces is not None and len(faces) > 0:
        largest = max(faces, key=lambda row: float(row[2]) * float(row[3]))
        embedding = embed_aligned_face(image_bgr, largest)
        if embedding is not None:
            return embedding

    resized = cv2.resize(image_bgr, _ALIGNED_SIZE, interpolation=cv2.INTER_LINEAR)
    return _feature(resized)
