"""Phát hiện PPE — mũ, áo phản quang, giày (3 model YOLO + heuristic fallback)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import cv2
import numpy as np

from .auto_train.inference import predict_boxes
from .detectors.person_detector import PersonDetector
from .schemas import PpeDetection
from .violation_thresholds import VIOLATION_MIN_CONFIDENCE

logger = logging.getLogger("ppe_analyzer")

PPE_SCENARIO = {
    "hard_hat": "PPE-001",
    "no_helmet": "PPE-001",
    "safety_vest": "PPE-002",
    "no_vest": "PPE-002",
    "safety_shoes": "PPE-003",
    "no_shoes": "PPE-003",
    "person": "PPE-001",
}

PPE_LABELS = {
    "hard_hat": "Mũ BHLD",
    "no_helmet": "Không mũ BHLD",
    "safety_vest": "Áo phản quang",
    "no_vest": "Không áo phản quang",
    "safety_shoes": "Giày BHLD",
    "no_shoes": "Không giày BHLD",
    "person": "CN",
}

_PERSON_CONF = 0.40
_VIOLATION_CONF = VIOLATION_MIN_CONFIDENCE
_ITEM_IOU = 0.12
_HELMET_MODEL_MIN_CONF = 0.55
_SHOE_MODEL_MIN_CONF = 0.52
_MODEL_MIN_CONF = 0.62

_person_detector: PersonDetector | None = None


def _get_person_detector() -> PersonDetector:
    global _person_detector
    if _person_detector is None:
        _person_detector = PersonDetector(conf_threshold=_PERSON_CONF)
        _person_detector.load()
    return _person_detector


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _sub_region(box: tuple[float, float, float, float], y0: float, y1: float) -> tuple[float, float, float, float]:
    x1, py1, x2, py2 = box
    ph = py2 - py1
    return x1, py1 + ph * y0, x2, py1 + ph * y1


def _head_region_for_helmet(person_box: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """Vùng đỉnh đầu — mở rộng lên trên bbox người (YOLO hay cắt sát vai)."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    return x1, max(0.0, y1 - ph * 0.14), x2, y1 + ph * 0.24


