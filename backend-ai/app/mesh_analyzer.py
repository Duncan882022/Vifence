"""Mesh cover analyzer — BPTC-001 (Lưới bao che).

Behavior map:
  mesh_missing → BPTC-001 (Coverage < 60% zone)
  mesh_torn    → BPTC-001 (Panel detect + gap contour heuristic)
  mesh_dirty   → BPTC-001 (Panel detect + HSV deviation từ baseline xanh)
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
_COVERAGE_MISSING_THRESHOLD = 0.60
_DIRTY_HSV_STD_THRESHOLD = 42.0
_LOCAL_GAP_MIN_AREA = 180
_LOCAL_GAP_MAX_ZONE_RATIO = 0.42

MESH_VIOLATION_BEHAVIORS = frozenset({"mesh_missing", "mesh_torn", "mesh_dirty"})

_LABELS = {
    "mesh_cover": "Lưới bao che OK",
    "mesh_missing": "Lưới bao che thiếu/hở",
    "mesh_torn": "Lưới bao che bị rách",
    "mesh_dirty": "Lưới bao che bẩn",
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


def _mesh_green_ratio(hsv: np.ndarray, roi_mask: np.ndarray) -> float:
    masked = _mesh_green_mask(hsv, roi_mask)
    roi_pixels = max(int(np.count_nonzero(roi_mask)), 1)
    return float(np.count_nonzero(masked)) / roi_pixels


def _localize_mesh_gap_bbox(
    hsv: np.ndarray,
    roi_mask: np.ndarray,
    zone_box: list[float],
) -> list[float] | None:
    """Tìm vùng hở/thiếu lưới — bbox chặt quanh lỗ, không phủ cả ROI."""
    h, w = roi_mask.shape[:2]
    zone_x1, zone_y1, zone_x2, zone_y2 = zone_box
    zone_w = max(zone_x2 - zone_x1, 1.0)
    zone_h = max(zone_y2 - zone_y1, 1.0)
    zone_area = max(int(np.count_nonzero(roi_mask)), 1)

    green_roi = _mesh_green_mask(hsv, roi_mask)
    green_near = cv2.dilate(green_roi, np.ones((11, 11), np.uint8), iterations=1)

    low_sat = cv2.inRange(hsv, np.array([0, 0, 35]), np.array([180, 38, 215]))
    open_cand = cv2.bitwise_and(low_sat, roi_mask)
    open_cand = cv2.bitwise_and(open_cand, cv2.bitwise_not(green_roi))
    open_cand = cv2.bitwise_and(open_cand, green_near)
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
        score = area + neighbor_green * 0.35 - max(0.0, bw - zone_w * 0.55) * 8.0
        if best is None or score > best[0]:
            best = (score, (x, y, bw, bh))

    if best is None:
        return None
    x, y, bw, bh = best[1]
    pad_x = max(int(bw * 0.06), 4)
    pad_y = max(int(bh * 0.08), 4)
    return [
        float(max(0, x - pad_x)),
        float(max(0, y - pad_y)),
        float(min(w, x + bw + pad_x)),
        float(min(h, y + bh + pad_y)),
    ]


def _mesh_hsv_std(hsv: np.ndarray, roi_mask: np.ndarray) -> float:
    ys, xs = np.where(roi_mask > 0)
    if len(xs) < 32:
        return 0.0
    patch = hsv[ys, xs]
    return float(np.std(patch[:, 0])) + float(np.std(patch[:, 1])) * 0.35


def _gap_ratio_in_zone(gray: np.ndarray, roi_mask: np.ndarray) -> float:
    masked = cv2.bitwise_and(gray, gray, mask=roi_mask)
    _, dark = cv2.threshold(masked, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    dark = cv2.bitwise_and(dark, dark, mask=roi_mask)
    roi_pixels = max(int(np.count_nonzero(roi_mask)), 1)
    return float(np.count_nonzero(dark)) / roi_pixels


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
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    zone_box = _zone_bbox(zone_polygon, w, h)
    coverage = _mesh_green_ratio(hsv, roi_mask)
    gap_bbox = _localize_mesh_gap_bbox(hsv, roi_mask, zone_box)
    behaviors_present = {d.behavior for d in existing}
    out: list[RoadDetection] = []

    if gap_bbox and "mesh_missing" not in behaviors_present:
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
    elif coverage < _COVERAGE_MISSING_THRESHOLD and "mesh_missing" not in behaviors_present:
        out.append(
            RoadDetection(
                behavior="mesh_missing",
                label=_LABELS["mesh_missing"],
                scenario_id="BPTC-001",
                confidence=_confidence_for_mesh("mesh_missing", coverage),
                bbox=zone_box,
                area_percent=round(coverage * 100.0, 2),
            )
        )

    hsv_std = _mesh_hsv_std(hsv, roi_mask)
    if (
        coverage >= _COVERAGE_MISSING_THRESHOLD * 0.85
        and hsv_std >= _DIRTY_HSV_STD_THRESHOLD
        and "mesh_dirty" not in behaviors_present
    ):
        out.append(
            RoadDetection(
                behavior="mesh_dirty",
                label=_LABELS["mesh_dirty"],
                scenario_id="BPTC-001",
                confidence=_confidence_for_mesh("mesh_dirty", hsv_std),
                bbox=zone_box,
            )
        )

    gap_ratio = _gap_ratio_in_zone(gray, roi_mask)
    if (
        coverage >= 0.35
        and gap_ratio >= 0.14
        and "mesh_torn" not in behaviors_present
        and "mesh_missing" not in {d.behavior for d in out}
    ):
        torn_bbox = gap_bbox or zone_box
        out.append(
            RoadDetection(
                behavior="mesh_torn",
                label=_LABELS["mesh_torn"],
                scenario_id="BPTC-001",
                confidence=_confidence_for_mesh("mesh_torn", gap_ratio),
                bbox=torn_bbox,
            )
        )

    return out


def analyze_mesh_frame(
    frame: np.ndarray,
    camera_id: str = "A-05",
    zone_polygon: Optional[list[dict]] = None,
) -> list[RoadDetection]:
    """Phân tích lưới bao che trong frame — model YOLO + heuristic ROI."""
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
    return results
