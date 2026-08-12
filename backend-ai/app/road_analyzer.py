"""Phân tích lòng đường — bùn/đất, vũng nước, vật chiếm lòng đường trong ROI polygon."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import cv2
import numpy as np

from .auto_train import inference as auto_train_inference
from .road_roi_config import get_roi_zones_for_camera
from .schemas import RoadDetection
from .unknown_detection import UNKNOWN_LABEL, object_display_label

logger = logging.getLogger("road_analyzer")

_AUTO_TRAIN_SCENARIO_ID = {"mud": "BPTC-007", "water": "BPTC-008", "material": "BPTC-009"}
_AUTO_TRAIN_MERGE_IOU = 0.35


def _bbox_iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _patch_barrier_ratios(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
) -> tuple[float, float, float, float, float] | None:
    """Tỷ lệ trắng / sọc cam-đỏ và độ bão hòa trung bình trong bbox."""
    x1, y1, x2, y2 = [int(v) for v in box]
    h, w = hsv.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    patch = hsv[y1:y2, x1:x2]
    if patch.size == 0:
        return None
    ph, pw = patch.shape[:2]
    if pw < 8 or ph < 5:
        return None
    area = max(pw * ph, 1)
    white = cv2.inRange(patch, np.array([0, 0, 168]), np.array([180, 55, 255]))
    red_lo = cv2.inRange(patch, np.array([0, 70, 70]), np.array([14, 255, 255]))
    red_hi = cv2.inRange(patch, np.array([165, 70, 70]), np.array([180, 255, 255]))
    orange = cv2.inRange(patch, np.array([6, 90, 110]), np.array([26, 255, 255]))
    stripe = cv2.bitwise_or(red_lo, cv2.bitwise_or(red_hi, orange))
    yellow_flex = cv2.inRange(patch, np.array([16, 45, 85]), np.array([40, 255, 255]))
    white_ratio = cv2.countNonZero(white) / area
    stripe_ratio = cv2.countNonZero(stripe) / area
    flex_ratio = cv2.countNonZero(yellow_flex) / area
    mean_s = float(np.mean(patch[:, :, 1]))
    mean_v = float(np.mean(patch[:, :, 2]))
    return white_ratio, stripe_ratio, mean_s, mean_v, flex_ratio


def _is_temporary_barrier_box(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
) -> bool:
    """Hàng rào tạm đỏ-trắng / lan can — không phải vũng nước hay bùn."""
    ratios = _patch_barrier_ratios(hsv, box)
    if ratios is None:
        return False
    white_ratio, stripe_ratio, mean_s, _mean_v, flex_ratio = ratios
    if flex_ratio > 0.08:
        return True
    if flex_ratio > 0.05 and (stripe_ratio > 0.03 or white_ratio > 0.05):
        return True
    if stripe_ratio > 0.08:
        return True
    if stripe_ratio > 0.05 and white_ratio < 0.12:
        return True
    if white_ratio > 0.10 and stripe_ratio > 0.06:
        return True
    if white_ratio > 0.20 and stripe_ratio > 0.03:
        return True
    if mean_s > 45 and stripe_ratio > 0.04 and white_ratio < 0.14:
        return True
    return False


def _water_patch_looks_real(hsv: np.ndarray, box: tuple[int, int, int, int]) -> bool:
    """Vũng thật: phản chiếu xám/trắng hoặc mặt tối đồng nhất — không phải vệt ướt sát hàng rào."""
    ratios = _patch_barrier_ratios(hsv, box)
    if ratios is None:
        return False
    white_ratio, stripe_ratio, mean_s, mean_v, flex_ratio = ratios
    if flex_ratio > 0.07:
        return False
    if stripe_ratio > 0.06:
        return False
    if mean_s > 42 and white_ratio < 0.12:
        return False
    if mean_v < 95:
        return True
    return white_ratio > 0.08 or mean_s < 22


def _water_validation_band(
    box: tuple[int, int, int, int],
    *,
    expanded: bool = False,
    frame_width: int = 0,
) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = [int(v) for v in box]
    h = max(y2 - y1, 1)
    if expanded and frame_width > 0 and (x2 - x1) >= frame_width * 0.40:
        # Bbox rộng ôm vũng — chỉ xác thực dải đáy (tránh hàng rào phía trên).
        return x1, y1 + int(h * 0.62), x2, y2
    if not expanded:
        return x1, y1, x2, y2
    return x1, y1 + int(h * 0.38), x2, y2


def _is_valid_water_box(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    *,
    expanded: bool = False,
) -> bool:
    if _score_water_box(box, frame_width, frame_height, expanded=expanded) < 0:
        return False
    if _is_temporary_barrier_box(hsv, box) and box[3] < frame_height * 0.88:
        return False
    band = _water_validation_band(box, expanded=expanded, frame_width=frame_width)
    wide = expanded and (box[2] - box[0]) >= frame_width * 0.40
    if wide and box[3] < frame_height * 0.88:
        return False
    if wide and box[3] >= frame_height * 0.78:
        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        if cy >= frame_height * 0.72 and frame_width * 0.12 <= cx <= frame_width * 0.62:
            if _water_patch_looks_real(hsv, band):
                return True
            return False
    if not wide and _is_temporary_barrier_box(hsv, band):
        return False
    if not _water_patch_looks_real(hsv, band):
        return False
    cx = (box[0] + box[2]) / 2
    cy = (box[1] + box[3]) / 2
    if not expanded and cx < frame_width * 0.20 and cy > frame_height * 0.72:
        return False
    return True


def _water_meets_violation_size(
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    frame_area: int,
    *,
    area_percent: float = 0.0,
) -> bool:
    """Vũng nước đủ lớn mới được ghi sự kiện BPTC-008."""
    x1, y1, x2, y2 = box
    bw, bh = max(x2 - x1, 0), max(y2 - y1, 0)
    if bw < MIN_WATER_BBOX_WIDTH or bh < MIN_WATER_BBOX_HEIGHT:
        return False
    bbox_ratio = (bw * bh) / max(frame_area, 1)
    if bbox_ratio < MIN_WATER_EVENT_AREA_RATIO:
        return False
    aspect = bw / max(bh, 1)
    # Vệt ướt mảnh sát mép — không coi là vũng đọng.
    if aspect > 5.5 and bh < frame_height * 0.028:
        return False
    if bw < frame_width * 0.06 and bh < frame_height * 0.024:
        return False
    if area_percent > 0 and area_percent < MIN_WATER_EVENT_ROI_PERCENT:
        return False
    return True


def _is_valid_object_box(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> bool:
    """Vật tư thật trên lòng đường — loại giải phân cách mềm / hàng rào tạm."""
    x1, y1, x2, y2 = [int(v) for v in box]
    bw = max(x2 - x1, 1)
    bh = max(y2 - y1, 1)
    area_ratio = (bw * bh) / max(frame_width * frame_height, 1)
    center_y = (y1 + y2) / 2 / max(frame_height, 1)
    ratios = _patch_barrier_ratios(hsv, box)
    if ratios is not None:
        white, stripe, _mean_s, _mean_v, flex = ratios
        # Đống dầm thép sát hàng rào — flex cao + nền trắng rộng, khác hàng rào FP mảnh.
        if area_ratio >= 0.045 and center_y >= 0.62 and flex >= 0.075 and white >= 0.18:
            return True
    if _is_temporary_barrier_box(hsv, box):
        return False
    if _green_ratio_in_box(hsv, box) >= 0.04:
        return True
    if bw >= frame_width * 0.46 and bh <= frame_height * 0.24:
        return False
    left = (x1, y1, x1 + max(bw // 3, 1), y2)
    left_ratios = _patch_barrier_ratios(hsv, left)
    if left_ratios is not None:
        _white, stripe, _mean_s, _mean_v, _flex = left_ratios
        if stripe > 0.14 and bw >= frame_width * 0.28:
            return False
    return True


def _augment_with_auto_train_model(frame: np.ndarray, all_detections: list[RoadDetection]) -> list[RoadDetection]:
    """Hỏi thêm model tự train (nếu đã có checkpoint được promote cho Cam 03)
    — chỉ CỘNG THÊM detection mới (không trùng vùng đã phát hiện bằng rule
    màu), không thay/xoá gì — an toàn, chỉ tăng recall theo thời gian khi
    model học được thêm từ dữ liệu thực tế."""
    try:
        preds = auto_train_inference.predict_boxes("road_material", frame)
    except Exception:  # noqa: BLE001
        return all_detections
    if not preds:
        return all_detections

    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    extra: list[RoadDetection] = []
    for cls_name, x1, y1, x2, y2, conf in preds:
        behavior = "object" if cls_name == "material" else cls_name
        existing = [d.bbox for d in all_detections if d.behavior == behavior]
        box = [x1, y1, x2, y2]
        int_box = (int(x1), int(y1), int(x2), int(y2))
        if any(_bbox_iou(box, e) >= _AUTO_TRAIN_MERGE_IOU for e in existing):
            continue
        if behavior == "water" and not _is_valid_water_box(hsv, int_box, w, h):
            continue
        if behavior == "water" and not _water_meets_violation_size(int_box, w, h, w * h):
            continue
        if behavior == "mud":
            if _score_mud_box(int_box, w, h) < 0 or _is_temporary_barrier_box(hsv, int_box):
                continue
        if behavior == "object" and not _is_valid_object_box(hsv, int_box, w, h):
            continue
        extra.append(
            RoadDetection(
                behavior=behavior,
                label=SCENARIO_LABELS.get(cls_name, OBJECT_KIND_LABEL) if behavior != "object" else OBJECT_KIND_LABEL,
                scenario_id=_AUTO_TRAIN_SCENARIO_ID.get(cls_name, "BPTC-009"),
                confidence=round(conf, 3),
                bbox=box,
                object_kind="material" if behavior == "object" else None,
            )
        )
    return all_detections + extra if extra else all_detections

MUD_THRESHOLD_PERCENT = 4.0
WATER_THRESHOLD_PERCENT = 0.28
# BPTC-008 — chỉ ghi sự kiện khi vũng đủ lớn (loại vệt ướt / mảnh nhỏ).
MIN_WATER_EVENT_AREA_RATIO = 0.0045
MIN_WATER_EVENT_ROI_PERCENT = 0.15
MIN_WATER_BBOX_WIDTH = 22
MIN_WATER_BBOX_HEIGHT = 14
MIN_OBJECT_AREA_RATIO = 0.008
MAX_OBJECT_AREA_RATIO = 0.12
MIN_OBJECT_EPISODE_AREA_RATIO = 0.012
EVENT_MIN_CONFIDENCE = 0.80
# Overlay Cam A-03: không lọc theo ngưỡng — trả mọi bbox detect được.
DISPLAY_MIN_CONFIDENCE = 0.0

SCENARIO_LABELS = {
    "mud": "Đường nội bộ bùn bẩn",
    "water": "Đường nội bộ đọng nước",
    "object": "Vật tư",
}

OBJECT_KIND_LABEL = "Vật tư"

OBJECT_KIND_LABELS: dict[str, str] = {
    "steel": OBJECT_KIND_LABEL,
    "cement_bag": OBJECT_KIND_LABEL,
    "brick": OBJECT_KIND_LABEL,
    "rust_metal": OBJECT_KIND_LABEL,
    "generic": OBJECT_KIND_LABEL,
    "material": OBJECT_KIND_LABEL,
}

OBJECT_KIND_PRIORITY: dict[str, int] = {
    "steel": 5,
    "rust_metal": 4,
    "brick": 3,
    "cement_bag": 2,
    "generic": 1,
}


@dataclass
class RoadMetrics:
    mud_percent: float = 0.0
    water_percent: float = 0.0
    object_count: int = 0


def _polygon_to_mask(polygon: list[dict], width: int, height: int) -> np.ndarray:
    pts = np.array(
        [[int(p["x"] * width), int(p["y"] * height)] for p in polygon],
        dtype=np.int32,
    )
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 255)
    return mask


def _roi_pixel_count(roi_mask: np.ndarray) -> int:
    return int(np.count_nonzero(roi_mask))


def _tight_bbox_from_contour(
    cnt: np.ndarray,
    roi_mask: np.ndarray,
    height: int,
    width: int,
) -> tuple[int, int, int, int] | None:
    """BBox ôm sát contour nằm trong ROI polygon."""
    patch = np.zeros((height, width), dtype=np.uint8)
    cv2.drawContours(patch, [cnt], -1, 255, -1)
    patch = cv2.bitwise_and(patch, roi_mask)
    ys, xs = np.where(patch > 0)
    if len(xs) < 6:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _bbox_roi_overlap_ratio(
    box: tuple[int, int, int, int],
    roi_mask: np.ndarray,
    width: int,
    height: int,
) -> float:
    x1, y1, x2, y2 = box
    patch = np.zeros((height, width), dtype=np.uint8)
    patch[y1:y2, x1:x2] = 255
    inter = cv2.bitwise_and(patch, roi_mask)
    return float(np.count_nonzero(inter)) / max((x2 - x1) * (y2 - y1), 1)


def _scale_box_from_center(
    box: tuple[int, int, int, int],
    scale: float,
) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = box
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    hw, hh = (x2 - x1) * scale / 2.0, (y2 - y1) * scale / 2.0
    return int(round(cx - hw)), int(round(cy - hh)), int(round(cx + hw)), int(round(cy + hh))


def _clip_water_box_to_roi(
    box: tuple[int, int, int, int],
    roi_mask: np.ndarray,
    width: int,
    height: int,
) -> tuple[int, int, int, int] | None:
    """Giữ bbox vũng nước rộng — chỉ cần tâm trong ROI và >=55% diện tích trong polygon."""
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(width, x2), min(height, y2)
    if x2 - x1 < 20 or y2 - y1 < 10:
        return None
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    if not _point_in_roi(cx, cy, roi_mask, width, height):
        return None
    if _bbox_roi_overlap_ratio((x1, y1, x2, y2), roi_mask, width, height) < 0.55:
        return None
    return x1, y1, x2, y2


def _clip_box_to_roi(
    box: tuple[int, int, int, int],
    roi_mask: np.ndarray,
    width: int,
    height: int,
    *,
    min_w: int = 8,
    min_h: int = 6,
    min_overlap: float = 0.93,
) -> tuple[int, int, int, int] | None:
    """Cắt bbox sát vùng trong polygon — tâm trong ROI, >= min_overlap diện tích."""
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(width, x2), min(height, y2)
    if x2 - x1 < min_w or y2 - y1 < min_h:
        return None
    patch = np.zeros((height, width), dtype=np.uint8)
    patch[y1:y2, x1:x2] = 255
    clipped = cv2.bitwise_and(patch, roi_mask)
    ys, xs = np.where(clipped > 0)
    if len(xs) < 6:
        return None
    tight = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    cx, cy = (tight[0] + tight[2]) // 2, (tight[1] + tight[3]) // 2
    if not _point_in_roi(cx, cy, roi_mask, width, height):
        return None

    if _bbox_roi_overlap_ratio(tight, roi_mask, width, height) >= min_overlap:
        if tight[2] - tight[0] >= min_w and tight[3] - tight[1] >= min_h:
            return tight

    for scale in (0.98, 0.94, 0.90, 0.86, 0.82, 0.78, 0.74, 0.70, 0.66, 0.62):
        inset = _scale_box_from_center(tight, scale)
        if inset[2] - inset[0] < min_w or inset[3] - inset[1] < min_h:
            continue
        icx, icy = (inset[0] + inset[2]) // 2, (inset[1] + inset[3]) // 2
        if not _point_in_roi(icx, icy, roi_mask, width, height):
            continue
        if _bbox_roi_overlap_ratio(inset, roi_mask, width, height) >= min_overlap:
            return inset
    return None


def _point_in_roi(x: int, y: int, roi_mask: np.ndarray, width: int, height: int) -> bool:
    if x < 0 or y < 0 or x >= width or y >= height:
        return False
    return roi_mask[y, x] > 0


def _normalize_geo_score(geo: float, *, scale: float) -> float:
    if geo <= 0:
        return 0.0
    return min(1.0, geo / scale)


def _confidence_for_detection(
    behavior: str,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    frame_area: int,
    *,
    area_percent: float = 0.0,
    contour_area: float = 0.0,
) -> float:
    """Độ tin cậy 0–1 — chỉ >= EVENT_MIN_CONFIDENCE mới ghi sự kiện."""
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    bbox_area = max(bw * bh, 1)
    fill = min(contour_area / bbox_area, 1.0) if contour_area > 0 else min(bbox_area / frame_area * 8.0, 1.0)

    if behavior == "mud":
        geo = _score_mud_box(box, frame_width, frame_height)
        if geo < 0:
            return 0.0
        geo_n = _normalize_geo_score(geo, scale=6000.0)
        area_n = min(area_percent / 10.0, 1.0)
        conf = 0.42 + area_n * 0.28 + geo_n * 0.22 + fill * 0.18
    elif behavior == "water":
        if not _water_meets_violation_size(box, frame_width, frame_height, frame_area, area_percent=area_percent):
            return 0.0
        geo = _score_water_box(box, frame_width, frame_height, expanded=True)
        if geo < 0:
            geo = _score_water_box(box, frame_width, frame_height)
        if geo < 0:
            return 0.0
        geo_n = _normalize_geo_score(geo, scale=5000.0)
        area_n = min(area_percent / 6.0, 1.0)
        conf = 0.48 + area_n * 0.28 + geo_n * 0.22 + fill * 0.16
    else:
        geo = _score_object_box(box, frame_width, frame_height)
        if geo < 0:
            return 0.0
        geo_n = _normalize_geo_score(geo, scale=7000.0)
        area_ratio = bbox_area / frame_area
        area_n = min(area_ratio / 0.05, 1.0)
        if area_ratio > 0.10 or bw > frame_width * 0.55:
            conf = 0.50 + area_n * 0.20 + geo_n * 0.22 + fill * 0.12
        elif area_ratio > 0.06:
            conf = 0.46 + area_n * 0.22 + geo_n * 0.20 + fill * 0.14
        else:
            conf = 0.46 + area_n * 0.24 + geo_n * 0.20 + fill * 0.14

    return round(min(0.98, max(0.0, conf)), 3)


def _best_patch_in_roi(
    mask: np.ndarray,
    roi_mask: np.ndarray,
    frame_area: int,
    *,
    min_area_ratio: float,
    max_area_ratio: float,
    min_compactness: float = 0.08,
    prefer_foreground: bool = False,
    frame_height: int = 0,
) -> tuple[float, list[tuple[int, int, int, int]]]:
    combined = cv2.bitwise_and(mask, roi_mask)
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    roi_pixels = _roi_pixel_count(roi_mask)
    if roi_pixels <= 0:
        return 0.0, []

    min_area = frame_area * min_area_ratio
    max_area = frame_area * max_area_ratio
    best_score = -1.0
    best_area = 0.0
    best_box: tuple[int, int, int, int] | None = None

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        if w <= 0 or h <= 0:
            continue
        if area / float(w * h) < min_compactness:
            continue
        score = area
        if prefer_foreground and frame_height > 0:
            cy = y + h / 2
            if cy < frame_height * 0.50:
                continue
            score *= 0.55 + 0.45 * (cy / frame_height)
        if score > best_score:
            best_score = score
            best_area = area
            best_box = (x, y, x + w, y + h)

    if best_box is None:
        return 0.0, []
    return round(100.0 * best_area / roi_pixels, 2), [best_box]


def _contour_boxes(
    mask: np.ndarray,
    roi_mask: np.ndarray,
    min_area_ratio: float,
    max_area_ratio: float,
    frame_area: int,
    frame_width: int,
    *,
    limit: int = 1,
    max_width_ratio: float | None = None,
    min_compactness: float = 0.12,
) -> list[tuple[int, int, int, int]]:
    combined = cv2.bitwise_and(mask, roi_mask)
    h, w = combined.shape[:2]
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area = frame_area * min_area_ratio
    max_area = frame_area * max_area_ratio
    ranked: list[tuple[float, tuple[int, int, int, int]]] = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        tight = _tight_bbox_from_contour(cnt, roi_mask, h, w)
        if tight is None:
            continue
        x1, y1, x2, y2 = tight
        bw, bh = x2 - x1, y2 - y1
        if max_width_ratio is not None and bw > frame_width * max_width_ratio:
            continue
        compactness = area / float(bw * bh)
        if compactness < min_compactness:
            continue
        ranked.append((area, tight))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return [box for _, box in ranked[:limit]]


def _road_band_mask(roi_mask: np.ndarray, width: int, height: int) -> np.ndarray:
    """Vùng mặt đường trong polygon — loại lề đất trái và phần xa trên."""
    band = roi_mask.copy()
    band[:, : int(width * 0.10)] = 0
    band[: int(height * 0.32), :] = 0
    return band


def _water_search_mask(roi_mask: np.ndarray, width: int, height: int) -> np.ndarray:
    """Vũng nước trên lòng đường phía gần — giữ sát lề trái (vũng hay bám mép đường)."""
    band = roi_mask.copy()
    band[: int(height * 0.42), :] = 0
    band[:, : int(width * 0.04)] = 0
    band[:, int(width * 0.72) :] = 0
    return band


def _object_search_mask(roi_mask: np.ndarray, width: int, height: int) -> np.ndarray:
    """Vùng tìm vật chiếm lòng đường — giữa polygon, loại túi be bên lề."""
    band = roi_mask.copy()
    band[:, : int(width * 0.14)] = 0
    band[:, int(width * 0.82) :] = 0
    band[: int(height * 0.30), :] = 0
    return band


def _masks_from_boxes(
    height: int,
    width: int,
    boxes: list[tuple[int, int, int, int]],
    *,
    pad_ratio: float = 0.06,
) -> np.ndarray:
    mask = np.zeros((height, width), dtype=np.uint8)
    for x1, y1, x2, y2 in boxes:
        pad_x = int((x2 - x1) * pad_ratio)
        pad_y = int((y2 - y1) * pad_ratio)
        cv2.rectangle(
            mask,
            (max(0, x1 - pad_x), max(0, y1 - pad_y)),
            (min(width - 1, x2 + pad_x), min(height - 1, y2 + pad_y)),
            255,
            -1,
        )
    return mask


MAX_PATCHES_PER_BEHAVIOR = 3


def _bbox_containment(
    inner: tuple[int, int, int, int],
    outer: tuple[int, int, int, int],
) -> float:
    """Tỷ lệ diện tích inner nằm trong outer."""
    ix1 = max(inner[0], outer[0])
    iy1 = max(inner[1], outer[1])
    ix2 = min(inner[2], outer[2])
    iy2 = min(inner[3], outer[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    inner_area = max((inner[2] - inner[0]) * (inner[3] - inner[1]), 1)
    return inter / inner_area


def _green_steel_mask(hsv: np.ndarray) -> np.ndarray:
    tan = cv2.inRange(hsv, np.array([15, 25, 120]), np.array([35, 180, 255]))
    green = cv2.inRange(hsv, np.array([32, 28, 45]), np.array([95, 255, 230]))
    return cv2.bitwise_and(green, cv2.bitwise_not(tan))


def _tighten_steel_pile_bbox(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Siết bbox vật tư thép — bám đống sắt xanh, bỏ vệt gỉ trải ngang mặt đường."""
    h, w = hsv.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    bw, bh = max(x2 - x1, 1), max(y2 - y1, 1)
    if bw <= int(w * 0.34):
        return box

    pad_x = max(10, int(bw * 0.06))
    pad_y = max(8, int(bh * 0.05))
    ex1 = max(0, x1 - pad_x)
    ex2 = min(w, x2 + pad_x)
    ey1 = max(0, y1 - pad_y)
    ey2 = min(h, y2 + pad_y)
    patch = hsv[ey1:ey2, ex1:ex2]
    green = _green_steel_mask(patch)
    if int(green.sum()) < 100:
        return _trim_object_bbox_by_density(hsv, box)

    num, _, stats, _ = cv2.connectedComponentsWithStats(green, connectivity=8)
    comps: list[tuple[int, tuple[int, int, int, int]]] = []
    for lbl in range(1, num):
        lx, ly, lbw, lbh, area = stats[lbl]
        if area < 36:
            continue
        comps.append((area, (lx + ex1, ly + ey1, lx + lbw + ex1, ly + lbh + ey1)))
    if not comps:
        return _trim_object_bbox_by_density(hsv, box)

    comps.sort(key=lambda row: row[0], reverse=True)
    primary = comps[0][1]
    px1, py1, px2, py2 = primary
    cluster = [primary]
    gap_x = max(12, int(w * 0.02))
    for _, cb in comps[1:]:
        ox1 = max(cb[0], px1)
        ox2 = min(cb[2], px2)
        if ox2 <= ox1:
            horiz_gap = min(abs(cb[0] - px2), abs(cb[2] - px1))
            if horiz_gap > gap_x:
                continue
        cluster.append(cb)
        px1 = min(px1, cb[0])
        py1 = min(py1, cb[1])
        px2 = max(px2, cb[2])
        py2 = max(py2, cb[3])

    tx1, ty1, tx2, ty2 = px1, py1, px2, py2
    pw = max(10, int((tx2 - tx1) * 0.14))
    tx1 = max(x1 - int(bw * 0.04), tx1 - pw)
    tx2 = min(x2 + int(bw * 0.04), tx2 + pw)
    # Giữ chiều cao bbox gốc — thân thép tối không có sơn xanh.
    ty1, ty2 = y1, y2

    if tx2 - tx1 < 20 or ty2 - ty1 < 14:
        return box
    if _score_object_box((tx1, ty1, tx2, ty2), frame_width, frame_height) < 0:
        return box
    return tx1, ty1, tx2, ty2


