from __future__ import annotations

import logging
from pathlib import Path

import cv2
import numpy as np

from ..schemas import Detection
from .base import BaseDetector

logger = logging.getLogger("detector")

_ONNX_PATH = Path(__file__).resolve().parent / "face_detection_yunet.onnx"

# Vùng "miệng" mở rộng từ bbox khuôn mặt (x, y, w, h do YuNet trả về) — không
# dùng thẳng bbox mặt vì tay+điếu thuốc thường nhô ra ngoài rìa mặt khi hút
# nghiêng. Các tỉ lệ dưới đây đã verify bằng ảnh thật (xem README mục "Ống
# hút/bật lửa bị nhận nhầm"): phân biệt rõ điếu thuốc thật ở miệng (pass) với
# bật lửa/vật thể nền ở xa mặt hoặc ngang tầm mắt-tóc (reject).
_MOUTH_TOP_RATIO = 0.55  # bắt đầu từ ngang mũi/miệng, KHÔNG lấy từ đỉnh đầu (tránh dính vật ngang tầm mắt/tóc)
_MOUTH_BOTTOM_EXTEND = 0.8  # kéo dài xuống dưới cằm (tay cầm điếu thuốc đưa lên từ dưới)
_MOUTH_SIDE_EXPAND = 0.4  # nới rộng 2 bên (hút nghiêng, tay lệch khỏi tâm mặt)
_FACE_SCORE_THRESHOLD = 0.5


class SmokingDetector(BaseDetector):
    """Phát hiện hành vi hút thuốc (điếu thuốc lá) — và tạm dùng chung cho vape.

    Model mặc định: Enos-123/smoking-detection (YOLOv11-Medium, 1 class
    "cigarette", mAP@0.5 ~83%). Đây là model cộng đồng train trên dataset
    Roboflow — nếu độ chính xác chưa đạt yêu cầu thực tế trên camera công
    trường, thay bằng model tự train qua biến SMOKING_MODEL_REPO /
    SMOKING_MODEL_FILE trong .env.

    Model có precision thấp: đã verify thực tế báo nhầm ống hút, bật lửa (cả
    khi tắt lẫn khi cháy), và vật thể hình chữ nhật nhỏ ở nền — với confidence
    trải dài 0.18-0.82, tức KHÔNG thể chỉ tăng ngưỡng confidence để lọc (vì
    true-positive thực tế cũng có confidence thấp tới 0.40). Giải pháp: thêm
    hậu kiểm bằng face detector (YuNet, `cv2.FaceDetectorYN`) — chỉ giữ lại
    detection nằm trong vùng miệng mở rộng của 1 khuôn mặt thật trong khung
    hình. Nếu KHÔNG detect được mặt nào (góc quay khó, thiếu sáng...), vẫn
    GIỮ NGUYÊN detection thay vì loại bỏ — tránh lặp lại lỗi false-negative đã
    gặp trước đây (yêu cầu quá chặt làm bỏ sót hút thuốc thật, xem lịch sử bên
    dưới).

    Vape (thuốc lá điện tử): chưa có model vape-detection public nào tải trực
    tiếp (.pt) được (đã tìm trên Hugging Face + Roboflow — chỉ có qua Roboflow
    Inference API cần API key riêng, hoặc dataset chưa có checkpoint). Quyết
    định tạm thời: dùng chung detector này cho vape — best-effort, không đảm
    bảo độ chính xác vì model chỉ train trên hình dáng điếu thuốc lá, không có
    mẫu vape (pod nhỏ / box mod). Xem mục "Vape" trong README.md để biết
    hướng nâng cấp khi cần độ chính xác thật.
    """

    behavior = "smoking"
    name = "smoking-yolo"

    _face_detector: "cv2.FaceDetectorYN | None" = None
    _face_detector_failed = False

    def _target_labels(self, label: str) -> bool:
        return label.lower() in {"cigarette", "smoking", "smoke"}

    @classmethod
    def _get_face_detector(cls):
        if cls._face_detector is not None or cls._face_detector_failed:
            return cls._face_detector
        try:
            cls._face_detector = cv2.FaceDetectorYN_create(
                str(_ONNX_PATH), "", (320, 320),
                score_threshold=_FACE_SCORE_THRESHOLD,
            )
        except Exception as exc:  # noqa: BLE001 - fail-open, không chặn detection chính
            cls._face_detector_failed = True
            logger.warning("[smoking] Không load được face detector (%s) — bỏ qua bước lọc theo vùng miệng.", exc)
        return cls._face_detector

    def _post_filter(self, frame: np.ndarray, detections: list[Detection]) -> list[Detection]:
        if not detections:
            return detections
        detector = self._get_face_detector()
        if detector is None:
            return detections

        h, w = frame.shape[:2]
        detector.setInputSize((w, h))
        ok, faces = detector.detect(frame)
        if faces is None or len(faces) == 0:
            return detections  # không thấy mặt nào -> không đủ căn cứ loại, giữ nguyên

        zones = [self._mouth_zone(f) for f in faces]
        return [d for d in detections if self._center_in_any_zone(d.bbox, zones)]

    @staticmethod
    def _mouth_zone(face) -> tuple[float, float, float, float]:
        x, y, fw, fh = float(face[0]), float(face[1]), float(face[2]), float(face[3])
        top = y + fh * _MOUTH_TOP_RATIO
        bottom = y + fh + fh * _MOUTH_BOTTOM_EXTEND
        side = fw * _MOUTH_SIDE_EXPAND
        return (x - side, top, x + fw + side, bottom)

    @staticmethod
    def _center_in_any_zone(bbox: list[float], zones: list[tuple[float, float, float, float]]) -> bool:
        cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
        return any(zx1 <= cx <= zx2 and zy1 <= cy <= zy2 for zx1, zy1, zx2, zy2 in zones)
