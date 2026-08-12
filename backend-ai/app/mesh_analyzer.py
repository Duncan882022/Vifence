"""Mesh cover analyzer — BPTC-001 (Lưới bao che thiếu/bẩn).

Behavior map:
  mesh_missing → BPTC-001 (Coverage < 60% zone / lỗ cục bộ)
  mesh_dirty   → BPTC-001 (Vết bùn/bẩn trên lưới + HSV deviation)
  mesh_torn    → BPTC-001 (legacy YOLO class — gộp hiển thị thiếu/bẩn)
"""

from __future__ import annotations

import logging
from typing import Optional

import cv2
import numpy as np

from .auto_train.inference import predict_boxes
from .road_roi_config import get_mesh_zones_for_camera
from .schemas import RoadDetection

logger = logging.getLogger("mesh_analyzer")

_MESH_CONF_THRESHOLD = 0.50
# Lưới xanh thực tế (Cam A-03) hue ~100–115, saturation thấp (~20–30).
_MESH_HUE_LOW = 38
_MESH_HUE_HIGH = 120
_MESH_SAT_MIN = 20
_MESH_VAL_MIN = 45
# Lưới bao che — saturation thấp, hue xanh lưới (khác cây xanh đậm).
_MESH_MAT_HUE_LOW = 82
_MESH_MAT_HUE_HIGH = 118
_MESH_MAT_SAT_MIN = 12
_MESH_MAT_SAT_MAX = 52
_MESH_MAT_VAL_MIN = 38
_MESH_MAT_VAL_MAX = 195
# Cây/bụi xanh đậm — loại khỏi mesh_dirty.
_FOLIAGE_HUE_LOW = 28
_FOLIAGE_HUE_HIGH = 92
_FOLIAGE_SAT_MIN = 44
_FOLIAGE_VAL_MAX = 150
_COVERAGE_MISSING_THRESHOLD = 0.60
_DIRTY_HSV_STD_THRESHOLD = 30.0
_DIRTY_STAIN_MIN_RATIO = 0.010
_DIRTY_MIN_MESH_OVERLAP = 0.22
_DIRTY_MIN_BBOX_MESH_FILL = 0.28
_DIRTY_MAX_MACHINERY_OVERLAP = 0.12
# mesh_missing — lỗ trên lưới thật, không phải khe trời giữa 2 tòa.
_GAP_MAX_INTERIOR_MESH_FILL = 0.25
_GAP_MIN_RING_MESH_FILL = 0.18
_GAP_MAX_SKY_FILL = 0.48
_DIRTY_BROWN_HUE_LOW = 6
_DIRTY_BROWN_HUE_HIGH = 38
_DIRTY_BROWN_SAT_MIN = 28
_DIRTY_BROWN_VAL_MIN = 12
_DIRTY_BROWN_VAL_MAX = 170
_LOCAL_GAP_MIN_AREA = 180
_LOCAL_GAP_MAX_ZONE_RATIO = 0.42
_LOCAL_DIRTY_MIN_AREA = 120
_LOCAL_DIRTY_MAX_ZONE_RATIO = 0.22
_LOCAL_DIRTY_MAX_WIDTH_RATIO = 0.38
_MESH_LABEL_MISSING = "Lưới bao che thiếu"
_MESH_LABEL_DIRTY = "Lưới bao che bẩn"

MESH_VIOLATION_BEHAVIORS = frozenset({"mesh_missing", "mesh_torn", "mesh_dirty"})

_LABELS = {
    "mesh_cover": "Lưới bao che OK",
    "mesh_missing": _MESH_LABEL_MISSING,
    "mesh_torn": _MESH_LABEL_MISSING,
    "mesh_dirty": _MESH_LABEL_DIRTY,
}


def _polygon_to_mask(polygon: list[dict], width: int, height: int) -> np.ndarray:
    pts = np.array(
        [[int(p["x"] * width), int(p["y"] * height)] for p in polygon],
        dtype=np.int32,
    )
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 255)
    return mask


def _zone_bbox(polygon: list[dict], width: int, height: int) -> list[float]:
    xs = [p["x"] * width for p in polygon]
    ys = [p["y"] * height for p in polygon]
    return [float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))]


