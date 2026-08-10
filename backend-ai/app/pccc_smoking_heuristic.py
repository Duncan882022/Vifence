"""Heuristic hút thuốc bổ sung khi YOLO không đạt ngưỡng ghi sự kiện.

Chỉ kích hoạt khi có người ngồi góc phải dưới (Cam A-04) VÀ vùng miệng có vật
dài mảnh rõ ràng — không quét mọi khuôn mặt trong khung (gây false-positive
trên công nhân đi bộ / phản quang).
"""

from __future__ import annotations

import cv2
import numpy as np

from .detectors.face_guard import detect_faces
from .schemas import Detection
from .violation_thresholds import VIOLATION_MIN_CONFIDENCE

_MOUTH_TOP_RATIO = 0.50
_MOUTH_BOTTOM_EXTEND = 0.80
_MOUTH_SIDE_EXPAND = 0.40
_MIN_CONF = VIOLATION_MIN_CONFIDENCE
_MIN_CUE_SCORE = 175.0
_MIN_ELONGATION = 1.25


def _mouth_zone(face) -> tuple[int, int, int, int]:
    x, y, fw, fh = [float(v) for v in face[:4]]
    top = y + fh * _MOUTH_TOP_RATIO
    bottom = y + fh + fh * _MOUTH_BOTTOM_EXTEND
    side = fw * _MOUTH_SIDE_EXPAND
    return int(x - side), int(top), int(x + fw + side), int(bottom)


def _clip_box(box: tuple[int, int, int, int], w: int, h: int) -> tuple[int, int, int, int] | None:
    x1, y1, x2, y2 = box
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)
    if x2 - x1 < 10 or y2 - y1 < 10:
        return None
    return x1, y1, x2, y2


def _face_center(face, w: int, h: int) -> tuple[float, float]:
    fx, fy, fw, fh = [float(v) for v in face[:4]]
    return (fx + fw / 2) / w, (fy + fh / 2) / h


def _confidence_from_cue(cue_score: float) -> float:
    if cue_score < _MIN_CUE_SCORE:
        return 0.0
    boost = min((cue_score - _MIN_CUE_SCORE) / 350.0, 0.12)
    return round(min(0.92, _MIN_CONF + boost), 3)


def _cigarette_like_blob(crop: np.ndarray) -> tuple[bool, tuple[int, int, int, int] | None, float]:
    if crop.size == 0:
        return False, None, 0.0
    ch, cw = crop.shape[:2]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 30, 110)
    edges = cv2.dilate(edges, np.ones((2, 2), np.uint8), 1)
    cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best: tuple[float, tuple[int, int, int, int]] | None = None
    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if area < 10 or area > ch * cw * 0.18:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw < 5 or bh < 2:
            continue
        aspect = bw / max(bh, 1)
        tall_aspect = bh / max(bw, 1)
        elongation = max(aspect, tall_aspect)
        if elongation < _MIN_ELONGATION:
            continue
        patch = gray[y : y + bh, x : x + bw]
        if patch.size == 0:
            continue
        mean_v = float(patch.mean())
        if mean_v < 45 or mean_v > 245:
            continue
        score = area * elongation
        if best is None or score > best[0]:
            best = (score, (x, y, x + bw, y + bh))
    if best is None:
        return False, None, 0.0
    return True, best[1], best[0]


def _bright_elongated_tip(crop: np.ndarray) -> tuple[bool, tuple[int, int, int, int] | None, float]:
    """Đầu lọc trắng / điếu mảnh ngang miệng — bắt cảnh hút thuốc ngồi góc phải."""
    if crop.size == 0:
        return False, None, 0.0
    ch, cw = crop.shape[:2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([0, 0, 150]), np.array([180, 75, 255])),
        cv2.inRange(hsv, np.array([5, 25, 110]), np.array([22, 190, 255])),
    )
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8), 1)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best: tuple[float, tuple[int, int, int, int]] | None = None
    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if area < 6 or area > ch * cw * 0.40:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw < 4 or bh < 2:
            continue
        aspect = bw / max(bh, 1)
        tall_aspect = bh / max(bw, 1)
        elongation = max(aspect, tall_aspect)
        if elongation < _MIN_ELONGATION:
            continue
        score = area * elongation * 1.4
        if best is None or score > best[0]:
            best = (score, (x, y, x + bw, y + bh))
    if best is None:
        return False, None, 0.0
    return True, best[1], best[0]