def _feet_region(
    person_box: tuple[float, float, float, float],
    frame_h: int,
) -> tuple[float, float, float, float]:
    """Vùng mắt cá — hẹp hơn, tránh gom quá nhiều nền bùn công trường."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    fy1 = y1 + ph * 0.80
    fy2 = min(float(frame_h), y2 + ph * 0.04)
    return x1, fy1, x2, fy2


def _foot_environment_ratios(crop: np.ndarray) -> dict[str, float]:
    """Tách nền đất/bùn/vũng khỏi da chân — tránh false-positive no_shoes trên nền công trường."""
    if crop.size == 0:
        return {"mud_ratio": 0.0, "pants_ratio": 0.0, "puddle_ratio": 0.0}
    h, w = crop.shape[:2]
    area = max(h * w, 1)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mud = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([8, 25, 25]), np.array([28, 170, 130])),
        cv2.inRange(hsv, np.array([0, 0, 35]), np.array([180, 55, 110])),
    )
    pants = cv2.inRange(hsv, np.array([95, 35, 25]), np.array([130, 255, 180]))
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    puddle = cv2.bitwise_and(
        (gray < 88).astype(np.uint8) * 255,
        cv2.inRange(hsv, np.array([0, 0, 20]), np.array([180, 80, 120])),
    )
    return {
        "mud_ratio": float(cv2.countNonZero(mud)) / area,
        "pants_ratio": float(cv2.countNonZero(pants)) / area,
        "puddle_ratio": float(cv2.countNonZero(puddle)) / area,
    }


def _foot_skin_mask(hsv: np.ndarray) -> np.ndarray:
    """Da chân — loại bùn nâu/xám công trường (hay gây FP no_shoes)."""
    skin = cv2.inRange(hsv, np.array([0, 38, 88]), np.array([18, 145, 245]))
    mud = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([8, 20, 25]), np.array([28, 150, 120])),
        cv2.inRange(hsv, np.array([0, 0, 35]), np.array([180, 70, 125])),
    )
    return cv2.bitwise_and(skin, cv2.bitwise_not(mud))


def _upper_foot_skin_ratio(crop: np.ndarray) -> float:
    """Tỷ lệ da ở nửa trên vùng chân — tách khỏi bùn phía dưới crop."""
    if crop.size == 0:
        return 0.0
    h, w = crop.shape[:2]
    upper = crop[: max(int(h * 0.58), 1)]
    if upper.size == 0:
        return 0.0
    hsv = cv2.cvtColor(upper, cv2.COLOR_BGR2HSV)
    skin = _foot_skin_mask(hsv)
    return float(cv2.countNonZero(skin)) / max(upper.shape[0] * upper.shape[1], 1)


def _feet_view_obstructed(env: dict[str, float]) -> bool:
    """Không đủ căn cứ — nền bùn/vũng che chân (Cam A-04 hay FP no_shoes)."""
    mud = env.get("foot_mud_ratio", env["mud_ratio"])
    if mud > 0.28:
        return True
    if env.get("mud_ratio", 0.0) > 0.36:
        return True
    return env.get("foot_puddle_ratio", env["puddle_ratio"]) > 0.30


def _region_crop(frame: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return frame[0:0, 0:0]
    return frame[y1:y2, x1:x2]


def _looks_like_white_helmet_dome(crop: np.ndarray) -> tuple[int, int, int, int] | None:
    """Mũ trắng phủ gần hết head crop — contour full-frame bị anti-glare rule chặn."""
    crop_h, crop_w = crop.shape[:2]
    if crop_h < 12 or crop_w < 10:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    upper_rows = max(int(crop_h * 0.38), 1)
    mid_rows = max(int(crop_h * 0.62), upper_rows + 1)
    v_top = float(np.mean(hsv[:upper_rows, :, 2]))
    v_mid = float(np.mean(hsv[upper_rows:mid_rows, :, 2]))
    v_bot = float(np.mean(hsv[mid_rows:, :, 2])) if mid_rows < crop_h else v_mid
    mean_s = float(np.mean(hsv[:, :, 1]))
    if v_top < 168 or mean_s > 88:
        return None
    skin = cv2.inRange(hsv, np.array([0, 20, 40]), np.array([25, 180, 220]))
    skin_ratio = cv2.countNonZero(skin) / max(crop_h * crop_w, 1)
    if skin_ratio > 0.10:
        return None
    dome = v_top >= v_mid + 8 or (v_top >= 185 and v_bot <= v_top - 18 and v_top >= v_mid + 3)
    if not dome:
        return None
    cap_rows = crop[: max(int(crop_h * 0.52), 1)]
    cap_hsv = cv2.cvtColor(cap_rows, cv2.COLOR_BGR2HSV)
    bright = cv2.inRange(cap_hsv, np.array([0, 0, 155]), np.array([180, 75, 255]))
    bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), 1)
    ys, xs = np.where(bright > 0)
    if len(xs) < 12:
        return None
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    if x1 - x0 < 8 or y1 - y0 < 6:
        return None
    return x0, y0, x1 + 1, y1 + 1


def _helmet_cap_plausible(x: int, y: int, bw: int, bh: int, crop_w: int, crop_h: int) -> bool:
    """Mũ nằm trên đỉnh đầu — loại dải sáng nền trời/lưới ở mép khung."""
    if bw < 8 or bh < 6:
        return False
    if x <= 1 and bw >= crop_w * 0.78:
        return False
    if x + bw >= crop_w - 1 and bw >= crop_w * 0.78:
        return False
    if y > crop_h * 0.55:
        return False
    cx = x + bw / 2
    if cx < crop_w * 0.14 or cx > crop_w * 0.86:
        return False
    aspect = bw / max(bh, 1)
    if not 0.45 <= aspect <= 4.5:
        return False
    return True


def _helmet_patch_looks_real(
    crop: np.ndarray,
    x: int,
    y: int,
    bw: int,
    bh: int,
    contour_area: float,
    crop_w: int,
) -> bool:
    patch = crop[y : y + bh, x : x + bw]
    if patch.size == 0:
        return False
    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
    mean_s = float(np.mean(hsv[:, :, 1]))
    mean_v = float(np.mean(hsv[:, :, 2]))
    fill = contour_area / max(bw * bh, 1)
    if mean_s < 38 and mean_v < 150:
        return False
    if mean_s < 42 and mean_v < 145 and bw >= crop_w * 0.40:
        return False
    if fill < 0.22 and mean_s < 35:
        return False
    return True


def _heuristic_helmet(frame: np.ndarray, head: tuple[float, float, float, float]) -> tuple[float, float, float, float] | None:
    crop = _region_crop(frame, head)
    if crop.size == 0:
        return None
    crop_h, crop_w = crop.shape[:2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([0, 0, 150]), np.array([180, 65, 255])),
        cv2.inRange(hsv, np.array([15, 60, 100]), np.array([40, 255, 255])),
    )
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), 1)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best: tuple[float, tuple[int, int, int, int]] | None = None
    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if area < 40:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        plausible = _helmet_cap_plausible(x, y, bw, bh, crop_w, crop_h)
        full_dome = (
            not plausible
            and x <= 2
            and y <= 6
            and bw >= crop_w * 0.62
            and _looks_like_white_helmet_dome(crop) is not None
        )
        if not plausible and not full_dome:
            continue
        if not full_dome and not _helmet_patch_looks_real(crop, x, y, bw, bh, area, crop_w):
            continue
        score = area + (24.0 if y <= crop_h * 0.22 else 0.0)
        if best is None or score > best[0]:
            best = (score, (x, y, bw, bh))
    if best is not None:
        x, y, bw, bh = best[1]
        hx1, hy1, _, _ = head
        return hx1 + x, hy1 + y, hx1 + x + bw, hy1 + y + bh

    dome_box = _looks_like_white_helmet_dome(crop)
    if dome_box is not None:
        x0, y0, x1, y1 = dome_box
        hx1, hy1, _, _ = head
        return hx1 + x0, hy1 + y0, hx1 + x1, hy1 + y1

    upper = crop[: max(int(crop_h * 0.62), 1)]
    if upper.size == 0:
        return None
    upper_hsv = cv2.cvtColor(upper, cv2.COLOR_BGR2HSV)
    cap = cv2.inRange(upper_hsv, np.array([0, 0, 155]), np.array([180, 60, 255]))
    cap = cv2.morphologyEx(cap, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), 1)
    cap_cnts, _ = cv2.findContours(cap, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in sorted(cap_cnts, key=cv2.contourArea, reverse=True):
        area = cv2.contourArea(cnt)
        if area < 36:
            break
        x, y, bw, bh = cv2.boundingRect(cnt)
        if not _helmet_cap_plausible(x, y, bw, bh, upper.shape[1], upper.shape[0]):
            continue
        if not _helmet_patch_looks_real(upper, x, y, bw, bh, area, upper.shape[1]):
            continue
        hx1, hy1, _, _ = head
        return hx1 + x, hy1 + y, hx1 + x + bw, hy1 + y + bh
    return None


def _heuristic_vest(frame: np.ndarray, torso: tuple[float, float, float, float]) -> tuple[float, float, float, float] | None:
    crop = _region_crop(frame, torso)
    if crop.size == 0:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([25, 85, 85]), np.array([45, 255, 255])),
        cv2.inRange(hsv, np.array([38, 65, 65]), np.array([85, 255, 255])),
    )
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), 2)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    cnt = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(cnt) < 180:
        return None
    x, y, bw, bh = cv2.boundingRect(cnt)
    tx1, ty1, _, _ = torso
    return tx1 + x, ty1 + y, tx1 + x + bw, ty1 + y + bh


def _feet_metrics(frame: np.ndarray, feet: tuple[float, float, float, float]) -> dict[str, float]:
    crop = _region_crop(frame, feet)
    env = _foot_environment_ratios(crop)
    if crop.size == 0:
        return {
            "skin_ratio": 0.0,
            "lower_skin_ratio": 0.0,
            "bottom_dark_nonskin": 0.0,
            "max_shoe_contour": 0.0,
            "bottom_area": 0.0,
            "bottom_skin_ratio": 0.0,
            "shoe_aspect": 0.0,
            "mud_ratio": 0.0,
            "pants_ratio": 0.0,
            "puddle_ratio": 0.0,
            "foot_mud_ratio": 0.0,
            "foot_puddle_ratio": 0.0,
        }
    h, w = crop.shape[:2]
    foot_band = crop[int(h * 0.35) :, :]
    foot_env = _foot_environment_ratios(foot_band) if foot_band.size > 0 else env
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    skin = _foot_skin_mask(hsv)
    skin_ratio = float(skin.sum() / 255) / (h * w)

    lower = crop[int(h * 0.35) :]
    lh, lw = lower.shape[:2]
    lower_hsv = cv2.cvtColor(lower, cv2.COLOR_BGR2HSV)
    lower_skin = _foot_skin_mask(lower_hsv)
    lower_skin_ratio = float(lower_skin.sum() / 255) / (lh * lw) if lh * lw else 0.0

    bottom = crop[int(h * 0.55) :]
    bh, bw = bottom.shape[:2]
    bottom_hsv = cv2.cvtColor(bottom, cv2.COLOR_BGR2HSV)
    bottom_skin = _foot_skin_mask(bottom_hsv)
    bottom_gray = cv2.cvtColor(bottom, cv2.COLOR_BGR2GRAY)
    bottom_dark = (bottom_gray < 90).astype(np.uint8) * 255
    bottom_mud = cv2.inRange(bottom_hsv, np.array([8, 20, 25]), np.array([28, 150, 120]))
    bottom_dark = cv2.bitwise_and(bottom_dark, cv2.bitwise_not(bottom_skin))
    bottom_dark = cv2.bitwise_and(bottom_dark, cv2.bitwise_not(bottom_mud))
    bottom_dark_nonskin = float(bottom_dark.sum() / 255) / (bh * bw) if bh * bw else 0.0

    cnts, _ = cv2.findContours(bottom_dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    max_shoe_contour = float(max((cv2.contourArea(c) for c in cnts), default=0.0))
    bottom_area = float(bh * bw)
    bottom_skin_ratio = float(bottom_skin.sum() / 255) / bottom_area if bottom_area else 0.0

    shoe_aspect = 0.0
    if cnts:
        cnt = max(cnts, key=cv2.contourArea)
        _, _, bw2, bh2 = cv2.boundingRect(cnt)
        shoe_aspect = float(bh2 / max(bw2, 1))

    return {
        "skin_ratio": skin_ratio,
        "lower_skin_ratio": lower_skin_ratio,
        "bottom_dark_nonskin": bottom_dark_nonskin,
        "max_shoe_contour": max_shoe_contour,
        "bottom_area": bottom_area,
        "bottom_skin_ratio": bottom_skin_ratio,
        "shoe_aspect": shoe_aspect,
        "mud_ratio": env["mud_ratio"],
        "pants_ratio": env["pants_ratio"],
        "puddle_ratio": env["puddle_ratio"],
        "foot_mud_ratio": foot_env["mud_ratio"],
        "foot_puddle_ratio": foot_env["puddle_ratio"],
    }


def _min_shoe_contour(bottom_area: float) -> float:
    return max(70.0, bottom_area * 0.065)


def _looks_barefoot_or_open_footwear(metrics: dict[str, float], *, foot_crop: np.ndarray | None = None) -> bool:
    """Chân trần / dép — cần da rõ ở vùng mắt cá, không phải bùn nền."""
    if _feet_view_obstructed(metrics):
        return False
    if metrics.get("mud_ratio", 0.0) > 0.30 or metrics.get("foot_mud_ratio", 0.0) > 0.26:
        return False
    if metrics.get("pants_ratio", 0.0) > 0.16 and metrics.get("max_shoe_contour", 0.0) < 40:
        return False

    upper_skin = _upper_foot_skin_ratio(foot_crop) if foot_crop is not None and foot_crop.size else 0.0
    if upper_skin < 0.07:
        return False

    lower_skin = metrics["lower_skin_ratio"]
    bottom_dark = metrics["bottom_dark_nonskin"]
    max_contour = metrics["max_shoe_contour"]
    bottom_area = metrics.get("bottom_area", 0.0)
    bottom_skin = metrics.get("bottom_skin_ratio", 0.0)
    shoe_aspect = metrics.get("shoe_aspect", 0.0)
    min_contour = _min_shoe_contour(bottom_area)

    if lower_skin > 0.92 and bottom_dark < 0.06 and upper_skin > 0.10:
        return True

    # Vệt bùn / nhiễu dọc — không phải chân trần
    if shoe_aspect > 1.6 and max_contour < min_contour * 0.42:
        return False
    if max_contour < 28 and bottom_dark < 0.12:
        return False

    # Giày bảo hộ — contour đủ lớn, tối, không phải dép mỏng
    if shoe_aspect >= 0.72 and max_contour >= min_contour and bottom_dark >= 0.10:
        return False
    if bottom_dark >= 0.115 and max_contour >= 100:
        if shoe_aspect >= 0.66 or bottom_skin < 0.80:
            return False
    if shoe_aspect < 0.66 and bottom_skin > 0.82 and max_contour >= 95:
        return False

    # Dép / hở ngón — da rõ + không có khối giày
    if (
        max_contour < min_contour * 1.35
        and shoe_aspect < 0.66
        and bottom_skin > 0.80
        and lower_skin > 0.78
        and upper_skin > 0.09
    ):
        return True
    if lower_skin > 0.82 and upper_skin > 0.10 and max_contour < min_contour * 0.85:
        return True

    return False


def _split_feet_halves(
    feet: tuple[float, float, float, float],
) -> tuple[tuple[float, float, float, float], tuple[float, float, float, float]]:
    x1, y1, x2, y2 = feet
    fw = x2 - x1
    gap = max(4.0, fw * 0.08)
    mid = (x1 + x2) / 2
    left = (x1, y1, mid - gap / 2, y2)
    right = (mid + gap / 2, y1, x2, y2)
    return left, right


def _best_shoe_for_feet(
    items: list[tuple[tuple[float, float, float, float], float]],
    feet: tuple[float, float, float, float],
) -> tuple[tuple[float, float, float, float], float] | None:
    """Model giày thường bbox cả 2 bên — khớp trước khi tách trái/phải."""
    x1, y1, x2, y2 = feet
    sole_y1 = y1 + (y2 - y1) * 0.20
    best: tuple[tuple[float, float, float, float], float] | None = None
    for box, conf in items:
        if conf < _SHOE_MODEL_MIN_CONF:
            continue
        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        if not (x1 - (x2 - x1) * 0.05 <= cx <= x2 + (x2 - x1) * 0.05):
            continue
        if not (sole_y1 <= cy <= y2 + (y2 - y1) * 0.12):
            continue
        if _iou(box, feet) < 0.06:
            continue
        if best is None or conf > best[1]:
            best = (box, conf)
    return best


def _best_shoe_for_foot(
    items: list[tuple[tuple[float, float, float, float], float]],
    foot: tuple[float, float, float, float],
) -> tuple[tuple[float, float, float, float], float] | None:
    """Model giày — khớp tâm/overlap vùng mắt cá."""
    x1, y1, x2, y2 = foot
    sole_y1 = y1 + (y2 - y1) * 0.35
    best: tuple[tuple[float, float, float, float], float] | None = None
    for box, conf in items:
        if conf < _SHOE_MODEL_MIN_CONF:
            continue
        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        if not (x1 <= cx <= x2 and sole_y1 <= cy <= y2 + (y2 - y1) * 0.08):
            continue
        if _iou(box, foot) < 0.03 and not (x1 <= box[0] and box[2] <= x2):
            continue
        if best is None or conf > best[1]:
            best = (box, conf)
    return best


def _shoe_detection_for_foot(
    frame: np.ndarray,
    foot: tuple[float, float, float, float],
    *,
    shoe_items: list[tuple[tuple[float, float, float, float], float]] | None = None,
) -> tuple[str, tuple[float, float, float, float], float] | None:
    """Trả ('safety_shoes'|'no_shoes', bbox, conf) cho một bên chân."""
    fx1, fy1, fx2, fy2 = foot
    if fx2 - fx1 < 8 or fy2 - fy1 < 8:
        return None

    foot_crop = _region_crop(frame, foot)
    metrics = _feet_metrics(frame, foot)

    if shoe_items and not _feet_view_obstructed(metrics):
        model_shoe = _best_shoe_for_foot(shoe_items, foot)
        if model_shoe:
            return ("safety_shoes", model_shoe[0], model_shoe[1])

    sb = _heuristic_shoes(frame, foot, metrics=metrics, foot_crop=foot_crop)
    if sb:
        return ("safety_shoes", sb, 0.58)

    if _feet_view_obstructed(metrics):
        return None

    if not _looks_barefoot_or_open_footwear(metrics, foot_crop=foot_crop):
        min_contour = _min_shoe_contour(metrics["bottom_area"])
        if (
            metrics["bottom_dark_nonskin"] >= 0.10
            and metrics["max_shoe_contour"] >= min_contour
        ):
            return ("safety_shoes", _shoe_bbox_from_feet(foot), 0.55)

    if _looks_barefoot_or_open_footwear(metrics, foot_crop=foot_crop):
        return ("no_shoes", foot, 0.55)

    return None


def _evaluate_foot_shoes(
    frame: np.ndarray,
    foot: tuple[float, float, float, float],
    *,
    shoe_items: list[tuple[tuple[float, float, float, float], float]] | None = None,
) -> tuple[str, tuple[float, float, float, float], float] | None:
    """Đánh giá một bên chân — không suy luận thiếu giày khi không đủ căn cứ."""
    det = _shoe_detection_for_foot(frame, foot, shoe_items=shoe_items)
    if det is not None:
        return det

    foot_crop = _region_crop(frame, foot)
    metrics = _feet_metrics(frame, foot)
    if _feet_view_obstructed(metrics):
        return None

    if not _looks_barefoot_or_open_footwear(metrics, foot_crop=foot_crop):
        min_contour = _min_shoe_contour(metrics["bottom_area"])
        if (
            metrics["bottom_dark_nonskin"] >= 0.08
            and metrics["max_shoe_contour"] >= min_contour * 0.85
        ):
            return ("safety_shoes", _shoe_bbox_from_feet(foot), 0.52)

    return None


def _shoe_detections_for_person(
    frame: np.ndarray,
    feet: tuple[float, float, float, float],
    person_conf: float,
    *,
    shoe_items: list[tuple[tuple[float, float, float, float], float]] | None = None,
) -> list[tuple[str, tuple[float, float, float, float], float]]:
    """Quét 2 chân — PPE-003 chỉ khi CẢ HAI chân đều thiếu giày; một bên không detect → không phạt."""
    _ = person_conf

    if shoe_items:
        foot_metrics = _feet_metrics(frame, feet)
        if not _feet_view_obstructed(foot_metrics):
            paired = _best_shoe_for_feet(shoe_items, feet)
            if paired:
                return [("safety_shoes", paired[0], paired[1])]

    left, right = _split_feet_halves(feet)
    left_det = _evaluate_foot_shoes(frame, left, shoe_items=shoe_items)
    right_det = _evaluate_foot_shoes(frame, right, shoe_items=shoe_items)

    left_state = left_det[0] if left_det else None
    right_state = right_det[0] if right_det else None

    out: list[tuple[str, tuple[float, float, float, float], float]] = []
    if left_state == "safety_shoes" and left_det:
        out.append(left_det)
    if right_state == "safety_shoes" and right_det:
        out.append(right_det)
    if out:
        return out

    if left_state == "no_shoes" and right_state == "no_shoes" and left_det and right_det:
        return [left_det, right_det]

    return []


def _shoe_bbox_from_feet(feet: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = feet
    fh = y2 - y1
    return x1, y1 + fh * 0.55, x2, y2


def _heuristic_shoes(
    frame: np.ndarray,
    feet: tuple[float, float, float, float],
    *,
    metrics: dict[str, float] | None = None,
    foot_crop: np.ndarray | None = None,
) -> tuple[float, float, float, float] | None:
    crop = foot_crop if foot_crop is not None else _region_crop(frame, feet)
    m = metrics if metrics is not None else _feet_metrics(frame, feet)
    if _feet_view_obstructed(m):
        return None
    if _looks_barefoot_or_open_footwear(m, foot_crop=crop):
        return None

    if crop.size == 0:
        return None
    h, w = crop.shape[:2]
    bottom = crop[int(h * 0.45) :]
    bh, bw = bottom.shape[:2]
    if bh <= 0 or bw <= 0:
        return None

    hsv = cv2.cvtColor(bottom, cv2.COLOR_BGR2HSV)
    skin = _foot_skin_mask(hsv)
    mud = cv2.inRange(hsv, np.array([8, 20, 25]), np.array([28, 150, 120]))
    gray = cv2.cvtColor(bottom, cv2.COLOR_BGR2GRAY)
    dark = (gray < 95).astype(np.uint8) * 255
    dark = cv2.bitwise_and(dark, cv2.bitwise_not(skin))
    dark = cv2.bitwise_and(dark, cv2.bitwise_not(mud))
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((5, 3), np.uint8), 1)
    cnts, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    cnt = max(cnts, key=cv2.contourArea)
    area = cv2.contourArea(cnt)
    min_area = max(70.0, bh * bw * 0.06)
    if area < min_area:
        return None
    x, y, bw2, bh2 = cv2.boundingRect(cnt)
    if bw2 < bw * 0.22:
        return None
    if bh2 < max(6, bh * 0.12):
        return None
    cx = x + bw2 / 2
    if cx < bw * 0.18 or cx > bw * 0.82:
        return None
    off_y = int(h * 0.45)
    fx1, fy1, _, _ = feet
    return fx1 + x, fy1 + off_y + y, fx1 + x + bw2, fy1 + off_y + y + bh2


def _model_items(task_id: str, frame: np.ndarray, class_name: str) -> list[tuple[tuple[float, float, float, float], float]]:
    boxes = predict_boxes(task_id, frame)
    return [((x1, y1, x2, y2), conf) for label, x1, y1, x2, y2, conf in boxes if label == class_name]


def _best_in_region(
    items: list[tuple[tuple[float, float, float, float], float]],
    region: tuple[float, float, float, float],
) -> tuple[tuple[float, float, float, float], float] | None:
    best: tuple[tuple[float, float, float, float], float] | None = None
    for box, conf in items:
        if _iou(box, region) >= _ITEM_IOU and (best is None or conf > best[1]):
            best = (box, conf)
    return best


def _best_helmet_for_head(
    items: list[tuple[tuple[float, float, float, float], float]],
    head: tuple[float, float, float, float],
) -> tuple[tuple[float, float, float, float], float] | None:
    """Model mũ thường bbox nhỏ — khớp tâm/overlap vùng đỉnh, không chỉ IoU toàn head."""
    x1, y1, x2, y2 = head
    cap_y2 = y1 + (y2 - y1) * 0.62
    best: tuple[tuple[float, float, float, float], float] | None = None
    for box, conf in items:
        if conf < _HELMET_MODEL_MIN_CONF:
            continue
        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        if not (x1 <= cx <= x2 and y1 - (y2 - y1) * 0.12 <= cy <= cap_y2):
            continue
        cap_region = (x1, y1, x2, cap_y2)
        if _iou(box, head) < 0.04 and _iou(box, cap_region) < 0.06:
            continue
        if best is None or conf > best[1]:
            best = (box, conf)
    return best


@dataclass
class _PersonPpe:
    person_box: tuple[float, float, float, float]
    person_conf: float


def _plausible_person_box(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Loại bbox giả trên vật kiến trúc / lưới — chỉ giữ người có tỷ lệ hợp lý."""
    x1, y1, x2, y2 = box
    bw = max(x2 - x1, 1.0)
    bh = max(y2 - y1, 1.0)
    if bh < frame_h * 0.07 or bh > frame_h * 0.62:
        return False
    if bw < frame_w * 0.04 or bw > frame_w * 0.42:
        return False
    aspect = bh / bw
    if aspect < 1.05 or aspect > 4.8:
        return False
    cy = (y1 + y2) / 2
    if cy < frame_h * 0.12:
        return False
    return True


