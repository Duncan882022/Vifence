"""Phát hiện dây an toàn trên người — heuristic (cam/vàng/beige, chữ X lưng) + model auto-train."""

from __future__ import annotations

import logging

import cv2
import numpy as np

from .auto_train.inference import predict_boxes

logger = logging.getLogger("wah_harness")

_TASK_ID = "wah_harness"
_CLASS = "safety_harness"
_STRAP_MIN_RATIO = 0.004
_X_BACK_MIN_RATIO = 0.003


def _region_crop(frame: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return frame[0:0, 0:0]
    return frame[y1:y2, x1:x2]


def _center_inside(inner: list[float] | tuple[float, ...], outer: tuple[float, float, float, float]) -> bool:
    cx = (inner[0] + inner[2]) / 2
    cy = (inner[1] + inner[3]) / 2
    return outer[0] <= cx <= outer[2] and outer[1] <= cy <= outer[3]


def harness_bbox_from_person(person_bbox: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """Vùng lưng/vai — nơi thường thấy dây chữ X (trước hoặc sau)."""
    x1, y1, x2, y2 = person_bbox
    pw, ph = x2 - x1, y2 - y1
    return (
        x1 + pw * 0.08,
        y1 + ph * 0.04,
        x2 - pw * 0.08,
        y1 + ph * 0.58,
    )


def _strap_mask(hsv: np.ndarray) -> np.ndarray:
    return cv2.bitwise_or(
        cv2.inRange(hsv, np.array([0, 35, 70]), np.array([32, 255, 255])),
        cv2.inRange(hsv, np.array([18, 25, 110]), np.array([35, 140, 255])),
    )


def _back_strap_ratio(frame: np.ndarray, person_bbox: tuple[float, float, float, float]) -> float:
    """Tỷ lệ dải cam/vàng trên vùng lưng — ổn định hơn crop torso khi người nhỏ/xa."""
    crop = _region_crop(frame, harness_bbox_from_person(person_bbox))
    if crop.size == 0:
        return 0.0
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = _strap_mask(hsv)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), 1)
    return float(mask.sum() / 255) / (crop.shape[0] * crop.shape[1])


def _heuristic_strap_harness(frame: np.ndarray, person_bbox: tuple[float, float, float, float]) -> bool:
    back_ratio = _back_strap_ratio(frame, person_bbox)
    crop = _region_crop(frame, person_bbox)
    if crop.size == 0:
        return back_ratio >= 0.016
    ch, cw = crop.shape[:2]
    torso = crop[int(ch * 0.10) : int(ch * 0.88), int(cw * 0.05) : int(cw * 0.95)]
    torso_ratio = 0.0
    if torso.size > 0:
        hsv = cv2.cvtColor(torso, cv2.COLOR_BGR2HSV)
        mask = _strap_mask(hsv)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8), 1)
        torso_ratio = float(mask.sum() / 255) / (torso.shape[0] * torso.shape[1])
    ratio = max(back_ratio, torso_ratio)
    crop_area = crop.shape[0] * crop.shape[1]
    min_ratio = 0.022 if crop_area < 2400 else max(_STRAP_MIN_RATIO, 0.006)
    if ratio < min_ratio:
        return False
    if ratio >= 0.085 and not _heuristic_x_harness_back(frame, person_bbox):
        return False
    return _heuristic_x_harness_back(frame, person_bbox)


def _diagonal_strap_angles(mask: np.ndarray, crop: np.ndarray) -> tuple[list[float], bool]:
    """Trả về góc dải chéo và có cặp giao (>40°) hay không."""
    edges = cv2.Canny(mask, 40, 120)
    min_len = max(6, int(min(crop.shape[:2]) * 0.14))
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180, threshold=6,
        minLineLength=min_len, maxLineGap=6,
    )
    if lines is None:
        return [], False
    angles: list[float] = []
    for line in lines.reshape(-1, 4):
        x1, y1, x2, y2 = [float(v) for v in line]
        seg_len = float(np.hypot(x2 - x1, y2 - y1))
        if seg_len < min_len * 0.75:
            continue
        ang = abs(float(np.arctan2(y2 - y1, x2 - x1)))
        if 0.35 < ang < 2.75:
            angles.append(ang)
    has_cross = any(abs(a1 - a2) > 0.40 for i, a1 in enumerate(angles) for a2 in angles[i + 1 :])
    return angles, has_cross


def _heuristic_x_harness_back(frame: np.ndarray, person_bbox: tuple[float, float, float, float]) -> bool:
    """Dây chữ X trên lưng — dải chéo vàng/cam/beige giao nhau vùng vai."""
    back_box = harness_bbox_from_person(person_bbox)
    crop = _region_crop(frame, back_box)
    if crop.size == 0:
        return False

    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = _strap_mask(hsv)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), 1)

    crop_area = crop.shape[0] * crop.shape[1]
    ratio = float(mask.sum() / 255) / crop_area
    if ratio < _X_BACK_MIN_RATIO:
        return False

    angles, has_cross = _diagonal_strap_angles(mask, crop)

    # Dây cam/vàng rõ — 2+ dải chéo hoặc chữ X (Cam A-04 mép biên).
    if ratio >= 0.052 and len(angles) >= 2:
        return True
    if has_cross and ratio >= 0.042:
        return True
    if ratio >= 0.014 and has_cross and len(angles) >= 2 and crop_area < 2600:
        return True

    # Áo phản quang phủ đều — không coi là dây.
    if ratio >= 0.085 and len(angles) < 2:
        return False
    return ratio >= 0.020 and len(angles) >= 1 and crop_area < 2600


def _model_harness_on_person(
    frame: np.ndarray,
    person_bbox: tuple[float, float, float, float],
) -> tuple[bool, tuple[float, float, float, float] | None]:
    boxes = predict_boxes(_TASK_ID, frame, conf_threshold=0.35)
    for _label, x1, y1, x2, y2, _conf in boxes:
        box = (x1, y1, x2, y2)
        if _center_inside(box, person_bbox):
            return True, box
    return False, None


def detect_harness_on_person(
    frame: np.ndarray,
    person_bbox: tuple[float, float, float, float],
    *,
    harness_flag: bool = False,
) -> tuple[bool, tuple[float, float, float, float] | None]:
    if harness_flag:
        return True, harness_bbox_from_person(person_bbox)
    if _heuristic_x_harness_back(frame, person_bbox):
        return True, harness_bbox_from_person(person_bbox)
    if _heuristic_strap_harness(frame, person_bbox):
        return True, harness_bbox_from_person(person_bbox)
    found, box = _model_harness_on_person(frame, person_bbox)
    if found:
        return True, box or harness_bbox_from_person(person_bbox)
    return False, None
