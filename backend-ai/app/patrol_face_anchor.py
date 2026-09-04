"""HC bodycam — neo bbox YOLO vào mặt YuNet, loại FP vải/tường."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .patrol_person_visibility import (
    _clip_box_to_frame,
    background_clutter_person_box,
    legs_only_person_box,
    plausible_person_silhouette,
    signboard_like_fp_box,
    upper_body_third_with_head_visible,
)

# Quay lưng chỉ cần vượt sàn YOLO bodycam — đặt cao hơn sẽ âm thầm bỏ rơi
# người đủ đầu + 1/3 thân trên mà YOLO chấm 0.30–0.38.
BACK_TURN_MIN_CONF = 0.25

# Một mặt nằm **trong** bbox YOLO thì bbox đó là bằng chứng độc lập, nên đọc mặt
# ở ngưỡng thấp là an toàn. Nhưng một mặt **không** khớp bbox nào lại tự sinh ra
# cả một người: lúc đó nó là bằng chứng duy nhất và phải chịu ngưỡng chặt hơn.
#
# Phân biệt bằng **điểm**, không bằng kích thước. Đo trên HC-01 (phố Hà Nội,
# không có người trong khung) YuNet ở 0.38 trả mặt giả trên biển hiệu và mặt xe
# máy với điểm 0.38–0.46; kích thước của chúng trải từ 14×14 tới 56×76 nên sàn
# kích thước không tách được. Mặt người thật đo trên ảnh công trường chấm
# 0.84–0.94 kể cả khi chỉ còn 19×23 px, nên sàn điểm 0.62 nằm giữa hai cụm.
FACE_SEED_MIN_SCORE = 0.62


@dataclass(frozen=True)
class _FrameFace:
    box: tuple[float, float, float, float]
    score: float


def _face_can_seed_person(face: _FrameFace) -> bool:
    """Mặt này có đủ chắc để **một mình** tạo ra một người trên khung không."""
    return face.score >= FACE_SEED_MIN_SCORE


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


def _bbox_center_distance_norm(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> float:
    acx = (a[0] + a[2]) / 2.0
    acy = (a[1] + a[3]) / 2.0
    bcx = (b[0] + b[2]) / 2.0
    bcy = (b[1] + b[3]) / 2.0
    dx = (acx - bcx) / max(float(frame_w), 1.0)
    dy = (acy - bcy) / max(float(frame_h), 1.0)
    return (dx * dx + dy * dy) ** 0.5


# Sàn tuyệt đối cho box synth — chỉ để bbox không teo xuống dưới mức vẽ được.
# Trước đây sàn là `frame_w * 0.18` / `frame_h * 0.24`, tức 173×130 px trên khung
# 960×540. Sàn theo khung làm kích thước box **độc lập với mặt**: mặt 14 px và
# mặt 66 px nhận cùng một box 173 px, nên mọi mặt nhỏ đều sinh ROI to gấp hàng
# trăm lần vùng bằng chứng và trùm lên vỉa hè / xe máy quanh đó.
_SYNTH_MIN_W_PX = 24.0
_SYNTH_MIN_H_PX = 32.0


def _person_box_from_face(
    face: _FrameFace,
    frame_w: int,
    frame_h: int,
    *,
    narrow: bool = False,
) -> tuple[float, float, float, float]:
    """Box người suy ra từ mặt — tỉ lệ theo **mặt**, không theo kích thước khung."""
    fx1, fy1, fx2, fy2 = face.box
    fw = max(fx2 - fx1, 1.0)
    fh = max(fy2 - fy1, 1.0)
    cx = (fx1 + fx2) / 2.0
    cy = (fy1 + fy2) / 2.0
    if narrow:
        pw = max(fw * 1.85, _SYNTH_MIN_W_PX)
        ph = max(fh * 3.0, _SYNTH_MIN_H_PX)
    else:
        pw = max(fw * 2.6, _SYNTH_MIN_W_PX)
        ph = max(fh * 3.4, _SYNTH_MIN_H_PX)
    raw = (
        cx - pw * 0.5,
        cy - ph * 0.38,
        cx + pw * 0.5,
        cy + ph * 0.62,
    )
    return _clip_box_to_frame(raw, frame_w, frame_h)


def _synth_conf_from_face(face: _FrameFace) -> float:
    return min(0.92, 0.55 + face.score * 0.35)


def _bbox_containment(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    """Tỉ lệ diện tích bbox nhỏ hơn nằm trong giao — bắt nested synth/YOLO trùng người."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter_area = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    smaller = min(area_a, area_b)
    return inter_area / smaller if smaller > 0 else 0.0


def _boxes_overlap(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
    *,
    iou_threshold: float = 0.34,
    containment_threshold: float = 0.46,
) -> bool:
    return (
        _bbox_iou(a, b) >= iou_threshold
        or _bbox_containment(a, b) >= containment_threshold
    )


def _same_person_anchor_box(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    min_center_distance: float = 0.045,
) -> bool:
    """True khi hai bbox có thể cùng một người — chỉ gộp khi gần nhau, không chỉ chạm mép."""
    if frame_w > 0 and frame_h > 0:
        if _bbox_center_distance_norm(a, b, frame_w, frame_h) >= min_center_distance:
            return False
    return _boxes_overlap(a, b)


