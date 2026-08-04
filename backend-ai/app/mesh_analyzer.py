"""Phân tích lưới bao che xanh — thiếu/hở, rách, bẩn (OpenCV heuristic)."""

from __future__ import annotations

import cv2
import numpy as np

from .schemas import RoadDetection

# Ngưỡng trong ROI lưới
GREEN_COVERAGE_MIN = 0.10
GAP_MIN_AREA_RATIO = 0.005
STAIN_MIN_AREA_RATIO = 0.0035
TORN_CIRCULARITY_MAX = 0.42

MESH_LABELS = {
    "mesh_missing": "Lưới bao che thiếu/hở",
    "mesh_torn": "Lưới bao che bị rách",
    "mesh_dirty": "Lưới bao che bẩn",
}


def _polygon_mask(polygon: list[dict], width: int, height: int) -> np.ndarray:
    pts = np.array(
        [[int(p["x"] * width), int(p["y"] * height)] for p in polygon],
        dtype=np.int32,
    )
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 255)
    return mask


def _bbox_from_contour(cnt: np.ndarray) -> tuple[int, int, int, int]:
    x, y, w, h = cv2.boundingRect(cnt)
    return x, y, x + w, y + h


def analyze_mesh_zones(
    frame: np.ndarray,
    mesh_zones: list[dict],
) -> list[RoadDetection]:
    h, w = frame.shape[:2]
    frame_area = h * w
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    kernel5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    kernel7 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))

    green = cv2.inRange(hsv, np.array([38, 55, 55]), np.array([82, 255, 200]))
    detections: list[RoadDetection] = []

    for zone in mesh_zones:
        roi_mask = _polygon_mask(zone["polygon"], w, h)
        roi_pixels = int(np.count_nonzero(roi_mask))
        if roi_pixels <= 0:
            continue

        green_in_roi = cv2.bitwise_and(green, roi_mask)
        coverage = np.count_nonzero(green_in_roi) / roi_pixels

        # --- Thiếu/hở: mảng lớn không phủ lưới xanh ---
        gap = cv2.bitwise_and(roi_mask, cv2.bitwise_not(green_in_roi))
        gap = cv2.bitwise_and(gap, cv2.inRange(hsv[:, :, 1], 0, 52))
        gap = cv2.morphologyEx(gap, cv2.MORPH_OPEN, kernel5, iterations=2)
        gap = cv2.morphologyEx(gap, cv2.MORPH_CLOSE, kernel7, iterations=2)

        gap_contours, _ = cv2.findContours(gap, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best_missing: tuple[float, tuple[int, int, int, int]] | None = None
        best_torn: tuple[float, tuple[int, int, int, int]] | None = None

        for cnt in gap_contours:
            area = cv2.contourArea(cnt)
            if area < frame_area * GAP_MIN_AREA_RATIO:
                continue
            box = _bbox_from_contour(cnt)
            peri = cv2.arcLength(cnt, True)
            circ = 4 * np.pi * area / (peri * peri + 1e-6)
            score = area / frame_area
            if circ <= TORN_CIRCULARITY_MAX:
                if best_torn is None or score > best_torn[0]:
                    best_torn = (score, box)
            elif score >= 0.008:
                if best_missing is None or score > best_missing[0]:
                    best_missing = (score, box)

        if coverage < GREEN_COVERAGE_MIN:
            cnts, _ = cv2.findContours(roi_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if cnts:
                x, y, bw, bh = cv2.boundingRect(cnts[0])
                box = (x, y, x + bw, y + bh)
            else:
                box = (0, 0, w, h)
            conf = round(min(0.90, 0.62 + (GREEN_COVERAGE_MIN - coverage) * 2.5), 3)
            detections.append(
                RoadDetection(
                    behavior="mesh_missing",
                    label=MESH_LABELS["mesh_missing"],
                    scenario_id="BPTC-001",
                    confidence=conf,
                    bbox=[float(v) for v in box],
                    area_percent=round((1 - coverage) * 100, 2),
                )
            )
        elif best_missing is not None:
            score, box = best_missing
            conf = round(min(0.92, 0.58 + score * 12), 3)
            detections.append(
                RoadDetection(
                    behavior="mesh_missing",
                    label=MESH_LABELS["mesh_missing"],
                    scenario_id="BPTC-001",
                    confidence=conf,
                    bbox=[float(v) for v in box],
                    area_percent=round(score * 100, 2),
                )
            )
        elif best_torn is not None:
            score, box = best_torn
            conf = round(min(0.90, 0.55 + score * 10), 3)
            detections.append(
                RoadDetection(
                    behavior="mesh_torn",
                    label=MESH_LABELS["mesh_torn"],
                    scenario_id="BPTC-001",
                    confidence=conf,
                    bbox=[float(v) for v in box],
                    area_percent=round(score * 100, 2),
                )
            )

        # --- Bẩn: vết đốm nâu/xám trên vùng lưới xanh (có thể đồng thời thiếu/rách) ---
        stain = cv2.inRange(hsv, np.array([12, 35, 40]), np.array([38, 200, 150]))
        stain = cv2.bitwise_and(stain, green_in_roi)
        stain = cv2.morphologyEx(stain, cv2.MORPH_OPEN, kernel5, iterations=1)
        stain = cv2.morphologyEx(stain, cv2.MORPH_CLOSE, kernel5, iterations=2)

        stain_contours, _ = cv2.findContours(stain, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best_stain: tuple[float, tuple[int, int, int, int]] | None = None
        for cnt in stain_contours:
            area = cv2.contourArea(cnt)
            if area < frame_area * STAIN_MIN_AREA_RATIO:
                continue
            score = area / frame_area
            if best_stain is None or score > best_stain[0]:
                best_stain = (score, _bbox_from_contour(cnt))

        if best_stain is not None:
            score, box = best_stain
            conf = round(min(0.88, 0.56 + score * 14), 3)
            detections.append(
                RoadDetection(
                    behavior="mesh_dirty",
                    label=MESH_LABELS["mesh_dirty"],
                    scenario_id="BPTC-001",
                    confidence=conf,
                    bbox=[float(v) for v in box],
                    area_percent=round(score * 100, 2),
                )
            )

    return detections