def _mesh_green_mask(hsv: np.ndarray, roi_mask: np.ndarray) -> np.ndarray:
    green = cv2.inRange(
        hsv,
        np.array([_MESH_HUE_LOW, _MESH_SAT_MIN, _MESH_VAL_MIN]),
        np.array([_MESH_HUE_HIGH, 255, 255]),
    )
    return cv2.bitwise_and(green, green, mask=roi_mask)


def _mesh_material_mask(hsv: np.ndarray, roi_mask: np.ndarray) -> np.ndarray:
    """Chất liệu lưới xanh — saturation thấp, không phải cây xanh đậm."""
    mat = cv2.inRange(
        hsv,
        np.array([_MESH_MAT_HUE_LOW, _MESH_MAT_SAT_MIN, _MESH_MAT_VAL_MIN]),
        np.array([_MESH_MAT_HUE_HIGH, _MESH_MAT_SAT_MAX, _MESH_MAT_VAL_MAX]),
    )
    return cv2.bitwise_and(mat, mat, mask=roi_mask)


def _foliage_exclusion_mask(hsv: np.ndarray, roi_mask: np.ndarray) -> np.ndarray:
    """Bụi cây xanh đậm — loại khỏi vết bẩn trên lưới."""
    foliage = cv2.inRange(
        hsv,
        np.array([_FOLIAGE_HUE_LOW, _FOLIAGE_SAT_MIN, 0]),
        np.array([_FOLIAGE_HUE_HIGH, 255, _FOLIAGE_VAL_MAX]),
    )
    return cv2.bitwise_and(foliage, foliage, mask=roi_mask)


def _machinery_exclusion_mask(hsv: np.ndarray, roi_mask: np.ndarray) -> np.ndarray:
    """Cẩu tháp / máy thi công — không coi là vết bẩn trên lưới."""
    warm = cv2.inRange(
        hsv,
        np.array([12, 26, 45]),
        np.array([42, 255, 255]),
    )
    neutral = cv2.inRange(
        hsv,
        np.array([0, 0, 78]),
        np.array([180, 54, 255]),
    )
    machinery = cv2.bitwise_or(warm, neutral)
    return cv2.bitwise_and(machinery, machinery, mask=roi_mask)


def _sky_like_mask(hsv: np.ndarray, roi_mask: np.ndarray) -> np.ndarray:
    """Trời / nền sáng saturation thấp — không phải lỗ lưới trên mặt công trình."""
    sky = cv2.inRange(
        hsv,
        np.array([0, 0, 128]),
        np.array([180, 50, 255]),
    )
    return cv2.bitwise_and(sky, sky, mask=roi_mask)


def _bbox_mesh_fill(bbox: list[float], green_roi: np.ndarray) -> float:
    """Tỷ lệ pixel lưới xanh trong bbox — loại bbox ôm cẩu tháp/trời."""
    h, w = green_roi.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return 0.0
    patch = green_roi[y1:y2, x1:x2]
    return float(np.count_nonzero(patch)) / max(patch.size, 1)


def _bbox_overlap_ratio(bbox: list[float], mask: np.ndarray) -> float:
    h, w = mask.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return 0.0
    patch = mask[y1:y2, x1:x2]
    return float(np.count_nonzero(patch)) / max(patch.size, 1)


def _bbox_ring_mesh_fill(bbox: list[float], green_roi: np.ndarray, *, pad_px: int = 16) -> float:
    """Tỷ lệ lưới xanh trên viền quanh bbox — lỗ lưới thật phải được bao quanh bởi lưới."""
    h, w = green_roi.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    ox1, oy1 = max(0, x1 - pad_px), max(0, y1 - pad_px)
    ox2, oy2 = min(w, x2 + pad_px), min(h, y2 + pad_px)
    if ox2 <= ox1 or oy2 <= oy1:
        return 0.0
    inner_x1, inner_y1 = x1 - ox1, y1 - oy1
    inner_x2, inner_y2 = x2 - ox1, y2 - oy1
    outer = green_roi[oy1:oy2, ox1:ox2].copy()
    outer[inner_y1:inner_y2, inner_x1:inner_x2] = 0
    ring_area = outer.size - max((inner_x2 - inner_x1) * (inner_y2 - inner_y1), 1)
    return float(np.count_nonzero(outer)) / max(ring_area, 1)


