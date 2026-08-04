"""Phân tích lòng đường — bùn/đất, vũng nước, vật chiếm lòng đường trong ROI polygon."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import cv2
import numpy as np

from .road_roi_config import get_roi_zones_for_camera
from .schemas import RoadDetection

logger = logging.getLogger("road_analyzer")

MUD_THRESHOLD_PERCENT = 4.0
WATER_THRESHOLD_PERCENT = 0.25
MIN_OBJECT_AREA_RATIO = 0.0025
MAX_OBJECT_AREA_RATIO = 0.14

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


def _road_band_mask(roi_mask: np.ndarray, width: int, height: int) -> np.ndarray:
    """Vùng mặt đường trong polygon — loại lề đất trái và phần xa trên."""
    band = roi_mask.copy()
    band[:, : int(width * 0.10)] = 0
    band[: int(height * 0.32), :] = 0
    return band


def _water_search_mask(roi_mask: np.ndarray, width: int, height: int) -> np.ndarray:
    """Vũng nước trên lòng đường phía gần — loại lề và phần xa."""
    band = roi_mask.copy()
    band[: int(height * 0.48), :] = 0
    band[:, : int(width * 0.10)] = 0
    band[:, int(width * 0.80) :] = 0
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


def _analyze_mud(
    hsv: np.ndarray,
    roi_mask: np.ndarray,
    frame_area: int,
    frame_width: int,
) -> tuple[float, list[tuple[int, int, int, int]]]:
    band = _road_band_mask(roi_mask, frame_width, hsv.shape[0])
    brown = cv2.inRange(hsv, np.array([8, 65, 35]), np.array([28, 220, 135]))
    dark_soil = cv2.inRange(hsv, np.array([5, 25, 18]), np.array([30, 150, 78]))
    asphalt = cv2.inRange(hsv, np.array([8, 0, 95]), np.array([30, 48, 255]))
    mud_mask = cv2.bitwise_or(brown, dark_soil)
    mud_mask = cv2.bitwise_and(mud_mask, band)
    mud_mask = cv2.bitwise_and(mud_mask, cv2.bitwise_not(asphalt))
    mud_mask = cv2.medianBlur(mud_mask, 5)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mud_mask = cv2.morphologyEx(mud_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mud_mask = cv2.morphologyEx(mud_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    return _best_patch_in_roi(
        mud_mask, band, frame_area,
        min_area_ratio=0.0015, max_area_ratio=0.12, min_compactness=0.08,
    )


def _wet_water_search_mask(roi_mask: np.ndarray, width: int, height: int) -> np.ndarray:
    """Vũng phản chiếu trên nhựa — giữa lòng đường phía gần."""
    band = roi_mask.copy()
    band[: int(height * 0.62), :] = 0
    band[:, : int(width * 0.12)] = 0
    band[:, int(width * 0.78) :] = 0
    return band


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
    if bw < 12 or bh < 8:
        return -1.0
    cy = y + bh / 2
    cx = x + bw / 2
    if cy < h * min_cy_ratio:
        return -1.0
    if cx < w * 0.18 or cx > w * 0.72:
        return -1.0
    compactness = area / float(bw * bh)
    if compactness < min_compactness:
        return -1.0
    patch_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(patch_mask, [cnt], -1, 255, -1)
    mean_v = cv2.mean(v, mask=patch_mask)[0]
    if mean_v > max_mean_v:
        return -1.0
    center_weight = max(0.25, 1.0 - abs(cx - w * cx_target) / (w * 0.38))
    return area * (cy / h) * center_weight


def _analyze_water(
    hsv: np.ndarray,
    roi_mask: np.ndarray,
    mud_boxes: list[tuple[int, int, int, int]],
    frame_area: int,
    frame_width: int,
) -> tuple[float, list[tuple[int, int, int, int]]]:
    h, w = hsv.shape[:2]
    exclude = _masks_from_boxes(h, w, mud_boxes, pad_ratio=0.05)
    v_u8 = hsv[:, :, 2]
    v_f = v_u8.astype(np.float32)
    mud_brown = cv2.inRange(hsv, np.array([10, 70, 30]), np.array([28, 220, 120]))
    mud_left = cv2.inRange(hsv, np.array([8, 60, 30]), np.array([30, 220, 130]))
    steel = cv2.inRange(hsv, np.array([0, 40, 40]), np.array([20, 255, 200]))
    white = cv2.inRange(hsv, np.array([0, 0, 185]), np.array([180, 35, 255]))
    k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    k7 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))

    best_score = -1.0
    best_area = 0.0
    best_box: tuple[int, int, int, int] | None = None
    best_roi_pixels = 1

    def consider(mask: np.ndarray, search: np.ndarray, min_a: float, max_a: float, **score_kw) -> None:
        nonlocal best_score, best_area, best_box, best_roi_pixels
        roi_pixels = max(_roi_pixel_count(search), 1)
        min_area = frame_area * min_a
        max_area = frame_area * max_a
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area or area > max_area:
                continue
            x, y, bw, bh = cv2.boundingRect(cnt)
            score = _score_water_patch(cnt, x, y, bw, bh, area, v_u8, h, w, **score_kw)
            if score <= 0:
                continue
            patch_mask = np.zeros((h, w), dtype=np.uint8)
            cv2.drawContours(patch_mask, [cnt], -1, 255, -1)
            mean_v = cv2.mean(v_u8, mask=patch_mask)[0]
            # Ưu tiên vũng tối thật; vũng phản chiếu chỉ thắng khi không có vũng tối
            adjusted = score * (4.0 if mean_v < 80 else 1.0)
            if adjusted > best_score:
                best_score = adjusted
                best_area = area
                best_box = (x, y, x + bw, y + bh)
                best_roi_pixels = roi_pixels

    # Pass A — vũng tối (đất bùn ẩm, vũng đen)
    search_dark = _water_search_mask(roi_mask, frame_width, h)
    dark = cv2.inRange(v_u8, 8, 82)
    dark = cv2.bitwise_and(dark, search_dark)
    dark = cv2.bitwise_and(dark, cv2.bitwise_not(mud_brown))
    dark = cv2.bitwise_and(dark, cv2.bitwise_not(steel))
    dark = cv2.bitwise_and(dark, cv2.bitwise_not(exclude))
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, k5, iterations=1)
    consider(dark, search_dark, 0.0012, 0.07, min_cy_ratio=0.72, max_mean_v=75)

    # Pass B — vũng phản chiếu trên nhựa (V trung bình, tối hơn vùng lân cận)
    search_wet = _wet_water_search_mask(roi_mask, frame_width, h)
    local = cv2.GaussianBlur(v_f, (51, 51), 0)
    rel_dark = ((local - v_f) > 5).astype(np.uint8) * 255
    road_mean = cv2.mean(v_u8, mask=search_wet)[0]
    damp = cv2.inRange(v_u8, int(max(90, road_mean - 35)), int(min(175, road_mean + 8)))
    wet = cv2.bitwise_or(rel_dark, damp)
    wet = cv2.bitwise_and(wet, search_wet)
    wet = cv2.bitwise_and(wet, cv2.bitwise_not(white))
    wet = cv2.bitwise_and(wet, cv2.bitwise_not(mud_left))
    wet = cv2.bitwise_and(wet, cv2.bitwise_not(exclude))
    wet = cv2.morphologyEx(wet, cv2.MORPH_OPEN, k5, iterations=1)
    wet = cv2.morphologyEx(wet, cv2.MORPH_CLOSE, k7, iterations=2)
    consider(
        wet, search_wet, 0.002, 0.06,
        min_cy_ratio=0.68, max_mean_v=175, min_compactness=0.12, cx_target=0.38,
    )

    if best_box is None:
        return 0.0, []
    pct = round(100.0 * best_area / best_roi_pixels, 2)
    return pct, [best_box]


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
    return area * (1 + min(ar, 5) * 0.12) - abs(center_x - cx_target) * 1.5 + y_norm * 800


def _analyze_objects(
    hsv: np.ndarray,
    gray: np.ndarray,
    roi_mask: np.ndarray,
    mud_boxes: list[tuple[int, int, int, int]],
    water_boxes: list[tuple[int, int, int, int]],
    frame_area: int,
) -> list[tuple[int, int, int, int]]:
    h, w = hsv.shape[:2]
    exclude = _masks_from_boxes(h, w, mud_boxes + water_boxes, pad_ratio=0.08)
    search = _object_search_mask(roi_mask, w, h)
    tan = cv2.inRange(hsv, np.array([15, 25, 120]), np.array([35, 180, 255]))
    zebra = cv2.inRange(hsv, np.array([0, 0, 165]), np.array([180, 40, 255]))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    candidates: list[tuple[int, int, int, int]] = []

    # Thép sơn xanh / dầm U trên đường
    green_steel = cv2.inRange(hsv, np.array([32, 28, 45]), np.array([95, 255, 230]))
    green_steel = cv2.bitwise_and(green_steel, search)
    green_steel = cv2.bitwise_and(green_steel, cv2.bitwise_not(exclude))
    green_steel = cv2.bitwise_and(green_steel, cv2.bitwise_not(tan))
    green_steel = cv2.bitwise_and(green_steel, cv2.bitwise_not(zebra))
    green_steel = cv2.morphologyEx(green_steel, cv2.MORPH_CLOSE, kernel, iterations=2)
    candidates.extend(
        _contour_boxes(
            green_steel, search,
            MIN_OBJECT_AREA_RATIO, MAX_OBJECT_AREA_RATIO,
            frame_area, w, limit=2, max_width_ratio=0.68, min_compactness=0.04,
        )
    )

    # Vật kim loại gỉ / nâu đỏ
    rust_mask = cv2.inRange(hsv, np.array([5, 55, 40]), np.array([25, 255, 210]))
    rust_mask = cv2.bitwise_and(rust_mask, search)
    rust_mask = cv2.bitwise_and(rust_mask, cv2.bitwise_not(exclude))
    rust_mask = cv2.bitwise_and(rust_mask, cv2.bitwise_not(tan))
    rust_mask = cv2.bitwise_and(rust_mask, cv2.bitwise_not(zebra))
    rust_mask = cv2.morphologyEx(rust_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    rust_mask = cv2.morphologyEx(rust_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    candidates.extend(
        _contour_boxes(
            rust_mask, search,
            MIN_OBJECT_AREA_RATIO, 0.12,
            frame_area, w, limit=2, max_width_ratio=0.62, min_compactness=0.05,
        )
    )

    if candidates:
        ranked = [b for b in candidates if _score_object_box(b, w, h) >= 0]
        if ranked:
            return [max(ranked, key=lambda b: _score_object_box(b, w, h))]

    # Fallback: biên cạnh vật thể lớn (dầm thép xám)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 45, 130)
    edges = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)
    edge_mask = cv2.bitwise_and(edges, search)
    edge_mask = cv2.bitwise_and(edge_mask, cv2.bitwise_not(exclude))
    edge_mask = cv2.bitwise_and(edge_mask, cv2.bitwise_not(zebra))
    edge_mask = cv2.morphologyEx(
        edge_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)), iterations=2,
    )
    edge_boxes = _contour_boxes(
        edge_mask, search,
        MIN_OBJECT_AREA_RATIO, 0.12,
        frame_area, w, limit=3, max_width_ratio=0.62, min_compactness=0.05,
    )
    edge_boxes = [b for b in edge_boxes if _score_object_box(b, w, h) >= 0]
    if edge_boxes:
        return [max(edge_boxes, key=lambda b: _score_object_box(b, w, h))]
    return []


def _confidence_from_percent(pct: float, threshold: float) -> float:
    if pct < threshold:
        return 0.0
    ratio = (pct - threshold) / max(threshold, 0.5)
    return round(min(0.94, 0.58 + ratio * 0.22), 3)


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

    for zone in road_zones:
        roi_mask = _polygon_to_mask(zone["polygon"], w, h)
        mud_pct, mud_boxes = _analyze_mud(hsv, roi_mask, frame_area, w)
        water_pct, water_boxes = _analyze_water(hsv, roi_mask, mud_boxes, frame_area, w)

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

        obj_boxes = _analyze_objects(hsv, gray, roi_mask, mud_boxes, water_boxes, frame_area)
        object_count += len(obj_boxes)
        for box in obj_boxes[:1]:
            x1, y1, x2, y2 = box
            area_ratio = ((x2 - x1) * (y2 - y1)) / frame_area
            conf = round(min(0.94, 0.60 + area_ratio * 8), 3)
            all_detections.append(
                RoadDetection(
                    behavior="object",
                    label=SCENARIO_LABELS["object"],
                    scenario_id="BPTC-009",
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
        if z["type"] != "MESH"
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
