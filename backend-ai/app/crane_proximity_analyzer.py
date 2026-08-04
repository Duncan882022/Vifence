"""Phát hiện người làm việc gần máy cẩu (≤ 1 m) — Cam A-04."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass

import cv2
import numpy as np

from .crane_roi_config import (
    DEFAULT_PIXELS_PER_METER,
    EVENT_MIN_CONFIDENCE,
    PERSON_MIN_CONFIDENCE,
    PROXIMITY_THRESHOLD_METERS,
)
from .detectors.person_detector import PersonDetector
from .schemas import CraneProximityDetection
from .unknown_detection import UNKNOWN_LABEL, person_display_label

logger = logging.getLogger("crane_proximity_analyzer")

_person_detector: PersonDetector | None = None

SCENARIO_LABEL = "Làm việc trong vùng nguy hiểm"
SCENARIO_ID = "DZ-003"


@dataclass
class _CraneBody:
    bbox: tuple[int, int, int, int]
    confidence: float
    source: str


def _get_person_detector() -> PersonDetector:
    global _person_detector
    if _person_detector is None:
        _person_detector = PersonDetector(conf_threshold=PERSON_MIN_CONFIDENCE)
        _person_detector.load()
    return _person_detector


def _polygon_to_mask(polygon: list[dict], width: int, height: int) -> np.ndarray:
    pts = np.array(
        [[int(p["x"] * width), int(p["y"] * height)] for p in polygon],
        dtype=np.int32,
    )
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 255)
    return mask


def _zone_bbox(polygon: list[dict], width: int, height: int) -> tuple[int, int, int, int]:
    xs = [int(p["x"] * width) for p in polygon]
    ys = [int(p["y"] * height) for p in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def _center_in_mask(cx: float, cy: float, mask: np.ndarray, w: int, h: int) -> bool:
    ix, iy = int(cx), int(cy)
    if ix < 0 or iy < 0 or ix >= w or iy >= h:
        return False
    return mask[iy, ix] > 0


@dataclass
class _MachineryUnit:
    bbox: tuple[int, int, int, int]
    confidence: float
    kind: str
    label: str
    source: str


MACHINERY_LABELS = {
    "crane_green": "Máy xúc (xanh)",
    "sany_drill": "Máy khoan",
    "tower_crane": "Máy cẩu tháp",
    "machinery_yellow": "Máy thi công (vàng)",
}

MACHINERY_KIND_PRIORITY: dict[str, int] = {
    "tower_crane": 4,
    "crane_green": 3,
    "sany_drill": 3,
    "machinery_yellow": 1,
}


def _machinery_search_mask(height: int, width: int) -> np.ndarray:
    """Toàn khung hình — tránh chỉ mép dưới."""
    mask = np.zeros((height, width), dtype=np.uint8)
    mask[int(height * 0.01) : int(height * 0.96), int(width * 0.06) : int(width * 0.99)] = 255
    return mask


def _union_boxes(boxes: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int] | None:
    if not boxes:
        return None
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


def _merge_vertical_stack(
    boxes: list[tuple[int, int, int, int]],
    *,
    gap_px: int,
    min_x_overlap_ratio: float = 0.28,
) -> list[tuple[int, int, int, int]]:
    """Gộp các mảnh cùng cột — máy cao (cẩu tháp / boom)."""
    if not boxes:
        return []
    ordered = sorted(boxes, key=lambda b: b[1])
    stacks: list[tuple[int, int, int, int]] = []
    for box in ordered:
        merged = False
        x1, y1, x2, y2 = box
        for idx, cur in enumerate(stacks):
            cx1, cy1, cx2, cy2 = cur
            ix1, ix2 = max(x1, cx1), min(x2, cx2)
            overlap = max(0, ix2 - ix1)
            min_w = max(min(x2 - x1, cx2 - cx1), 1)
            dx = max(x1 - cx2, cx1 - x2, 0)
            dy = max(y1 - cy2, cy1 - y2, 0)
            if overlap / min_w >= min_x_overlap_ratio and dx <= gap_px and dy <= gap_px:
                stacks[idx] = (
                    min(cx1, x1), min(cy1, y1),
                    max(cx2, x2), max(cy2, y2),
                )
                merged = True
                break
        if not merged:
            stacks.append(box)
    return stacks


def _machinery_confidence(box: tuple[int, int, int, int], frame_area: int, kind: str) -> float:
    x1, y1, x2, y2 = box
    area_ratio = ((x2 - x1) * (y2 - y1)) / frame_area
    base = 0.58 + min(area_ratio * 5.0, 0.28)
    if kind == "sany_drill":
        base += 0.12
    if kind == "crane_green":
        base += 0.06
    if kind == "tower_crane":
        base += 0.05
    return round(min(0.96, base), 3)


def _score_excavator_box(box: tuple[int, int, int, int], frame_width: int, frame_height: int) -> float:
    """Ưu tiên máy xúc cam bên trái — tránh vệt đất cam ở lề phải."""
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0
    area = bw * bh
    x_norm = cx / max(frame_width, 1)
    y_norm = cy / max(frame_height, 1)
    if x_norm > 0.42:
        return -1.0
    if y_norm < 0.34 or y_norm > 0.72:
        return -1.0
    cx_target = frame_width * 0.20
    return area - abs(cx - cx_target) * 4.0 + y_norm * 400.0


def _machinery_box_valid(
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    kind: str,
) -> bool:
    """Lọc bbox máy — tránh gộp nhầm toàn khung hoặc mảnh lưới."""
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    area_ratio = (bw * bh) / max(frame_width * frame_height, 1)
    cy = (y1 + y2) / 2.0
    if bw < frame_width * 0.04 or bh < frame_height * 0.04:
        return False
    if area_ratio > 0.42:
        return False
    if kind == "crane_green":
        if cy > frame_height * 0.82:
            return False
        if area_ratio < 0.0035:
            return False
        if bw < frame_width * 0.06:
            return False
    if kind == "sany_drill":
        if cy < frame_height * 0.22:
            return False
        if area_ratio > 0.10:
            return False
        if bw > frame_width * 0.30:
            return False
    return True


def _boxes_from_color_mask(
    mask: np.ndarray,
    frame_area: int,
    *,
    min_area_ratio: float = 0.0008,
) -> list[tuple[int, int, int, int]]:
    min_area = frame_area * min_area_ratio
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes: list[tuple[int, int, int, int]] = []
    for cnt in contours:
        if cv2.contourArea(cnt) < min_area:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        boxes.append((x, y, x + bw, y + bh))
    return boxes


def _tower_core_exclude_box(
    tower_box: tuple[int, int, int, int],
    frame_width: int,
) -> tuple[int, int, int, int]:
    """Chỉ loại cột cẩu tháp hẹp — không cắt cần máy xúc xanh."""
    x1, y1, x2, y2 = tower_box
    cx = (x1 + x2) // 2
    half = max(12, int((x2 - x1) * 0.32))
    return max(0, cx - half), y1, min(frame_width, cx + half), y2


def _refine_green_excavator_bbox(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Mở rộng bbox máy xúc xanh — gộp thân + cần, không tràn lưới phải."""
    h, w = hsv.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    ex1 = max(0, min(int(w * 0.16), x1 - int(w * 0.02)))
    ex2 = min(w, int(w * 0.98))
    ey1 = max(0, y1 - int(h * 0.05))
    ey2 = min(h, y2 + int(h * 0.03))
    patch = hsv[ey1:ey2, ex1:ex2]
    if patch.size == 0:
        return _clamp_green_bbox(box, w, h)
    green = cv2.inRange(patch, np.array([32, 38, 50]), np.array([96, 255, 235]))
    mesh = cv2.inRange(patch, np.array([40, 90, 50]), np.array([88, 255, 190]))
    material = cv2.bitwise_and(green, cv2.bitwise_not(mesh))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    material = cv2.morphologyEx(material, cv2.MORPH_CLOSE, kernel, iterations=1)
    cx = (x1 + x2) // 2 - ex1
    cy = (y1 + y2) // 2 - ey1
    num, labels, stats, _ = cv2.connectedComponentsWithStats(material, connectivity=8)
    best_label = 0
    best_area = 0
    for lbl in range(1, num):
        lx, ly, lbw, lbh, area = stats[lbl]
        if area < 80:
            continue
        if lx <= cx < lx + lbw and ly <= cy < ly + lbh:
            best_label = lbl
            break
        if area > best_area:
            best_area = area
            best_label = lbl
    if best_label <= 0:
        return _clamp_green_bbox(box, w, h)
    comp = labels == best_label
    ys, xs = np.where(comp)
    if len(xs) < 20:
        return _clamp_green_bbox(box, w, h)
    tx1 = int(xs.min()) + ex1
    ty1 = int(ys.min()) + ey1
    tx2 = int(xs.max()) + 1 + ex1
    ty2 = int(ys.max()) + 1 + ey1
    tx1, ty1 = min(tx1, x1), min(ty1, y1)
    tx2, ty2 = max(tx2, x2), max(ty2, y2)
    return _clamp_green_bbox((tx1, ty1, tx2, ty2), w, h)