def _mesh_dirty_bbox_on_net(
    bbox: list[float],
    hsv: np.ndarray,
    roi_mask: np.ndarray,
) -> bool:
    """BBox mesh_dirty phải nằm chủ yếu trên lưới xanh, không ôm cẩu tháp."""
    green_roi = _mesh_green_mask(hsv, roi_mask)
    mesh_fill = _bbox_mesh_fill(bbox, green_roi)
    if mesh_fill < _DIRTY_MIN_BBOX_MESH_FILL:
        return False
    machinery = _machinery_exclusion_mask(hsv, roi_mask)
    if _bbox_overlap_ratio(bbox, machinery) > _DIRTY_MAX_MACHINERY_OVERLAP:
        return False
    return True


def _mesh_gap_bbox_on_net(
    bbox: list[float],
    hsv: np.ndarray,
    roi_mask: np.ndarray,
) -> bool:
    """BBox mesh_missing phải là lỗ trên mặt lưới — không bbox khe trời giữa tòa nhà."""
    green_roi = _mesh_green_mask(hsv, roi_mask)
    interior_mesh = _bbox_mesh_fill(bbox, green_roi)
    if interior_mesh > _GAP_MAX_INTERIOR_MESH_FILL:
        return False
    sky = _sky_like_mask(hsv, roi_mask)
    if _bbox_overlap_ratio(bbox, sky) > _GAP_MAX_SKY_FILL:
        return False
    if _bbox_ring_mesh_fill(bbox, green_roi) < _GAP_MIN_RING_MESH_FILL:
        return False
    machinery = _machinery_exclusion_mask(hsv, roi_mask)
    if _bbox_overlap_ratio(bbox, machinery) > _DIRTY_MAX_MACHINERY_OVERLAP:
        return False
    return True


def _mesh_overlap_ratio(patch_mask: np.ndarray, mesh_mask: np.ndarray) -> float:
    area = max(int(np.count_nonzero(patch_mask)), 1)
    overlap = int(np.count_nonzero(cv2.bitwise_and(patch_mask, mesh_mask)))
    return overlap / area


def _mesh_green_ratio(hsv: np.ndarray, roi_mask: np.ndarray) -> float:
    masked = _mesh_green_mask(hsv, roi_mask)
    roi_pixels = max(int(np.count_nonzero(roi_mask)), 1)
    return float(np.count_nonzero(masked)) / roi_pixels