def _anchor_box_redundant_with(
    candidate: tuple[float, float, float, float],
    existing: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Bỏ bbox YOLO lồng / crowd box khi đã có synth hẹp; vẫn giữ hai người sát nhau."""
    if _bbox_containment(candidate, existing) >= 0.72 or _bbox_containment(existing, candidate) >= 0.72:
        return True
    cand_area = _box_area_ratio(candidate, frame_w, frame_h)
    exist_area = _box_area_ratio(existing, frame_w, frame_h)
    if cand_area >= exist_area:
        larger, smaller, large_area, small_area = candidate, existing, cand_area, exist_area
    else:
        larger, smaller, large_area, small_area = existing, candidate, exist_area, cand_area
    if large_area >= 0.28 and small_area <= large_area * 0.62:
        if _boxes_overlap(
            larger,
            smaller,
            iou_threshold=0.12,
            containment_threshold=0.38,
        ):
            return True
    return _same_person_anchor_box(candidate, existing, frame_w, frame_h)


def _dedupe_anchor_boxes(
    boxes: list[tuple[tuple[float, float, float, float], float]],
    *,
    frame_w: int = 0,
    frame_h: int = 0,
    iou_threshold: float = 0.34,
    containment_threshold: float = 0.46,
    min_center_distance: float = 0.055,
) -> list[tuple[tuple[float, float, float, float], float]]:
    if len(boxes) <= 1:
        return boxes
    ranked = sorted(
        boxes,
        key=lambda item: max(1.0, (item[0][2] - item[0][0]) * (item[0][3] - item[0][1])),
        reverse=True,
    )
    kept: list[tuple[tuple[float, float, float, float], float]] = []
    for candidate_box, candidate_conf in ranked:
        dominated = False
        for kept_box, _ in kept:
            if frame_w > 0 and frame_h > 0:
                if _bbox_center_distance_norm(candidate_box, kept_box, frame_w, frame_h) >= min_center_distance:
                    continue
            if _boxes_overlap(
                candidate_box,
                kept_box,
                iou_threshold=iou_threshold,
                containment_threshold=containment_threshold,
            ):
                dominated = True
                break
        if dominated:
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
        if _face_center_in_box(face, box) and _boxes_overlap(synth_box, box):
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
    from .patrol_person_visibility import vertical_structure_fp_box

    if vertical_structure_fp_box(box, frame_w, frame_h):
        return False
    if signboard_like_fp_box(box, frame_w, frame_h):
        return False
    if background_clutter_person_box(box, frame_w, frame_h):
        return False
    if legs_only_person_box(box, frame_w, frame_h):
        return False
    if not plausible_person_silhouette(box, frame_w, frame_h):
        return False
    from .patrol_person_visibility import patrol_person_meets_display_gate

    if patrol_person_meets_display_gate(box, frame_w, frame_h):
        return True
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
    if not (camera_id.startswith("HC-") or camera_id.startswith("DR-")):
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
        if legs_only_person_box(box, w, h):
            continue
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
                synth_box = _person_box_from_face(face, w, h, narrow=True)
                if legs_only_person_box(synth_box, w, h):
                    continue
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
        if legs_only_person_box(synth_box, w, h):
            continue
        matched_yolo.append((synth_box, _synth_conf_from_face(face)))

    synth_boxes: list[tuple[tuple[float, float, float, float], float]] = []
    for face_index, face in enumerate(faces):
        if face_index in covered_face_indices:
            continue
        if not _face_can_seed_person(face):
            continue
        synth_box = _person_box_from_face(face, w, h)
        if legs_only_person_box(synth_box, w, h):
            continue
        if _synth_duplicate_of_matched(face, synth_box, matched_yolo):
            continue
        if any(
            _same_person_anchor_box(synth_box, other, w, h)
            for other in [box for box, _ in matched_yolo]
        ):
            continue
        synth_boxes.append((synth_box, _synth_conf_from_face(face)))

    back_turn: list[tuple[tuple[float, float, float, float], float]] = []
    existing_boxes = [box for box, _ in matched_yolo + synth_boxes]
    for box, conf in person_boxes:
        if any(_face_center_in_box(face, box) for face in faces):
            continue
        if conf < BACK_TURN_MIN_CONF or not _yolo_plausible_without_face(box, w, h):
            continue
        if any(_anchor_box_redundant_with(box, other, w, h) for other in existing_boxes):
            continue
        back_turn.append((box, conf))
        existing_boxes.append(box)

    # Silhouette YOLO không khớp mặt / quay lưng — vẫn giữ nếu đủ conf (đám đông).
    silhouette_keep: list[tuple[tuple[float, float, float, float], float]] = []
    for box, conf in person_boxes:
        if any(
            _anchor_box_redundant_with(box, other, w, h)
            for other in existing_boxes
        ):
            continue
        if conf < BACK_TURN_MIN_CONF:
            continue
        if background_clutter_person_box(box, w, h):
            continue
        if signboard_like_fp_box(box, w, h):
            continue
        if legs_only_person_box(box, w, h):
            continue
        if not plausible_person_silhouette(box, w, h):
            continue
        silhouette_keep.append((box, conf))
        existing_boxes.append(box)

    if matched_yolo or synth_boxes or back_turn or silhouette_keep:
        return _dedupe_anchor_boxes(
            matched_yolo + synth_boxes + back_turn + silhouette_keep,
            frame_w=w,
            frame_h=h,
        )

    return _dedupe_anchor_boxes(
        [
            (_person_box_from_face(face, w, h), _synth_conf_from_face(face))
            for face in faces
            if _face_can_seed_person(face)
        ],
        frame_w=w,
        frame_h=h,
    )
