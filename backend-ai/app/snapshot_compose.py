"""Ghép snapshot sự kiện: RAW | ROI + mã kịch bản ngắn (đồng bộ FE roiOverlayCode)."""

from __future__ import annotations

import re

import cv2
import numpy as np

from .machinery_detector import MACHINERY_LABELS

BEHAVIOR_ROI_CODE: dict[str, str] = {
    "person": "NV",
    "unknown": "?",
    "hard_hat": "PPE+",
    "safety_vest": "PPE+",
    "safety_shoes": "PPE+",
    "no_helmet": "PPE-001",
    "no_vest": "PPE-002",
    "no_shoes": "PPE-003",
    "safety_harness": "WAH+",
    "no_harness": "WAH-001",
    "crane": "Máy thi công",
    "crane_green": "Máy xúc",
    "sany_drill": "Máy khoan",
    "excavator_orange": "Máy khoan",
    "tower_crane": "Máy cẩu tháp",
    "road_roller": "Xe lăn đường",
    "dump_truck": "Xe tải ben",
    "forklift": "Xe nâng",
    "machinery": "Máy thi công",
    "crane_proximity": "DZ-003",
    "vehicle": "ATGT",
    "speeding": "ATGT-002",
    "hard_median": "LÀN+",
    "soft_median": "LÀN+",
    "no_soft_median": "ATGT-004",
    "smoking": "PCCC-001",
    "fire": "PCCC-002",
    "mud": "BPTC-007",
    "water": "BPTC-008",
    "object": "BPTC-009",
    "mesh_missing": "BPTC-001",
    "mesh_torn": "BPTC-001",
    "mesh_dirty": "BPTC-001",
}

_SCENARIO_CODE = re.compile(r"^[A-Z]+-\d{3}$")

VIOLATION_BEHAVIORS = frozenset({
    "smoking",
    "fire",
    "no_harness",
    "crane_proximity",
    "speeding",
    "no_soft_median",
    "mud",
    "water",
    "object",
    "mesh_missing",
    "mesh_torn",
    "mesh_dirty",
})


def is_atld_violation_behavior(behavior: str) -> bool:
    if behavior.startswith("no_"):
        return True
    return behavior in VIOLATION_BEHAVIORS


def draw_dashed_rectangle(
    frame: np.ndarray,
    pt1: tuple[int, int],
    pt2: tuple[int, int],
    color: tuple[int, int, int],
    thickness: int = 1,
    dash_len: int = 8,
    gap_len: int = 6,
) -> None:
    x1, y1 = pt1
    x2, y2 = pt2
    if x2 <= x1 or y2 <= y1:
        return

    def _dash_line(ax: int, ay: int, bx: int, by: int) -> None:
        length = max(int(((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5), 1)
        dx = (bx - ax) / length
        dy = (by - ay) / length
        pos = 0.0
        draw = True
        while pos < length:
            seg = min(dash_len if draw else gap_len, length - pos)
            x_start = int(ax + dx * pos)
            y_start = int(ay + dy * pos)
            x_end = int(ax + dx * (pos + seg))
            y_end = int(ay + dy * (pos + seg))
            if draw:
                cv2.line(frame, (x_start, y_start), (x_end, y_end), color, thickness, cv2.LINE_AA)
            pos += seg
            draw = not draw

    _dash_line(x1, y1, x2, y1)
    _dash_line(x2, y1, x2, y2)
    _dash_line(x2, y2, x1, y2)
    _dash_line(x1, y2, x1, y1)


def draw_atld_roi_box(
    frame: np.ndarray,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    color: tuple[int, int, int],
    behavior: str,
    *,
    thickness: int = 2,
) -> None:
    """Vi phạm ATLĐ — viền liền; thông tin (người/máy/đạt chuẩn) — viền đứt."""
    if is_atld_violation_behavior(behavior):
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)
    else:
        draw_dashed_rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            color,
            thickness=max(1, thickness - 1),
        )