def _localize_mesh_gap_bbox(
    hsv: np.ndarray,
    roi_mask: np.ndarray,
    zone_box: list[float],
    *,
    stain_mask: np.ndarray | None = None,
) -> list[float] | None:
    """Tìm vùng hở/thiếu lưới — bbox chặt quanh lỗ, không phủ cả ROI."""
    h, w = roi_mask.shape[:2]
    zone_x1, zone_y1, zone_x2, zone_y2 = zone_box
    zone_w = max(zone_x2 - zone_x1, 1.0)
    zone_h = max(zone_y2 - zone_y1, 1.0)
    zone_area = max(int(np.count_nonzero(roi_mask)), 1)

    green_roi = _mesh_green_mask(hsv, roi_mask)
    green_near = cv2.dilate(green_roi, np.ones((7, 7), np.uint8), iterations=1)
    green_touch = cv2.dilate(green_roi, np.ones((3, 3), np.uint8), iterations=1)
    sky = _sky_like_mask(hsv, roi_mask)

    low_sat = cv2.inRange(hsv, np.array([0, 0, 35]), np.array([180, 38, 215]))
    open_cand = cv2.bitwise_and(low_sat, roi_mask)
    open_cand = cv2.bitwise_and(open_cand, cv2.bitwise_not(green_roi))
    open_cand = cv2.bitwise_and(open_cand, cv2.bitwise_not(sky))
    open_cand = cv2.bitwise_and(open_cand, green_near)
    if stain_mask is not None:
        open_cand = cv2.bitwise_and(open_cand, cv2.bitwise_not(stain_mask))
    open_cand = cv2.morphologyEx(open_cand, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), 1)
    open_cand = cv2.morphologyEx(open_cand, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8), 2)

    cnts, _ = cv2.findContours(open_cand, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best: tuple[float, tuple[int, int, int, int]] | None = None
    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if area < _LOCAL_GAP_MIN_AREA or area > zone_area * _LOCAL_GAP_MAX_ZONE_RATIO:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw >= zone_w * 0.92 and bh >= zone_h * 0.88:
            continue
        fill = area / max(bw * bh, 1)
        if fill < 0.06:
            continue
        pad = 10
        y0, y1 = max(0, y - pad), min(h, y + bh + pad)
        x0, x1 = max(0, x - pad), min(w, x + bw + pad)
        neighbor_green = int(np.count_nonzero(green_roi[y0:y1, x0:x1]))
        if neighbor_green < 48:
            continue
        touch_mask = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(touch_mask, [cnt], -1, 255, -1)
        if int(np.count_nonzero(cv2.bitwise_and(touch_mask, green_touch))) < 16:
            continue
        score = area + neighbor_green * 0.35 - max(0.0, bw - zone_w * 0.55) * 8.0
        if best is None or score > best[0]:
            best = (score, (x, y, bw, bh))

    if best is None:
        return None
    x, y, bw, bh = best[1]
    pad_x = max(int(bw * 0.03), 2)
    pad_y = max(int(bh * 0.04), 2)
    return [
        float(max(0, x - pad_x)),
        float(max(0, y - pad_y)),
        float(min(w, x + bw + pad_x)),
        float(min(h, y + bh + pad_y)),
    ]


def _clamp_mesh_bbox(
    bbox: list[float],
    zone_box: list[float],
    *,
    max_w_ratio: float = 0.34,
    max_h_ratio: float = 0.40,
) -> list[float]:
    """Giới hạn bbox mesh — tránh ROI tràn gần hết zone."""
    zone_w = max(zone_box[2] - zone_box[0], 1.0)
    zone_h = max(zone_box[3] - zone_box[1], 1.0)
    bw = max(bbox[2] - bbox[0], 1.0)
    bh = max(bbox[3] - bbox[1], 1.0)
    if bw <= zone_w * max_w_ratio and bh <= zone_h * max_h_ratio:
        return bbox
    cx = (bbox[0] + bbox[2]) / 2.0
    cy = (bbox[1] + bbox[3]) / 2.0
    tw = min(bw, zone_w * max_w_ratio)
    th = min(bh, zone_h * max_h_ratio)
    return [
        max(zone_box[0], cx - tw / 2.0),
        max(zone_box[1], cy - th / 2.0),
        min(zone_box[2], cx + tw / 2.0),
        min(zone_box[3], cy + th / 2.0),
    ]


def _refine_mesh_bbox(
    hsv: np.ndarray,
    roi_mask: np.ndarray,
    bbox: list[float],
    behavior: str,
    zone_box: list[float],
) -> list[float]:
    """Siết bbox quanh pixel vi phạm thực trong vùng detect."""
    h, w = hsv.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 - x1 < 12 or y2 - y1 < 12:
        return _clamp_mesh_bbox(bbox, zone_box)

    sub_roi = roi_mask[y1:y2, x1:x2]
    if int(np.count_nonzero(sub_roi)) < 16:
        return _clamp_mesh_bbox(bbox, zone_box)

    sub_hsv = hsv[y1:y2, x1:x2]
    sub_zone = [0.0, 0.0, float(x2 - x1), float(y2 - y1)]
    refined: list[float] | None = None
    if behavior in {"mesh_missing", "mesh_torn"}:
        stain = _mesh_dirty_stain_mask(sub_hsv, sub_roi)
        refined = _localize_mesh_gap_bbox(sub_hsv, sub_roi, sub_zone, stain_mask=stain)
    elif behavior == "mesh_dirty":
        refined = _localize_mesh_dirty_bbox(sub_hsv, sub_roi, sub_zone)

    if refined is None:
        return _clamp_mesh_bbox(bbox, zone_box)

    return _clamp_mesh_bbox(
        [
            float(x1 + refined[0]),
            float(y1 + refined[1]),
            float(x1 + refined[2]),
            float(y1 + refined[3]),
        ],
        zone_box,
    )


def _mesh_hsv_std(hsv: np.ndarray, roi_mask: np.ndarray) -> float:
    ys, xs = np.where(roi_mask > 0)
    if len(xs) < 32:
        return 0.0
    patch = hsv[ys, xs]
    return float(np.std(patch[:, 0])) + float(np.std(patch[:, 1])) * 0.35


def _mesh_dirty_stain_mask(hsv: np.ndarray, roi_mask: np.ndarray) -> np.ndarray:
    """Vết bùn/nâu trên lưới xanh — chỉ pixel trên lưới thật, loại cẩu tháp."""
    green_roi = _mesh_green_mask(hsv, roi_mask)
    mesh_mat = _mesh_material_mask(hsv, roi_mask)
    foliage = _foliage_exclusion_mask(hsv, roi_mask)
    machinery = _machinery_exclusion_mask(hsv, roi_mask)

    brown = cv2.inRange(
        hsv,
        np.array([_DIRTY_BROWN_HUE_LOW, _DIRTY_BROWN_SAT_MIN, _DIRTY_BROWN_VAL_MIN]),
        np.array([_DIRTY_BROWN_HUE_HIGH, 220, _DIRTY_BROWN_VAL_MAX]),
    )
    stain = cv2.bitwise_and(brown, mesh_mat)
    stain = cv2.bitwise_and(stain, green_roi)
    stain = cv2.bitwise_and(stain, roi_mask)
    stain = cv2.bitwise_and(stain, cv2.bitwise_not(foliage))
    stain = cv2.bitwise_and(stain, cv2.bitwise_not(machinery))
    stain = cv2.morphologyEx(stain, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8), iterations=1)
    return stain