def _trim_object_bbox_by_density(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
) -> tuple[int, int, int, int]:
    """Cắt hai bên bbox theo mật độ vật liệu — loại vệt mảnh."""
    x1, y1, x2, y2 = [int(v) for v in box]
    patch = hsv[y1:y2, x1:x2]
    if patch.size == 0 or x2 - x1 < 48:
        return box
    material = _pile_material_mask(patch)
    ph, pw = material.shape[:2]
    row1, row2 = int(ph * 0.12), int(ph * 0.88)
    band = material[row1:row2]
    if band.size == 0:
        return box
    col = band.sum(axis=0) / 255.0
    peak = float(col.max()) if col.size else 0.0
    if peak < 4.0:
        return box
    thresh = max(peak * 0.28, (row2 - row1) * 0.07)
    active = np.where(col >= thresh)[0]
    if len(active) < 8:
        return box
    ax1 = int(active.min())
    ax2 = int(active.max()) + 1
    if ax2 - ax1 < pw * 0.12:
        return box
    pad = max(4, int((ax2 - ax1) * 0.06))
    return x1 + max(0, ax1 - pad), y1, x1 + min(pw, ax2 + pad), y2


def _pile_material_mask(hsv: np.ndarray) -> np.ndarray:
    """Mask vật liệu đống thép / kim loại — gộp nhiều sắc độ gỉ + thân tối."""
    tan = cv2.inRange(hsv, np.array([15, 25, 120]), np.array([35, 180, 255]))
    rust = cv2.inRange(hsv, np.array([5, 45, 35]), np.array([28, 255, 220]))
    rust = cv2.bitwise_and(rust, cv2.bitwise_not(tan))
    brown = cv2.inRange(hsv, np.array([8, 35, 30]), np.array([24, 255, 210]))
    green = cv2.inRange(hsv, np.array([32, 25, 40]), np.array([95, 255, 230]))
    dark = cv2.inRange(hsv, np.array([0, 0, 22]), np.array([180, 90, 115]))
    return cv2.bitwise_or(rust, cv2.bitwise_or(brown, cv2.bitwise_or(green, dark)))


