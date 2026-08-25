"""HC bodycam — neo bbox YOLO vào mặt YuNet, loại FP vải/tường."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .patrol_person_visibility import (
    _clip_box_to_frame,
    background_clutter_person_box,
    legs_only_person_box,
    upper_body_third_with_head_visible,
)


@dataclass(frozen=True)
class _FrameFace:
    box: tuple[float, float, float, float]
    score: float


def _list_frame_faces(
    frame: np.ndarray,
    *,
    score_threshold: float = 0.50,
) -> list[_FrameFace]:
    from .detectors.face_guard import detect_faces

    ok, faces = detect_faces(frame, score_threshold=score_threshold)
    if not ok or faces is None or len(faces) == 0:
        return []

    h, w = frame.shape[:2]
    out: list[_FrameFace] = []
    min_face_h = max(12.0, h * 0.04)
    for face in faces:
        x, y, fw, fh = face[:4]
        score = float(face[14]) if len(face) > 14 else float(face[4] if len(face) > 4 else 0.0)
        if score < score_threshold or fh < min_face_h:
            continue
        aspect = fw / max(fh, 1.0)
        if aspect < 0.45 or aspect > 2.05:
            continue
        x1, y1 = max(0.0, float(x)), max(0.0, float(y))
        x2, y2 = min(float(w), float(x + fw)), min(float(h), float(y + fh))
        if x2 - x1 < 8 or y2 - y1 < 8:
            continue
        out.append(_FrameFace(box=(x1, y1, x2, y2), score=score))
    return out


def _face_center_in_box(face: _FrameFace, person_box: tuple[float, float, float, float]) -> bool:
    fx1, fy1, fx2, fy2 = face.box
    cx = (fx1 + fx2) / 2.0
    cy = (fy1 + fy2) / 2.0
    x1, y1, x2, y2 = person_box
    return x1 <= cx <= x2 and y1 <= cy <= y2


def _bbox_iou(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _person_box_from_face(
    face: _FrameFace,
    frame_w: int,
    frame_h: int,
) -> tuple[float, float, float, float]:
    fx1, fy1, fx2, fy2 = face.box
    fw = max(fx2 - fx1, 1.0)
    fh = max(fy2 - fy1, 1.0)
    cx = (fx1 + fx2) / 2.0
    cy = (fy1 + fy2) / 2.0
    pw = max(fw * 2.6, frame_w * 0.20)
    ph = max(fh * 3.4, frame_h * 0.26)
    raw = (
        cx - pw * 0.5,
        cy - ph * 0.38,
        cx + pw * 0.5,
        cy + ph * 0.62,
    )
    return _clip_box_to_frame(raw, frame_w, frame_h)


def _yolo_plausible_without_face(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Quay lưng / không thấy mặt — vẫn giữ nếu đủ thân trên (tab Đối tượng)."""
    if background_clutter_person_box(box, frame_w, frame_h):
        return False
    if legs_only_person_box(box, frame_w, frame_h):
        return False
    if not upper_body_third_with_head_visible(box, frame_w, frame_h):
        return False
    x1, y1, x2, y2 = box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    bh_ratio = ph / max(float(frame_h), 1.0)
    bw_ratio = pw / max(float(frame_w), 1.0)
    area_ratio = (pw * ph) / max(float(frame_w * frame_h), 1.0)
    if area_ratio > 0.28 or area_ratio < 0.018:
        return False
    if bh_ratio > 0.72 or bh_ratio < 0.12:
        return False
    if bw_ratio > 0.36 or bw_ratio < 0.04:
        return False
    return True


def anchor_patrol_person_boxes_to_faces(
    frame: np.ndarray,
    person_boxes: list[tuple[tuple[float, float, float, float], float]],
    *,
    camera_id: str,
) -> list[tuple[tuple[float, float, float, float], float]]:
    """Giữ bbox YOLO có mặt hoặc đủ thân trên; synth mỗi mặt chưa có YOLO; loại FP vải."""
    if not camera_id.startswith("HC-"):
        return person_boxes

    faces = _list_frame_faces(frame)
    h, w = frame.shape[:2]
    if not faces:
        return [
            (box, conf)
            for box, conf in person_boxes
            if conf >= 0.48 and _yolo_plausible_without_face(box, w, h)
        ]

    matched_yolo: list[tuple[tuple[float, float, float, float], float]] = []
    for box, conf in person_boxes:
        if any(_face_center_in_box(face, box) for face in faces):
            matched_yolo.append((box, conf))
        elif conf >= 0.48 and _yolo_plausible_without_face(box, w, h):
            matched_yolo.append((box, conf))

    covered_face_indices: set[int] = set()
    for face_index, face in enumerate(faces):
        for box, _ in matched_yolo:
            if _face_center_in_box(face, box):
                covered_face_indices.add(face_index)
                break

    synth_boxes: list[tuple[tuple[float, float, float, float], float]] = []
    for face_index, face in enumerate(faces):
        if face_index in covered_face_indices:
            continue
        synth_box = _person_box_from_face(face, w, h)
        if any(_bbox_iou(synth_box, box) >= 0.34 for box, _ in matched_yolo):
            continue
        synth_conf = min(0.92, 0.52 + face.score * 0.38)
        synth_boxes.append((synth_box, synth_conf))

    if matched_yolo or synth_boxes:
        return matched_yolo + synth_boxes

    best = max(faces, key=lambda f: f.score * (f.box[2] - f.box[0]) * (f.box[3] - f.box[1]))
    synth_box = _person_box_from_face(best, w, h)
    synth_conf = min(0.92, 0.52 + best.score * 0.38)
    return [(synth_box, synth_conf)]
