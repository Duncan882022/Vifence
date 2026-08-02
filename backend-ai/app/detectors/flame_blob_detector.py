from __future__ import annotations

import logging

import cv2
import numpy as np

from ..schemas import Detection

logger = logging.getLogger("detector")

# Bước 1 — định vị: dải màu xanh dương rộng (bật lửa khò/torch lighter, mỏ
# hàn gas...). Không trùng tông da người/ánh đèn ấm nên an toàn hơn hẳn so
# với dò theo dải màu cam/đỏ (đã thử và bỏ vì dễ trùng highlight trên da).
_BLUE_LOCATE_LOWER = np.array([95, 80, 190], dtype=np.uint8)
_BLUE_LOCATE_UPPER = np.array([130, 255, 255], dtype=np.uint8)

# Bước 2 — xác nhận: bên trong vùng khoanh được, phải có đủ pixel "lõi nóng"
# gần cháy trắng (V rất cao, gần bão hoà cảm biến). Đây là điểm khác biệt cốt
# lõi giữa lửa thật và vật thể xanh dương thông thường (quần áo, đồ nhựa, máy
# tạo ẩm...): lửa có lõi cháy trắng chạm ngưỡng bão hoà camera (V gần 255),
# còn vật thể phản chiếu ánh đèn dù cùng tông xanh cũng chỉ đạt V~200-215.
# Đã verify bằng ảnh thật: máy tạo ẩm xanh trong phòng có V_max=211 (0 pixel
# đạt ngưỡng dưới) trong khi lửa thật có 15-20 pixel lõi đạt ngưỡng.
_HOT_CORE_LOWER = np.array([95, 80, 235], dtype=np.uint8)
_HOT_CORE_UPPER = np.array([130, 255, 255], dtype=np.uint8)
_MIN_HOT_CORE_PIXELS = 5

_MIN_AREA = 8
_MAX_AREA_RATIO = 0.06  # blob lửa nhỏ so với cả khung hình (tránh match đèn/cửa sổ lớn)

# ─── Lửa cam/vàng (bật lửa thường, diêm, nến) ───────────────────────────────
# Không thể dùng riêng màu sắc như lửa xanh dương: da người + đồ vật ánh vàng
# (khung ảnh, tường, tóc ngược sáng) dưới đèn ấm trong nhà cũng cho pixel cam/
# vàng bão hoà cảm biến (V=255) y hệt lửa thật khi camera bị phơi sáng dư
# (verify bằng ảnh thật: 1 khung ảnh treo tường cho hot-core-ratio ngang bằng
# lửa thật — không thể phân biệt bằng màu tĩnh). Điểm khác biệt DUY NHẤT và
# đáng tin cậy: LỬA THẬT NHẤP NHÁY — hình dạng & diện tích lõi sáng đổi liên
# tục giữa các khung hình (đo thực tế: lửa thật đổi 20-47% pixel giữa 2 khung
# cách nhau ~0.3s, trong khi khung ảnh/tóc tĩnh chỉ đổi 3.5-4.6% do nhiễu cảm
# biến). Vật thể tĩnh dù sáng bao nhiêu cũng không "nhấp nháy" theo kiểu này.
_HOT_LOCATE_LOWER = np.array([0, 0, 250], dtype=np.uint8)
_HOT_LOCATE_UPPER = np.array([179, 130, 255], dtype=np.uint8)
_MIN_ORANGE_AREA_RATIO = 0.0015  # lọc bớt đốm sáng nhỏ/phản chiếu vặt (đã verify < ngưỡng này toàn nhiễu)
_MAX_ORANGE_AREA_RATIO = 0.03
_MIN_FLICKER_RATIO = 0.12  # % pixel lõi sáng đổi khác giữa 2 khung liên tiếp
_MIN_WARM_HALO_RATIO = 0.15  # quanh lõi phải có màu ấm (cam/vàng) bao quanh, không phải đèn trắng trung tính
_ORANGE_EXPAND_MARGIN = 0.25