def _expand_object_bbox_to_pile(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Mở rộng bbox ôm trọn cả đống vật — gộp các mảnh mask liền nhau."""
    h, w = hsv.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    bw, bh = max(x2 - x1, 1), max(y2 - y1, 1)
    mx = max(24, int(bw * 0.18))
    my = max(16, int(bh * 0.12))
    ex1, ey1 = max(0, x1 - mx), max(0, y1 - my)
    ex2, ey2 = min(w, x2 + mx), min(h, y2 + my)
    patch = hsv[ey1:ey2, ex1:ex2]
    if patch.size == 0:
        return box

    material = _pile_material_mask(patch)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))
    material = cv2.morphologyEx(material, cv2.MORPH_CLOSE, kernel, iterations=3)
    wet = cv2.inRange(patch, np.array([0, 0, 75]), np.array([180, 42, 210]))
    ph = patch.shape[0]
    wet[: max(0, int(ph * 0.52)), :] = 0
    material = cv2.bitwise_and(material, cv2.bitwise_not(wet))

    cx = (x1 + x2) // 2 - ex1
    cy = (y1 + y2) // 2 - ey1
    num, labels, stats, _ = cv2.connectedComponentsWithStats(material, connectivity=8)
    best_label = 0
    best_area = 0
    for lbl in range(1, num):
        lx, ly, lbw, lbh, area = stats[lbl]
        if area < 40:
            continue
        if lx <= cx < lx + lbw and ly <= cy < ly + lbh:
            best_label = lbl
            break
        if area > best_area:
            best_area = area
            best_label = lbl

    if best_label <= 0:
        return box

    comp = labels == best_label
    ys, xs = np.where(comp)
    if len(xs) < 16:
        return box

    tx1 = int(xs.min()) + ex1
    ty1 = int(ys.min()) + ey1
    tx2 = int(xs.max()) + 1 + ex1
    ty2 = int(ys.max()) + 1 + ey1
    tx1, ty1 = min(tx1, x1), min(ty1, y1)
    tx2, ty2 = max(tx2, x2), max(ty2, y2)
    if _score_object_box((tx1, ty1, tx2, ty2), frame_width, frame_height) < 0:
        return box
    return tx1, ty1, tx2, ty2


def _trim_wet_bottom_from_bbox(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
) -> tuple[int, int, int, int]:
    """Chỉ cắt hàng nhựa ướt phía dưới — không thu hai bên đống vật."""
    x1, y1, x2, y2 = [int(v) for v in box]
    patch = hsv[y1:y2, x1:x2]
    if patch.size == 0 or y2 - y1 < 16:
        return box
    material = _pile_material_mask(patch)
    wet = cv2.inRange(patch, np.array([0, 0, 75]), np.array([180, 38, 205]))
    ty2 = y2
    for row in range(patch.shape[0] - 1, max(patch.shape[0] // 3, 0), -1):
        mat_cnt = int(material[row].sum() // 255)
        wet_cnt = int(wet[row].sum() // 255)
        row_w = patch.shape[1]
        if mat_cnt >= max(8, row_w * 0.04):
            break
        if wet_cnt >= row_w * 0.35 and mat_cnt < row_w * 0.06:
            ty2 = y1 + row
            continue
        break
    if ty2 - y1 < 12:
        return box
    return x1, y1, x2, ty2


def _balance_pile_bbox_to_seed(
    seed: tuple[int, int, int, int],
    enveloped: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    *,
    max_pad_x_ratio: float = 0.36,
    max_pad_y_ratio: float = 0.14,
) -> tuple[int, int, int, int]:
    """Giới hạn mở rộng quanh bbox gốc — tránh phình to cả vùng lòng đường."""
    x1, y1, x2, y2 = [int(v) for v in seed]
    ex1, ey1, ex2, ey2 = [int(v) for v in enveloped]
    bw, bh = max(x2 - x1, 1), max(y2 - y1, 1)
    lim_x1 = max(0, x1 - int(bw * max_pad_x_ratio))
    lim_x2 = min(frame_width, x2 + int(bw * max_pad_x_ratio))
    lim_y1 = max(0, y1 - int(bh * max_pad_y_ratio))
    lim_y2 = min(frame_height, y2 + int(bh * max_pad_y_ratio))
    tx1 = max(min(ex1, x1), lim_x1)
    ty1 = max(min(ey1, y1), lim_y1)
    tx2 = min(max(ex2, x2), lim_x2)
    ty2 = min(max(ey2, y2), lim_y2)
    if tx2 - tx1 < 20 or ty2 - ty1 < 14:
        return seed
    return tx1, ty1, tx2, ty2


def _envelope_material_pile_bbox(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    *,
    roi_mask: np.ndarray | None = None,
) -> tuple[int, int, int, int]:
    """Mở rộng bbox ôm trọn ụ sắt — gỉ + thân tối + sơn xanh, không chỉ mảng xanh."""
    h, w = hsv.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    bw, bh = max(x2 - x1, 1), max(y2 - y1, 1)
    mx = max(32, int(w * 0.20))
    ex1 = max(0, x1 - mx)
    ex2 = min(w, x2 + max(20, int(w * 0.05)))
    ey1 = max(0, min(y1 - int(bh * 0.08), int(h * 0.54)))
    ey2 = min(h, y2 + max(10, int(bh * 0.04)))

    patch_hsv = hsv[ey1:ey2, ex1:ex2]
    if patch_hsv.size == 0:
        return box

    material = _pile_material_mask(patch_hsv)
    if roi_mask is not None:
        material = cv2.bitwise_and(material, roi_mask[ey1:ey2, ex1:ex2])

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))
    material = cv2.morphologyEx(material, cv2.MORPH_CLOSE, kernel, iterations=2)

    cx = min(max((x1 + x2) // 2 - ex1, 0), material.shape[1] - 1)
    cy = min(max((y1 + y2) // 2 - ey1, 0), material.shape[0] - 1)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(material, connectivity=8)
    seed_lbl = int(labels[cy, cx]) if num > 1 else 0

    if seed_lbl <= 0:
        return _expand_object_bbox_to_pile(hsv, box, frame_width, frame_height)

    comps: list[dict] = []
    for lbl in range(1, num):
        lx, ly, lbw, lbh, area = stats[lbl]
        if area < 60:
            continue
        comps.append({
            "lbl": lbl,
            "box": (lx + ex1, ly + ey1, lx + lbw + ex1, ly + lbh + ey1),
        })

    cluster = [c for c in comps if c["lbl"] == seed_lbl]
    gap_x = max(12, int(w * 0.035))
    changed = True
    while changed:
        changed = False
        for c in comps:
            if any(item["lbl"] == c["lbl"] for item in cluster):
                continue
            for cb in cluster:
                bx1, by1, bx2, by2 = c["box"]
                cx1, cy1, cx2, cy2 = cb["box"]
                vert = max(0, min(by2, cy2) - max(by1, cy1))
                min_h = max(min(by2 - by1, cy2 - cy1), 1)
                if vert / min_h < 0.40:
                    continue
                if max(bx1 - cx2, cx1 - bx2, 0) <= gap_x:
                    cluster.append(c)
                    changed = True
                    break

    tx1 = min(c["box"][0] for c in cluster)
    ty1 = min(c["box"][1] for c in cluster)
    tx2 = max(c["box"][2] for c in cluster)
    ty2 = max(c["box"][3] for c in cluster)
    tx1, ty1 = min(tx1, x1), min(ty1, y1)
    tx2, ty2 = max(tx2, x2), max(ty2, y2)

    if _score_object_box((tx1, ty1, tx2, ty2), frame_width, frame_height) < 0:
        return box
    return tx1, ty1, tx2, ty2


def _finalize_object_bbox(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    *,
    kind: str = "generic",
    roi_mask: np.ndarray | None = None,
) -> tuple[int, int, int, int]:
    """Ôm trọn đống vật tư — envelope có giới hạn quanh detect gốc."""
    enveloped = _envelope_material_pile_bbox(
        hsv, box, frame_width, frame_height, roi_mask=roi_mask,
    )
    balanced = _balance_pile_bbox_to_seed(box, enveloped, frame_width, frame_height)
    return _trim_wet_bottom_from_bbox(hsv, balanced)


def _clip_object_box_to_roi(
    box: tuple[int, int, int, int],
    roi_mask: np.ndarray,
    width: int,
    height: int,
) -> tuple[int, int, int, int] | None:
    """Clip ROI cho vật tư — không thu bbox quá mạnh so với detect gốc."""
    clipped = _clip_box_to_roi(box, roi_mask, width, height, min_overlap=0.78)
    if clipped is None:
        cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
        if _point_in_roi(cx, cy, roi_mask, width, height):
            return box
        return None
    orig_area = max((box[2] - box[0]) * (box[3] - box[1]), 1)
    clip_area = max((clipped[2] - clipped[0]) * (clipped[3] - clipped[1]), 1)
    if clip_area < orig_area * 0.82:
        cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
        if _point_in_roi(cx, cy, roi_mask, width, height):
            return box
    return clipped


def _tighten_object_bbox(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Alias — giữ tương thích test cũ."""
    return _finalize_object_bbox(hsv, box, frame_width, frame_height)


def _bbox_iou(a: tuple[int, int, int, int] | list[float], b: tuple[int, int, int, int] | list[float]) -> float:
    ax1, ay1, ax2, ay2 = [float(v) for v in a]
    bx1, by1, bx2, by2 = [float(v) for v in b]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    aa = max((ax2 - ax1) * (ay2 - ay1), 1.0)
    bb = max((bx2 - bx1) * (by2 - by1), 1.0)
    return inter / (aa + bb - inter)


def _dedupe_boxes(
    boxes: list[tuple[int, int, int, int]],
    *,
    iou_threshold: float = 0.38,
    limit: int = MAX_PATCHES_PER_BEHAVIOR,
) -> list[tuple[int, int, int, int]]:
    sized = sorted(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)
    kept: list[tuple[int, int, int, int]] = []
    for box in sized:
        if all(_bbox_iou(box, prev) < iou_threshold for prev in kept):
            kept.append(box)
        if len(kept) >= limit:
            break
    return kept


def _union_box(
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
) -> tuple[int, int, int, int]:
    return min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])


