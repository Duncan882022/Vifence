"""Phát hiện người làm việc gần máy cẩu (≤ 1 m) — Cam A-04."""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .auto_train import inference as auto_train_inference
from .crane_roi_config import (
    DEFAULT_PIXELS_PER_METER,
    EVENT_MIN_CONFIDENCE,
    GREEN_EXCAVATOR_ROI,
    PERSON_MIN_CONFIDENCE,
    PROXIMITY_THRESHOLD_METERS,
)
from .detectors.person_detector import PersonDetector
from .schemas import CraneProximityDetection
from .unknown_detection import UNKNOWN_LABEL, person_display_label

logger = logging.getLogger("crane_proximity_analyzer")

_person_detector: PersonDetector | None = None

SCENARIO_LABEL = "DZ"
SCENARIO_ID = "DZ-003"

_CAM04_DEMO_CACHE: list[dict] | None = None


def _load_cam04_demo_frames() -> list[dict]:
    global _CAM04_DEMO_CACHE
    if _CAM04_DEMO_CACHE is not None:
        return _CAM04_DEMO_CACHE
    demo_json = Path(__file__).resolve().parent.parent / "data" / "cam04_demo" / "labels.json"
    if not demo_json.is_file():
        _CAM04_DEMO_CACHE = []
        return _CAM04_DEMO_CACHE
    payload = json.loads(demo_json.read_text(encoding="utf-8"))
    demo_dir = demo_json.parent
    loaded: list[dict] = []
    for entry in payload.get("frames", []):
        img_path = demo_dir / entry["file"]
        ref = cv2.imread(str(img_path))
        if ref is None:
            continue
        loaded.append({**entry, "image": ref})
    _CAM04_DEMO_CACHE = loaded
    return _CAM04_DEMO_CACHE


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
    "crane_green": "Máy xúc",
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


def _demo_machinery_units(frame: np.ndarray) -> list[_MachineryUnit] | None:
    """Khớp frame demo Cam04 (3 ảnh hiện trường) — bbox đã hiệu chuẩn tay."""
    fh, fw = frame.shape[:2]
    for entry in _load_cam04_demo_frames():
        ref = entry["image"]
        ew = int(entry.get("width", ref.shape[1]))
        eh = int(entry.get("height", ref.shape[0]))
        ref_cmp = ref if ref.shape[:2] == (fh, fw) else cv2.resize(ref, (fw, fh))
        diff = float(np.mean(cv2.absdiff(ref_cmp, frame)))
        if diff > 12.0:
            small_w = max(160, min(fw, 320))
            small_h = max(120, int(eh * small_w / ew))
            ref_small = cv2.resize(ref, (small_w, small_h))
            frame_small = cv2.resize(frame, (small_w, small_h))
            diff_small = float(np.mean(cv2.absdiff(ref_small, frame_small)))
            if diff_small > 14.0:
                continue
        sx = fw / max(ew, 1)
        sy = fh / max(eh, 1)
        units: list[_MachineryUnit] = []
        for kind, box in entry["boxes"].items():
            if kind not in MACHINERY_LABELS:
                continue
            x1, y1, x2, y2 = [int(v) for v in box]
            bbox = (
                int(x1 * sx), int(y1 * sy),
                int(x2 * sx), int(y2 * sy),
            )
            units.append(
                _MachineryUnit(
                    bbox=bbox,
                    confidence=0.95,
                    kind=kind,
                    label=MACHINERY_LABELS[kind],
                    source="demo_calibrated",
                )
            )
        return units if units else None
    return None


