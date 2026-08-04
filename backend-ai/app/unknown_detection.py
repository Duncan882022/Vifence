"""Vùng / vật thể chưa phân loại được — gán nhãn Unknown."""

from __future__ import annotations

import cv2
import numpy as np
from typing import Optional

UNKNOWN_LABEL = "Unknown"

MACHINERY_RECOGNIZED_MIN_CONF = 0.72
OBJECT_RECOGNIZED_MIN_CONF = 0.80

MACHINERY_KIND_LABELS: dict[str, str] = {
    "crane_green": "Máy xúc (xanh)",
    "excavator_orange": "Máy xúc / cẩu (cam)",
    "tower_crane": "Cẩu tháp (vàng)",
}


def machinery_display_label(kind: str, confidence: float, source: str) -> str:
    if source != "color_detect" or confidence < MACHINERY_RECOGNIZED_MIN_CONF:
        return UNKNOWN_LABEL
    return MACHINERY_KIND_LABELS.get(kind, UNKNOWN_LABEL)


def person_display_label(_confidence: float) -> str:
    return UNKNOWN_LABEL


def object_display_label(object_kind: str | None, confidence: float, fallback: str) -> str:
    if confidence < OBJECT_RECOGNIZED_MIN_CONF:
        return UNKNOWN_LABEL
    if not object_kind or object_kind in ("generic", "unknown"):
        return UNKNOWN_LABEL
    return fallback


def _masks_from_boxes(
    height: int,
    width: int,
    boxes: list[tuple[int, int, int, int]],
    *,
    pad_ratio: float = 0.10,
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


def _bbox_iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    aa = max((ax2 - ax1) * (ay2 - ay1), 1)
    bb = max((bx2 - bx1) * (by2 - by1), 1)
    return inter / (aa + bb - inter)


def find_unknown_regions(
    gray: np.ndarray,
    existing_boxes: list[tuple[int, int, int, int]],
    frame_area: int,
    *,
    hsv: Optional[np.ndarray] = None,
    min_area_ratio: float = 0.008,
    max_area_ratio: float = 0.16,
    min_y_ratio: float = 0.30,
    max_y_ratio: float = 0.84,
    limit: int = 4,
) -> list[tuple[int, int, int, int]]:
    """Tìm vùng nổi bật trong khung hình chưa được detect phân loại."""
    h, w = gray.shape[:2]
    if frame_area <= 0:
        return []
    exclude = _masks_from_boxes(h, w, existing_boxes, pad_ratio=0.12)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 42, 125)
    edges = cv2.bitwise_and(edges, cv2.bitwise_not(exclude))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    work = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    work = cv2.dilate(work, kernel, iterations=1)
    contours, _ = cv2.findContours(work, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = frame_area * min_area_ratio
    max_area = frame_area * max_area_ratio
    ranked: list[tuple[float, tuple[int, int, int, int]]] = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw < w * 0.06 or bh < h * 0.05:
            continue
        if bw > w * 0.72 and bh > h * 0.55:
            continue
        box = (x, y, x + bw, y + bh)
        cy = (y + y + bh) / 2.0
        if cy < h * min_y_ratio or cy > h * max_y_ratio:
            continue
        compactness = area / max(float(bw * bh), 1.0)
        if compactness < 0.14:
            continue
        if hsv is not None:
            patch = hsv[y:y + bh, x:x + bw]
            if patch.size:
                mean_sat = float(patch[:, :, 1].mean())
                mean_val = float(patch[:, :, 2].mean())
                if mean_sat < 28 and mean_val > 168:
                    continue
                if mean_sat < 18 and cy < h * 0.45:
                    continue
        if any(_bbox_iou(box, known) > 0.55 for known in existing_boxes):
            continue
        ranked.append((area * compactness, box))

    ranked.sort(key=lambda row: row[0], reverse=True)
    kept: list[tuple[int, int, int, int]] = []
    for _, box in ranked:
        if all(_bbox_iou(box, prev) < 0.45 for prev in kept):
            kept.append(box)
        if len(kept) >= limit:
            break
    return kept
