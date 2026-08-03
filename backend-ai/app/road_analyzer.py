"""Phân tích lòng đường — bùn, nước đọng, vật thể trong ROI (OpenCV heuristic)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from .road_roi_config import RoiZone, get_roi_zones_for_camera
from .schemas import RoadDetection

logger = logging.getLogger("road_analyzer")

# Ngưỡng % diện tích ROI (khớp housekeepingAi.types defaults)
MUD_THRESHOLD_PERCENT = 8.0
WATER_THRESHOLD_PERCENT = 5.0
MIN_OBJECT_AREA_RATIO = 0.004
MAX_OBJECT_AREA_RATIO = 0.22


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


def _mask_percent(mask: np.ndarray, roi_mask: np.ndarray) -> float:
    roi_pixels = int(np.count_nonzero(roi_mask))
    if roi_pixels <= 0:
        return 0.0
    hit = int(np.count_nonzero(cv2.bitwise_and(mask, roi_mask)))
    return round(100.0 * hit / roi_pixels, 2)


def _contour_boxes(
    mask: np.ndarray,
    roi_mask: np.ndarray,
    min_area_ratio: float,
    max_area_ratio: float,
    frame_area: int,
) -> list[tuple[int, int, int, int]]:
    combined = cv2.bitwise_and(mask, roi_mask)
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area = frame_area * min_area_ratio
    max_area = frame_area * max_area_ratio
    boxes: list[tuple[int, int, int, int]] = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        boxes.append((x, y, x + w, y + h))
    return boxes


def _analyze_mud(hsv: np.ndarray, roi_mask: np.ndarray, frame_area: int) -> tuple[float, list[tuple[int, int, int, int]]]:
    # Nâu / bùn đất trong ROI
    mud_mask = cv2.inRange(hsv, np.array([8, 35, 35]), np.array([28, 200, 180]))
    mud_mask = cv2.medianBlur(mud_mask, 5)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mud_mask = cv2.morphologyEx(mud_mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    pct = _mask_percent(mud_mask, roi_mask)
    boxes = _contour_boxes(mud_mask, roi_mask, 0.002, 0.18, frame_area)
    return pct, boxes


def _analyze_water(hsv: np.ndarray, roi_mask: np.ndarray, frame_area: int) -> tuple[float, list[tuple[int, int, int, int]]]:
    # Nước đọng: xanh lam / xám phản chiếu
    blue = cv2.inRange(hsv, np.array([85, 25, 60]), np.array([130, 180, 220]))
    gray_reflect = cv2.inRange(hsv, np.array([0, 0, 120]), np.array([179, 45, 210]))
    water_mask = cv2.bitwise_or(blue, gray_reflect)
    water_mask = cv2.medianBlur(water_mask, 7)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    water_mask = cv2.morphologyEx(water_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    pct = _mask_percent(water_mask, roi_mask)
    boxes = _contour_boxes(water_mask, roi_mask, 0.003, 0.25, frame_area)
    return pct, boxes


def _analyze_objects(
    gray: np.ndarray,
    roi_mask: np.ndarray,
    mud_mask: np.ndarray,
    water_mask: np.ndarray,
    frame_area: int,
) -> list[tuple[int, int, int, int]]:
    # Vật thể / vật liệu: cạnh mạnh, loại trừ vùng bùn/nước đã gán
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 40, 120)
    obj_mask = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=2)
    exclude = cv2.bitwise_or(mud_mask, water_mask)
    obj_mask = cv2.bitwise_and(obj_mask, roi_mask)
    obj_mask = cv2.bitwise_and(obj_mask, cv2.bitwise_not(exclude))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    obj_mask = cv2.morphologyEx(obj_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    return _contour_boxes(obj_mask, roi_mask, MIN_OBJECT_AREA_RATIO, MAX_OBJECT_AREA_RATIO, frame_area)


def _confidence_from_percent(pct: float, threshold: float) -> float:
    if pct <= 0:
        return 0.0
    ratio = pct / max(threshold, 1.0)
    return round(min(0.95, 0.45 + ratio * 0.35), 3)


def analyze_road_frame(frame: np.ndarray, camera_id: str) -> dict:
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

    mud_combined = np.zeros((h, w), dtype=np.uint8)
    water_combined = np.zeros((h, w), dtype=np.uint8)

    for zone in road_zones:
        roi_mask = _polygon_to_mask(zone["polygon"], w, h)
        mud_pct, mud_boxes = _analyze_mud(hsv, roi_mask, frame_area)
        water_pct, water_boxes = _analyze_water(hsv, roi_mask, frame_area)

        mud_mask = cv2.inRange(hsv, np.array([8, 35, 35]), np.array([28, 200, 180]))
        water_mask = cv2.inRange(hsv, np.array([85, 25, 60]), np.array([130, 180, 220]))
        mud_combined = cv2.bitwise_or(mud_combined, cv2.bitwise_and(mud_mask, roi_mask))
        water_combined = cv2.bitwise_or(water_combined, cv2.bitwise_and(water_mask, roi_mask))

        total_mud = max(total_mud, mud_pct)
        total_water = max(total_water, water_pct)

        if mud_pct >= MUD_THRESHOLD_PERCENT * 0.5:
            conf = _confidence_from_percent(mud_pct, MUD_THRESHOLD_PERCENT)
            for box in mud_boxes[:3]:
                all_detections.append(
                    RoadDetection(
                        behavior="mud",
                        label="bùn đất",
                        scenario_id="HK-01",
                        confidence=conf,
                        bbox=[float(v) for v in box],
                        area_percent=mud_pct,
                    )
                )

        if water_pct >= WATER_THRESHOLD_PERCENT * 0.5:
            conf = _confidence_from_percent(water_pct, WATER_THRESHOLD_PERCENT)
            for box in water_boxes[:3]:
                all_detections.append(
                    RoadDetection(
                        behavior="water",
                        label="nước đọng",
                        scenario_id="HK-02",
                        confidence=conf,
                        bbox=[float(v) for v in box],
                        area_percent=water_pct,
                    )
                )

        obj_boxes = _analyze_objects(gray, roi_mask, mud_combined, water_combined, frame_area)
        object_count += len(obj_boxes)
        for box in obj_boxes[:4]:
            x1, y1, x2, y2 = box
            area_ratio = ((x2 - x1) * (y2 - y1)) / frame_area
            conf = round(min(0.92, 0.5 + area_ratio * 8), 3)
            all_detections.append(
                RoadDetection(
                    behavior="object",
                    label="vật thể trên đường",
                    scenario_id="HK-03",
                    confidence=conf,
                    bbox=[float(v) for v in box],
                )
            )

    fe_zones = [
        {
            "id": z["id"],
            "label": z["label"],
            "type": z["type"],
            "polygon": z["polygon"],
        }
        for z in zones
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
        "detections": [d.model_dump() for d in all_detections],
    }