def _boxes_adjacent(
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
    gap_px: int,
) -> bool:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    dx = max(bx1 - ax2, ax1 - bx2, 0)
    dy = max(by1 - ay2, ay1 - by2, 0)
    return dx <= gap_px and dy <= gap_px


def _merge_adjacent_boxes(
    boxes: list[tuple[int, int, int, int]],
    frame_width: int,
    *,
    gap_ratio: float = 0.045,
) -> list[tuple[int, int, int, int]]:
    """Gộp vật cùng loại liền nhau thành một bbox — tránh log nhiều sự kiện."""
    if len(boxes) <= 1:
        return boxes
    gap_px = max(12, int(frame_width * gap_ratio))
    merged = list(boxes)
    changed = True
    while changed:
        changed = False
        next_boxes: list[tuple[int, int, int, int]] = []
        used = [False] * len(merged)
        for i, box_a in enumerate(merged):
            if used[i]:
                continue
            cur = box_a
            for j in range(i + 1, len(merged)):
                if used[j]:
                    continue
                if _boxes_adjacent(cur, merged[j], gap_px):
                    cur = _union_box(cur, merged[j])
                    used[j] = True
                    changed = True
            next_boxes.append(cur)
            used[i] = True
        merged = next_boxes
    return merged


def _trim_box_overlap(
    box: tuple[int, int, int, int],
    other: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Cắt bbox bùn không chồng vùng vật tư — giữ phần bên trái."""
    x1, y1, x2, y2 = box
    ox1, oy1, ox2, oy2 = other
    ix1 = max(x1, ox1)
    iy1 = max(y1, oy1)
    ix2 = min(x2, ox2)
    iy2 = min(y2, oy2)
    if ix1 >= ix2 or iy1 >= iy2:
        return box
    overlap = (ix2 - ix1) * (iy2 - iy1)
    box_area = max((x2 - x1) * (y2 - y1), 1)
    if overlap / box_area < 0.12:
        return box
    if ox1 <= x1:
        return box
    trimmed_x2 = max(x1 + 20, ox1 - 4)
    if trimmed_x2 <= x1 + 16:
        return box
    return (
        x1,
        y1,
        min(x2, trimmed_x2),
        y2,
    )


def _mud_search_mask(roi_mask: np.ndarray, width: int, height: int) -> np.ndarray:
    """Bùn trên mặt đường — lề trái + vùng cạnh vũng nước, loại phần vật tư xa phải."""
    # Giữ lề trái (bùn/đất cạnh mép đường) — không cắt 10% như road_band.
    band = roi_mask.copy()
    band[: int(height * 0.32), :] = 0
    band[:, int(width * 0.58) :] = 0
    return band


def _mud_shoulder_mask(width: int, height: int) -> np.ndarray:
    """Góc dưới-trái — bùn lẫn cỏ/đất cạnh lề, thường bị loại bởi lọc xanh."""
    mask = np.zeros((height, width), dtype=np.uint8)
    mask[int(height * 0.74) :, : int(width * 0.14)] = 255
    return mask


def _analyze_mud_shoulder(
    hsv: np.ndarray,
    roi_mask: np.ndarray,
    search: np.ndarray,
    frame_area: int,
    frame_width: int,
    frame_height: int,
) -> list[tuple[float, tuple[int, int, int, int]]]:
    """Bùn/đất cạnh lề trái — tách riêng để không dính vùng vật tư / lòng đường."""
    h, w = hsv.shape[:2]
    shoulder = cv2.bitwise_and(_mud_shoulder_mask(w, h), search)
    if cv2.countNonZero(shoulder) < 40:
        return []

    brown = cv2.inRange(hsv, np.array([8, 45, 22]), np.array([30, 220, 135]))
    dark_soil = cv2.inRange(hsv, np.array([5, 25, 12]), np.array([35, 170, 90]))
    muddy_edge = cv2.inRange(hsv, np.array([26, 24, 20]), np.array([72, 155, 125]))
    green_vivid = cv2.inRange(hsv, np.array([40, 110, 95]), np.array([92, 255, 255]))
    white_mat = cv2.inRange(hsv, np.array([0, 0, 175]), np.array([180, 45, 255]))

    mud_mask = cv2.bitwise_or(brown, cv2.bitwise_or(dark_soil, muddy_edge))
    mud_mask = cv2.bitwise_and(mud_mask, shoulder)
    mud_mask = cv2.bitwise_and(mud_mask, cv2.bitwise_not(green_vivid))
    mud_mask = cv2.bitwise_and(mud_mask, cv2.bitwise_not(white_mat))
    mud_mask = cv2.medianBlur(mud_mask, 5)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mud_mask = cv2.morphologyEx(mud_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mud_mask = cv2.morphologyEx(mud_mask, cv2.MORPH_OPEN, kernel, iterations=1)

    roi_pixels = max(_roi_pixel_count(search), 1)
    min_area = frame_area * 0.00030
    max_area = frame_area * 0.024
    max_w = int(frame_width * 0.22)
    max_h = int(frame_height * 0.24)
    contours, _ = cv2.findContours(mud_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    ranked: list[tuple[float, float, tuple[int, int, int, int]]] = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw > max_w or bh > max_h:
            continue
        tight = _tight_bbox_from_contour(cnt, shoulder, h, w)
        if tight is None:
            continue
        box = _clamp_mud_box(tight, w)
        geo = _score_mud_box(box, w, h)
        if geo < 0:
            continue
        pct = 100.0 * area / roi_pixels
        if pct < 0.015:
            continue
        ranked.append((geo + area * 0.02, area, box))

    if not ranked:
        return []
    ranked.sort(key=lambda row: row[0], reverse=True)
    boxes = _dedupe_boxes([row[2] for row in ranked[:2]])
    area_map = {row[2]: row[1] for row in ranked}
    return [(round(100.0 * area_map.get(box, 0) / roi_pixels, 2), box) for box in boxes]


def _clamp_mud_box(
    box: tuple[int, int, int, int],
    frame_width: int,
) -> tuple[int, int, int, int]:
    """Thu hẹp bbox bùn — không để tràn sang vùng vật tư."""
    x1, y1, x2, y2 = box
    max_w = int(frame_width * 0.36)
    if x2 - x1 <= max_w:
        return box
    return (x1, y1, x1 + max_w, y2)


def _score_mud_box(box: tuple[int, int, int, int], frame_width: int, frame_height: int) -> float:
    """Ưu tiên mảng bùn gọn ở lề trái / cạnh vũng nước — không bao vật tư xa phải."""
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    shoulder = cx / max(frame_width, 1) < 0.16 and cy / max(frame_height, 1) > 0.68
    min_bw = 14 if shoulder else 20
    min_bh = 10 if shoulder else 12
    if bw < min_bw or bh < min_bh:
        return -1.0
    area = bw * bh
    x_norm = cx / max(frame_width, 1)
    y_norm = cy / max(frame_height, 1)
    if x_norm > 0.54:
        return -1.0
    if x2 > frame_width * 0.60:
        return -1.0
    if y_norm < 0.38:
        return -1.0
    if bw > frame_width * 0.42:
        return -1.0
    compact = area / max(float(bw * bh), 1.0)
    if compact < 0.10:
        return -1.0
    cx_target = frame_width * 0.24
    return area * compact * (0.55 + y_norm * 0.45) - abs(cx - cx_target) * 1.6


def _trim_mud_from_objects(
    box: tuple[int, int, int, int],
    obj_boxes: list[tuple[int, int, int, int]],
    frame_width: int,
) -> tuple[int, int, int, int] | None:
    """Loại/cắt bbox bùn chồng vật tư — không để thành vệt mảnh."""
    x1, y1, x2, y2 = box
    trimmed = box
    for obj in obj_boxes:
        if _bbox_iou(trimmed, obj) < 0.10:
            continue
        if _bbox_containment(trimmed, obj) > 0.45:
            return None
        ox1, _, ox2, _ = obj
        mcx = (trimmed[0] + trimmed[2]) / 2
        if mcx >= ox1 and _bbox_containment(trimmed, obj) > 0.22:
            return None
        if trimmed[0] < ox1 and mcx < ox1:
            nx2 = max(trimmed[0] + 24, int(ox1 - 8))
            if nx2 <= trimmed[0] + 20:
                return None
            trimmed = (trimmed[0], trimmed[1], min(trimmed[2], nx2), trimmed[3])
    tw = trimmed[2] - trimmed[0]
    th = trimmed[3] - trimmed[1]
    if tw < 28 or th < 14:
        return None
    if (trimmed[0] + trimmed[2]) / 2 > frame_width * 0.38:
        return None
    return trimmed


def _analyze_mud(
    hsv: np.ndarray,
    roi_mask: np.ndarray,
    frame_area: int,
    frame_width: int,
) -> list[tuple[float, tuple[int, int, int, int]]]:
    h, w = hsv.shape[:2]
    search = _mud_search_mask(roi_mask, frame_width, h)
    v_u8 = hsv[:, :, 2]
    v_f = v_u8.astype(np.float32)
    local_v = cv2.GaussianBlur(v_f, (41, 41), 0)

    brown = cv2.inRange(hsv, np.array([8, 55, 28]), np.array([28, 210, 130]))
    dark_soil = cv2.inRange(hsv, np.array([5, 30, 14]), np.array([32, 160, 82]))
    asphalt = cv2.inRange(hsv, np.array([8, 0, 95]), np.array([30, 48, 255]))
    # Chỉ loại cây/lưới xanh tươi — giữ bùn lẫn cỏ olive ở lề trái.
    green_vivid = cv2.inRange(hsv, np.array([38, 95, 90]), np.array([92, 255, 255]))
    white_mat = cv2.inRange(hsv, np.array([0, 0, 175]), np.array([180, 45, 255]))
    orange_gear = cv2.inRange(hsv, np.array([8, 110, 150]), np.array([28, 255, 255]))
    # Chỉ loại kim loại gỉ sáng rõ (bão hoà cao, sáng) — không trùng dải bùn/đất tối.
    # Vùng chồng vật tư thật sẽ được cắt riêng bởi _trim_mud_from_objects (bbox thật).
    rust_metal = cv2.inRange(hsv, np.array([5, 150, 90]), np.array([22, 255, 190]))
    blue_vest = cv2.inRange(hsv, np.array([85, 50, 80]), np.array([130, 255, 255]))
    rel_dark = (local_v - v_f > 6).astype(np.uint8) * 255

    mud_base = cv2.bitwise_or(brown, dark_soil)
    mud_focus = cv2.bitwise_and(mud_base, rel_dark)
    mud_mask = cv2.bitwise_or(
        mud_focus,
        cv2.bitwise_and(mud_base, cv2.bitwise_not(asphalt)),
    )
    mud_mask = cv2.bitwise_and(mud_mask, search)
    mud_mask = cv2.bitwise_and(mud_mask, cv2.bitwise_not(green_vivid))
    mud_mask = cv2.bitwise_and(mud_mask, cv2.bitwise_not(white_mat))
    mud_mask = cv2.bitwise_and(mud_mask, cv2.bitwise_not(orange_gear))
    mud_mask = cv2.bitwise_and(mud_mask, cv2.bitwise_not(rust_metal))
    mud_mask = cv2.bitwise_and(mud_mask, cv2.bitwise_not(blue_vest))
    mud_mask = cv2.medianBlur(mud_mask, 5)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mud_mask = cv2.morphologyEx(mud_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mud_mask = cv2.morphologyEx(mud_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mud_mask = cv2.dilate(mud_mask, kernel, iterations=1)

    roi_pixels = max(_roi_pixel_count(search), 1)
    min_area = frame_area * 0.0010
    max_area = frame_area * 0.065
    contours, _ = cv2.findContours(mud_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    ranked: list[tuple[float, float, tuple[int, int, int, int]]] = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        tight = _tight_bbox_from_contour(cnt, search, h, w)
        if tight is None:
            continue
        box = _clamp_mud_box(tight, w)
        geo = _score_mud_box(box, w, h)
        if geo < 0:
            continue
        pct = 100.0 * area / roi_pixels
        if pct < 0.05:
            continue
        ranked.append((geo + area * 0.015, area, box))

    shoulder_patches = _analyze_mud_shoulder(hsv, roi_mask, search, frame_area, w, h)
    for pct, box in shoulder_patches:
        geo = _score_mud_box(box, w, h)
        if geo < 0:
            continue
        area = pct * roi_pixels / 100.0
        ranked.append((geo + area * 0.015, area, box))

    if not ranked:
        return []
    ranked.sort(key=lambda row: row[0], reverse=True)
    boxes = _dedupe_boxes([row[2] for row in ranked])
    out: list[tuple[float, tuple[int, int, int, int]]] = []
    area_map = {row[2]: row[1] for row in ranked}
    for box in boxes:
        pct = round(100.0 * area_map.get(box, 0) / roi_pixels, 2)
        out.append((pct, box))
    return out


def _wet_water_search_mask(roi_mask: np.ndarray, width: int, height: int) -> np.ndarray:
    """Vũng phản chiếu trên nhựa — giữa lòng đường phía gần."""
    band = roi_mask.copy()
    band[: int(height * 0.55), :] = 0
    band[:, : int(width * 0.04)] = 0
    band[:, int(width * 0.78) :] = 0
    return band


def _score_water_box(
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    *,
    expanded: bool = False,
) -> float:
    """Điểm vị trí vũng nước — ưu tiên giữa-dưới khung hình (vũng thật trên lòng đường)."""
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    if bw < MIN_WATER_BBOX_WIDTH or bh < MIN_WATER_BBOX_HEIGHT:
        return -1.0
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    area = bw * bh
    cx_target = frame_width * 0.36
    y_norm = cy / max(frame_height, 1)
    x_norm = cx / max(frame_width, 1)
    min_y = 0.58 if expanded else 0.62
    if y_norm < min_y:
        return -1.0
    max_x_norm = 0.58 if expanded else 0.50
    min_x_norm = 0.12 if expanded else 0.25
    if x_norm < min_x_norm or x_norm > max_x_norm:
        return -1.0
    max_x1 = frame_width * (0.44 if expanded else 0.32)
    if x1 > max_x1:
        return -1.0
    if x1 < frame_width * 0.02 and y2 > frame_height * 0.92 and not expanded:
        return -1.0
    aspect = bw / max(bh, 1)
    # Vũng thật thường dải ngang rộng — chỉ loại vệt cực mỏng (bùn/ống)
    if bw > frame_width * 0.52 and bh < frame_height * 0.06 and aspect > 10.0:
        return -1.0
    center_penalty = abs(cx - cx_target) * (2.5 if expanded else 3.5)
    area_bonus = area * (0.55 if expanded else 0.45)
    return area_bonus * (0.45 + y_norm * 0.55) - center_penalty + min(bh, bw) * 1.5


def _score_water_patch(
    cnt: np.ndarray,
    x: int,
    y: int,
    bw: int,
    bh: int,
    area: float,
    v: np.ndarray,
    h: int,
    w: int,
    *,
    cx_target: float = 0.38,
    min_cy_ratio: float = 0.68,
    max_mean_v: float = 200.0,
    min_compactness: float = 0.0,
) -> float:
    if bw < MIN_WATER_BBOX_WIDTH or bh < MIN_WATER_BBOX_HEIGHT:
        return -1.0
    cy = y + bh / 2
    cx = x + bw / 2
    if cy < h * min_cy_ratio:
        return -1.0
    max_cx = w * (0.58 if cx_target >= 0.40 else 0.50)
    if cx < w * 0.18 or cx > max_cx:
        return -1.0
    if x > w * 0.44:
        return -1.0
    compactness = area / float(bw * bh)
    if compactness < min_compactness:
        return -1.0
    patch_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(patch_mask, [cnt], -1, 255, -1)
    mean_v = cv2.mean(v, mask=patch_mask)[0]
    if mean_v > max_mean_v:
        return -1.0
    center_weight = max(0.25, 1.0 - abs(cx - w * 0.40) / (w * 0.32))
    return area * (cy / h) * center_weight


def _trim_barrier_from_water_bbox(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
) -> tuple[int, int, int, int]:
    """Cắt phần hàng rào/vỉa khỏi bbox vũng — giữ vùng nước trên lòng đường."""
    x1, y1, x2, y2 = [int(v) for v in box]
    for _ in range(12):
        if y2 - y1 <= 24:
            break
        top = (x1, y1, x2, min(y2, y1 + max(24, (y2 - y1) // 2)))
        if _is_temporary_barrier_box(hsv, top):
            y1 += max(3, (y2 - y1) // 8)
        else:
            break
    for _ in range(8):
        if x2 - x1 <= 40:
            break
        left = (x1, y1, min(x2, x1 + max(40, (x2 - x1) // 2)), y2)
        if _is_temporary_barrier_box(hsv, left):
            x1 += max(3, (x2 - x1) // 10)
        else:
            break
    if x2 - x1 < 20 or y2 - y1 < 12:
        return box
    return x1, y1, x2, y2


def _boxes_overlap_or_near(
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
    *,
    gap_px: int = 0,
) -> bool:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    if ax2 + gap_px < bx1 or bx2 + gap_px < ax1 or ay2 + gap_px < by1 or by2 + gap_px < ay1:
        return False
    return True


def _water_puddle_component_bbox(
    puddle_mask: np.ndarray,
    seed: tuple[int, int, int, int],
    roi_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int] | None:
    """Bbox ôm trọn component vũng nước liền seed — không chỉ mảnh contour nhỏ."""
    h, w = puddle_mask.shape[:2]
    sx1, sy1, sx2, sy2 = [int(v) for v in seed]
    cx = min(max((sx1 + sx2) // 2, 0), w - 1)
    cy = min(max((sy1 + sy2) // 2, 0), h - 1)

    num, labels, stats, _ = cv2.connectedComponentsWithStats(puddle_mask, connectivity=8)
    seed_lbl = int(labels[cy, cx]) if num > 1 else 0
    if seed_lbl <= 0:
        seed_paint = np.zeros((h, w), dtype=np.uint8)
        seed_paint[sy1:sy2, sx1:sx2] = 255
        probe = cv2.bitwise_and(seed_paint, puddle_mask)
        if np.count_nonzero(probe) < 8:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))
            probe = cv2.dilate(seed_paint, kernel, iterations=3)
            probe = cv2.bitwise_and(probe, puddle_mask)
        ys, xs = np.where(probe > 0)
        if len(xs) < 8:
            return None
        cy = int(np.mean(ys))
        cx = int(np.mean(xs))
        seed_lbl = int(labels[cy, cx])
        if seed_lbl <= 0:
            return None

    merged = np.zeros((h, w), dtype=np.uint8)
    merged[labels == seed_lbl] = 255
    touch_gap = max(8, int(frame_width * 0.012))
    for lbl in range(1, num):
        if lbl == seed_lbl:
            continue
        x, y, bw, bh, area = stats[lbl]
        if area < 40:
            continue
        box = (int(x), int(y), int(x + bw), int(y + bh))
        if _boxes_overlap_or_near(box, seed, gap_px=touch_gap):
            merged[labels == lbl] = 255

    close_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    merged = cv2.morphologyEx(merged, cv2.MORPH_CLOSE, close_k, iterations=1)
    ys, xs = np.where(merged > 0)
    if len(xs) < 12:
        return None
    envelope = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    return _clip_water_box_to_roi(envelope, roi_mask, w, h)


def _snap_water_bbox_to_puddle_mask(
    box: tuple[int, int, int, int],
    puddle_mask: np.ndarray,
    roi_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Kéo bbox ôm theo mặt nạ vũng ướt quanh seed — không trải ngang cả lòng đường."""
    x1, y1, x2, y2 = [int(v) for v in box]
    bw = max(x2 - x1, 1)
    pad_x = max(10, int(bw * 0.14))
    x_lo = max(0, x1 - pad_x)
    x_hi = min(frame_width, x2 + pad_x)
    h = max(y2 - y1, 1)
    y_band_top = max(0, y2 - max(int(h * 0.95), 28))
    band = puddle_mask[y_band_top:y2, x_lo:x_hi]
    if band.size == 0:
        return box
    cols = np.where(np.any(band > 0, axis=0))[0]
    if len(cols) < 8:
        return box
    lx = x_lo + int(cols.min())
    rx = x_lo + int(cols.max()) + 1
    sub = puddle_mask[y_band_top:y2, lx:rx]
    rows = np.where(np.any(sub > 0, axis=1))[0]
    if len(rows) < 5:
        return box
    ty1 = y_band_top + int(rows.min())
    ty2 = y_band_top + int(rows.max()) + 1
    pad_y = max(4, int((ty2 - ty1) * 0.06))
    candidate = (
        max(0, lx - max(4, int(bw * 0.04))),
        max(0, min(y1, ty1) - pad_y),
        min(frame_width, rx + max(4, int(bw * 0.04))),
        min(frame_height, ty2 + pad_y),
    )
    clipped = _clip_water_box_to_roi(candidate, roi_mask, frame_width, frame_height)
    return clipped or box


def _local_water_bbox_from_puddle(
    puddle_mask: np.ndarray,
    seed: tuple[int, int, int, int],
    roi_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """BBox gọn quanh vũng — chỉ mở rộng trong vùng ướt liền seed."""
    h, w = puddle_mask.shape[:2]
    sx1, sy1, sx2, sy2 = [int(v) for v in seed]
    seed_paint = np.zeros((h, w), dtype=np.uint8)
    seed_paint[sy1:sy2, sx1:sx2] = 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))
    local = cv2.dilate(seed_paint, kernel, iterations=2)
    local = cv2.bitwise_and(local, puddle_mask)
    local = cv2.bitwise_and(local, roi_mask)
    ys, xs = np.where(local > 0)
    if len(xs) < 10:
        component = _water_puddle_component_bbox(
            puddle_mask, seed, roi_mask, frame_width, frame_height,
        )
        return component or seed

    envelope = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    pad_x = max(6, int((envelope[2] - envelope[0]) * 0.05))
    pad_y = max(5, int((envelope[3] - envelope[1]) * 0.07))
    candidate = (
        max(0, envelope[0] - pad_x),
        max(0, envelope[1] - pad_y),
        min(w, envelope[2] + pad_x),
        min(h, envelope[3] + pad_y),
    )
    clipped = _clip_water_box_to_roi(candidate, roi_mask, w, h)
    return clipped or seed