def _mesh_dirty_local_mask(hsv: np.ndarray, roi_mask: np.ndarray) -> np.ndarray:
    """Alias — giữ API cũ cho heuristic/fallback."""
    return _mesh_dirty_stain_mask(hsv, roi_mask)


def _mesh_dirty_stain_ratio(hsv: np.ndarray, roi_mask: np.ndarray) -> float:
    stain = _mesh_dirty_stain_mask(hsv, roi_mask)
    roi_pixels = max(int(np.count_nonzero(roi_mask)), 1)
    return float(np.count_nonzero(stain)) / roi_pixels


def _dirty_bbox_valid(
    bbox: list[float],
    zone_box: list[float],
    zone_area: int,
    *,
    allow_tall: bool = False,
) -> bool:
    bw = max(bbox[2] - bbox[0], 1.0)
    bh = max(bbox[3] - bbox[1], 1.0)
    zone_w = max(zone_box[2] - zone_box[0], 1.0)
    if bw * bh > zone_area * _LOCAL_DIRTY_MAX_ZONE_RATIO:
        return False
    if bw > zone_w * _LOCAL_DIRTY_MAX_WIDTH_RATIO:
        return False
    max_h_ratio = 0.72 if allow_tall else 0.62
    if bh > (zone_box[3] - zone_box[1]) * max_h_ratio:
        return False
    return True


def _dirty_bbox_on_net(
    bbox: list[float],
    hsv: np.ndarray,
    roi_mask: np.ndarray,
    zone_box: list[float],
    zone_area: int,
    *,
    allow_tall: bool = False,
) -> bool:
    if not _dirty_bbox_valid(bbox, zone_box, zone_area, allow_tall=allow_tall):
        return False
    return _mesh_dirty_bbox_on_net(bbox, hsv, roi_mask)


def _union_bbox_from_points(xs: np.ndarray, ys: np.ndarray) -> list[float] | None:
    if len(xs) == 0:
        return None
    return [float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())]