def _mouth_smoking_cue(crop: np.ndarray) -> tuple[bool, tuple[int, int, int, int] | None, float]:
    found, inner, score = _cigarette_like_blob(crop)
    if found and inner is not None and score >= _MIN_CUE_SCORE:
        return True, inner, score
    found, inner, score = _bright_elongated_tip(crop)
    if found and inner is not None and score >= _MIN_CUE_SCORE:
        return True, inner, score
    return False, None, 0.0


def _detection_from_face(
    frame: np.ndarray,
    face,
    w: int,
    h: int,
    *,
    person_bbox: list[float] | None = None,
) -> Detection | None:
    zone = _clip_box(_mouth_zone(face), w, h)
    if zone is None:
        return None
    x1, y1, x2, y2 = zone
    crop = frame[y1:y2, x1:x2]
    found, inner, cue_score = _mouth_smoking_cue(crop)
    if not found or inner is None:
        return None
    conf = _confidence_from_cue(cue_score)
    if conf < _MIN_CONF:
        return None
    ix1, iy1, ix2, iy2 = inner
    bbox = [float(x1 + ix1), float(y1 + iy1), float(x1 + ix2), float(y1 + iy2)]
    return Detection(
        behavior="smoking",
        label="cigarette",
        confidence=conf,
        bbox=bbox,
        subject_bbox=[float(v) for v in person_bbox] if person_bbox else None,
    )


def _center_inside(face, person_bbox: list[float]) -> bool:
    fx, fy, fw, fh = [float(v) for v in face[:4]]
    fcx, fcy = fx + fw / 2, fy + fh / 2
    x1, y1, x2, y2 = person_bbox
    return x1 <= fcx <= x2 and y1 <= fcy <= y2


def detect_smoking_heuristic(frame: np.ndarray, camera_id: str = "A-04") -> list[Detection]:
    """Chỉ bổ sung khi người ngồi góc phải dưới có điếu rõ ở miệng."""
    if camera_id != "A-04":
        return []

    h, w = frame.shape[:2]
    ok, faces = detect_faces(frame, score_threshold=0.48)
    if not ok or faces is None or len(faces) == 0:
        return []

    seated = _seated_smoker_from_persons(frame, faces, w, h)
    return [seated] if seated is not None else []


def _seated_smoker_from_persons(
    frame: np.ndarray,
    faces,
    w: int,
    h: int,
) -> Detection | None:
    """Người ngồi góc phải dưới + mặt nằm trong bbox người + điếu ở miệng."""
    from .detectors.person_detector import PersonDetector

    detector = PersonDetector(conf_threshold=0.45)
    if not detector.ready:
        detector.load()
    if not detector.ready:
        return None

    persons = [d for d in detector.predict(frame) if d.confidence >= 0.58]
    seated: list[tuple[list[float], float]] = []
    for person in persons:
        x1, y1, x2, y2 = person.bbox
        cx = (x1 + x2) / 2 / w
        cy = (y1 + y2) / 2 / h
        if cx < 0.72 or cy < 0.72:
            continue
        if (y2 - y1) < h * 0.14:
            continue
        seated.append(([float(v) for v in person.bbox], person.confidence))

    if not seated:
        return None

    best_det: Detection | None = None
    best_score = 0.0
    for person_bbox, person_conf in seated:
        for face in faces:
            if not _center_inside(face, person_bbox):
                continue
            det = _detection_from_face(
                frame,
                face,
                w,
                h,
                person_bbox=person_bbox,
            )
            if det is None:
                continue
            score = det.confidence * person_conf
            if score > best_score:
                best_det, best_score = det, score

    return best_det