def _expand_water_bbox_to_puddle(
    puddle_mask: np.ndarray,
    hsv: np.ndarray,
    seed: tuple[int, int, int, int],
    roi_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Mở rộng bbox vũng nước gọn quanh vũng thật — không trải ngang cả lòng đường."""
    max_width = frame_width * 0.46

    local = _local_water_bbox_from_puddle(
        puddle_mask, seed, roi_mask, frame_width, frame_height,
    )
    if (local[2] - local[0]) <= max_width and _is_valid_water_box(
        hsv, local, frame_width, frame_height,
    ):
        return local
    if (local[2] - local[0]) <= max_width and _is_valid_water_box(
        hsv, local, frame_width, frame_height, expanded=True,
    ):
        return local

    snapped = _snap_water_bbox_to_puddle_mask(
        seed, puddle_mask, roi_mask, frame_width, frame_height,
    )
    if (snapped[2] - snapped[0]) <= max_width and _is_valid_water_box(
        hsv, snapped, frame_width, frame_height,
    ):
        return snapped
    if (snapped[2] - snapped[0]) <= max_width and _is_valid_water_box(
        hsv, snapped, frame_width, frame_height, expanded=True,
    ):
        return snapped

    if _is_valid_water_box(hsv, seed, frame_width, frame_height):
        return seed
    if _is_valid_water_box(hsv, seed, frame_width, frame_height, expanded=True):
        return seed
    return local if (local[2] - local[0]) <= (snapped[2] - snapped[0]) else snapped


def _analyze_water(
    hsv: np.ndarray,
    roi_mask: np.ndarray,
    mud_boxes: list[tuple[int, int, int, int]],
    frame_area: int,
    frame_width: int,
) -> list[tuple[float, tuple[int, int, int, int]]]:
    h, w = hsv.shape[:2]
    exclude = _masks_from_boxes(h, w, mud_boxes, pad_ratio=0.02)
    v_u8 = hsv[:, :, 2]
    v_f = v_u8.astype(np.float32)
    mud_brown = cv2.inRange(hsv, np.array([10, 70, 30]), np.array([28, 220, 120]))
    mud_left = cv2.inRange(hsv, np.array([8, 60, 30]), np.array([30, 220, 130]))
    steel = cv2.inRange(hsv, np.array([0, 40, 40]), np.array([20, 255, 200]))
    white = cv2.inRange(hsv, np.array([0, 0, 185]), np.array([180, 35, 255]))
    k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    k7 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))

    ranked: list[tuple[float, float, tuple[int, int, int, int], int]] = []

    def consider(mask: np.ndarray, search: np.ndarray, min_a: float, max_a: float, **score_kw) -> None:
        roi_pixels = max(_roi_pixel_count(search), 1)
        min_area = frame_area * min_a
        max_area = frame_area * max_a
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area or area > max_area:
                continue
            tight = _tight_bbox_from_contour(cnt, search, h, w)
            if tight is None:
                continue
            x1, y1, x2, y2 = tight
            bw, bh = x2 - x1, y2 - y1
            score = _score_water_patch(cnt, x1, y1, bw, bh, area, v_u8, h, w, **score_kw)
            if score <= 0:
                continue
            patch_mask = np.zeros((h, w), dtype=np.uint8)
            cv2.drawContours(patch_mask, [cnt], -1, 255, -1)
            mean_v = cv2.mean(v_u8, mask=patch_mask)[0]
            adjusted = score * (4.0 if mean_v < 80 else 1.0)
            box = tight
            geo = _score_water_box(box, w, h, expanded=True)
            if geo < 0:
                geo = _score_water_box(box, w, h)
            if geo < 0:
                continue
            clipped = _clip_water_box_to_roi(box, roi_mask, w, h)
            if clipped is None:
                clipped = _clip_box_to_roi(box, roi_mask, w, h, min_overlap=0.72)
            if clipped is None:
                continue
            box = clipped
            if not _is_valid_water_box(hsv, box, w, h, expanded=True):
                if not _is_valid_water_box(hsv, box, w, h):
                    continue
            pct = 100.0 * area / roi_pixels
            if pct < MIN_WATER_EVENT_ROI_PERCENT:
                continue
            ranked.append((adjusted + geo * 0.15, area, box, roi_pixels))

    search_dark = _water_search_mask(roi_mask, frame_width, h)
    dark = cv2.inRange(v_u8, 8, 82)
    dark = cv2.bitwise_and(dark, search_dark)
    dark = cv2.bitwise_and(dark, cv2.bitwise_not(mud_brown))
    dark = cv2.bitwise_and(dark, cv2.bitwise_not(steel))
    dark_for_expand = cv2.morphologyEx(dark.copy(), cv2.MORPH_CLOSE, k5, iterations=1)
    dark = cv2.bitwise_and(dark, cv2.bitwise_not(exclude))
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, k5, iterations=1)
    consider(dark, search_dark, 0.0035, 0.07, min_cy_ratio=0.72, max_mean_v=75)

    search_wet = _wet_water_search_mask(roi_mask, frame_width, h)
    local = cv2.GaussianBlur(v_f, (51, 51), 0)
    rel_dark = ((local - v_f) > 5).astype(np.uint8) * 255
    road_mean = cv2.mean(v_u8, mask=search_wet)[0]
    damp = cv2.inRange(v_u8, int(max(90, road_mean - 35)), int(min(175, road_mean + 8)))
    wet = cv2.bitwise_or(rel_dark, damp)
    wet = cv2.bitwise_and(wet, search_wet)
    wet = cv2.bitwise_and(wet, cv2.bitwise_not(white))
    wet = cv2.bitwise_and(wet, cv2.bitwise_not(mud_left))
    wet_for_expand = wet.copy()
    wet = cv2.bitwise_and(wet, cv2.bitwise_not(exclude))
    wet = cv2.morphologyEx(wet, cv2.MORPH_OPEN, k5, iterations=1)
    wet = cv2.morphologyEx(wet, cv2.MORPH_CLOSE, k7, iterations=2)
    wet_for_expand = cv2.morphologyEx(wet_for_expand, cv2.MORPH_OPEN, k5, iterations=1)
    wet_for_expand = cv2.morphologyEx(wet_for_expand, cv2.MORPH_CLOSE, k7, iterations=2)
    puddle_mask = cv2.bitwise_or(
        cv2.bitwise_and(dark_for_expand, search_dark),
        cv2.bitwise_and(wet_for_expand, search_wet),
    )
    consider(
        wet, search_wet, 0.0045, 0.12,
        min_cy_ratio=0.62, max_mean_v=175, min_compactness=0.10, cx_target=0.42,
    )

    if not ranked:
        return []
    ranked.sort(key=lambda row: row[0], reverse=True)
    boxes = _dedupe_boxes([row[2] for row in ranked])
    boxes = _merge_adjacent_boxes(boxes, w, gap_ratio=0.06)
    out: list[tuple[float, tuple[int, int, int, int]]] = []
    meta = {row[2]: (row[1], row[3]) for row in ranked}
    for box in boxes:
        expanded = _expand_water_bbox_to_puddle(puddle_mask, hsv, box, roi_mask, w, h)
        area, roi_px = meta.get(box, (0, 1))
        ex1, ey1, ex2, ey2 = expanded
        expanded_area_ratio = ((ex2 - ex1) * (ey2 - ey1)) / max(frame_area, 1)
        seed_area_ratio = ((box[2] - box[0]) * (box[3] - box[1])) / max(frame_area, 1)
        if expanded_area_ratio > seed_area_ratio * 1.05:
            pct = round(max(100.0 * expanded_area_ratio * 0.92, 100.0 * area / max(roi_px, 1)), 2)
        else:
            pct = round(100.0 * area / max(roi_px, 1), 2)
        if not _is_valid_water_box(hsv, expanded, w, h, expanded=True):
            if _is_valid_water_box(hsv, box, w, h, expanded=True):
                expanded = box
            elif _is_valid_water_box(hsv, box, w, h):
                expanded = box
            else:
                continue
        if not _water_meets_violation_size(expanded, w, h, frame_area, area_percent=pct):
            continue
        out.append((pct, expanded))
    return out


def episode_snapshot_score(
    behavior: str,
    det: RoadDetection,
    frame_width: int,
    frame_height: int,
) -> float:
    """Chọn frame/detection tốt nhất trong phiên debounce — snapshot khớp vùng thật."""
    if behavior == "object":
        box = tuple(int(v) for v in det.bbox)
        geo = _score_object_box(box, frame_width, frame_height)
        if geo < 0:
            return -1.0
        x1, y1, x2, y2 = box
        area_ratio = ((x2 - x1) * (y2 - y1)) / max(frame_width * frame_height, 1)
        compact_bonus = max(0.0, 0.055 - area_ratio) * 12000.0
        return det.confidence * 1000.0 + geo + compact_bonus
    if behavior in ("mud", "water"):
        if behavior == "mud":
            box = tuple(int(v) for v in det.bbox)
            geo = _score_mud_box(box, frame_width, frame_height)
            if geo < 0:
                return -1.0
            pct = det.area_percent or 0.0
            return geo + pct * 3.0 + det.confidence * 40.0
        if behavior == "water":
            box = tuple(int(v) for v in det.bbox)
            geo = _score_water_box(box, frame_width, frame_height, expanded=True)
            if geo < 0:
                geo = _score_water_box(box, frame_width, frame_height)
            if geo < 0:
                return -1.0
            pct = det.area_percent or 0.0
            cx = (box[0] + box[2]) / 2
            bw = box[2] - box[0]
            x_bonus = max(0.0, 12000.0 - abs(cx / max(frame_width, 1) - 0.36) * 28000.0)
            compact_bonus = max(0.0, frame_width * 0.44 - bw) * 14.0
            return geo + x_bonus + compact_bonus + pct * 4.0 + det.confidence * 50.0
        pct = det.area_percent or 0.0
        return det.confidence * 1000.0 + pct * 10.0
    return det.confidence


def _score_object_box(box: tuple[int, int, int, int], frame_width: int, frame_height: int) -> float:
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    area = bw * bh
    ar = bw / max(bh, 1)
    center_x = (x1 + x2) / 2
    center_y = (y1 + y2) / 2
    cx_target = frame_width * 0.46
    # Loại vạch trắng/xa — vật chiếm đường nằm gần camera (dầm thép)
    y_norm = center_y / max(frame_height, 1)
    if y_norm < 0.72:
        return -1.0
    area_ratio = area / max(frame_width * frame_height, 1)
    if area_ratio < MIN_OBJECT_AREA_RATIO:
        return -1.0
    return area * (1 + min(ar, 5) * 0.12) - abs(center_x - cx_target) * 1.5 + y_norm * 800


def _green_ratio_in_box(hsv: np.ndarray, box: tuple[int, int, int, int]) -> float:
    x1, y1, x2, y2 = box
    patch = hsv[y1:y2, x1:x2]
    if patch.size == 0:
        return 0.0
    green = cv2.inRange(patch, np.array([32, 28, 45]), np.array([95, 255, 230]))
    return float(cv2.countNonZero(green)) / max(patch.shape[0] * patch.shape[1], 1)


def _refine_object_kind(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    kind: str,
) -> str:
    """Sửa phân loại — dầm thép / kim loại không bị gán nhầm bao xi măng / gạch."""
    h, w = hsv.shape[:2]
    x1, y1, x2, y2 = box
    patch = hsv[y1:y2, x1:x2]
    if patch.size == 0:
        return kind
    green_ratio = _green_ratio_in_box(hsv, box)
    mean_h = float(patch[:, :, 0].mean())
    mean_sat = float(patch[:, :, 1].mean())
    bw, bh = x2 - x1, y2 - y1
    aspect = bw / max(bh, 1)
    area_ratio = (bw * bh) / max(w * h, 1)
    if green_ratio > 0.045 or (aspect > 1.4 and mean_sat < 70):
        return "steel"
    if kind == "cement_bag":
        if area_ratio > 0.07 and aspect > 0.95 and mean_sat < 100:
            return "rust_metal"
        if aspect > 1.25 and bw > w * 0.14:
            return "rust_metal"
    if kind == "brick" and mean_sat < 62:
        return "steel"
    if kind == "brick" and aspect > 1.35:
        return "steel"
    if kind == "generic" and green_ratio > 0.03:
        return "steel"
    return kind


def _dedupe_object_kinds(
    items: list[tuple[str, tuple[int, int, int, int]]],
    hsv: np.ndarray,
    frame_width: int,
    frame_height: int,
) -> list[tuple[str, tuple[int, int, int, int]]]:
    """Loại trùng vùng — ưu tiên loại vật tư đúng (thép > gỉ > bao xi măng)."""
    refined_items = [
        (_refine_object_kind(hsv, box, kind), box)
        for kind, box in items
    ]
    ranked = sorted(
        refined_items,
        key=lambda row: (
            OBJECT_KIND_PRIORITY.get(row[0], 0),
            _score_object_box(row[1], frame_width, frame_height),
        ),
        reverse=True,
    )
    kept: list[tuple[str, tuple[int, int, int, int]]] = []
    for kind, box in ranked:
        replaced = False
        for idx, (prev_kind, prev_box) in enumerate(kept):
            iou = _bbox_iou(box, prev_box)
            if iou < 0.38 and _bbox_containment(box, prev_box) < 0.62 and _bbox_containment(prev_box, box) < 0.62:
                continue
            prev_pri = OBJECT_KIND_PRIORITY.get(prev_kind, 0)
            new_pri = OBJECT_KIND_PRIORITY.get(kind, 0)
            union_box = _union_box(box, prev_box)
            best_kind = kind if new_pri >= prev_pri else prev_kind
            kept[idx] = (best_kind, union_box)
            replaced = True
            break
        if not replaced:
            kept.append((kind, box))
    return kept


def _merge_same_kind_clusters(
    items: list[tuple[str, tuple[int, int, int, int]]],
    frame_width: int,
) -> list[tuple[str, tuple[int, int, int, int]]]:
    """Gộp thêm các bbox cùng loại gần nhau sau dedupe."""
    buckets: dict[str, list[tuple[int, int, int, int]]] = {}
    for kind, box in items:
        buckets.setdefault(kind, []).append(box)
    out: list[tuple[str, tuple[int, int, int, int]]] = []
    for kind, boxes in buckets.items():
        merged = _merge_adjacent_boxes(boxes, frame_width)
        for box in merged:
            out.append((kind, box))
    return out


def _analyze_objects(
    hsv: np.ndarray,
    gray: np.ndarray,
    roi_mask: np.ndarray,
    mud_boxes: list[tuple[int, int, int, int]],
    water_boxes: list[tuple[int, int, int, int]],
    frame_area: int,
) -> list[tuple[str, tuple[int, int, int, int]]]:
    h, w = hsv.shape[:2]
    exclude = _masks_from_boxes(h, w, mud_boxes + water_boxes, pad_ratio=0.08)
    search = _object_search_mask(roi_mask, w, h)
    tan = cv2.inRange(hsv, np.array([15, 25, 120]), np.array([35, 180, 255]))
    zebra = cv2.inRange(hsv, np.array([0, 0, 165]), np.array([180, 40, 255]))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    k7 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))

    def boxes_for_mask(
        mask: np.ndarray,
        *,
        min_ratio: float = MIN_OBJECT_AREA_RATIO,
        max_ratio: float = MAX_OBJECT_AREA_RATIO,
        limit: int = 6,
        max_width_ratio: float | None = 0.68,
        min_compactness: float = 0.04,
        close_iter: int = 2,
    ) -> list[tuple[int, int, int, int]]:
        work = cv2.bitwise_and(mask, search)
        work = cv2.bitwise_and(work, cv2.bitwise_not(exclude))
        work = cv2.bitwise_and(work, cv2.bitwise_not(zebra))
        work = cv2.morphologyEx(work, cv2.MORPH_CLOSE, kernel, iterations=close_iter)
        return _contour_boxes(
            work, search,
            min_ratio, max_ratio,
            frame_area, w, limit=limit,
            max_width_ratio=max_width_ratio,
            min_compactness=min_compactness,
        )

    by_kind: list[tuple[str, tuple[int, int, int, int]]] = []

    # Thép / dầm sơn xanh
    green_steel = cv2.inRange(hsv, np.array([32, 28, 45]), np.array([95, 255, 230]))
    green_steel = cv2.bitwise_and(green_steel, cv2.bitwise_not(tan))
    steel_boxes = boxes_for_mask(green_steel, min_compactness=0.04)
    steel_boxes = _merge_adjacent_boxes(steel_boxes, w)
    for box in steel_boxes:
        if _score_object_box(box, w, h) >= 0:
            by_kind.append(("steel", box))

    # Bao xi măng / vật liệu bột (túi trắng, vàng nhạt)
    cement_bag = cv2.inRange(hsv, np.array([8, 18, 130]), np.array([35, 140, 255]))
    white_bag = cv2.inRange(hsv, np.array([0, 0, 155]), np.array([180, 55, 255]))
    cement_mask = cv2.bitwise_or(cement_bag, white_bag)
    cement_mask = cv2.bitwise_and(cement_mask, cv2.bitwise_not(green_steel))
    cement_boxes = boxes_for_mask(cement_mask, max_ratio=0.10, min_compactness=0.06, max_width_ratio=0.55)
    cement_boxes = _merge_adjacent_boxes(cement_boxes, w, gap_ratio=0.035)
    for box in cement_boxes:
        if _score_object_box(box, w, h) < 0:
            continue
        bw, bh = box[2] - box[0], box[3] - box[1]
        area_ratio = (bw * bh) / max(frame_area, 1)
        aspect = bw / max(bh, 1)
        # Dầm thép / vật dài — hay bị nhầm bao xi măng khi sát hàng rào.
        if aspect > 1.08 and bw >= w * 0.20:
            continue
        if area_ratio > 0.075 or bh > h * 0.36:
            continue
        patch = hsv[box[1]:box[3], box[0]:box[2]]
        if patch.size and float(patch[:, :, 1].mean()) < 62:
            continue
        by_kind.append((_refine_object_kind(hsv, box, "cement_bag"), box))

    # Gạch / block đỏ-nâu
    brick_red = cv2.inRange(hsv, np.array([0, 45, 45]), np.array([12, 255, 220]))
    brick_alt = cv2.inRange(hsv, np.array([165, 40, 45]), np.array([180, 255, 220]))
    brick_mask = cv2.bitwise_or(brick_red, brick_alt)
    brick_boxes = boxes_for_mask(brick_mask, max_ratio=0.11, min_compactness=0.05, max_width_ratio=0.58)
    brick_boxes = _merge_adjacent_boxes(brick_boxes, w)
    for box in brick_boxes:
        if _score_object_box(box, w, h) < 0:
            continue
        patch = hsv[box[1]:box[3], box[0]:box[2]]
        if patch.size and float(patch[:, :, 1].mean()) < 62:
            continue
        kind = _refine_object_kind(hsv, box, "brick")
        by_kind.append((kind, box))

    # Kim loại gỉ / nâu đỏ
    rust_mask = cv2.inRange(hsv, np.array([5, 55, 40]), np.array([25, 255, 210]))
    rust_mask = cv2.bitwise_and(rust_mask, cv2.bitwise_not(tan))
    rust_boxes = boxes_for_mask(rust_mask, max_ratio=0.12, min_compactness=0.04, max_width_ratio=0.68, close_iter=3)
    rust_boxes = _merge_adjacent_boxes(rust_boxes, w)
    for box in rust_boxes:
        if _score_object_box(box, w, h) >= 0:
            by_kind.append(("rust_metal", box))

    # Bổ sung dầm thép / vật lớn từ biên cạnh (gộp mảnh liền nhau)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 45, 130)
    edges = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)
    edge_mask = cv2.bitwise_and(edges, search)
    edge_mask = cv2.bitwise_and(edge_mask, cv2.bitwise_not(exclude))
    edge_mask = cv2.morphologyEx(edge_mask, cv2.MORPH_CLOSE, k7, iterations=2)
    edge_boxes = _contour_boxes(
        edge_mask, search,
        MIN_OBJECT_EPISODE_AREA_RATIO, 0.12,
        frame_area, w, limit=6, max_width_ratio=0.68, min_compactness=0.05,
    )
    edge_boxes = [b for b in edge_boxes if _score_object_box(b, w, h) >= 0]
    edge_boxes = _merge_adjacent_boxes(edge_boxes, w)
    color_boxes = [box for _, box in by_kind]
    for box in edge_boxes:
        ar = (box[2] - box[0]) / max(box[3] - box[1], 1)
        if any(_bbox_iou(box, known) >= 0.34 for known in color_boxes):
            # Dầm thép dài — không để cement FP chặn edge detect.
            if ar <= 1.12:
                continue
        kind = "steel" if ar > 1.12 else "generic"
        by_kind.append((_refine_object_kind(hsv, box, kind), box))

    if by_kind:
        deduped = _dedupe_object_kinds(by_kind, hsv, w, h)
        merged = _merge_same_kind_clusters(deduped, w)
        all_boxes = [box for _, box in merged]
        pile_boxes = _merge_adjacent_boxes(all_boxes, w, gap_ratio=0.09)
        return [
            (
                "material",
                finalized,
            )
            for box in pile_boxes
            if (finalized := _finalize_object_bbox(hsv, box, w, h, kind="material", roi_mask=roi_mask))
            and _is_valid_object_box(hsv, finalized, w, h)
        ]

    return []


def _confidence_from_percent(pct: float, threshold: float) -> float:
    """Legacy helper — prefer _confidence_for_detection."""
    if pct < threshold:
        return 0.0
    ratio = (pct - threshold) / max(threshold, 0.5)
    return round(min(0.94, 0.58 + ratio * 0.22), 3)


_PREV_ROAD_DETECTIONS: dict[str, list[dict]] = {}


def _bbox_iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _merge_bbox_envelope(a: list[float], b: list[float]) -> list[float]:
    return [
        round(min(a[0], b[0]), 1),
        round(min(a[1], b[1]), 1),
        round(max(a[2], b[2]), 1),
        round(max(a[3], b[3]), 1),
    ]


def _blend_bbox(a: list[float], b: list[float], alpha: float = 0.55) -> list[float]:
    return [
        round(a[i] * alpha + b[i] * (1.0 - alpha), 1)
        for i in range(4)
    ]


def _stabilize_road_detections(camera_id: str, detections: list[dict]) -> list[dict]:
    """Giảm bbox nhảy giữa các khung liên tiếp — giữ vị trí ổn định trên overlay."""
    prev = _PREV_ROAD_DETECTIONS.get(camera_id, [])
    stabilized: list[dict] = []
    used_prev: set[int] = set()

    for det in detections:
        best_idx = -1
        best_iou = 0.28
        for idx, old in enumerate(prev):
            if idx in used_prev or old.get("behavior") != det.get("behavior"):
                continue
            iou = _bbox_iou(det["bbox"], old["bbox"])
            if iou > best_iou:
                best_iou = iou
                best_idx = idx
        merged = dict(det)
        if best_idx >= 0:
            used_prev.add(best_idx)
            prev_box = prev[best_idx]["bbox"]
            if det.get("behavior") in ("water", "mud"):
                merged["bbox"] = _merge_bbox_envelope(det["bbox"], prev_box)
            else:
                merged["bbox"] = _blend_bbox(det["bbox"], prev_box)
        stabilized.append(merged)

    _PREV_ROAD_DETECTIONS[camera_id] = stabilized
    return stabilized


def analyze_road_frame(frame: np.ndarray, camera_id: str, *, stabilize: bool = True) -> dict:
    h, w = frame.shape[:2]
    frame_area = h * w
    zones = get_roi_zones_for_camera(camera_id)
    road_zones = [z for z in zones if z["type"] == "ROAD" and not z.get("exempt_from_occupancy")]

    if not road_zones:
        return {
            "type": "result",
            "camera_id": camera_id,
            "width": w,
            "height": h,
            "roi_zones": [],
            "metrics": {"mud_percent": 0.0, "water_percent": 0.0, "object_count": 0},
            "detections": [],
        }

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    all_detections: list[RoadDetection] = []
    total_mud = 0.0
    total_water = 0.0
    object_count = 0

    for zone in road_zones:
        roi_mask = _polygon_to_mask(zone["polygon"], w, h)
        mud_patches = _analyze_mud(hsv, roi_mask, frame_area, w)
        mud_boxes = [box for _, box in mud_patches]
        water_patches = _analyze_water(hsv, roi_mask, mud_boxes, frame_area, w)
        water_boxes = [box for _, box in water_patches]

        total_mud = max((pct for pct, _ in mud_patches), default=0.0)
        total_water = max((pct for pct, _ in water_patches), default=0.0)

        obj_items = _analyze_objects(hsv, gray, roi_mask, mud_boxes, water_boxes, frame_area)
        object_count += len(obj_items)
        obj_boxes = [box for _, box in obj_items]
        roi_pixels = max(_roi_pixel_count(roi_mask), 1)

        for pct, box in mud_patches:
            if pct < 1.25:
                continue
            trimmed = _trim_mud_from_objects(box, obj_boxes, w)
            if trimmed is None:
                continue
            clipped = _clip_box_to_roi(trimmed, roi_mask, w, h)
            if clipped is None:
                continue
            conf = _confidence_for_detection(
                "mud", clipped, w, h, frame_area, area_percent=pct, contour_area=pct * roi_pixels / 100.0,
            )
            if conf <= 0:
                continue
            all_detections.append(
                RoadDetection(
                    behavior="mud",
                    label=SCENARIO_LABELS["mud"],
                    scenario_id="BPTC-007",
                    confidence=conf,
                    bbox=[float(v) for v in clipped],
                    area_percent=pct,
                )
            )

        for pct, box in water_patches:
            if not _is_valid_water_box(hsv, box, w, h, expanded=True):
                continue
            conf = _confidence_for_detection(
                "water", box, w, h, frame_area, area_percent=pct, contour_area=pct * roi_pixels / 100.0,
            )
            if conf <= 0:
                continue
            all_detections.append(
                RoadDetection(
                    behavior="water",
                    label=SCENARIO_LABELS["water"],
                    scenario_id="BPTC-008",
                    confidence=conf,
                    bbox=[float(v) for v in box],
                    area_percent=pct,
                )
            )

        for object_kind, box in obj_items:
            clipped = _clip_object_box_to_roi(box, roi_mask, w, h)
            if clipped is None:
                continue
            if not _is_valid_object_box(hsv, clipped, w, h):
                continue
            x1, y1, x2, y2 = clipped
            area_ratio = ((x2 - x1) * (y2 - y1)) / frame_area
            if area_ratio < MIN_OBJECT_AREA_RATIO:
                continue
            conf = _confidence_for_detection(
                "object", clipped, w, h, frame_area, contour_area=area_ratio * frame_area * 0.75,
            )
            label = object_display_label(object_kind, conf, OBJECT_KIND_LABEL)
            behavior = "object" if label != UNKNOWN_LABEL else "unknown"
            if label == UNKNOWN_LABEL:
                if conf <= 0:
                    continue
                conf = max(conf, 0.52)
            elif conf <= 0:
                continue
            all_detections.append(
                RoadDetection(
                    behavior=behavior,
                    label=OBJECT_KIND_LABEL if behavior == "object" else label,
                    scenario_id="BPTC-009",
                    confidence=conf,
                    bbox=[float(v) for v in clipped],
                    object_kind="material" if behavior == "object" else "unknown",
                )
            )

    # Cam A-03: không vẽ vùng Unknown — edge toàn khung gây bbox nhảy trên overlay.

    all_detections = _augment_with_auto_train_model(frame, all_detections)

    serialized = [d.model_dump() for d in all_detections]
    if stabilize:
        serialized = _stabilize_road_detections(camera_id, serialized)

    fe_zones = [
        {
            "id": z["id"],
            "label": z["label"],
            "type": z["type"],
            "polygon": z["polygon"],
        }
        for z in zones
        if z["type"] in ("ROAD", "MESH")
    ]

    return {
        "type": "result",
        "camera_id": camera_id,
        "width": w,
        "height": h,
        "roi_zones": fe_zones,
        "metrics": {
            "mud_percent": total_mud,
            "water_percent": total_water,
            "object_count": object_count,
        },
        "detections": serialized,
    }