def _clamp_green_bbox(
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = [int(v) for v in box]
    min_x = int(frame_width * min(0.32, x1 / max(frame_width, 1) + 0.02))
    max_x = int(frame_width * 0.96)
    x1 = max(min_x, x1)
    x2 = min(max_x, max(x1 + int(frame_width * 0.08), x2))
    y1 = max(int(frame_height * 0.12), y1)
    y2 = min(int(frame_height * 0.92), max(y1 + int(frame_height * 0.06), y2))
    return x1, y1, x2, y2


def _detect_tower_crane(
    hsv: np.ndarray,
    search_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int] | None:
    """Cẩu tháp vàng ở giữa phía trên — cột cao hẹp."""
    h, w = hsv.shape[:2]
    band = np.zeros((h, w), dtype=np.uint8)
    band[int(h * 0.04) : int(h * 0.58), int(w * 0.36) : int(w * 0.62)] = 255
    yellow = cv2.inRange(hsv, np.array([14, 50, 80]), np.array([40, 255, 255]))
    orange = cv2.inRange(hsv, np.array([6, 70, 80]), np.array([28, 255, 255]))
    mask = cv2.bitwise_or(yellow, orange)
    mask = cv2.bitwise_and(mask, search_mask)
    mask = cv2.bitwise_and(mask, band)
    k_vert = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 35))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k_vert, iterations=2)
    best: tuple[float, tuple[int, int, int, int]] | None = None
    for box in _boxes_from_color_mask(mask, w * h, min_area_ratio=0.00035):
        x1, y1, x2, y2 = box
        bw, bh = x2 - x1, y2 - y1
        if bh < h * 0.16:
            continue
        cx = (x1 + x2) / 2.0
        if cx < w * 0.34 or cx > w * 0.64:
            continue
        max_bw = w * (0.22 if bh > h * 0.32 else 0.14)
        if bw > max_bw:
            half = int(min(bw * 0.22, w * 0.085))
            x1, x2 = int(cx - half), int(cx + half)
            bw = x2 - x1
        aspect = bh / max(bw, 1)
        if aspect < 1.4 and bh < h * 0.28:
            continue
        score = bh * min(aspect, 4.0) - abs(cx - w * 0.50) * 2.0
        if best is None or score > best[0]:
            best = (score, (x1, y1, x2, y2))
    if best is None:
        return None
    x1, y1, x2, y2 = best[1]
    bw = x2 - x1
    if bw > w * 0.14:
        cx = (x1 + x2) // 2
        half = int(w * 0.085)
        x1, x2 = max(0, cx - half), min(w, cx + half)
    # Mở rộng nhẹ lên trên / sang trái để gồm cần cẩu ngang
    yellow_top = cv2.inRange(hsv, np.array([12, 55, 90]), np.array([38, 255, 255]))
    top_roi = yellow_top[max(0, y1 - int(h * 0.12)) : y1 + int(h * 0.08), max(0, x1 - int(w * 0.18)) : min(w, x2 + int(w * 0.12))]
    ys, xs = np.where(top_roi > 0)
    if len(xs) >= 12:
        x1 = min(x1, int(xs.min()) + max(0, x1 - int(w * 0.18)))
        y1 = min(y1, int(ys.min()) + max(0, y1 - int(h * 0.12)))
    return (x1, y1, x2, y2)


