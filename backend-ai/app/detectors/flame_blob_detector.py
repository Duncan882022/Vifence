from __future__ import annotations

import logging

import cv2
import numpy as np

from ..schemas import Detection
from .face_guard import detect_faces

logger = logging.getLogger("detector")
_SKIN_HSV_LOWER = np.array([0, 30, 60], dtype=np.uint8)
_SKIN_HSV_UPPER = np.array([25, 170, 255], dtype=np.uint8)

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
_MIN_HOT_CORE_PIXELS = 12
_MIN_BLUE_FILL_RATIO = 0.18
_MIN_HOT_IN_BLUE_RATIO = 0.14
_MAX_GLARE_TOP_RATIO = 0.22
_MAX_GLARE_AREA_RATIO = 0.005
_MAX_SKIN_IN_BLUE_RATIO = 0.24
# Chỉ chặn flare trán — không chặn vùng miệng/tay (bật lửa khi hút thuốc).
_FACE_FOREHEAD_RATIO = 0.28
_STRONG_BLUE_HOT_PIXELS = 16
_STRONG_BLUE_HOT_RATIO = 0.17

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
_MIN_FLICKER_RATIO = 0.22  # tăng — giảm FP đèn/vật sáng tĩnh nhấp nháy nhẹ
_MIN_WARM_HALO_RATIO = 0.22  # quanh lõi phải có màu ấm rõ, không phải đèn trắng
_MIN_ORANGE_SATURATION_RATIO = 0.42  # đèn trắng/vàng nhạt (S thấp) -> loại
_ORANGE_EXPAND_MARGIN = 0.25

