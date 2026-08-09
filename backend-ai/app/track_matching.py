"""Gán track ổn định theo IoU — tránh log trùng khi người di chuyển qua ô lưới."""

from __future__ import annotations


def bbox_iou(a: list[float] | tuple[float, ...], b: list[float] | tuple[float, ...]) -> float:
    ax1, ay1, ax2, ay2 = a[0], a[1], a[2], a[3]
    bx1, by1, bx2, by2 = b[0], b[1], b[2], b[3]
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


def _bbox_center(bbox: list[float] | tuple[float, ...]) -> tuple[float, float]:
    return (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2


def _person_slot(person_bbox: list[float], frame_w: int, frame_h: int) -> str:
    cx, cy = _bbox_center(person_bbox)
    gx = min(7, int(cx / max(frame_w / 8, 1)))
    gy = min(5, int(cy / max(frame_h / 6, 1)))
    return f"p{gy}{gx}"


def match_person_track_id(
    person_bbox: list[float],
    tracks: dict[str, object],
    *,
    behavior: str,
    iou_threshold: float = 0.2,
) -> str | None:
    suffix = f":{behavior}"
    best_tid: str | None = None
    best_iou = iou_threshold
    for track_id, state in tracks.items():
        if not track_id.endswith(suffix):
            continue
        pb = getattr(state, "person_bbox", None)
        if not pb or len(pb) < 4:
            continue
        iou = bbox_iou(person_bbox, pb)
        if iou > best_iou:
            best_iou = iou
            best_tid = track_id
    return best_tid


def assign_person_track_id(
    person_bbox: list[float],
    tracks: dict[str, object],
    *,
    behavior: str,
    frame_w: int,
    frame_h: int,
    max_tracks: int,
) -> str | None:
    matched = match_person_track_id(person_bbox, tracks, behavior=behavior)
    if matched:
        return matched
    if len(tracks) >= max_tracks:
        return None
    slot = _person_slot(person_bbox, frame_w, frame_h)
    return f"{slot}:{behavior}"
