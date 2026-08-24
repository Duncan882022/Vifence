"""HC bodycam — neo bbox YOLO vào mặt YuNet, loại FP vải/tường."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .patrol_person_visibility import _clip_box_to_frame


@dataclass(frozen=True)
class _FrameFace:
    box: tuple[float, float, float, float]
    score: float


def _list_frame_faces(
    frame: np.ndarray,
    *,
    score_threshold: float = 0.55,
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


def anchor_patrol_person_boxes_to_faces(
    frame: np.ndarray,
    person_boxes: list[tuple[tuple[float, float, float, float], float]],
    *,
    camera_id: str,
) -> list[tuple[tuple[float, float, float, float], float]]:
    """Giữ bbox có mặt bên trong; nếu YOLO trượt mặt thì tạo bbox từ YuNet."""
    if not camera_id.startswith("HC-"):
        return person_boxes

    faces = _list_frame_faces(frame)
    if not faces:
        return person_boxes

    h, w = frame.shape[:2]
    matched: list[tuple[tuple[float, float, float, float], float]] = []
    for box, conf in person_boxes:
        if any(_face_center_in_box(face, box) for face in faces):
            matched.append((box, conf))

    if matched:
        return matched

    best = max(faces, key=lambda f: f.score * (f.box[2] - f.box[0]) * (f.box[3] - f.box[1]))
    synth_box = _person_box_from_face(best, w, h)
    synth_conf = min(0.92, 0.52 + best.score * 0.38)
    return [(synth_box, synth_conf)]