def _build_person_only_result(frame: np.ndarray, camera_id: str) -> dict:
    """Person detections only — dùng khi suppress PPE trên reel demo Cam A-04."""
    from .worker_identity.detection_enrich import enrich_person_bbox

    detector = _get_person_detector()
    h, w = frame.shape[:2]
    persons_raw = detector.predict(frame)
    persons = [
        _PersonPpe((p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3]), p.confidence)
        for p in persons_raw
        if p.confidence >= _PERSON_CONF
        and _plausible_person_box((p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3]), w, h)
    ]

    detections: list[PpeDetection] = []
    for person_index, person in enumerate(persons):
        pb = person.person_box
        person_det = PpeDetection(
            behavior="person",
            label=PPE_LABELS["person"],
            scenario_id=PPE_SCENARIO["person"],
            confidence=round(person.person_conf, 3),
            bbox=[float(v) for v in pb],
        )
        enrich_person_bbox(frame, person_det, camera_id=camera_id, person_index=person_index)
        detections.append(person_det)

    return {
        "type": "result",
        "camera_id": camera_id,
        "width": w,
        "height": h,
        "metrics": {
            "person_count": len(persons),
            "ppe_violations": 0,
        },
        "detections": [d.model_dump() for d in detections],
        "events": [],
    }