def _sany_box_valid(box: tuple[int, int, int, int], frame_width: int, frame_height: int) -> bool:
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    if bh < frame_height * 0.08 or bw < frame_width * 0.04:
        return False
    if bh > frame_height * 0.78 or bw > frame_width * 0.42:
        return False
    cy = (y1 + y2) / 2.0
    if cy > frame_height * 0.82 or x2 > frame_width * 0.52:
        return False
    return True


def _score_sany_box(box: tuple[int, int, int, int], frame_width: int, frame_height: int) -> float:
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    return bh * 1.8 + bw * 0.35 - abs((x1 + x2) / 2 - frame_width * 0.19) * 2.2


def _detect_sany_drill(
    hsv: np.ndarray,
    search_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int] | None:
    """Máy khoan SANY (cam/vàng) bên trái — gộp thân + boom cao."""
    h, w = hsv.shape[:2]

    def run_pass(
        orange_lo: tuple[int, int, int],
        orange_hi: tuple[int, int, int],
        yellow_lo: tuple[int, int, int],
        yellow_hi: tuple[int, int, int],
        left_ratio: float,
        *,
        max_piece_width: float,
        min_area_ratio: float,
    ) -> tuple[int, int, int, int] | None:
        left = np.zeros((h, w), dtype=np.uint8)
        left[:, : int(w * left_ratio)] = 255
        ground = np.zeros((h, w), dtype=np.uint8)
        ground[: int(h * 0.88), :] = 255
        orange = cv2.inRange(hsv, np.array(orange_lo), np.array(orange_hi))
        yellow = cv2.inRange(hsv, np.array(yellow_lo), np.array(yellow_hi))
        mask = cv2.bitwise_or(orange, yellow)
        mask = cv2.bitwise_and(mask, search_mask)
        mask = cv2.bitwise_and(mask, left)
        mask = cv2.bitwise_and(mask, ground)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        raw = _boxes_from_color_mask(mask, w * h, min_area_ratio=min_area_ratio)
        raw = [
            b for b in raw
            if b[3] < h * 0.86
            and (b[2] - b[0]) < w * max_piece_width
            and (b[2] - b[0]) > w * 0.04
            and (b[3] - b[1]) > h * 0.025
            and (b[0] + b[2]) / 2 < w * 0.46
            and (b[2] - b[0]) < w * 0.55
        ]
        stacks = _merge_vertical_stack(raw, gap_px=max(28, int(h * 0.08)))
        if not stacks:
            return None

        stacks.sort(key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)
        primary = stacks[0]
        merged = primary
        for extra in stacks[1:]:
            if extra[0] > w * 0.36:
                continue
            dx = max(extra[0] - merged[2], merged[0] - extra[2], 0)
            dy = max(extra[1] - merged[3], merged[1] - extra[3], 0)
            if dx >= w * 0.10 or dy >= h * 0.14:
                continue
            candidate = (
                min(merged[0], extra[0]), min(merged[1], extra[1]),
                max(merged[2], extra[2]), max(merged[3], extra[3]),
            )
            if _sany_box_valid(candidate, w, h):
                merged = candidate

        candidates = [primary, merged] + stacks[1:]
        best: tuple[float, tuple[int, int, int, int]] | None = None
        seen: set[tuple[int, int, int, int]] = set()
        for box in candidates:
            if box in seen:
                continue
            seen.add(box)
            if not _sany_box_valid(box, w, h):
                continue
            score = _score_sany_box(box, w, h)
            if best is None or score > best[0]:
                best = (score, box)
        return best[1] if best else None

    strict = run_pass(
        (6, 80, 85), (26, 255, 255),
        (14, 65, 95), (36, 255, 255),
        0.48,
        max_piece_width=0.34,
        min_area_ratio=0.00045,
    )
    if strict is not None:
        return strict

    return run_pass(
        (4, 45, 60), (30, 255, 255),
        (10, 35, 70), (40, 255, 255),
        0.55,
        max_piece_width=0.38,
        min_area_ratio=0.00030,
    )


