"""Tiện ích chung — downscale frame mobile + scale bbox về kích thước gốc."""

from __future__ import annotations

from collections.abc import Callable

import cv2
import numpy as np


def downscale_for_mobile(frame: np.ndarray, max_width: int = 640) -> np.ndarray:
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / w
    return cv2.resize(frame, (max_width, int(h * scale)), interpolation=cv2.INTER_AREA)


def scale_result_to_frame(result: dict, frame: np.ndarray, small: np.ndarray) -> dict:
    """Scale detections/events bbox từ `small` về kích thước `frame`."""
    sw, sh = small.shape[1], small.shape[0]
    ow, oh = frame.shape[1], frame.shape[0]
    if sw == ow and sh == oh:
        result["width"] = ow
        result["height"] = oh
        return result

    sx, sy = ow / sw, oh / sh
    scaled_detections = []
    for d in result.get("detections", []):
        x1, y1, x2, y2 = d["bbox"]
        patch = {**d, "bbox": [x1 * sx, y1 * sy, x2 * sx, y2 * sy]}
        sub = d.get("subject_bbox")
        if sub and len(sub) >= 4:
            sx1, sy1, sx2, sy2 = sub
            patch["subject_bbox"] = [sx1 * sx, sy1 * sy, sx2 * sx, sy2 * sy]
        scaled_detections.append(patch)
    result["detections"] = scaled_detections

    scaled_events = []
    for e in result.get("events", []):
        patch = dict(e)
        if "bbox" in patch and len(patch["bbox"]) >= 4:
            x1, y1, x2, y2 = patch["bbox"]
            patch["bbox"] = [x1 * sx, y1 * sy, x2 * sx, y2 * sy]
        if patch.get("subject_bbox") and len(patch["subject_bbox"]) >= 4:
            x1, y1, x2, y2 = patch["subject_bbox"]
            patch["subject_bbox"] = [x1 * sx, y1 * sy, x2 * sx, y2 * sy]
        if patch.get("related_bbox") and len(patch["related_bbox"]) >= 4:
            x1, y1, x2, y2 = patch["related_bbox"]
            patch["related_bbox"] = [x1 * sx, y1 * sy, x2 * sx, y2 * sy]
        patch["frame_width"] = ow
        patch["frame_height"] = oh
        scaled_events.append(patch)
    result["events"] = scaled_events
    result["width"] = ow
    result["height"] = oh
    return result


def analyze_engine_frame(
    frame: np.ndarray,
    camera_id: str,
    process_fn: Callable[[np.ndarray, str], tuple[dict, object]],
    *,
    max_width: int = 640,
    after_process: Callable[[np.ndarray, dict], None] | None = None,
) -> dict:
    small = downscale_for_mobile(frame, max_width=max_width)
    result, _ = process_fn(small, camera_id, capture_frame=frame)
    if after_process is not None:
        after_process(small, result)
    return scale_result_to_frame(result, frame, small)