def analyze_ppe_frame(frame: np.ndarray, camera_id: str = "A-04") -> dict:
    from .cam04_ppe_demo import is_cam04_ppe_scene, resolve_cam04_ppe_demo

    if resolve_cam04_ppe_demo(camera_id, frame) == "suppress":
        return _build_person_only_result(frame, camera_id)

    ppe_demo_scene = is_cam04_ppe_scene(camera_id, frame)

    detector = _get_person_detector()
    h, w = frame.shape[:2]
    persons_raw = detector.predict(frame)
    persons = [
        _PersonPpe((p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3]), p.confidence)
        for p in persons_raw
        if p.confidence >= _PERSON_CONF
        and _plausible_person_box((p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3]), w, h)
    ]

    helmet_items = _model_items("ppe_helmet", frame, "hard_hat")
    vest_items = _model_items("ppe_vest", frame, "safety_vest")
    shoe_items = _model_items("ppe_shoes", frame, "safety_shoes")

    from .worker_identity.detection_enrich import copy_worker_identity, enrich_person_bbox

    detections: list[PpeDetection] = []
    violations = 0

    for person_index, person in enumerate(persons):
        pb = person.person_box
        head = _head_region_for_helmet(pb)
        torso = _sub_region(pb, 0.20, 0.72)
        feet = _feet_region(pb, h)

        person_det = PpeDetection(
            behavior="person",
            label=PPE_LABELS["person"],
            scenario_id=PPE_SCENARIO["person"],
            confidence=round(person.person_conf, 3),
            bbox=[float(v) for v in pb],
        )
        enrich_person_bbox(frame, person_det, camera_id=camera_id, person_index=person_index)
        detections.append(person_det)

        def _append_violation(violation: PpeDetection) -> None:
            copy_worker_identity(person_det, violation)
            detections.append(violation)

        helmet = None
        model_helmet = _best_helmet_for_head(helmet_items, head)
        if model_helmet:
            helmet = model_helmet
        else:
            hb = _heuristic_helmet(frame, head)
            if hb:
                helmet = (hb, 0.62)
        if helmet:
            box, conf = helmet
            detections.append(
                PpeDetection(
                    behavior="hard_hat",
                    label=PPE_LABELS["hard_hat"],
                    scenario_id=PPE_SCENARIO["hard_hat"],
                    confidence=round(conf, 3),
                    bbox=[float(v) for v in box],
                )
            )
        else:
            violations += 1
            _append_violation(
                PpeDetection(
                    behavior="no_helmet",
                    label=PPE_LABELS["no_helmet"],
                    scenario_id=PPE_SCENARIO["no_helmet"],
                    confidence=round(max(_VIOLATION_CONF, person.person_conf * 0.95), 3),
                    bbox=[float(v) for v in head],
                )
            )
        person_ppe_viol = helmet is None

        vest = None
        vb = _heuristic_vest(frame, torso)
        if vb:
            vest = (vb, 0.60)
        else:
            model_vest = _best_in_region(vest_items, torso)
            if model_vest and model_vest[1] >= 0.70:
                vest = model_vest
        if vest:
            box, conf = vest
            detections.append(
                PpeDetection(
                    behavior="safety_vest",
                    label=PPE_LABELS["safety_vest"],
                    scenario_id=PPE_SCENARIO["safety_vest"],
                    confidence=round(conf, 3),
                    bbox=[float(v) for v in box],
                )
            )
        else:
            violations += 1
            person_ppe_viol = True
            _append_violation(
                PpeDetection(
                    behavior="no_vest",
                    label=PPE_LABELS["no_vest"],
                    scenario_id=PPE_SCENARIO["no_vest"],
                    confidence=round(max(_VIOLATION_CONF, person.person_conf * 0.93), 3),
                    bbox=[float(v) for v in torso],
                )
            )

        shoe_items_det = _shoe_detections_for_person(
            frame, feet, person.person_conf, shoe_items=shoe_items,
        )
        shoe_violation_logged = False
        for behavior, box, conf in shoe_items_det:
            if behavior == "safety_shoes":
                detections.append(
                    PpeDetection(
                        behavior="safety_shoes",
                        label=PPE_LABELS["safety_shoes"],
                        scenario_id=PPE_SCENARIO["safety_shoes"],
                        confidence=round(conf, 3),
                        bbox=[float(v) for v in box],
                    )
                )
                continue
            if not shoe_violation_logged:
                violations += 1
                shoe_violation_logged = True
            _append_violation(
                PpeDetection(
                    behavior="no_shoes",
                    label=PPE_LABELS["no_shoes"],
                    scenario_id=PPE_SCENARIO["no_shoes"],
                    confidence=round(max(conf, _VIOLATION_CONF, person.person_conf * 0.90), 3),
                    bbox=[float(v) for v in box],
                )
            )

        if (
            ppe_demo_scene
            and person_ppe_viol
            and not shoe_violation_logged
            and not shoe_items_det
            and _feet_view_obstructed(_feet_metrics(frame, feet))
        ):
            violations += 1
            _append_violation(
                PpeDetection(
                    behavior="no_shoes",
                    label=PPE_LABELS["no_shoes"],
                    scenario_id=PPE_SCENARIO["no_shoes"],
                    confidence=round(max(_VIOLATION_CONF, person.person_conf * 0.88), 3),
                    bbox=[float(v) for v in feet],
                )
            )

    h, w = frame.shape[:2]
    return {
        "type": "result",
        "camera_id": camera_id,
        "width": w,
        "height": h,
        "metrics": {
            "person_count": len(persons),
            "ppe_violations": violations,
        },
        "detections": [d.model_dump() for d in detections],
        "events": [],
    }
