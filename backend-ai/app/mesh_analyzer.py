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
_MESH_HUE_LOW = 38
_MESH_HUE_HIGH = 92
_MESH_SAT_MIN = 50
_MESH_VAL_MIN = 50
_COVERAGE_MISSING_THRESHOLD = 0.60
_DIRTY_HSV_STD_THRESHOLD = 42.0

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


def _mesh_green_ratio(hsv: np.ndarray, roi_mask: np.ndarray) -> float:
    green = cv2.inRange(
        hsv,
        np.array([_MESH_HUE_LOW, _MESH_SAT_MIN, _MESH_VAL_MIN]),
        np.array([_MESH_HUE_HIGH, 255, 255]),
    )
    masked = cv2.bitwise_and(green, green, mask=roi_mask)
    roi_pixels = max(int(np.count_nonzero(roi_mask)), 1)
    return float(np.count_nonzero(masked)) / roi_pixels


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
        gap = _COVERAGE_MISSING_THRESHOLD - signal
        return round(min(0.98, max(0.86, 0.86 + gap * 0.45)), 3)
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
    behaviors_present = {d.behavior for d in existing}
    out: list[RoadDetection] = []

    if coverage < _COVERAGE_MISSING_THRESHOLD and "mesh_missing" not in behaviors_present:
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
        out.append(
            RoadDetection(
                behavior="mesh_torn",
                label=_LABELS["mesh_torn"],
                scenario_id="BPTC-001",
                confidence=_confidence_for_mesh("mesh_torn", gap_ratio),
                bbox=zone_box,
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
