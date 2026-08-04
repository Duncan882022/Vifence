"""Catalog ROI — Cam A-03: vẽ tất cả lớp detect trong polygon lòng đường."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .road_analyzer import (
    EVENT_MIN_CONFIDENCE,
    MIN_OBJECT_AREA_RATIO,
    _analyze_objects,
    _analyze_water,
    _clip_box_to_roi,
    _contour_boxes,
    _finalize_object_bbox,
    _merge_adjacent_boxes,
    _object_search_mask,
    _polygon_to_mask,
    _score_object_box,
)
from .road_roi_config import get_roi_zones_for_camera

# BGR — màu chuẩn overlay catalog
CATALOG_STYLES: dict[str, dict[str, Any]] = {
    "mud": {
        "label": "Bùn bẩn / đất",
        "color": (60, 180, 255),
        "scenario": "BPTC-007",
    },
    "water": {
        "label": "Vũng nước",
        "color": (255, 160, 40),
        "scenario": "BPTC-008",
    },
    "steel": {
        "label": "Cột / dầm thép",
        "color": (80, 220, 80),
        "scenario": "BPTC-009",
    },
    "cement_bag": {
        "label": "Bao xi măng",
        "color": (200, 200, 200),
        "scenario": "BPTC-009",
    },
    "sand_bag": {
        "label": "Bao cát",
        "color": (140, 190, 230),
        "scenario": "BPTC-009",
    },
    "brick": {
        "label": "Gạch / block",
        "color": (80, 80, 220),
        "scenario": "BPTC-009",
    },
    "broken_brick": {
        "label": "Gạch vỡ",
        "color": (60, 60, 200),
        "scenario": "BPTC-009",
    },
    "white_board": {
        "label": "Bảng trắng / biển báo",
        "color": (255, 255, 255),
        "scenario": "BPTC-009",
    },
    "rust_metal": {
        "label": "Kim loại gỉ",
        "color": (60, 120, 200),
        "scenario": "BPTC-009",
    },
    "generic": {
        "label": "Vật tư khác",
        "color": (100, 160, 255),
        "scenario": "BPTC-009",
    },
}


@dataclass
class CatalogDetection:
    kind: str
    label: str
    bbox: tuple[int, int, int, int]
    confidence: float
    behavior: str  # mud | water | object


def _catalog_boxes_for_mask(
    mask: np.ndarray,
    search: np.ndarray,
    frame_area: int,
    frame_width: int,
    *,
    min_ratio: float = 0.0012,
    max_ratio: float = 0.14,
    limit: int = 8,
    max_width_ratio: float = 0.72,
    min_compactness: float = 0.03,
) -> list[tuple[int, int, int, int]]:
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    work = cv2.bitwise_and(mask, search)
    work = cv2.morphologyEx(work, cv2.MORPH_CLOSE, kernel, iterations=2)
    return _contour_boxes(
        work,
        search,
        min_ratio,
        max_ratio,
        frame_area,
        frame_width,
        limit=limit,
        max_width_ratio=max_width_ratio,
        min_compactness=min_compactness,
    )


def _detect_sand_bags(
    hsv: np.ndarray,
    search: np.ndarray,
    frame_area: int,
    w: int,
    h: int,
) -> list[tuple[int, int, int, int]]:
    """Bao cát — túi vàng/nâu nhạt, tách khỏi bao xi măng trắng."""
    sand = cv2.inRange(hsv, np.array([14, 35, 90]), np.array([32, 170, 230]))
    tan = cv2.inRange(hsv, np.array([18, 40, 110]), np.array([38, 150, 210]))
    white = cv2.inRange(hsv, np.array([0, 0, 170]), np.array([180, 40, 255]))
    mask = cv2.bitwise_or(sand, tan)
    mask = cv2.bitwise_and(mask, cv2.bitwise_not(white))
    boxes = _catalog_boxes_for_mask(mask, search, frame_area, w, max_ratio=0.09, max_width_ratio=0.55)
    out: list[tuple[int, int, int, int]] = []
    for box in boxes:
        bw, bh = box[2] - box[0], box[3] - box[1]
        if bh < h * 0.04 or bw < w * 0.03:
            continue
        if bh > h * 0.32 or bw > w * 0.28:
            continue
        patch = hsv[box[1]:box[3], box[0]:box[2]]
        if patch.size and float(patch[:, :, 1].mean()) < 35:
            continue
        out.append(box)
    return _merge_adjacent_boxes(out, w, gap_ratio=0.04)


def _detect_white_boards(
    hsv: np.ndarray,
    search: np.ndarray,
    frame_area: int,
    w: int,
    h: int,
) -> list[tuple[int, int, int, int]]:
    """Bảng trắng / biển — vùng sáng, ít bão hoà."""
    white = cv2.inRange(hsv, np.array([0, 0, 175]), np.array([180, 38, 255]))
    boxes = _catalog_boxes_for_mask(
        white, search, frame_area, w,
        min_ratio=0.0008, max_ratio=0.08,
        max_width_ratio=0.62, min_compactness=0.05,
    )
    out: list[tuple[int, int, int, int]] = []
    for box in boxes:
        bw, bh = box[2] - box[0], box[3] - box[1]
        ar = bw / max(bh, 1)
        if bw < w * 0.05 or bh < h * 0.03:
            continue
        if ar < 0.45 and ar > 2.8:
            continue
        patch = hsv[box[1]:box[3], box[0]:box[2]]
        if patch.size and float(patch[:, :, 2].mean()) < 168:
            continue
        out.append(box)
    return out


def _detect_broken_bricks(
    hsv: np.ndarray,
    search: np.ndarray,
    frame_area: int,
    w: int,
    h: int,
) -> list[tuple[int, int, int, int]]:
    """Gạch vỡ — mảnh đỏ/nâu nhỏ, không gộp thành đống lớn."""
    brick = cv2.inRange(hsv, np.array([0, 50, 50]), np.array([14, 255, 220]))
    brick2 = cv2.inRange(hsv, np.array([165, 45, 50]), np.array([180, 255, 220]))
    mask = cv2.bitwise_or(brick, brick2)
    boxes = _catalog_boxes_for_mask(
        mask, search, frame_area, w,
        min_ratio=0.0006, max_ratio=0.035,
        max_width_ratio=0.35, min_compactness=0.03, limit=12,
    )
    out: list[tuple[int, int, int, int]] = []
    for box in boxes:
        bw, bh = box[2] - box[0], box[3] - box[1]
        area = bw * bh
        if area > frame_area * 0.04:
            continue
        if bw > w * 0.22 and bh > h * 0.12:
            continue
        if _score_object_box(box, w, h) < 0 and bh < h * 0.05:
            continue
        out.append(box)
    return out


def _detect_extended_objects(
    hsv: np.ndarray,
    gray: np.ndarray,
    roi_mask: np.ndarray,
    mud_boxes: list[tuple[int, int, int, int]],
    water_boxes: list[tuple[int, int, int, int]],
    frame_area: int,
) -> list[tuple[str, tuple[int, int, int, int]]]:
    """Gộp detect production + catalog-only (bao cát, bảng trắng, gạch vỡ)."""
    h, w = hsv.shape[:2]
    base = _analyze_objects(hsv, gray, roi_mask, mud_boxes, water_boxes, frame_area)
    search = _object_search_mask(roi_mask, w, h)
    seen = {kind: [box for k, box in base if k == kind] for kind in {k for k, _ in base}}

    extras: list[tuple[str, tuple[int, int, int, int]]] = []
    for kind, detector in (
        ("sand_bag", lambda: _detect_sand_bags(hsv, search, frame_area, w, h)),
        ("white_board", lambda: _detect_white_boards(hsv, search, frame_area, w, h)),
        ("broken_brick", lambda: _detect_broken_bricks(hsv, search, frame_area, w, h)),
    ):
        for box in detector():
            clipped = _clip_box_to_roi(box, roi_mask, w, h)
            if clipped is None:
                continue
            if any(
                _bbox_iou_catalog(clipped, prev) > 0.45
                for prev in seen.get(kind, [])
            ):
                continue
            extras.append((kind, clipped))
            seen.setdefault(kind, []).append(clipped)

    # Gạch lớn từ production → brick; mảnh nhỏ tách → broken_brick
    refined: list[tuple[str, tuple[int, int, int, int]]] = []
    for kind, box in base:
        final = _finalize_object_bbox(hsv, box, w, h, kind=kind)
        if kind == "brick":
            bw, bh = final[2] - final[0], final[3] - final[1]
            if bw * bh < frame_area * 0.012 and max(bw, bh) < max(w, h) * 0.14:
                kind = "broken_brick"
        refined.append((kind, final))

    return refined + extras


def _bbox_iou_catalog(
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
) -> float:
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


def _analyze_mud_catalog(
    hsv: np.ndarray,
    roi_mask: np.ndarray,
    frame_area: int,
    frame_width: int,
) -> list[tuple[float, tuple[int, int, int, int]]]:
    """Bùn catalog — ngưỡng thấp hơn production để hiển thị ROI."""
    from .road_analyzer import (
        MUD_THRESHOLD_PERCENT,
        _clamp_mud_box,
        _mud_search_mask,
        _roi_pixel_count,
        _score_mud_box,
        _tight_bbox_from_contour,
        _dedupe_boxes,
    )

    h, w = hsv.shape[:2]
    search = _mud_search_mask(roi_mask, frame_width, h)
    v_u8 = hsv[:, :, 2]
    v_f = v_u8.astype(np.float32)
    local_v = cv2.GaussianBlur(v_f, (41, 41), 0)
    brown = cv2.inRange(hsv, np.array([8, 55, 28]), np.array([28, 210, 130]))
    dark_soil = cv2.inRange(hsv, np.array([5, 30, 14]), np.array([32, 160, 82]))
    rel_dark = (local_v - v_f > 5).astype(np.uint8) * 255
    mud_mask = cv2.bitwise_or(brown, dark_soil)
    mud_mask = cv2.bitwise_and(mud_mask, rel_dark)
    mud_mask = cv2.bitwise_and(mud_mask, search)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mud_mask = cv2.morphologyEx(mud_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    roi_pixels = max(_roi_pixel_count(search), 1)
    contours, _ = cv2.findContours(mud_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    ranked: list[tuple[float, float, tuple[int, int, int, int]]] = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < frame_area * 0.0008 or area > frame_area * 0.07:
            continue
        tight = _tight_bbox_from_contour(cnt, search, h, w)
        if tight is None:
            continue
        box = _clamp_mud_box(tight, w)
        geo = _score_mud_box(box, w, h)
        if geo < 0:
            continue
        pct = 100.0 * area / roi_pixels
        if pct < MUD_THRESHOLD_PERCENT * 0.35:
            continue
        ranked.append((geo, area, box))
    if not ranked:
        return []
    ranked.sort(key=lambda row: row[0], reverse=True)
    boxes = _dedupe_boxes([row[2] for row in ranked[:4]])
    area_map = {row[2]: row[1] for row in ranked}
    return [
        (round(100.0 * area_map.get(box, 0) / roi_pixels, 2), box)
        for box in boxes
    ]


def analyze_road_catalog(
    frame: np.ndarray,
    camera_id: str = "A-03",
) -> tuple[list[CatalogDetection], list[dict]]:
    """Phân tích catalog — mọi lớp detect trong polygon ROAD."""
    h, w = frame.shape[:2]
    frame_area = h * w
    zones = get_roi_zones_for_camera(camera_id)
    road_zones = [z for z in zones if z["type"] == "ROAD" and not z.get("exempt_from_occupancy")]
    if not road_zones:
        return [], []

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    catalog: list[CatalogDetection] = []

    for zone in road_zones:
        roi_mask = _polygon_to_mask(zone["polygon"], w, h)
        mud_patches = _analyze_mud_catalog(hsv, roi_mask, frame_area, w)
        mud_boxes = [b for _, b in mud_patches]
        water_patches = _analyze_water(hsv, roi_mask, mud_boxes, frame_area, w)
        water_boxes = [b for _, b in water_patches]
        obj_items = _detect_extended_objects(
            hsv, gray, roi_mask, mud_boxes, water_boxes, frame_area,
        )

        for pct, box in mud_patches:
            clipped = _clip_box_to_roi(box, roi_mask, w, h)
            if clipped is None:
                continue
            conf = min(0.98, 0.55 + pct / 20.0)
            style = CATALOG_STYLES["mud"]
            catalog.append(
                CatalogDetection("mud", style["label"], clipped, conf, "mud"),
            )

        for pct, box in water_patches:
            clipped = _clip_box_to_roi(box, roi_mask, w, h)
            if clipped is None:
                continue
            conf = min(0.98, 0.55 + pct / 12.0)
            style = CATALOG_STYLES["water"]
            catalog.append(
                CatalogDetection("water", style["label"], clipped, conf, "water"),
            )

        for kind, box in obj_items:
            clipped = _clip_box_to_roi(box, roi_mask, w, h)
            if clipped is None:
                continue
            style = CATALOG_STYLES.get(kind, CATALOG_STYLES["generic"])
            conf = 0.72 if kind in ("rust_metal", "generic") else 0.85
            if _score_object_box(clipped, w, h) >= 0:
                conf = max(conf, EVENT_MIN_CONFIDENCE)
            catalog.append(
                CatalogDetection(kind, style["label"], clipped, conf, "object"),
            )

    # Dedupe IoU cao — giữ confidence lớn hơn
    deduped: list[CatalogDetection] = []
    for det in sorted(catalog, key=lambda d: d.confidence, reverse=True):
        if any(
            d.kind == det.kind and _bbox_iou_catalog(d.bbox, det.bbox) > 0.5
            for d in deduped
        ):
            continue
        deduped.append(det)

    return deduped, road_zones[0]["polygon"]


def render_road_catalog(
    frame: np.ndarray,
    detections: list[CatalogDetection],
    polygon: list[dict],
    *,
    show_legend: bool = True,
) -> np.ndarray:
    """Vẽ polygon ROI + bbox catalog lên frame."""
    out = frame.copy()
    h, w = out.shape[:2]
    pts = np.array(
        [[int(p["x"] * w), int(p["y"] * h)] for p in polygon],
        dtype=np.int32,
    )

    overlay = out.copy()
    cv2.fillPoly(overlay, [pts], (255, 200, 0))
    out = cv2.addWeighted(overlay, 0.08, out, 0.92, 0)
    cv2.polylines(out, [pts], True, (255, 200, 0), 2, cv2.LINE_AA)

    for det in detections:
        style = CATALOG_STYLES.get(det.kind, CATALOG_STYLES["generic"])
        color = style["color"]
        x1, y1, x2, y2 = det.bbox
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)
        tag = f"{det.label} {det.confidence * 100:.0f}%"
        font = cv2.FONT_HERSHEY_SIMPLEX
        scale = max(0.38, min(0.52, w / 1400))
        thickness = 1
        (tw, th), _ = cv2.getTextSize(tag, font, scale, thickness)
        ty = max(y1 - 4, th + 6)
        cv2.rectangle(out, (x1, ty - th - 6), (x1 + tw + 6, ty + 2), (20, 20, 20), -1)
        cv2.putText(out, tag, (x1 + 3, ty - 2), font, scale, color, thickness, cv2.LINE_AA)

    cv2.putText(
        out,
        "Cam A-03 — ROI Catalog (trong polygon lòng đường)",
        (12, 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        out,
        "Cam A-03 — ROI Catalog (trong polygon lòng đường)",
        (12, 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 200, 0),
        1,
        cv2.LINE_AA,
    )

    if show_legend:
        used_kinds = sorted({d.kind for d in detections}, key=lambda k: CATALOG_STYLES[k]["label"])
        lx, ly = 12, h - 14 - len(used_kinds) * 22
        cv2.rectangle(out, (8, ly - 10), (min(w - 8, 280), h - 8), (16, 16, 16), -1)
        cv2.rectangle(out, (8, ly - 10), (min(w - 8, 280), h - 8), (80, 80, 80), 1)
        for i, kind in enumerate(used_kinds):
            style = CATALOG_STYLES[kind]
            y = ly + i * 22
            cv2.rectangle(out, (16, y - 10), (32, y + 4), style["color"], -1)
            cv2.putText(
                out,
                style["label"],
                (40, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                (230, 230, 230),
                1,
                cv2.LINE_AA,
            )

    return out


def save_road_catalog_snapshot(
    frame: np.ndarray,
    camera_id: str,
    output_path: Path,
) -> dict:
    """Phân tích + lưu PNG catalog."""
    detections, polygon = analyze_road_catalog(frame, camera_id)
    rendered = render_road_catalog(frame, detections, polygon)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), rendered)
    return {
        "path": str(output_path),
        "count": len(detections),
        "detections": [
            {
                "kind": d.kind,
                "label": d.label,
                "behavior": d.behavior,
                "confidence": round(d.confidence, 3),
                "bbox": list(d.bbox),
            }
            for d in detections
        ],
    }
