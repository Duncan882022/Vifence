"""Drone DR-* — tích lũy mật độ person trên lưới pixel + render JET định kỳ."""

from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HEATMAP_DIR = DATA_DIR / "heatmap"

GRID_H = 180
GRID_W = 320
DECAY_PER_FRAME = 0.995
RENDER_INTERVAL_SEC = 30.0
GAUSSIAN_KSIZE = 21

_lock = threading.Lock()
_states: dict[str, dict[str, Any]] = {}


def _camera_state(camera_id: str) -> dict[str, Any]:
    if camera_id not in _states:
        (HEATMAP_DIR / camera_id).mkdir(parents=True, exist_ok=True)
        _states[camera_id] = {
            "matrix": np.zeros((GRID_H, GRID_W), dtype=np.float32),
            "last_render": 0.0,
            "latest_png": None,
            "frame_person_count": 0,
            "track_count": 0,
            "updated_at": 0.0,
        }
    return _states[camera_id]


def ingest_drone_detections(
    camera_id: str,
    frame_w: int,
    frame_h: int,
    detections: list[dict[str, Any]],
    *,
    metrics: dict[str, Any] | None = None,
) -> None:
    if frame_w <= 0 or frame_h <= 0:
        return

    with _lock:
        st = _camera_state(camera_id)
        st["matrix"] *= DECAY_PER_FRAME

        for row in detections:
            if row.get("behavior") != "person":
                continue
            bbox = row.get("bbox") or row.get("subject_bbox")
            if not bbox or len(bbox) < 4:
                continue
            x1, y1, x2, y2 = (float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3]))
            cx = (x1 + x2) / 2.0
            cy = (y1 + y2) / 2.0
            mx = int(min(GRID_W - 1, max(0, cx / frame_w * GRID_W)))
            my = int(min(GRID_H - 1, max(0, cy / frame_h * GRID_H)))
            conf = float(row.get("confidence") or 0.5)
            st["matrix"][my, mx] += max(0.5, conf)

        if metrics:
            st["frame_person_count"] = int(
                metrics.get("frame_person_count") or metrics.get("person_count") or 0,
            )
            st["track_count"] = int(metrics.get("track_count") or st["frame_person_count"])
        st["updated_at"] = time.time()

        now = time.time()
        if now - float(st["last_render"]) >= RENDER_INTERVAL_SEC:
            _render_png(camera_id, st)
            st["last_render"] = now


def _render_png(camera_id: str, st: dict[str, Any]) -> None:
    matrix = st["matrix"]
    if float(matrix.max()) <= 0:
        return
    blur = cv2.GaussianBlur(matrix, (GAUSSIAN_KSIZE, GAUSSIAN_KSIZE), 0)
    norm = blur / max(float(blur.max()), 1e-6)
    img_u8 = (norm * 255).astype(np.uint8)
    colored = cv2.applyColorMap(img_u8, cv2.COLORMAP_JET)
    out_path = HEATMAP_DIR / camera_id / "latest.png"
    cv2.imwrite(str(out_path), colored)
    st["latest_png"] = str(out_path)


def get_drone_heatmap_metrics(camera_id: str) -> dict[str, Any]:
    with _lock:
        st = _camera_state(camera_id)
        return {
            "camera_id": camera_id,
            "frame_person_count": int(st["frame_person_count"]),
            "track_count": int(st["track_count"]),
            "person_count": int(st["track_count"]),
            "updated_at": float(st["updated_at"]),
        }


def get_drone_heatmap_png_path(camera_id: str) -> Path | None:
    with _lock:
        st = _camera_state(camera_id)
        cached = st.get("latest_png")
        if cached and Path(cached).is_file():
            return Path(cached)
    fallback = HEATMAP_DIR / camera_id / "latest.png"
    return fallback if fallback.is_file() else None


def reset_drone_heatmap(camera_id: str | None = None) -> None:
    with _lock:
        if camera_id:
            _states.pop(camera_id, None)
            return
        _states.clear()
