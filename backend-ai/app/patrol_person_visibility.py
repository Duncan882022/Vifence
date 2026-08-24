"""Tiêu chí hiển thị / đếm patrol person — thân trên + đầu trong khung."""

from __future__ import annotations


def _clip_box_to_frame(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = box
    return (
        max(0.0, min(float(frame_w), x1)),
        max(0.0, min(float(frame_h), y1)),
        max(0.0, min(float(frame_w), x2)),
        max(0.0, min(float(frame_h), y2)),
    )


def zone_visible_ratio(
    zone: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> float:
    """Tỷ lệ chiều cao vùng còn nằm trong khung hình (0–1)."""
    _zx1, zy1, _zx2, zy2 = zone
    raw_h = max(zy2 - zy1, 1.0)
    _cx1, cy1, _cx2, cy2 = _clip_box_to_frame(zone, frame_w, frame_h)
    if cy2 <= cy1:
        return 0.0
    return (cy2 - cy1) / raw_h


def upper_body_third_with_head_visible(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    upper_frac: float = 0.50,
    head_frac: float = 0.24,
    min_visible: float = 0.33,
    min_upper_px_frac: float = 0.08,
    min_head_px_frac: float = 0.04,
) -> bool:
    """Đối tượng patrol — cần ≥1/3 thân trên (vùng có đầu) còn trong khung."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    head = (x1 + pw * 0.10, y1, x2 - pw * 0.10, y1 + ph * head_frac)
    upper = (x1 + pw * 0.05, y1, x2 - pw * 0.05, y1 + ph * upper_frac)

    head_vis = zone_visible_ratio(head, frame_w, frame_h)
    upper_vis = zone_visible_ratio(upper, frame_w, frame_h)
    if head_vis < min_visible or upper_vis < min_visible:
        return False

    # Loại bbox thân dưới/chân — “đầu” giả ở mép trên bbox (YOLO chỉ bắt chân).
    visible_upper_h = upper_vis * ph * upper_frac
    visible_head_h = head_vis * ph * head_frac
    if visible_upper_h < frame_h * min_upper_px_frac:
        return False
    if visible_head_h < frame_h * min_head_px_frac:
        return False

    y1_ratio = y1 / max(float(frame_h), 1.0)
    bh_ratio = ph / max(float(frame_h), 1.0)
    if y1_ratio > 0.62 and bh_ratio < 0.18:
        return False

    return True