def _localize_mesh_dirty_bbox(
    hsv: np.ndarray,
    roi_mask: np.ndarray,
    zone_box: list[float],
) -> list[float] | None:
    """BBox bao trọn vết bẩn cục bộ trên lưới."""
    h, w = roi_mask.shape[:2]
    zone_x1, zone_y1, zone_x2, zone_y2 = zone_box
    zone_w = max(zone_x2 - zone_x1, 1.0)
    zone_h = max(zone_y2 - zone_y1, 1.0)
    zone_area = max(int(np.count_nonzero(roi_mask)), 1)

    stain = _mesh_dirty_stain_mask(hsv, roi_mask)

    cnts, _ = cv2.findContours(stain, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    green_roi = _mesh_green_mask(hsv, roi_mask)
    foliage = _foliage_exclusion_mask(hsv, roi_mask)
    machinery = _machinery_exclusion_mask(hsv, roi_mask)
    best: tuple[float, list[float]] | None = None

    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if area < _LOCAL_DIRTY_MIN_AREA or area > zone_area * _LOCAL_DIRTY_MAX_ZONE_RATIO:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw >= zone_w * 0.90 or bh >= zone_h * 0.90:
            continue
        if bw > zone_w * 0.40:
            continue
        patch = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(patch, [cnt], -1, 255, -1)
        stain_inside = cv2.bitwise_and(stain, patch)
        stain_area = int(np.count_nonzero(stain_inside))
        if stain_area < _LOCAL_DIRTY_MIN_AREA:
            continue
        mesh_overlap = _mesh_overlap_ratio(stain_inside, green_roi)
        foliage_overlap = _mesh_overlap_ratio(stain_inside, foliage)
        machinery_overlap = _mesh_overlap_ratio(stain_inside, machinery)
        if mesh_overlap < _DIRTY_MIN_MESH_OVERLAP:
            continue
        if foliage_overlap > 0.42:
            continue
        if machinery_overlap > _DIRTY_MAX_MACHINERY_OVERLAP:
            continue
        ys, xs = np.where(stain_inside > 0)
        raw = _union_bbox_from_points(xs, ys)
        if raw is None:
            continue
        candidate = list(raw)
        if not _dirty_bbox_on_net(candidate, hsv, roi_mask, zone_box, zone_area, allow_tall=True):
            continue
        cx = (candidate[0] + candidate[2]) / 2.0
        if cx < w * 0.06:
            continue
        aspect = (candidate[3] - candidate[1]) / max(candidate[2] - candidate[0], 1.0)
        fill = stain_area / max((candidate[2] - candidate[0]) * (candidate[3] - candidate[1]), 1.0)
        vertical_bonus = min(aspect, 2.6) * 36.0 if aspect >= 0.85 else 0.0
        score = stain_area + fill * 110.0 + vertical_bonus + mesh_overlap * 220.0 - foliage_overlap * 140.0 - machinery_overlap * 180.0
        if best is None or score > best[0]:
            best = (score, candidate)

    if best is None:
        return None

    candidate = best[1]
    bw = candidate[2] - candidate[0]
    bh = candidate[3] - candidate[1]
    pad_x = max(int(bw * 0.06), 6)
    pad_y = max(int(bh * 0.07), 6)
    return [
        float(max(0, candidate[0] - pad_x)),
        float(max(0, candidate[1] - pad_y)),
        float(min(w, candidate[2] + pad_x)),
        float(min(h, candidate[3] + pad_y)),
    ]


def _fallback_dirty_bbox(
    stain: np.ndarray,
    w: int,
    h: int,
    *,
    hsv: np.ndarray | None = None,
    roi_mask: np.ndarray | None = None,
    zone_box: list[float] | None = None,
) -> list[float] | None:
    """BBox dự phòng — chỉ chọn vết trên lưới, không lấy cẩu tháp."""
    cnts, _ = cv2.findContours(stain, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best_area = 0.0
    best_rect: tuple[int, int, int, int] | None = None
    zone_area = int(np.count_nonzero(roi_mask)) if roi_mask is not None else w * h
    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if area < 72 or area <= best_area:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw < 8 or bh < 8:
            continue
        candidate = [
            float(max(0, x)),
            float(max(0, y)),
            float(min(w, x + bw)),
            float(min(h, y + bh)),
        ]
        if hsv is not None and roi_mask is not None and zone_box is not None:
            if not _dirty_bbox_on_net(candidate, hsv, roi_mask, zone_box, zone_area, allow_tall=True):
                continue
        best_area = area
        best_rect = (x, y, bw, bh)
    if best_rect is None:
        return None
    x, y, bw, bh = best_rect
    pad_x = max(int(bw * 0.06), 4)
    pad_y = max(int(bh * 0.07), 4)
    return [
        float(max(0, x - pad_x)),
        float(max(0, y - pad_y)),
        float(min(w, x + bw + pad_x)),
        float(min(h, y + bh + pad_y)),
    ]


def _confidence_for_mesh(behavior: str, signal: float) -> float:
    if behavior == "mesh_missing":
        if signal <= 1.0:
            gap = _COVERAGE_MISSING_THRESHOLD - signal
            return round(min(0.98, max(0.86, 0.86 + gap * 0.45)), 3)
        return round(min(0.97, max(0.88, 0.88 + signal * 2.2)), 3)
    if behavior == "mesh_dirty":
        return round(min(0.96, max(0.86, 0.86 + (signal - _DIRTY_HSV_STD_THRESHOLD) * 0.004)), 3)
    if behavior == "mesh_torn":
        return round(min(0.95, max(0.87, 0.87 + signal * 0.35)), 3)
    return 0.88


def _resolve_zone_polygon(
    camera_id: str,
    zone_polygon: Optional[list[dict]],
) -> list[dict] | None:
    if zone_polygon:
        return zone_polygon
    zones = get_mesh_zones_for_camera(camera_id)
    if not zones:
        return None
    return zones[0]["polygon"]


def _heuristic_mesh_violations(
    frame: np.ndarray,
    zone_polygon: list[dict],
    *,
    existing: list[RoadDetection],
) -> list[RoadDetection]:
    h, w = frame.shape[:2]
    roi_mask = _polygon_to_mask(zone_polygon, w, h)
    if int(np.count_nonzero(roi_mask)) < 64:
        return []

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    zone_box = _zone_bbox(zone_polygon, w, h)
    coverage = _mesh_green_ratio(hsv, roi_mask)
    stain_mask = _mesh_dirty_stain_mask(hsv, roi_mask)
    gap_bbox = _localize_mesh_gap_bbox(hsv, roi_mask, zone_box, stain_mask=stain_mask)
    behaviors_present = {d.behavior for d in existing}
    out: list[RoadDetection] = []

    stain_ratio = _mesh_dirty_stain_ratio(hsv, roi_mask)
    dirty_bbox = _localize_mesh_dirty_bbox(hsv, roi_mask, zone_box)
    hsv_std = _mesh_hsv_std(hsv, roi_mask)
    dirty_signal = max(hsv_std, stain_ratio * 800.0)
    dirty_hit = dirty_bbox is not None or stain_ratio >= _DIRTY_STAIN_MIN_RATIO
    if dirty_hit and "mesh_dirty" not in behaviors_present:
        zone_area_px = int(np.count_nonzero(roi_mask))
        use_bbox: list[float] | None = None
        if dirty_bbox and _dirty_bbox_on_net(dirty_bbox, hsv, roi_mask, zone_box, zone_area_px, allow_tall=True):
            use_bbox = dirty_bbox
        elif stain_ratio >= _DIRTY_STAIN_MIN_RATIO:
            combined_stain = stain_mask
            use_bbox = _fallback_dirty_bbox(
                combined_stain,
                w,
                h,
                hsv=hsv,
                roi_mask=roi_mask,
                zone_box=zone_box,
            )
        if use_bbox is not None:
            out.append(
                RoadDetection(
                    behavior="mesh_dirty",
                    label=_LABELS["mesh_dirty"],
                    scenario_id="BPTC-001",
                    confidence=_confidence_for_mesh("mesh_dirty", dirty_signal),
                    bbox=use_bbox,
                    area_percent=round(stain_ratio * 100.0, 2) if stain_ratio else None,
                )
            )

    dirty_overlap = False
    if dirty_bbox is not None and gap_bbox is not None:
        ix1 = max(dirty_bbox[0], gap_bbox[0])
        iy1 = max(dirty_bbox[1], gap_bbox[1])
        ix2 = min(dirty_bbox[2], gap_bbox[2])
        iy2 = min(dirty_bbox[3], gap_bbox[3])
        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        dirty_area = max((dirty_bbox[2] - dirty_bbox[0]) * (dirty_bbox[3] - dirty_bbox[1]), 1.0)
        dirty_overlap = inter > dirty_area * 0.55

    if gap_bbox and "mesh_missing" not in behaviors_present and not dirty_overlap:
        if not _mesh_gap_bbox_on_net(gap_bbox, hsv, roi_mask):
            gap_bbox = None
        else:
            gap_area = max((gap_bbox[2] - gap_bbox[0]) * (gap_bbox[3] - gap_bbox[1]), 1.0)
            zone_area = max((zone_box[2] - zone_box[0]) * (zone_box[3] - zone_box[1]), 1.0)
            gap_ratio = gap_area / zone_area
            out.append(
                RoadDetection(
                    behavior="mesh_missing",
                    label=_LABELS["mesh_missing"],
                    scenario_id="BPTC-001",
                    confidence=_confidence_for_mesh("mesh_missing", gap_ratio + 1.5),
                    bbox=gap_bbox,
                    area_percent=round(coverage * 100.0, 2),
                )
            )

    return out


def mesh_cover_boxes_from_frame(
    frame: np.ndarray,
    camera_id: str = "A-03",
) -> list[tuple[float, float, float, float]]:
    """Pseudo-label mesh_cover từ vùng lưới xanh trong ROI MESH — dùng seed/collector."""
    h, w = frame.shape[:2]
    zones = get_mesh_zones_for_camera(camera_id)
    if not zones:
        return []

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    boxes: list[tuple[float, float, float, float]] = []
    for zone in zones:
        roi_mask = _polygon_to_mask(zone["polygon"], w, h)
        zone_area = max(int(np.count_nonzero(roi_mask)), 1)
        green = _mesh_green_mask(hsv, roi_mask)
        green = cv2.morphologyEx(green, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8), 2)
        cnts, _ = cv2.findContours(green, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in cnts:
            area = cv2.contourArea(cnt)
            if area < 600 or area < zone_area * 0.015:
                continue
            x, y, bw, bh = cv2.boundingRect(cnt)
            if bw < 12 or bh < 12:
                continue
            pad = 8
            boxes.append((
                float(max(0, x - pad)),
                float(max(0, y - pad)),
                float(min(w, x + bw + pad)),
                float(min(h, y + bh + pad)),
            ))
        if not boxes and _mesh_green_ratio(hsv, roi_mask) >= 0.30:
            zb = _zone_bbox(zone["polygon"], w, h)
            boxes.append((zb[0], zb[1], zb[2], zb[3]))
    return boxes


def analyze_mesh_frame(
    frame: np.ndarray,
    camera_id: str = "A-05",
    zone_polygon: Optional[list[dict]] = None,
) -> list[RoadDetection]:
    """Phân tích lưới bao che trong frame — model YOLO + heuristic ROI."""
    from .cam03_scene_demo import resolve_cam03_mesh_demo

    demo = resolve_cam03_mesh_demo(camera_id, frame)
    if demo is not None:
        return demo

    zone = _resolve_zone_polygon(camera_id, zone_polygon)
    if zone is None:
        return []

    results: list[RoadDetection] = []
    boxes = predict_boxes("safety_mesh_cover", frame, conf_threshold=_MESH_CONF_THRESHOLD)
    for cls_name, conf, x1, y1, x2, y2 in boxes:
        behavior = cls_name
        if behavior == "mesh_cover":
            continue
        if behavior not in MESH_VIOLATION_BEHAVIORS:
            continue
        results.append(
            RoadDetection(
                behavior=behavior,
                label=_LABELS.get(behavior, behavior),
                scenario_id="BPTC-001",
                confidence=round(float(conf), 3),
                bbox=[float(x1), float(y1), float(x2), float(y2)],
            )
        )

    results.extend(_heuristic_mesh_violations(frame, zone, existing=results))

    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    roi_mask = _polygon_to_mask(zone, w, h)
    zone_box = _zone_bbox(zone, w, h)
    refined: list[RoadDetection] = []
    for det in results:
        bbox = _refine_mesh_bbox(hsv, roi_mask, det.bbox, det.behavior, zone_box)
        if det.behavior == "mesh_dirty" and not _mesh_dirty_bbox_on_net(bbox, hsv, roi_mask):
            continue
        if det.behavior in {"mesh_missing", "mesh_torn"} and not _mesh_gap_bbox_on_net(bbox, hsv, roi_mask):
            continue
        refined.append(det.model_copy(update={"bbox": bbox}))
    return refined
