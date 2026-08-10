"""Gán track ổn định theo IoU — mỗi người một track, không gộp log khi đi sát nhau."""

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


def _center_distance_norm(
    a: list[float] | tuple[float, ...],
    b: list[float] | tuple[float, ...],
    frame_w: int,
    frame_h: int,
) -> float:
    acx, acy = _bbox_center(a)
    bcx, bcy = _bbox_center(b)
    return (
        ((acx - bcx) / max(frame_w, 1)) ** 2 + ((acy - bcy) / max(frame_h, 1)) ** 2
    ) ** 0.5


def _person_slot(person_bbox: list[float], frame_w: int, frame_h: int) -> str:
    cx, cy = _bbox_center(person_bbox)
    gx = min(7, int(cx / max(frame_w / 8, 1)))
    gy = min(5, int(cy / max(frame_h / 6, 1)))
    return f"p{gy}{gx}"


def _person_subslot(person_bbox: list[float], frame_w: int, frame_h: int) -> str:
    cx, cy = _bbox_center(person_bbox)
    cell_w = max(frame_w / 8, 1)
    cell_h = max(frame_h / 6, 1)
    sx = min(3, int((cx % cell_w) / max(cell_w / 4, 1)))
    sy = min(3, int((cy % cell_h) / max(cell_h / 4, 1)))
    return f"{sy}{sx}"


def match_person_track_id(
    person_bbox: list[float],
    tracks: dict[str, object],
    *,
    behavior: str,
    frame_w: int,
    frame_h: int,
    iou_threshold: float = 0.28,
    blocked_tracks: set[str] | None = None,
) -> str | None:
    suffix = f":{behavior}"
    blocked = blocked_tracks or set()
    best_tid: str | None = None
    best_iou = iou_threshold
    for track_id, state in tracks.items():
        if not track_id.endswith(suffix) or track_id in blocked:
            continue
        pb = getattr(state, "person_bbox", None)
        if not pb or len(pb) < 4:
            continue
        iou = bbox_iou(person_bbox, pb)
        if iou <= best_iou:
            continue
        if _center_distance_norm(person_bbox, pb, frame_w, frame_h) > 0.14:
            continue
        best_iou = iou
        best_tid = track_id
    return best_tid


def _allocate_person_track_id(
    person_bbox: list[float],
    tracks: dict[str, object],
    *,
    behavior: str,
    frame_w: int,
    frame_h: int,
    blocked_tracks: set[str] | None = None,
) -> str:
    blocked = blocked_tracks or set()
    slot = _person_slot(person_bbox, frame_w, frame_h)
    sub = _person_subslot(person_bbox, frame_w, frame_h)
    base = f"{slot}:{behavior}"
    candidates = [f"{base}:{sub}", base]
    for cand in candidates:
        if cand in blocked:
            continue
        if cand not in tracks:
            return cand
        existing = getattr(tracks[cand], "person_bbox", None)
        if existing and bbox_iou(person_bbox, existing) >= 0.22:
            return cand
    n = 2
    while True:
        cand = f"{base}:u{n}"
        n += 1
        if cand in blocked:
            continue
        if cand not in tracks:
            return cand
        existing = getattr(tracks[cand], "person_bbox", None)
        if existing and bbox_iou(person_bbox, existing) >= 0.22:
            return cand


def assign_person_track_id(
    person_bbox: list[float],
    tracks: dict[str, object],
    *,
    behavior: str,
    frame_w: int,
    frame_h: int,
    max_tracks: int,
    blocked_tracks: set[str] | None = None,
) -> str | None:
    matched = match_person_track_id(
        person_bbox,
        tracks,
        behavior=behavior,
        frame_w=frame_w,
        frame_h=frame_h,
        blocked_tracks=blocked_tracks,
    )
    if matched:
        return matched
    if len(tracks) >= max_tracks:
        return None
    return _allocate_person_track_id(
        person_bbox,
        tracks,
        behavior=behavior,
        frame_w=frame_w,
        frame_h=frame_h,
        blocked_tracks=blocked_tracks,
    )