class FlameBlobDetector:
    """Detector heuristic (không dùng ML) bổ sung cho FireDetector.

    FireDetector (YOLO, train trên D-Fire/yolov26) không ổn định với lửa nhỏ
    cận cảnh — confidence dao động mạnh theo góc/khoảng cách/ánh sáng, đã đo
    thực tế có lúc chỉ 0.05-0.2 dù lửa hiện rõ trong khung hình. Detector này
    bù thêm 2 nhánh:

    1. Lửa xanh dương (bật lửa khò/torch): khoanh theo màu xanh dương rồi xác
       nhận lõi cháy trắng bên trong — màu xanh dương đủ hiếm trong đời sống
       nên chỉ cần lọc màu tĩnh là đủ tin cậy.
    2. Lửa cam/vàng (bật lửa thường, diêm): màu KHÔNG đủ để phân biệt với
       vật thể ấm màu tĩnh (xem chú thích `_HOT_LOCATE_LOWER`), nên phải dùng
       thêm tín hiệu NHẤP NHÁY giữa 2 khung hình liên tiếp làm điều kiện bắt
       buộc. Cần tối thiểu 2 khung hình mới có thể xác nhận (bỏ qua khung đầu
       tiên của mỗi phiên).
    """

    behavior = "fire"
    name = "fire-heuristic"

    def __init__(self, conf_threshold: float = 0.3):
        self.conf_threshold = conf_threshold
        self.ready = True  # không cần tải model, luôn sẵn sàng
        self._error: str | None = None
        self._prev_hot_mask: np.ndarray | None = None

    def load(self) -> None:
        logger.info(
            "[fire-heuristic] Sẵn sàng (dò lửa xanh dương theo màu + lõi cháy trắng, "
            "lửa cam/vàng theo độ nhấp nháy giữa các khung hình, không cần tải model)."
        )

    @property
    def error(self) -> str | None:
        return self._error

    def predict(self, frame: np.ndarray) -> list[Detection]:
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        detections = self._detect_blue(frame, hsv)
        detections.extend(self._detect_orange_flicker(frame, hsv))
        return detections

    def _detect_blue(self, frame: np.ndarray, hsv: np.ndarray) -> list[Detection]:
        h, w = frame.shape[:2]
        frame_area = h * w

        mask = cv2.inRange(hsv, _BLUE_LOCATE_LOWER, _BLUE_LOCATE_UPPER)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        detections: list[Detection] = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < _MIN_AREA or area > frame_area * _MAX_AREA_RATIO:
                continue
            x, y, bw, bh = cv2.boundingRect(cnt)

            roi_hsv = hsv[y : y + bh, x : x + bw]
            hot_mask = cv2.inRange(roi_hsv, _HOT_CORE_LOWER, _HOT_CORE_UPPER)
            hot_pixels = cv2.countNonZero(hot_mask)
            if hot_pixels < _MIN_HOT_CORE_PIXELS:
                continue  # không có lõi cháy trắng -> không phải lửa thật

            confidence = min(0.3 + hot_pixels / 40 * 0.6, 0.95)
            if confidence < self.conf_threshold:
                continue
            detections.append(
                Detection(
                    behavior=self.behavior,
                    label="flame-blue",
                    confidence=confidence,
                    bbox=[float(x), float(y), float(x + bw), float(y + bh)],
                )
            )
        return detections

    def _detect_orange_flicker(self, frame: np.ndarray, hsv: np.ndarray) -> list[Detection]:
        h, w = frame.shape[:2]
        frame_area = h * w

        hot_mask = cv2.inRange(hsv, _HOT_LOCATE_LOWER, _HOT_LOCATE_UPPER)
        hot_mask = cv2.morphologyEx(hot_mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))

        prev_mask = self._prev_hot_mask
        self._prev_hot_mask = hot_mask
        if prev_mask is None or prev_mask.shape != hot_mask.shape:
            return []  # cần khung trước đó cùng kích thước mới tính được độ nhấp nháy

        diff_mask = cv2.absdiff(hot_mask, prev_mask)
        contours, _ = cv2.findContours(hot_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        detections: list[Detection] = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < frame_area * _MIN_ORANGE_AREA_RATIO or area > frame_area * _MAX_ORANGE_AREA_RATIO:
                continue
            x, y, bw, bh = cv2.boundingRect(cnt)

            roi_diff = diff_mask[y : y + bh, x : x + bw]
            flicker_ratio = cv2.countNonZero(roi_diff) / roi_diff.size
            if flicker_ratio < _MIN_FLICKER_RATIO:
                continue  # vùng sáng ổn định giữa 2 khung -> vật thể tĩnh, không phải lửa

            mx, my = bw * _ORANGE_EXPAND_MARGIN, bh * _ORANGE_EXPAND_MARGIN
            ex0, ey0 = max(int(x - mx), 0), max(int(y - my), 0)
            ex1, ey1 = min(int(x + bw + mx), w), min(int(y + bh + my), h)
            roi_hsv = hsv[ey0:ey1, ex0:ex1]
            warm_mask = (
                (roi_hsv[:, :, 0] <= 45) & (roi_hsv[:, :, 1] >= 50) & (roi_hsv[:, :, 2] >= 130)
            )
            warm_ratio = float(warm_mask.sum()) / warm_mask.size
            if warm_ratio < _MIN_WARM_HALO_RATIO:
                continue  # không có quầng màu ấm bao quanh -> nhiều khả năng là đèn trắng/phản chiếu

            confidence = min(0.4 + flicker_ratio * 1.0, 0.92)
            if confidence < self.conf_threshold:
                continue
            detections.append(
                Detection(
                    behavior=self.behavior,
                    label="flame-orange",
                    confidence=confidence,
                    bbox=[float(x), float(y), float(x + bw), float(y + bh)],
                )
            )
        return detections
