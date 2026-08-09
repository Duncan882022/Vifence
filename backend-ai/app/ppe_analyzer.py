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


def _region_crop(frame: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return frame[0:0, 0:0]
    return frame[y1:y2, x1:x2]


def _heuristic_helmet(frame: np.ndarray, head: tuple[float, float, float, float]) -> tuple[float, float, float, float] | None:
    crop = _region_crop(frame, head)
    if crop.size == 0:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([0, 0, 165]), np.array([180, 50, 255])),
        cv2.inRange(hsv, np.array([18, 75, 115]), np.array([38, 255, 255])),
    )
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), 1)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    cnt = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(cnt) < 70:
        return None
    x, y, bw, bh = cv2.boundingRect(cnt)
    hx1, hy1, _, _ = head
    return hx1 + x, hy1 + y, hx1 + x + bw, hy1 + y + bh


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
    if crop.size == 0:
        return {"skin_ratio": 0.0, "lower_skin_ratio": 0.0, "bottom_dark_nonskin": 0.0, "max_shoe_contour": 0.0, "bottom_area": 0.0, "bottom_skin_ratio": 0.0, "shoe_aspect": 0.0}
    h, w = crop.shape[:2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    skin = cv2.inRange(hsv, np.array([0, 18, 55]), np.array([25, 170, 255]))
    skin_ratio = float(skin.sum() / 255) / (h * w)

    lower = crop[int(h * 0.35) :]
    lh, lw = lower.shape[:2]
    lower_hsv = cv2.cvtColor(lower, cv2.COLOR_BGR2HSV)
    lower_skin = cv2.inRange(lower_hsv, np.array([0, 18, 55]), np.array([25, 170, 255]))
    lower_skin_ratio = float(lower_skin.sum() / 255) / (lh * lw) if lh * lw else 0.0

    bottom = crop[int(h * 0.55) :]
    bh, bw = bottom.shape[:2]
    bottom_hsv = cv2.cvtColor(bottom, cv2.COLOR_BGR2HSV)
    bottom_skin = cv2.inRange(bottom_hsv, np.array([0, 18, 55]), np.array([25, 170, 255]))
    bottom_gray = cv2.cvtColor(bottom, cv2.COLOR_BGR2GRAY)
    bottom_dark = (bottom_gray < 90).astype(np.uint8) * 255
    bottom_dark = cv2.bitwise_and(bottom_dark, cv2.bitwise_not(bottom_skin))
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
    }


def _min_shoe_contour(bottom_area: float) -> float:
    return max(70.0, bottom_area * 0.065)


def _looks_barefoot_or_open_footwear(metrics: dict[str, float]) -> bool:
    """Chân trần / dép — tách khỏi giày bảo hộ (kể cả giày đen ở 640px)."""
    lower_skin = metrics["lower_skin_ratio"]
    bottom_dark = metrics["bottom_dark_nonskin"]
    max_contour = metrics["max_shoe_contour"]
    bottom_area = metrics.get("bottom_area", 0.0)
    bottom_skin = metrics.get("bottom_skin_ratio", 0.0)
    shoe_aspect = metrics.get("shoe_aspect", 0.0)
    min_contour = _min_shoe_contour(bottom_area)

    if lower_skin > 0.90 and bottom_dark < 0.08:
        return True
    if bottom_dark < 0.055:
        return True

    # Giày bảo hộ — contour đủ lớn, tối, không phải dép mỏng
    if shoe_aspect >= 0.72 and max_contour >= min_contour and bottom_dark >= 0.10:
        return False
    if bottom_dark >= 0.115 and max_contour >= 100:
        if shoe_aspect >= 0.66 or bottom_skin < 0.80:
            return False
    if shoe_aspect < 0.66 and bottom_skin > 0.82 and max_contour >= 95:
        return False

    # Dép / hở ngón
    if (
        max_contour < min_contour * 1.45
        and shoe_aspect < 0.68
        and bottom_skin > 0.78
        and lower_skin > 0.72
    ):
        return True
    if lower_skin > 0.74 and max_contour < min_contour:
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


def _shoe_detection_for_foot(
    frame: np.ndarray,
    foot: tuple[float, float, float, float],
) -> tuple[str, tuple[float, float, float, float], float] | None:
    """Trả ('safety_shoes'|'no_shoes', bbox, conf) cho một bên chân."""
    fx1, fy1, fx2, fy2 = foot
    if fx2 - fx1 < 8 or fy2 - fy1 < 8:
        return None

    metrics = _feet_metrics(frame, foot)
    sb = _heuristic_shoes(frame, foot)
    if sb:
        return ("safety_shoes", sb, 0.58)

    if not _looks_barefoot_or_open_footwear(metrics):
        min_contour = _min_shoe_contour(metrics["bottom_area"])
        if (
            metrics["bottom_dark_nonskin"] >= 0.10
            and metrics["max_shoe_contour"] >= min_contour
        ):
            return ("safety_shoes", _shoe_bbox_from_feet(foot), 0.55)

    if _looks_barefoot_or_open_footwear(metrics):
        return ("no_shoes", foot, 0.55)

    return None