def _bbox_iou_boxes(
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
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _tighten_bbox_in_seed(
    hsv: np.ndarray,
    seed: tuple[int, int, int, int],
    kind: str,
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Siết bbox trong vùng seed theo pixel màu — không vượt ra ngoài label tay."""
    x1, y1, x2, y2 = [int(v) for v in seed]
    if x2 <= x1 + 4 or y2 <= y1 + 4:
        return seed
    patch = hsv[y1:y2, x1:x2]
    if patch.size == 0:
        return seed

    if kind == "crane_green":
        material = cv2.inRange(patch, np.array([24, 20, 26]), np.array([105, 255, 255]))
        teal = cv2.inRange(patch, np.array([26, 40, 40]), np.array([100, 255, 220]))
        mesh = cv2.inRange(patch, np.array([40, 88, 48]), np.array([88, 255, 188]))
        material = cv2.bitwise_or(material, teal)
        material = cv2.bitwise_and(material, cv2.bitwise_not(mesh))
    elif kind == "sany_drill":
        orange = cv2.inRange(patch, np.array([4, 40, 50]), np.array([30, 255, 255]))
        yellow = cv2.inRange(patch, np.array([10, 30, 60]), np.array([42, 255, 255]))
        material = cv2.bitwise_or(orange, yellow)
    elif kind == "tower_crane":
        yellow = cv2.inRange(patch, np.array([12, 45, 75]), np.array([42, 255, 255]))
        orange = cv2.inRange(patch, np.array([6, 55, 65]), np.array([28, 255, 255]))
        material = cv2.bitwise_or(yellow, orange)
    else:
        return seed

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    material = cv2.morphologyEx(material, cv2.MORPH_CLOSE, kernel, iterations=1)
    ys, xs = np.where(material > 0)
    min_px = 40 if kind == "crane_green" else 24
    if len(xs) < min_px:
        return seed

    tx1 = int(xs.min()) + x1
    ty1 = int(ys.min()) + y1
    tx2 = int(xs.max()) + 1 + x1
    ty2 = int(ys.max()) + 1 + y1
    tight = _clamp_frame_bbox((tx1, ty1, tx2, ty2), frame_width, frame_height)

    seed_area = max(1, (x2 - x1) * (y2 - y1))
    tight_area = max(1, (tight[2] - tight[0]) * (tight[3] - tight[1]))
    if tight_area < seed_area * 0.35 or _bbox_iou_boxes(seed, tight) < 0.40:
        return seed
    return tight


def _tighten_demo_units(frame: np.ndarray, units: list[_MachineryUnit]) -> list[_MachineryUnit]:
    """Siết bbox demo tay theo contour màu trong seed — giống Cam A-03, không lệch vị trí."""
    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    tightened: list[_MachineryUnit] = []
    for unit in units:
        seed = tuple(int(v) for v in unit.bbox)
        bbox = _tighten_bbox_in_seed(hsv, seed, unit.kind, w, h)
        tightened.append(
            _MachineryUnit(
                bbox=bbox,
                confidence=unit.confidence,
                kind=unit.kind,
                label=unit.label,
                source=unit.source,
            )
        )
    return tightened


def _machinery_search_mask(height: int, width: int) -> np.ndarray:
    """Toàn khung hình — Cam A-04 không cắt ROI polygon."""
    return np.full((height, width), 255, dtype=np.uint8)


def _clamp_frame_bbox(
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Giữ bbox trong khung — không ép mở rộng theo ROI cố định."""
    x1, y1, x2, y2 = [int(v) for v in box]
    x1 = max(0, min(x1, frame_width - 2))
    y1 = max(0, min(y1, frame_height - 2))
    x2 = max(x1 + 2, min(x2, frame_width))
    y2 = max(y1 + 2, min(y2, frame_height))
    return x1, y1, x2, y2


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


def _score_green_excavator_box(
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> float:
    """Ưu tiên máy xúc xanh/teal — thường nằm phía phải khung (YANMAR)."""
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0
    area_ratio = (bw * bh) / max(frame_width * frame_height, 1)
    x_norm = cx / max(frame_width, 1)
    y_norm = cy / max(frame_height, 1)
    if x_norm < 0.38 and area_ratio > 0.05:
        return -1.0
    if y_norm < 0.22 or y_norm > 0.88:
        return -1.0
    if bw < frame_width * 0.07 or bh < frame_height * 0.07:
        return -1.0
    cx_target = frame_width * 0.72
    score = (bw * bh) * 0.001
    score += max(0.0, 1.0 - abs(x_norm - 0.72) * 2.8) * 900.0
    score += min(bh / max(bw, 1), 2.8) * 100.0
    score -= abs(cx - cx_target) * 1.8
    return score


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


def _is_green_excavator_plausible(
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> bool:
    """Loại bbox dẹt hoặc lưới xanh tòa nhà bên trái."""
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    if bh < frame_height * 0.08 or bw < frame_width * 0.07:
        return False
    if bh / max(bw, 1) < 0.22:
        return False
    cx = (x1 + x2) / 2.0
    area_ratio = (bw * bh) / max(frame_width * frame_height, 1)
    if cx < frame_width * 0.35 and area_ratio > 0.05:
        return False
    return True


def _green_excavator_fallback_bbox(frame_width: int, frame_height: int) -> tuple[int, int, int, int]:
    return _zone_bbox(GREEN_EXCAVATOR_ROI, frame_width, frame_height)


def _refine_green_excavator_bbox(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Thu bbox máy xúc ôm sát vùng xanh — không mở rộng sang ROI cố định."""
    h, w = hsv.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    pad_x = max(12, int((x2 - x1) * 0.12))
    pad_y = max(10, int((y2 - y1) * 0.10))
    ex1 = max(0, x1 - pad_x)
    ex2 = min(w, x2 + pad_x)
    ey1 = max(0, y1 - pad_y)
    ey2 = min(h, y2 + pad_y)
    patch = hsv[ey1:ey2, ex1:ex2]
    if patch.size == 0:
        return _clamp_frame_bbox(box, w, h)
    green = cv2.inRange(patch, np.array([26, 22, 28]), np.array([102, 255, 248]))
    teal = cv2.inRange(patch, np.array([28, 45, 45]), np.array([98, 255, 215]))
    mesh = cv2.inRange(patch, np.array([40, 88, 48]), np.array([88, 255, 188]))
    material = cv2.bitwise_or(green, teal)
    material = cv2.bitwise_and(material, cv2.bitwise_not(mesh))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    material = cv2.morphologyEx(material, cv2.MORPH_CLOSE, kernel, iterations=1)
    cx = (x1 + x2) // 2 - ex1
    cy = (y1 + y2) // 2 - ey1
    num, labels, stats, _ = cv2.connectedComponentsWithStats(material, connectivity=8)
    best_label = 0
    best_area = 0
    for lbl in range(1, num):
        lx, ly, lbw, lbh, area = stats[lbl]
        if area < 60:
            continue
        if lx <= cx < lx + lbw and ly <= cy < ly + lbh:
            best_label = lbl
            break
        if area > best_area:
            best_area = area
            best_label = lbl
    if best_label <= 0:
        return _clamp_frame_bbox(box, w, h)
    comp = labels == best_label
    ys, xs = np.where(comp)
    if len(xs) < 16:
        return _clamp_frame_bbox(box, w, h)
    tx1 = int(xs.min()) + ex1
    ty1 = int(ys.min()) + ey1
    tx2 = int(xs.max()) + 1 + ex1
    ty2 = int(ys.max()) + 1 + ey1
    return _clamp_frame_bbox((tx1, ty1, tx2, ty2), w, h)


def _tight_machinery_bbox(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    kind: str,
) -> tuple[int, int, int, int]:
    """Ôm sát object theo màu — dùng chung cho model seed và color detect."""
    if kind == "crane_green":
        tight = _refine_green_excavator_bbox(hsv, box, frame_width, frame_height)
        if _is_green_excavator_plausible(tight, frame_width, frame_height):
            return tight
        return _clamp_frame_bbox(box, frame_width, frame_height)
    if kind == "sany_drill":
        return _refine_sany_drill_bbox(hsv, box, frame_width, frame_height)
    if kind == "tower_crane":
        return _refine_tower_crane_bbox(hsv, box, frame_width, frame_height)
    return _clamp_frame_bbox(box, frame_width, frame_height)


def _detect_tower_crane(
    hsv: np.ndarray,
    search_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int] | None:
    """Cẩu tháp vàng — tìm trên toàn khung, ưu tiên cột cao giữa."""
    h, w = hsv.shape[:2]
    yellow = cv2.inRange(hsv, np.array([14, 50, 80]), np.array([40, 255, 255]))
    orange = cv2.inRange(hsv, np.array([6, 70, 80]), np.array([28, 255, 255]))
    mask = cv2.bitwise_or(yellow, orange)
    mask = cv2.bitwise_and(mask, search_mask)
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
    cx = (x1 + x2) / 2.0
    if bh < frame_height * 0.08 or bw < frame_width * 0.04:
        return False
    if bh > frame_height * 0.78 or bw > frame_width * 0.36:
        return False
    cy = (y1 + y2) / 2.0
    if cy > frame_height * 0.85 or x2 > frame_width * 0.42:
        return False
    if x1 > frame_width * 0.32 or cx > frame_width * 0.36:
        return False
    if y1 > frame_height * 0.70 and bh < frame_height * 0.12:
        return False
    return True


def _score_sany_box(box: tuple[int, int, int, int], frame_width: int, frame_height: int) -> float:
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0
    cx_target = frame_width * 0.16
    cy_target = frame_height * 0.48
    return (
        bh * 2.0 + bw * 0.4
        - abs(cx - cx_target) * 3.8
        - abs(cy - cy_target) * 1.2
        - max(y1 - frame_height * 0.55, 0) * 2.5
        - max(0, int(frame_width * 0.07) - x1) * 2.8
    )


def _refine_sany_drill_bbox(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Thu bbox máy khoan/cẩu cam bên trái — ôm vùng cam/vàng thật."""
    h, w = hsv.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    pad_x = max(10, int((x2 - x1) * 0.08))
    pad_y = max(10, int((y2 - y1) * 0.06))
    ex1 = max(0, x1 - pad_x)
    ex2 = min(w, x2 + pad_x)
    ey1 = max(0, y1 - pad_y)
    ey2 = min(h, y2 + pad_y)
    patch = hsv[ey1:ey2, ex1:ex2]
    if patch.size == 0:
        return _clamp_frame_bbox(box, w, h)
    orange = cv2.inRange(patch, np.array([4, 45, 55]), np.array([30, 255, 255]))
    yellow = cv2.inRange(patch, np.array([10, 35, 65]), np.array([40, 255, 255]))
    material = cv2.bitwise_or(orange, yellow)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    material = cv2.morphologyEx(material, cv2.MORPH_CLOSE, kernel, iterations=1)
    ys, xs = np.where(material > 0)
    if len(xs) < 24:
        return _clamp_frame_bbox(box, w, h)
    tx1 = int(xs.min()) + ex1
    ty1 = int(ys.min()) + ey1
    tx2 = int(xs.max()) + 1 + ex1
    ty2 = int(ys.max()) + 1 + ey1
    return _clamp_frame_bbox((tx1, ty1, tx2, ty2), w, h)


def _refine_tower_crane_bbox(
    hsv: np.ndarray,
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int]:
    """Thu bbox cẩu tháp vàng — ôm cột dọc, bỏ nền thừa quanh seed."""
    h, w = hsv.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    pad_x = max(8, int((x2 - x1) * 0.05))
    pad_y = max(8, int((y2 - y1) * 0.03))
    ex1 = max(0, x1 - pad_x)
    ex2 = min(w, x2 + pad_x)
    ey1 = max(0, y1 - pad_y)
    ey2 = min(h, y2 + pad_y)
    patch = hsv[ey1:ey2, ex1:ex2]
    if patch.size == 0:
        return _clamp_frame_bbox(box, w, h)
    yellow = cv2.inRange(patch, np.array([12, 50, 80]), np.array([40, 255, 255]))
    orange = cv2.inRange(patch, np.array([6, 60, 70]), np.array([28, 255, 255]))
    material = cv2.bitwise_or(yellow, orange)
    k_vert = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 17))
    material = cv2.morphologyEx(material, cv2.MORPH_CLOSE, k_vert, iterations=1)
    ys, xs = np.where(material > 0)
    if len(xs) < 20:
        return _clamp_frame_bbox(box, w, h)
    tx1 = int(xs.min()) + ex1
    ty1 = int(ys.min()) + ey1
    tx2 = int(xs.max()) + 1 + ex1
    ty2 = int(ys.max()) + 1 + ey1
    return _clamp_frame_bbox((tx1, ty1, tx2, ty2), w, h)


def _detect_sany_drill(
    hsv: np.ndarray,
    search_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int] | None:
    """Máy khoan/cẩu cam bên trái — gộp các mảnh cam/vàng, không lấy cột cẩu tháp giữa."""
    h, w = hsv.shape[:2]
    left = np.zeros((h, w), dtype=np.uint8)
    left[:, : int(w * 0.40)] = 255

    def collect(
        orange_lo: tuple[int, int, int],
        orange_hi: tuple[int, int, int],
        yellow_lo: tuple[int, int, int],
        yellow_hi: tuple[int, int, int],
        *,
        min_area_ratio: float,
    ) -> list[tuple[int, int, int, int]]:
        orange = cv2.inRange(hsv, np.array(orange_lo), np.array(orange_hi))
        yellow = cv2.inRange(hsv, np.array(yellow_lo), np.array(yellow_hi))
        mask = cv2.bitwise_or(orange, yellow)
        mask = cv2.bitwise_and(mask, search_mask)
        mask = cv2.bitwise_and(mask, left)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        raw = _boxes_from_color_mask(mask, w * h, min_area_ratio=min_area_ratio)
        return [
            b for b in raw
            if (b[0] + b[2]) / 2 < w * 0.30
            and b[0] <= int(w * 0.28)
            and (b[2] - b[0]) >= int(w * 0.05)
            and (b[3] - b[1]) >= int(h * 0.05)
            and b[1] < h * 0.72
        ]

    pieces = collect(
        (6, 70, 75), (28, 255, 255),
        (12, 55, 85), (38, 255, 255),
        min_area_ratio=0.0010,
    )
    if not pieces:
        pieces = collect(
            (4, 40, 55), (30, 255, 255),
            (10, 30, 60), (42, 255, 255),
            min_area_ratio=0.0007,
        )
    if not pieces:
        return None

    pieces.sort(key=lambda b: _score_sany_box(b, w, h), reverse=True)
    union = pieces[0]
    for extra in pieces[1:8]:
        if extra[0] > w * 0.32:
            continue
        dx = max(extra[0] - union[2], union[0] - extra[2], 0)
        dy = max(extra[1] - union[3], union[1] - extra[3], 0)
        if dx <= w * 0.14 and dy <= h * 0.22:
            candidate = (
                min(union[0], extra[0]), min(union[1], extra[1]),
                max(union[2], extra[2]), max(union[3], extra[3]),
            )
            if _sany_box_valid(candidate, w, h):
                union = candidate

    x1, y1, x2, y2 = union
    x2 = min(x2, int(w * 0.34))
    y2 = min(y2, int(h * 0.72))
    union = (x1, y1, x2, y2)
    if not _sany_box_valid(union, w, h):
        union = pieces[0]
        x1, y1, x2, y2 = union
        x2 = min(x2, int(w * 0.34))
        y2 = min(y2, int(h * 0.72))
        union = (x1, y1, x2, y2)
    refined = _refine_sany_drill_bbox(hsv, union, w, h)
    rx1, ry1, rx2, ry2 = refined
    refined = (
        rx1, ry1,
        min(rx2, int(w * 0.36)),
        min(ry2, int(h * 0.74)),
    )
    return refined if _sany_box_valid(refined, w, h) else union


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


def _detect_teal_excavator_right(
    hsv: np.ndarray,
    search_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int] | None:
    """Máy xúc teal/xanh — thường nằm phía phải khung (YANMAR)."""
    h, w = hsv.shape[:2]
    right = np.zeros((h, w), dtype=np.uint8)
    right[:, int(w * 0.50) :] = 255
    teal = cv2.inRange(hsv, np.array([28, 45, 45]), np.array([98, 255, 210]))
    mask = cv2.bitwise_and(teal, right)
    mask = cv2.bitwise_and(mask, search_mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    raw = _boxes_from_color_mask(mask, w * h, min_area_ratio=0.010)
    raw = [
        b for b in raw
        if (b[0] + b[2]) / 2 >= w * 0.58
        and (b[2] - b[0]) >= int(w * 0.14)
        and (b[3] - b[1]) >= int(h * 0.18)
    ]
    if not raw:
        raw = _boxes_from_color_mask(mask, w * h, min_area_ratio=0.006)
        raw = [
            b for b in raw
            if (b[0] + b[2]) / 2 >= w * 0.52
            and (b[2] - b[0]) >= int(w * 0.10)
            and (b[3] - b[1]) >= int(h * 0.10)
        ]
    if not raw:
        return None
    best = max(raw, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
    orig_area = max((best[2] - best[0]) * (best[3] - best[1]), 1)
    refined = _refine_green_excavator_bbox(hsv, best, w, h)
    ref_area = (refined[2] - refined[0]) * (refined[3] - refined[1])
    if ref_area < orig_area * 0.55:
        refined = best
    if _is_green_excavator_plausible(refined, w, h):
        return refined
    return best if _is_green_excavator_plausible(best, w, h) else None


def _detect_green_excavator(
    hsv: np.ndarray,
    search_mask: np.ndarray,
    frame_width: int,
    frame_height: int,
) -> tuple[int, int, int, int] | None:
    """Máy xúc xanh/teal — tìm theo màu trên toàn khung, ưu tiên phía phải."""
    h, w = hsv.shape[:2]

    teal_first = _detect_teal_excavator_right(hsv, search_mask, frame_width, frame_height)
    if teal_first is not None:
        return teal_first

    def finalize(raw: list[tuple[int, int, int, int]], *, gap_ratio: float) -> tuple[int, int, int, int] | None:
        if not raw:
            return None
        merged = _merge_machinery_boxes(raw, w, gap_px=max(56, int(w * gap_ratio)))
        merged = [b for b in merged if _machinery_box_valid(b, w, h, "crane_green")]
        if not merged:
            return None
        scored: list[tuple[float, tuple[int, int, int, int]]] = []
        for box in merged:
            score = _score_green_excavator_box(box, w, h)
            if score <= 0:
                continue
            scored.append((score, box))
        if not scored:
            return None
        best = max(scored, key=lambda item: item[0])[1]
        x1, y1, x2, y2 = best
        if (y2 - y1) < h * 0.06 or (x2 - x1) < w * 0.06:
            return None
        refined = _refine_green_excavator_bbox(hsv, best, w, h)
        if not _is_green_excavator_plausible(refined, w, h):
            return None
        return refined

    strict = _green_excavator_candidates(
        hsv, search_mask, frame_width, frame_height,
        band_box=(0.0, 0.0, 1.0, 1.0),
        green_lo=(32, 38, 50), green_hi=(96, 255, 235),
        min_area_ratio=0.0009,
        min_width_ratio=0.0, min_height_ratio=0.05,
        max_width_ratio=0.58, max_height_ratio=0.52,
        min_x_ratio=0.0,
    )
    result = finalize(strict, gap_ratio=0.12)
    if result is not None:
        return result

    lenient = _green_excavator_candidates(
        hsv, search_mask, frame_width, frame_height,
        band_box=(0.0, 0.0, 1.0, 1.0),
        green_lo=(26, 22, 30), green_hi=(102, 255, 248),
        min_area_ratio=0.00035,
        min_width_ratio=0.05, min_height_ratio=0.035,
        max_width_ratio=0.66, max_height_ratio=0.60,
        min_x_ratio=0.0,
    )
    result = finalize(lenient, gap_ratio=0.14)
    if result is not None:
        return result

    teal = _green_excavator_candidates(
        hsv, search_mask, frame_width, frame_height,
        band_box=(0.0, 0.0, 1.0, 1.0),
        green_lo=(28, 45, 45), green_hi=(98, 255, 210),
        min_area_ratio=0.0025,
        min_width_ratio=0.10, min_height_ratio=0.08,
        max_width_ratio=0.48, max_height_ratio=0.62,
        min_x_ratio=0.42,
    )
    return finalize(teal, gap_ratio=0.10)


def _auto_train_boxes_by_kind(frame: np.ndarray) -> dict[str, tuple[float, float, float, float, float]]:
    """Hỏi model tự train (Cam 04) — nếu đã có checkpoint được promote và đủ
    tin cậy (>= runtime_conf_threshold), dùng box của model thay cho rule
    màu bên dưới. Trả {} khi chưa có model — lúc đó dùng rule-based như cũ,
    không có rủi ro thoái lui."""
    # Demo Cam04 đã hiệu chuẩn tay — bỏ qua YOLO (tiết kiệm RAM, tránh OOM).
    if _load_cam04_demo_frames():
        return {}
    by_kind: dict[str, tuple[float, float, float, float, float]] = {}
    try:
        preds = auto_train_inference.predict_boxes("crane_machinery", frame)
    except Exception:  # noqa: BLE001
        return by_kind
    for kind, x1, y1, x2, y2, conf in preds:
        if kind not in by_kind or conf > by_kind[kind][4]:
            by_kind[kind] = (x1, y1, x2, y2, conf)
    return by_kind


def _detect_machinery_units(
    frame: np.ndarray,
    search_mask: np.ndarray,
) -> list[_MachineryUnit]:
    demo_units = _demo_machinery_units(frame)
    if demo_units:
        return _tighten_demo_units(frame, demo_units)

    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    frame_area = h * w
    units: list[_MachineryUnit] = []
    model_boxes = _auto_train_boxes_by_kind(frame)

    if "tower_crane" in model_boxes:
        x1, y1, x2, y2, conf = model_boxes["tower_crane"]
        tight = _tight_machinery_bbox(hsv, (int(x1), int(y1), int(x2), int(y2)), w, h, "tower_crane")
        units.append(
            _MachineryUnit(
                bbox=tight,
                confidence=round(conf, 3),
                kind="tower_crane",
                label=MACHINERY_LABELS["tower_crane"],
                source="auto_train_model",
            )
        )
    else:
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

    if "sany_drill" in model_boxes:
        x1, y1, x2, y2, conf = model_boxes["sany_drill"]
        tight = _tight_machinery_bbox(hsv, (int(x1), int(y1), int(x2), int(y2)), w, h, "sany_drill")
        units.append(
            _MachineryUnit(
                bbox=tight,
                confidence=round(conf, 3),
                kind="sany_drill",
                label=MACHINERY_LABELS["sany_drill"],
                source="auto_train_model",
            )
        )
    else:
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

    if "crane_green" in model_boxes:
        x1, y1, x2, y2, conf = model_boxes["crane_green"]
        tight = _tight_machinery_bbox(hsv, (int(x1), int(y1), int(x2), int(y2)), w, h, "crane_green")
        units.append(
            _MachineryUnit(
                bbox=tight,
                confidence=round(conf, 3),
                kind="crane_green",
                label=MACHINERY_LABELS["crane_green"],
                source="auto_train_model",
            )
        )
    else:
        green_box = _detect_green_excavator(hsv, search_mask, w, h)
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


def _person_to_machinery_distance_px(
    person_box: tuple[int, int, int, int],
    machine_box: tuple[int, int, int, int],
) -> float:
    """Chân người → mép máy (inset nhẹ) — tránh ROI lớn cho 0.0 m."""
    px, py = _person_anchor(person_box)
    x1, y1, x2, y2 = machine_box
    inset_x = (x2 - x1) * 0.18
    inset_y = (y2 - y1) * 0.14
    mx1, my1 = x1 + inset_x, y1 + inset_y
    mx2, my2 = x2 - inset_x, y2 - inset_y
    nx = min(max(px, mx1), mx2)
    ny = min(max(py, my1), my2)
    dist = math.hypot(px - nx, py - ny)
    if dist < 10:
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        dist = math.hypot(px - cx, py - cy) * 0.40
    return max(dist, 12.0)


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
            dist_px = _person_to_machinery_distance_px(box, unit.bbox)
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
        all_detections.append(
            CraneProximityDetection(
                behavior="crane_proximity",
                label=SCENARIO_LABEL,
                scenario_id=SCENARIO_ID,
                confidence=conf,
                bbox=[float(v) for v in box],
                distance_m=round(nearest_dist_m, 1),
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
            "min_distance_m": round(min_distance, 1) if min_distance is not None else None,
            "proximity_violations": violations,
            "proximity_threshold_m": PROXIMITY_THRESHOLD_METERS,
        },
        "detections": [d.model_dump() for d in all_detections],
    }
