"""Phân tích lòng đường — bùn, nước đọng, vật thể trong ROI (OpenCV heuristic)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from .mesh_analyzer import analyze_mesh_zones
from .road_roi_config import RoiZone, get_roi_zones_for_camera
from .schemas import RoadDetection

logger = logging.getLogger("road_analyzer")

# Ngưỡng % diện tích patch lớn nhất trong ROI (khớp housekeepingAi.types defaults)
MUD_THRESHOLD_PERCENT = 5.0
WATER_THRESHOLD_PERCENT = 5.0
MIN_OBJECT_AREA_RATIO = 0.003
MAX_OBJECT_AREA_RATIO = 0.12
MAX_OBJECT_WIDTH_RATIO = 0.62

SCENARIO_LABELS = {
    "mud": "Đường nội bộ bùn bẩn",
    "water": "Nước đọng trên đường",
    "object": "Vật liệu rơi vãi trên đường",
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


def _largest_contour_area(mask: np.ndarray, roi_mask: np.ndarray) -> float:
    combined = cv2.bitwise_and(mask, roi_mask)
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return 0.0
    return float(max(cv2.contourArea(c) for c in contours))


def _patch_percent(mask: np.ndarray, roi_mask: np.ndarray) -> float:
    roi_pixels = _roi_pixel_count(roi_mask)
    if roi_pixels <= 0:
        return 0.0
    patch_area = _largest_contour_area(mask, roi_mask)
    return round(100.0 * patch_area / roi_pixels, 2)


def _contour_boxes(
    mask: np.ndarray,
    roi_mask: np.ndarray,
    min_area_ratio: float,
    max_area_ratio: float,
    frame_area: int,
    frame_width: int,
    *,
    limit: int = 1,
    max_width_ratio: Optional[float] = None,
    min_compactness: float = 0.12,
) -> list[tuple[int, int, int, int]]:
    combined = cv2.bitwise_and(mask, roi_mask)
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area = frame_area * min_area_ratio
    max_area = frame_area * max_area_ratio
    ranked: list[tuple[float, tuple[int, int, int, int]]] = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        if w <= 0 or h <= 0:
            continue
        if max_width_ratio is not None and w > frame_width * max_width_ratio:
            continue
        compactness = area / float(w * h)
        if compactness < min_compactness:
            continue
        ranked.append((area, (x, y, x + w, y + h)))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return [box for _, box in ranked[:limit]]


def _analyze_mud(hsv: np.ndarray, roi_mask: np.ndarray, frame_area: int, frame_width: int, frame_height: int) -> tuple[float, list[tuple[int, int, int, int]]]:
    surface = _road_surface_mask(roi_mask, frame_width, frame_height)
    mud_mask = cv2.inRange(hsv, np.array([8, 70, 35]), np.array([22, 200, 130]))
    mud_mask = cv2.bitwise_and(mud_mask, surface)
    mud_mask = cv2.medianBlur(mud_mask, 5)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mud_mask = cv2.morphologyEx(mud_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mud_mask = cv2.morphologyEx(mud_mask, cv2.MORPH_CLOSE, kernel, iterations=3)
    pct = _patch_percent(mud_mask, surface)
    boxes = _contour_boxes(
        mud_mask, surface, 0.002, 0.10, frame_area, frame_width,
        limit=1, min_compactness=0.10,
    )
    return pct, boxes


def _analyze_water(hsv: np.ndarray, roi_mask: np.ndarray, frame_area: int, frame_width: int) -> tuple[float, list[tuple[int, int, int, int]]]:
    water_mask = cv2.inRange(hsv, np.array([95, 50, 60]), np.array([125, 200, 190]))
    water_mask = cv2.medianBlur(water_mask, 7)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    water_mask = cv2.morphologyEx(water_mask, cv2.MORPH_OPEN, kernel, iterations=2)
    water_mask = cv2.morphologyEx(water_mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    pct = _patch_percent(water_mask, roi_mask)
    boxes = _contour_boxes(
        water_mask, roi_mask, 0.004, 0.10, frame_area, frame_width,
        limit=1, min_compactness=0.12,
    )
    return pct, boxes


def _road_surface_mask(roi_mask: np.ndarray, width: int, height: int) -> np.ndarray:
    """Mặt đường thực — loại lề trái đất đá và phần xa."""
    band = roi_mask.copy()
    band[:, : int(width * 0.18)] = 0
    band[: int(height * 0.52), :] = 0
    return band


def _object_search_mask(roi_mask: np.ndarray, width: int, height: int) -> np.ndarray:
    """Vùng tìm vật liệu trên lòng đường — giữa khung, loại túi/vật bên lề."""
    band = roi_mask.copy()
    band[:, : int(width * 0.24)] = 0
    band[:, int(width * 0.78) :] = 0
    band[: int(height * 0.40), :] = 0
    return band


def _analyze_objects(
    frame: np.ndarray,
    hsv: np.ndarray,
    gray: np.ndarray,
    roi_mask: np.ndarray,
    mud_mask: np.ndarray,
    water_mask: np.ndarray,
    frame_area: int,
) -> list[tuple[int, int, int, int]]:
    h, w = frame.shape[:2]
    exclude = cv2.bitwise_or(mud_mask, water_mask)
    search = _object_search_mask(roi_mask, w, h)

    # Loại túi vật liệu màu be/kem
    tan = cv2.inRange(hsv, np.array([15, 25, 120]), np.array([35, 180, 255]))

    rust_mask = cv2.inRange(hsv, np.array([5, 60, 40]), np.array([25, 255, 210]))
    rust_mask = cv2.bitwise_and(rust_mask, search)
    rust_mask = cv2.bitwise_and(rust_mask, cv2.bitwise_not(exclude))
    rust_mask = cv2.bitwise_and(rust_mask, cv2.bitwise_not(tan))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    rust_mask = cv2.morphologyEx(rust_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    rust_mask = cv2.morphologyEx(rust_mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    boxes = _contour_boxes(
        rust_mask, search,
        MIN_OBJECT_AREA_RATIO, 0.10,
        frame_area, w,
        limit=3,
        max_width_ratio=0.56,
        min_compactness=0.05,
    )
    if boxes:
        # Ưu tiên cụm ngang (dầm thép) gần giữa đường
        cx_target = w * 0.48

        def score(box: tuple[int, int, int, int]) -> float:
            x1, y1, x2, y2 = box
            bw, bh = x2 - x1, y2 - y1
            area = bw * bh
            ar = bw / max(bh, 1)
            center_x = (x1 + x2) / 2
            return area * (1 + min(ar, 4) * 0.15) - abs(center_x - cx_target) * 2

        return [max(boxes, key=score)]

    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 50, 140)
    edges = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)
    edge_mask = cv2.bitwise_and(edges, search)
    edge_mask = cv2.bitwise_and(edge_mask, cv2.bitwise_not(exclude))
    edge_mask = cv2.morphologyEx(
        edge_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)), iterations=2,
    )
    return _contour_boxes(
        edge_mask, search,
        MIN_OBJECT_AREA_RATIO, 0.10,
        frame_area, w,
        limit=1,
        max_width_ratio=0.56,
        min_compactness=0.05,
    )


def _confidence_from_percent(pct: float, threshold: float) -> float:
    if pct < threshold:
        return 0.0
    ratio = (pct - threshold) / max(threshold, 1.0)
    return round(min(0.92, 0.55 + ratio * 0.25), 3)


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
        mud_pct, mud_boxes = _analyze_mud(hsv, roi_mask, frame_area, w, h)
        water_pct, water_boxes = _analyze_water(hsv, roi_mask, frame_area, w)

        mud_mask = cv2.inRange(hsv, np.array([8, 70, 35]), np.array([22, 200, 130]))
        water_mask = cv2.inRange(hsv, np.array([95, 50, 60]), np.array([125, 200, 190]))
        mud_combined = cv2.bitwise_or(mud_combined, cv2.bitwise_and(mud_mask, roi_mask))
        water_combined = cv2.bitwise_or(water_combined, cv2.bitwise_and(water_mask, roi_mask))

        total_mud = max(total_mud, mud_pct)
        total_water = max(total_water, water_pct)

        if mud_pct >= MUD_THRESHOLD_PERCENT and mud_boxes:
            conf = _confidence_from_percent(mud_pct, MUD_THRESHOLD_PERCENT)
            all_detections.append(
                RoadDetection(
                    behavior="mud",
                    label=SCENARIO_LABELS["mud"],
                    scenario_id="BPTC-007",
                    confidence=conf,
                    bbox=[float(v) for v in mud_boxes[0]],
                    area_percent=mud_pct,
                )
            )

        if water_pct >= WATER_THRESHOLD_PERCENT and water_boxes:
            conf = _confidence_from_percent(water_pct, WATER_THRESHOLD_PERCENT)
            all_detections.append(
                RoadDetection(
                    behavior="water",
                    label=SCENARIO_LABELS["water"],
                    scenario_id="BPTC-008",
                    confidence=conf,
                    bbox=[float(v) for v in water_boxes[0]],
                    area_percent=water_pct,
                )
            )

        obj_boxes = _analyze_objects(frame, hsv, gray, roi_mask, mud_combined, water_combined, frame_area)
        object_count += len(obj_boxes)
        for box in obj_boxes[:1]:
            x1, y1, x2, y2 = box
            area_ratio = ((x2 - x1) * (y2 - y1)) / frame_area
            conf = round(min(0.92, 0.58 + area_ratio * 6), 3)
            all_detections.append(
                RoadDetection(
                    behavior="object",
                    label=SCENARIO_LABELS["object"],
                    scenario_id="BPTC-009",
                    confidence=conf,
                    bbox=[float(v) for v in box],
                )
            )

    mesh_zones = [z for z in zones if z["type"] == "MESH"]
    all_detections.extend(analyze_mesh_zones(frame, mesh_zones))

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