def format_snapshot_code(
    behavior: str,
    scenario_id: str | None = None,
    *,
    machine_kind: str | None = None,
) -> str:
    sid = (scenario_id or "").strip()
    if sid and _SCENARIO_CODE.match(sid):
        return sid
    if behavior == "crane" and machine_kind:
        return MACHINERY_LABELS.get(machine_kind, BEHAVIOR_ROI_CODE.get("crane", "Máy thi công"))
    if machine_kind and machine_kind in BEHAVIOR_ROI_CODE:
        return BEHAVIOR_ROI_CODE[machine_kind]
    return BEHAVIOR_ROI_CODE.get(behavior, behavior[:10].upper() or "?")


def format_snapshot_badge(code: str, confidence: float, suffix: str = "") -> str:
    pct = f"{confidence * 100:.0f}%"
    base = f"{code} {pct}"
    return f"{base}{suffix}" if suffix else base


def merge_bboxes(boxes: list[list[float]]) -> list[float] | None:
    valid = [b for b in boxes if b and len(b) >= 4]
    if not valid:
        return None
    return [
        min(b[0] for b in valid),
        min(b[1] for b in valid),
        max(b[2] for b in valid),
        max(b[3] for b in valid),
    ]


def _focus_crop_profile(behavior: str) -> tuple[float, int, float]:
    """margin_ratio, min_side_px, max_frame_ratio — crop vùng vi phạm trên snapshot."""
    if behavior in {"fire", "smoking"}:
        return 1.35, 220, 0.42
    if behavior in {"mesh_missing", "mesh_torn", "mesh_dirty"}:
        return 0.12, 96, 0.34
    if behavior.startswith("no_"):
        return 0.55, 180, 0.55
    return 0.45, 160, 0.55


def focus_crop_bounds(
    bbox: list[float],
    frame_w: int,
    frame_h: int,
    *,
    behavior: str = "",
) -> tuple[int, int, int, int]:
    """Crop snapshot quanh bbox vi phạm — tránh ảnh full-frame khi lửa/hút thuốc rất nhỏ."""
    margin_ratio, min_side, max_ratio = _focus_crop_profile(behavior)
    x1, y1, x2, y2 = (float(v) for v in bbox[:4])
    bw = max(x2 - x1, 8.0)
    bh = max(y2 - y1, 8.0)
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0

    pad_x = max(bw * margin_ratio, min_side * 0.42)
    pad_y = max(bh * margin_ratio, min_side * 0.42)
    crop_w = min(max(bw + pad_x * 2, min_side), frame_w * max_ratio)
    crop_h = min(max(bh + pad_y * 2, min_side), frame_h * max_ratio)

    ix1 = int(max(0, min(cx - crop_w / 2, frame_w - crop_w)))
    iy1 = int(max(0, min(cy - crop_h / 2, frame_h - crop_h)))
    ix2 = int(min(frame_w, ix1 + crop_w))
    iy2 = int(min(frame_h, iy1 + crop_h))
    if ix2 - ix1 < 24 or iy2 - iy1 < 24:
        return 0, 0, frame_w, frame_h
    return ix1, iy1, ix2, iy2


def crop_to_focus(
    frame: np.ndarray,
    bbox: list[float] | None,
    *,
    behavior: str = "",
) -> np.ndarray:
    if not bbox or len(bbox) < 4:
        return frame
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = focus_crop_bounds(bbox, w, h, behavior=behavior)
    if x2 <= x1 or y2 <= y1:
        return frame
    return frame[y1:y2, x1:x2].copy()


def compose_violation_snapshot(
    raw: np.ndarray,
    annotated: np.ndarray,
    *,
    scenario_id: str,
    behavior: str = "",
    focus_bbox: list[float] | None = None,
) -> np.ndarray:
    """Ảnh lưu sự kiện: crop vùng vi phạm + bbox ROI (mã trên bbox — không header bundle)."""
    h, w = raw.shape[:2]
    roi = annotated if annotated.shape[:2] == (h, w) else cv2.resize(annotated, (w, h))
    if focus_bbox and len(focus_bbox) >= 4:
        roi = crop_to_focus(roi, focus_bbox, behavior=behavior)
    return roi