# Lửa/open flame sát mặt đất (đốm lửa nhỏ cạnh CN — demo Cam A-04, không cần 2 khung nhấp nháy).
_GROUND_Y_MIN_RATIO = 0.72
_GROUND_X_MIN_RATIO = 0.50
_MIN_GROUND_AREA = 22
_MAX_GROUND_AREA_RATIO = 0.0038
_MIN_GROUND_VMAX = 140
_MIN_GROUND_SMEAN = 92.0
_MAX_GROUND_ASPECT = 3.4
_MIN_GROUND_FILL = 0.22
_GROUND_CY_MIN_RATIO = 0.84


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

    def _face_forehead_zones(self, frame: np.ndarray) -> list[tuple[float, float, float, float]]:
        ok, faces = detect_faces(frame)
        if not ok or faces is None or len(faces) == 0:
            return []
        zones: list[tuple[float, float, float, float]] = []
        for face in faces:
            x, y, fw, fh = float(face[0]), float(face[1]), float(face[2]), float(face[3])
            zones.append((x, y, x + fw, y + fh * _FACE_FOREHEAD_RATIO))
        return zones

    @staticmethod
    def _is_strong_blue_flame(hot_pixels: int, blue_pixels: int) -> bool:
        return (
            hot_pixels >= _STRONG_BLUE_HOT_PIXELS
            and hot_pixels / max(blue_pixels, 1) >= _STRONG_BLUE_HOT_RATIO
        )

    @staticmethod
    def _skin_ratio(hsv_roi: np.ndarray) -> float:
        mask = cv2.inRange(hsv_roi, _SKIN_HSV_LOWER, _SKIN_HSV_UPPER)
        return float(cv2.countNonZero(mask)) / max(mask.size, 1)

    @staticmethod
    def _saturation_ratio(hsv_roi: np.ndarray) -> float:
        return float((hsv_roi[:, :, 1] >= 55).mean())

    @staticmethod
    def _center_in_zones(bbox: list[float], zones: list[tuple[float, float, float, float]]) -> bool:
        cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
        return any(zx1 <= cx <= zx2 and zy1 <= cy <= zy2 for zx1, zy1, zx2, zy2 in zones)

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
        detections.extend(self._detect_ground_orange(frame, hsv))
        return detections

    def _detect_blue(self, frame: np.ndarray, hsv: np.ndarray) -> list[Detection]:
        h, w = frame.shape[:2]
        frame_area = h * w
        face_forehead_zones = self._face_forehead_zones(frame)

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
            blue_mask = cv2.inRange(roi_hsv, _BLUE_LOCATE_LOWER, _BLUE_LOCATE_UPPER)
            blue_pixels = cv2.countNonZero(blue_mask)
            if blue_pixels / max(roi_hsv.size, 1) < _MIN_BLUE_FILL_RATIO:
                continue

            hot_mask = cv2.inRange(roi_hsv, _HOT_CORE_LOWER, _HOT_CORE_UPPER)
            hot_pixels = cv2.countNonZero(hot_mask)
            if hot_pixels < _MIN_HOT_CORE_PIXELS:
                continue
            hot_in_blue = hot_pixels / max(blue_pixels, 1)
            if hot_in_blue < _MIN_HOT_IN_BLUE_RATIO:
                continue

            strong = self._is_strong_blue_flame(hot_pixels, blue_pixels)
            bbox = [float(x), float(y), float(x + bw), float(y + bh)]

            if not strong:
                if self._skin_ratio(roi_hsv) > _MAX_SKIN_IN_BLUE_RATIO:
                    continue
                if face_forehead_zones and self._center_in_zones(bbox, face_forehead_zones):
                    continue
                if y < h * _MAX_GLARE_TOP_RATIO and area < frame_area * _MAX_GLARE_AREA_RATIO:
                    continue

            confidence = min(0.38 + hot_pixels / 45 * 0.52, 0.92)
            min_conf = self.conf_threshold if strong else max(self.conf_threshold, 0.58)
            if confidence < min_conf:
                continue
            detections.append(
                Detection(
                    behavior=self.behavior,
                    label="flame-blue",
                    confidence=confidence,
                    bbox=bbox,
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
            y2 = y + bh
            # Clutter/ét mép dưới khung (hộp sản phẩm, chữ đỏ trên nền trắng) hay FP flame-orange.
            if y2 > h * 0.88:
                aspect = bw / max(bh, 1)
                if aspect > 1.8 and area < frame_area * 0.004:
                    continue

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
            if self._saturation_ratio(roi_hsv) < _MIN_ORANGE_SATURATION_RATIO:
                continue  # ánh đèn trắng/vàng nhạt — không đủ bão hoà màu lửa

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

    def _detect_ground_orange(self, frame: np.ndarray, hsv: np.ndarray) -> list[Detection]:
        """Đốm lửa cam/vàng sát mặt đất — bắt lửa củi/dầu nhỏ cạnh CN (1 khung hình)."""
        h, w = frame.shape[:2]
        frame_area = h * w
        y0 = int(h * _GROUND_Y_MIN_RATIO)
        x0 = int(w * _GROUND_X_MIN_RATIO)
        roi_hsv = hsv[y0:, x0:]
        if roi_hsv.size == 0:
            return []

        mask = cv2.bitwise_or(
            cv2.inRange(roi_hsv, np.array([5, 80, 120], dtype=np.uint8), np.array([32, 255, 255], dtype=np.uint8)),
            cv2.inRange(roi_hsv, np.array([0, 95, 145], dtype=np.uint8), np.array([14, 255, 255], dtype=np.uint8)),
        )
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), 1)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), 1)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        detections: list[Detection] = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < _MIN_GROUND_AREA or area > frame_area * _MAX_GROUND_AREA_RATIO:
                continue
            x, y, bw, bh = cv2.boundingRect(cnt)
            abs_y = y0 + y + bh / 2
            if abs_y < h * _GROUND_CY_MIN_RATIO:
                continue
            aspect = bw / max(bh, 1)
            if aspect > _MAX_GROUND_ASPECT and area < frame_area * 0.0012:
                continue

            roi = roi_hsv[y : y + bh, x : x + bw]
            if roi.size == 0:
                continue
            fill = cv2.countNonZero(mask[y : y + bh, x : x + bw]) / roi.shape[0] / roi.shape[1]
            if fill < _MIN_GROUND_FILL:
                continue
            vmax = float(roi[:, :, 2].max())
            smean = float(roi[:, :, 1].mean())
            if vmax < _MIN_GROUND_VMAX or smean < _MIN_GROUND_SMEAN:
                continue
            if self._saturation_ratio(roi) < 0.34:
                continue

            # Loại vùng da lớn (CN ngồi gần lửa) — lửa thật nhỏ gọn, không phải bbox người.
            if area > frame_area * 0.0018 and self._skin_ratio(roi) > 0.22:
                continue

            confidence = min(
                0.78
                + min(area / max(frame_area * 0.0012, 1.0), 1.0) * 0.10
                + min((abs_y / h - _GROUND_CY_MIN_RATIO) * 0.35, 0.08),
                0.92,
            )
            if confidence < max(self.conf_threshold, 0.80):
                continue

            detections.append(
                Detection(
                    behavior=self.behavior,
                    label="flame-ground",
                    confidence=confidence,
                    bbox=[
                        float(x0 + x),
                        float(y0 + y),
                        float(x0 + x + bw),
                        float(y0 + y + bh),
                    ],
                )
            )

        if not detections:
            return []

        detections.sort(key=lambda d: d.confidence, reverse=True)
        return [detections[0]]