def _green_excavator_candidates(
    hsv: np.ndarray,
    search_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
    *,
    band_box: tuple[float, float, float, float],
    green_lo: tuple[int, int, int],
    green_hi: tuple[int, int, int],
    min_area_ratio: float,
    min_width_ratio: float,
    min_height_ratio: float,
    max_width_ratio: float,
    max_height_ratio: float,
    min_x_ratio: float,
) -> list[tuple[int, int, int, int]]:
    h, w = hsv.shape[:2]
    by0, bx0, by1, bx1 = band_box
    band = np.zeros((h, w), dtype=np.uint8)
    band[int(h * by0) : int(h * by1), int(w * bx0) : int(w * bx1)] = 255
    green = cv2.inRange(hsv, np.array(green_lo), np.array(green_hi))
    mesh = cv2.inRange(hsv, np.array([40, 88, 48]), np.array([88, 255, 188]))
    mask = cv2.bitwise_and(green, band)
    mask = cv2.bitwise_and(mask, search_mask)
    mask = cv2.bitwise_and(mask, cv2.bitwise_not(mesh))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    raw = _boxes_from_color_mask(mask, w * h, min_area_ratio=min_area_ratio)
    return [
        b for b in raw
        if b[0] >= int(w * min_x_ratio)
        and (b[2] - b[0]) >= int(w * min_width_ratio)
        and (b[2] - b[0]) <= int(w * max_width_ratio)
        and (b[3] - b[1]) >= int(h * min_height_ratio)
        and (b[3] - b[1]) <= int(h * max_height_ratio)
    ]


