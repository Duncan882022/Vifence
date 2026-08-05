from __future__ import annotations

import cv2
import numpy as np

from ..schemas import Detection
from .base import BaseDetector

# Dải màu HSV của da người (chấp nhận nhiều tông da). Đây là nguyên nhân
# false-positive phổ biến nhất của model fire/smoke tổng quát: da người dưới
# ánh đèn vàng/ấm rất giống màu lửa (cam/đỏ, độ bão hoà trung bình).
_SKIN_HSV_LOWER = np.array([0, 30, 60], dtype=np.uint8)
_SKIN_HSV_UPPER = np.array([25, 170, 255], dtype=np.uint8)
_MAX_SKIN_RATIO = 0.32  # bbox có > 32% diện tích là da -> coi là false-positive

# Đèn trần/ánh sáng hắt qua cửa (bóng đèn trắng/vàng nhạt) là nguồn false-
# positive khác của nhãn "fire": rất sáng (V cao) nhưng gần như KHÔNG màu
# (S thấp) vì là ánh sáng trắng/vàng nhạt, khác lửa thật luôn có màu cam/vàng
# rõ rệt (S cao) dù ở vùng rìa ngoài lõi cháy trắng. Đã verify bằng ảnh thật:
# 1 sự kiện báo nhầm đèn hành lang có chỉ 10.9% pixel bbox đạt S>=50, trong
# khi lửa bật lửa thật cùng điều kiện đạt 87%. CHỈ áp dụng cho nhãn "fire" —
# không áp dụng cho "smoke" vì khói thật vốn dĩ xám/trắng, ít bão hoà màu.
_MIN_FIRE_SATURATION_RATIO = 0.48
_SATURATION_THRESHOLD = 58


class FireDetector(BaseDetector):
    """Phát hiện dấu hiệu cháy nổ (lửa + khói).

    Model mặc định: SalahALHaismawi/yolov26-fire-detection (YOLOv26-S, 3 class:
    fire, smoke, other). Đã thử rabahdev/fire-smoke-yolov8n (D-Fire) trước đó
    nhưng model đó gần như không nhận ra lửa bật lửa thường cỡ nhỏ cận cảnh
    (confidence thực đo chỉ ~0.10-0.15 dù lửa hiện rõ trong khung hình — model
    train chủ yếu trên lửa/khói quy mô lớn). Model YOLOv26 bắt lửa nhỏ tốt hơn
    hẳn (đo thực tế 0.4-0.75 với cùng cảnh) nhờ có thêm class "other" riêng để
    hứng vùng màu giống lửa (da người dưới đèn ấm, ánh sáng vàng...) thay vì
    nhét chung vào "fire".

    Dù vậy vẫn giữ thêm lớp phòng vệ: sau khi có bbox, kiểm tra tỉ lệ pixel màu
    da bên trong bbox — nếu quá cao thì loại bỏ detection đó thay vì báo động
    giả (phòng trường hợp model mới cũng lệch trong điều kiện ánh sáng khác).
    """

    behavior = "fire"
    name = "fire-yolo"

    def _target_labels(self, label: str) -> bool:
        return label.lower() in {"fire", "smoke"}

    def _post_filter(self, frame: np.ndarray, detections: list[Detection]) -> list[Detection]:
        filtered = []
        for d in detections:
            if self._skin_ratio(frame, d.bbox) > _MAX_SKIN_RATIO:
                continue
            if d.label.lower() == "fire" and self._saturation_ratio(frame, d.bbox) < _MIN_FIRE_SATURATION_RATIO:
                continue  # sáng nhưng gần như không màu -> đèn/ánh sáng trắng, không phải lửa
            filtered.append(d)
        return filtered

    @staticmethod
    def _crop_hsv(frame: np.ndarray, bbox: list[float]) -> np.ndarray | None:
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in bbox]
        x1, y1 = max(x1, 0), max(y1, 0)
        x2, y2 = min(x2, w), min(y2, h)
        if x2 <= x1 or y2 <= y1:
            return None
        roi = frame[y1:y2, x1:x2]
        return cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

    @classmethod
    def _skin_ratio(cls, frame: np.ndarray, bbox: list[float]) -> float:
        hsv = cls._crop_hsv(frame, bbox)
        if hsv is None:
            return 0.0
        mask = cv2.inRange(hsv, _SKIN_HSV_LOWER, _SKIN_HSV_UPPER)
        return float(cv2.countNonZero(mask)) / mask.size

    @classmethod
    def _saturation_ratio(cls, frame: np.ndarray, bbox: list[float]) -> float:
        hsv = cls._crop_hsv(frame, bbox)
        if hsv is None:
            return 1.0  # bbox rỗng -> không loại vì lý do màu sắc
        saturated = hsv[:, :, 1] >= _SATURATION_THRESHOLD
        return float(saturated.mean())
