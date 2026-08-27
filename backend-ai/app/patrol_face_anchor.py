"""HC bodycam — neo bbox YOLO vào mặt YuNet, loại FP vải/tường."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .patrol_person_visibility import (
    _clip_box_to_frame,
    background_clutter_person_box,
    legs_only_person_box,
    plausible_person_silhouette,
    upper_body_third_with_head_visible,
)

# Quay lưng chỉ cần vượt sàn YOLO bodycam — đặt cao hơn sẽ âm thầm bỏ rơi
# người đủ đầu + 1/3 thân trên mà YOLO chấm 0.30–0.38.
BACK_TURN_MIN_CONF = 0.30


@dataclass(frozen=True)
class _FrameFace:
    box: tuple[float, float, float, float]
    score: float


def _list_frame_faces(
    frame: np.ndarray,
    *,
    score_threshold: float = 0.38,
) -> list[_FrameFace]:
    from .detectors.face_guard import detect_faces

    ok, faces = detect_faces(frame, score_threshold=score_threshold)
    if not ok or faces is None or len(faces) == 0:
        return []

    h, w = frame.shape[:2]
    out: list[_FrameFace] = []
    min_face_h = max(8.0, h * 0.024)
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
    pw = max(fw * 2.6, frame_w * 0.18)
    ph = max(fh * 3.4, frame_h * 0.24)
    raw = (
        cx - pw * 0.5,
        cy - ph * 0.38,
        cx + pw * 0.5,
        cy + ph * 0.62,
    )
    return _clip_box_to_frame(raw, frame_w, frame_h)


def _synth_conf_from_face(face: _FrameFace) -> float:
    return min(0.92, 0.55 + face.score * 0.35)


def _dedupe_anchor_boxes(
    boxes: list[tuple[tuple[float, float, float, float], float]],
    *,
    iou_threshold: float = 0.34,
) -> list[tuple[tuple[float, float, float, float], float]]:
    if len(boxes) <= 1:
        return boxes
    ranked = sorted(
        boxes,
        key=lambda item: item[1] * max(1.0, (item[0][2] - item[0][0]) * (item[0][3] - item[0][1])),
        reverse=True,
    )
    kept: list[tuple[tuple[float, float, float, float], float]] = []
    for candidate_box, candidate_conf in ranked:
        if any(_bbox_iou(candidate_box, kept_box) >= iou_threshold for kept_box, _ in kept):
            continue
        kept.append((candidate_box, candidate_conf))
    return kept


def _synth_duplicate_of_matched(
    face: _FrameFace,
    synth_box: tuple[float, float, float, float],
    matched_yolo: list[tuple[tuple[float, float, float, float], float]],
) -> bool:
    """Chỉ gộp synth với YOLO khi mặt nằm trong box YOLO — tránh bbox YOLO rộng nuốt cả đám."""
    for box, _ in matched_yolo:
        if _face_center_in_box(face, box) and _bbox_iou(synth_box, box) >= 0.34:
            return True
    return False


def _yolo_plausible_without_face(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Quay lưng — không thấy mặt nhưng đủ đầu + 1/3 thân trên (tab Đối tượng).

    Chỉ áp đúng tiêu chí nghiệp vụ. Các dải diện tích/tỉ lệ từng thêm ở đây để
    chặn FP thời histogram lại loại cả người đứng gần (bbox lớn) lẫn người đứng
    xa (bbox nhỏ), nên bỏ — FP đã do clutter/silhouette và model mặt lo.
    """
    if background_clutter_person_box(box, frame_w, frame_h):
        return False
    if legs_only_person_box(box, frame_w, frame_h):
        return False
    if not plausible_person_silhouette(box, frame_w, frame_h):
        return False
    return upper_body_third_with_head_visible(box, frame_w, frame_h)


def _box_area_ratio(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> float:
    x1, y1, x2, y2 = box
    return max(0.0, x2 - x1) * max(0.0, y2 - y1) / max(float(frame_w * frame_h), 1.0)


def anchor_patrol_person_boxes_to_faces(
    frame: np.ndarray,
    person_boxes: list[tuple[tuple[float, float, float, float], float]],
    *,
    camera_id: str,
) -> list[tuple[tuple[float, float, float, float], float]]:
    """Ưu tiên mặt YuNet — mỗi mặt một bbox; YOLO chỉ bổ sung quay lưng (đầu+30% thân)."""
    if not camera_id.startswith("HC-"):
        return person_boxes

    faces = _list_frame_faces(frame)
    h, w = frame.shape[:2]
    if not faces:
        return [
            (box, conf)
            for box, conf in person_boxes
            if conf >= BACK_TURN_MIN_CONF and _yolo_plausible_without_face(box, w, h)
        ]

    matched_yolo: list[tuple[tuple[float, float, float, float], float]] = []
    covered_face_indices: set[int] = set()

    for box, conf in person_boxes:
        matching = [
            (idx, face)
            for idx, face in enumerate(faces)
            if _face_center_in_box(face, box)
        ]
        if not matching:
            continue
        for idx, _face in matching:
            covered_face_indices.add(idx)

        if len(matching) > 1:
            for _idx, face in matching:
                synth_box = _person_box_from_face(face, w, h)
                matched_yolo.append((synth_box, _synth_conf_from_face(face)))
            continue

        _idx, face = matching[0]
        area_ratio = _box_area_ratio(box, w, h)
        tight_yolo = (
            upper_body_third_with_head_visible(box, w, h)
            and not legs_only_person_box(box, w, h)
            and area_ratio < 0.28
        )
        if tight_yolo:
            matched_yolo.append((box, conf))
            continue
        synth_box = _person_box_from_face(face, w, h)
        matched_yolo.append((synth_box, _synth_conf_from_face(face)))

    synth_boxes: list[tuple[tuple[float, float, float, float], float]] = []
    for face_index, face in enumerate(faces):
        if face_index in covered_face_indices:
            continue
        synth_box = _person_box_from_face(face, w, h)
        if _synth_duplicate_of_matched(face, synth_box, matched_yolo):
            continue
        synth_boxes.append((synth_box, _synth_conf_from_face(face)))

    back_turn: list[tuple[tuple[float, float, float, float], float]] = []
    existing_boxes = [box for box, _ in matched_yolo + synth_boxes]
    for box, conf in person_boxes:
        if any(_face_center_in_box(face, box) for face in faces):
            continue
        if conf < BACK_TURN_MIN_CONF or not _yolo_plausible_without_face(box, w, h):
            continue
        if any(_bbox_iou(box, other) >= 0.34 for other in existing_boxes):
            continue
        back_turn.append((box, conf))
        existing_boxes.append(box)

    if matched_yolo or synth_boxes or back_turn:
        return _dedupe_anchor_boxes(matched_yolo + synth_boxes + back_turn)

    return _dedupe_anchor_boxes([
        (_person_box_from_face(face, w, h), _synth_conf_from_face(face))
        for face in faces
    ])