def _detect_green_excavator(
    hsv: np.ndarray,
    search_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
    *,
    exclude_boxes: list[tuple[int, int, int, int]] | None = None,
) -> tuple[int, int, int, int] | None:
    """Máy xúc xanh — tách khỏi cẩu tháp / lưới xanh; fallback nới lỏng nếu detect chặt thất bại."""
    h, w = hsv.shape[:2]

    def finalize(raw: list[tuple[int, int, int, int]], *, gap_ratio: float) -> tuple[int, int, int, int] | None:
        if not raw:
            return None
        if exclude_boxes:
            filtered = []
            for box in raw:
                if all(_bbox_iou_machinery(box, ex) < 0.25 for ex in exclude_boxes):
                    filtered.append(box)
            raw = filtered or raw
        merged = _merge_machinery_boxes(raw, w, gap_px=max(56, int(w * gap_ratio)))
        merged = [b for b in merged if _machinery_box_valid(b, w, h, "crane_green")]
        if not merged:
            return None
        best = max(merged, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
        x1, y1, x2, y2 = best
        if (y2 - y1) < h * 0.06 or (x2 - x1) < w * 0.06:
            return None
        return _refine_green_excavator_bbox(hsv, best, w, h)

    strict = _green_excavator_candidates(
        hsv, search_mask, frame_width, frame_height,
        band_box=(0.26, 0.36, 0.92, 0.96),
        green_lo=(32, 38, 50), green_hi=(96, 255, 235),
        min_area_ratio=0.0009,
        min_width_ratio=0.0, min_height_ratio=0.05,
        max_width_ratio=0.58, max_height_ratio=0.52,
        min_x_ratio=0.28,
    )
    result = finalize(strict, gap_ratio=0.12)
    if result is not None:
        return result

    # Fallback — nới lỏng dải màu/vị trí, luôn cố tìm 1 box để giám sát biết đã detect
    # (bbox này có confidence thấp hơn, FE sẽ vẽ viền đứt nét "chưa đủ ngưỡng").
    lenient = _green_excavator_candidates(
        hsv, search_mask, frame_width, frame_height,
        band_box=(0.16, 0.18, 0.96, 0.98),
        green_lo=(26, 22, 30), green_hi=(102, 255, 248),
        min_area_ratio=0.00035,
        min_width_ratio=0.05, min_height_ratio=0.035,
        max_width_ratio=0.66, max_height_ratio=0.60,
        min_x_ratio=0.16,
    )
    return finalize(lenient, gap_ratio=0.14)


def _detect_machinery_units(
    frame: np.ndarray,
    search_mask: np.ndarray,
) -> list[_MachineryUnit]:
    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    frame_area = h * w
    units: list[_MachineryUnit] = []

    tower_box = _detect_tower_crane(hsv, search_mask, w, h)
    if tower_box:
        conf = _machinery_confidence(tower_box, frame_area, "tower_crane")
        units.append(
            _MachineryUnit(
                bbox=tower_box,
                confidence=conf,
                kind="tower_crane",
                label=MACHINERY_LABELS["tower_crane"],
                source="color_detect",
            )
        )

    left_box = _detect_sany_drill(hsv, search_mask, w, h)
    if left_box:
        conf = _machinery_confidence(left_box, frame_area, "sany_drill")
        units.append(
            _MachineryUnit(
                bbox=left_box,
                confidence=conf,
                kind="sany_drill",
                label=MACHINERY_LABELS["sany_drill"],
                source="color_detect",
            )
        )

    exclude: list[tuple[int, int, int, int]] = []
    if tower_box:
        exclude.append(_tower_core_exclude_box(tower_box, w))
    green_box = _detect_green_excavator(hsv, search_mask, w, h, exclude_boxes=exclude or None)
    if green_box:
        conf = _machinery_confidence(green_box, frame_area, "crane_green")
        units.append(
            _MachineryUnit(
                bbox=green_box,
                confidence=conf,
                kind="crane_green",
                label=MACHINERY_LABELS["crane_green"],
                source="color_detect",
            )
        )

    if units:
        units.sort(
            key=lambda u: (
                MACHINERY_KIND_PRIORITY.get(u.kind, 0),
                (u.bbox[2] - u.bbox[0]) * (u.bbox[3] - u.bbox[1]),
            ),
            reverse=True,
        )
        deduped: list[_MachineryUnit] = []
        for unit in units:
            replaced = False
            for idx, prev in enumerate(deduped):
                if unit.kind != prev.kind:
                    continue
                if _bbox_iou_machinery(unit.bbox, prev.bbox) < 0.35:
                    continue
                if unit.confidence >= prev.confidence:
                    deduped[idx] = unit
                replaced = True
                break
            if not replaced:
                deduped.append(unit)
        return deduped[:4]

    return []


def _bbox_iou_machinery(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
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


def _merge_machinery_boxes(
    boxes: list[tuple[int, int, int, int]],
    frame_width: int,
    *,
    gap_px: int | None = None,
) -> list[tuple[int, int, int, int]]:
    if len(boxes) <= 1:
        return boxes
    if gap_px is None:
        gap_px = max(16, int(frame_width * 0.03))
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
                ax1, ay1, ax2, ay2 = cur
                bx1, by1, bx2, by2 = merged[j]
                dx = max(bx1 - ax2, ax1 - bx2, 0)
                dy = max(by1 - ay2, ay1 - by2, 0)
                if dx <= gap_px and dy <= gap_px:
                    cur = (
                        min(ax1, bx1), min(ay1, by1),
                        max(ax2, bx2), max(ay2, by2),
                    )
                    used[j] = True
                    changed = True
            next_boxes.append(cur)
            used[i] = True
        merged = next_boxes
    return merged


def _detect_crane_heuristic(
    frame: np.ndarray,
    search_mask: np.ndarray,
    body_zone: dict,
) -> _CraneBody | None:
    units = _detect_machinery_units(frame, search_mask)
    if units:
        top = units[0]
        return _CraneBody(bbox=top.bbox, confidence=top.confidence, source=top.source)
    fallback = _zone_bbox(body_zone["polygon"], frame.shape[1], frame.shape[0])
    return _CraneBody(bbox=fallback, confidence=0.62, source="roi_fallback")


def _bbox_edge_distance_px(
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    dx = max(bx1 - ax2, ax1 - bx2, 0)
    dy = max(by1 - ay2, ay1 - by2, 0)
    return math.hypot(dx, dy)


def _person_anchor(box: tuple[int, int, int, int]) -> tuple[float, float]:
    x1, y1, x2, y2 = box
    return (x1 + x2) / 2.0, float(y2)


def _proximity_confidence(person_conf: float, crane_conf: float, distance_m: float) -> float:
    if distance_m > PROXIMITY_THRESHOLD_METERS:
        return 0.0
    closeness = max(0.0, 1.0 - distance_m / PROXIMITY_THRESHOLD_METERS)
    conf = 0.48 + closeness * 0.34 + person_conf * 0.12 + crane_conf * 0.08
    if distance_m <= 0.65:
        conf += 0.06
    return round(min(0.98, conf), 3)


def analyze_crane_proximity_frame(frame: np.ndarray, camera_id: str) -> dict:
    h, w = frame.shape[:2]
    px_per_m = DEFAULT_PIXELS_PER_METER
    machinery_search = _machinery_search_mask(h, w)

    machinery_units = _detect_machinery_units(frame, machinery_search)

    person_dets = _get_person_detector().predict(frame)
    persons: list[tuple[tuple[int, int, int, int], float]] = []
    for det in person_dets:
        if det.confidence < PERSON_MIN_CONFIDENCE:
            continue
        box = tuple(int(v) for v in det.bbox)
        persons.append((box, det.confidence))

    all_detections: list[CraneProximityDetection] = []
    violations = 0
    min_distance: float | None = None

    for unit in machinery_units:
        all_detections.append(
            CraneProximityDetection(
                behavior="crane",
                label=unit.label,
                scenario_id=SCENARIO_ID,
                confidence=unit.confidence,
                bbox=[float(v) for v in unit.bbox],
                machine_kind=unit.kind,
            )
        )

    for box, p_conf in persons:
        all_detections.append(
            CraneProximityDetection(
                behavior="person",
                label=person_display_label(p_conf),
                scenario_id=SCENARIO_ID,
                confidence=round(p_conf, 3),
                bbox=[float(v) for v in box],
            )
        )

        nearest_unit: _MachineryUnit | None = None
        nearest_dist_m = float("inf")
        for unit in machinery_units:
            dist_px = _bbox_edge_distance_px(box, unit.bbox)
            dist_m = dist_px / px_per_m
            if dist_m < nearest_dist_m:
                nearest_dist_m = dist_m
                nearest_unit = unit

        if nearest_unit is None:
            continue

        if min_distance is None or nearest_dist_m < min_distance:
            min_distance = nearest_dist_m

        if nearest_dist_m > PROXIMITY_THRESHOLD_METERS:
            continue

        conf = _proximity_confidence(p_conf, nearest_unit.confidence, nearest_dist_m)
        if conf < EVENT_MIN_CONFIDENCE:
            continue

        violations += 1
        machine_label = nearest_unit.label
        all_detections.append(
            CraneProximityDetection(
                behavior="crane_proximity",
                label=f"{SCENARIO_LABEL} · {machine_label}",
                scenario_id=SCENARIO_ID,
                confidence=conf,
                bbox=[float(v) for v in box],
                distance_m=round(nearest_dist_m, 2),
                machine_kind=nearest_unit.kind,
            )
        )

    return {
        "type": "result",
        "camera_id": camera_id,
        "width": w,
        "height": h,
        "roi_zones": [],
        "metrics": {
            "person_count": len(persons),
            "min_distance_m": round(min_distance, 2) if min_distance is not None else None,
            "proximity_violations": violations,
            "proximity_threshold_m": PROXIMITY_THRESHOLD_METERS,
        },
        "detections": [d.model_dump() for d in all_detections],
    }