def _evaluate_foot_shoes(
    frame: np.ndarray,
    foot: tuple[float, float, float, float],
) -> tuple[str, tuple[float, float, float, float], float] | None:
    """Đánh giá một bên chân — không suy luận thiếu giày khi không đủ căn cứ."""
    det = _shoe_detection_for_foot(frame, foot)
    if det is not None:
        return det

    metrics = _feet_metrics(frame, foot)
    if _looks_barefoot_or_open_footwear(metrics):
        return ("no_shoes", foot, 0.55)

    if not _looks_barefoot_or_open_footwear(metrics):
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
) -> list[tuple[str, tuple[float, float, float, float], float]]:
    """Luôn quét 2 chân trái/phải — chỉ trả no_shoes khi cả hai xác định vi phạm."""
    _ = person_conf

    left, right = _split_feet_halves(feet)
    per_foot = [
        _evaluate_foot_shoes(frame, left),
        _evaluate_foot_shoes(frame, right),
    ]

    shoes = [d for d in per_foot if d and d[0] == "safety_shoes"]
    bare = [d for d in per_foot if d and d[0] == "no_shoes"]

    out: list[tuple[str, tuple[float, float, float, float], float]] = list(shoes)
    if len(bare) >= 2:
        out.extend(bare)
    return out


def _shoe_bbox_from_feet(feet: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = feet
    fh = y2 - y1
    return x1, y1 + fh * 0.55, x2, y2


def _heuristic_shoes(frame: np.ndarray, feet: tuple[float, float, float, float]) -> tuple[float, float, float, float] | None:
    metrics = _feet_metrics(frame, feet)
    if _looks_barefoot_or_open_footwear(metrics):
        return None

    crop = _region_crop(frame, feet)
    if crop.size == 0:
        return None
    h, w = crop.shape[:2]
    bottom = crop[int(h * 0.45) :]
    bh, bw = bottom.shape[:2]
    if bh <= 0 or bw <= 0:
        return None

    hsv = cv2.cvtColor(bottom, cv2.COLOR_BGR2HSV)
    skin = cv2.inRange(hsv, np.array([0, 18, 55]), np.array([25, 170, 255]))
    gray = cv2.cvtColor(bottom, cv2.COLOR_BGR2GRAY)
    dark = (gray < 95).astype(np.uint8) * 255
    dark = cv2.bitwise_and(dark, cv2.bitwise_not(skin))
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


def analyze_ppe_frame(frame: np.ndarray, camera_id: str = "A-04") -> dict:
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
    # Giày: chỉ heuristic/metrics — model seed hay false-positive chân trần.

    detections: list[PpeDetection] = []
    violations = 0

    for person in persons:
        pb = person.person_box
        head = _sub_region(pb, 0.0, 0.30)
        torso = _sub_region(pb, 0.20, 0.72)
        feet = _sub_region(pb, 0.78, 1.0)

        detections.append(
            PpeDetection(
                behavior="person",
                label=PPE_LABELS["person"],
                scenario_id=PPE_SCENARIO["person"],
                confidence=round(person.person_conf, 3),
                bbox=[float(v) for v in pb],
            )
        )

        helmet = None
        hb = _heuristic_helmet(frame, head)
        if hb:
            helmet = (hb, 0.62)
        else:
            model_helmet = _best_in_region(helmet_items, head)
            if model_helmet and model_helmet[1] >= _MODEL_MIN_CONF:
                helmet = model_helmet
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
            detections.append(
                PpeDetection(
                    behavior="no_helmet",
                    label=PPE_LABELS["no_helmet"],
                    scenario_id=PPE_SCENARIO["no_helmet"],
                    confidence=round(max(_VIOLATION_CONF, person.person_conf * 0.95), 3),
                    bbox=[float(v) for v in head],
                )
            )

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
            detections.append(
                PpeDetection(
                    behavior="no_vest",
                    label=PPE_LABELS["no_vest"],
                    scenario_id=PPE_SCENARIO["no_vest"],
                    confidence=round(max(_VIOLATION_CONF, person.person_conf * 0.93), 3),
                    bbox=[float(v) for v in torso],
                )
            )

        shoe_items = _shoe_detections_for_person(frame, feet, person.person_conf)
        shoe_violation_logged = False
        for behavior, box, conf in shoe_items:
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
            detections.append(
                PpeDetection(
                    behavior="no_shoes",
                    label=PPE_LABELS["no_shoes"],
                    scenario_id=PPE_SCENARIO["no_shoes"],
                    confidence=round(max(conf, _VIOLATION_CONF, person.person_conf * 0.90), 3),
                    bbox=[float(v) for v in box],
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
