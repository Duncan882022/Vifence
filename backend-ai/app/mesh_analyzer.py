"""Mesh cover analyzer stub — BPTC-001 (Lưới bao che).

Phase 1: stub, chưa có model YOLO train.
Sẽ dùng model `safety_mesh_cover` khi đủ seed data (150–300 ảnh, task auto_train).

Behavior map:
  mesh_missing → BPTC-001 (Coverage < 60% zone)
  mesh_torn    → BPTC-001 (Panel detect + gap contour heuristic)
  mesh_dirty   → BPTC-001 (Panel detect + HSV deviation từ baseline xanh)
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from .auto_train.inference import predict_boxes
from .schemas import RoadDetection  # reuse schema shape

logger = logging.getLogger("mesh_analyzer")

# Ngưỡng confidence inference (lowered khi model mới train, chưa fine-tune)
_MESH_CONF_THRESHOLD = 0.50

# HSV range màu xanh lưới bao che (tuỳ chỉnh theo site)
_MESH_HUE_LOW = 38
_MESH_HUE_HIGH = 92
_MESH_SAT_MIN = 50
_MESH_VAL_MIN = 50


def analyze_mesh_frame(
    frame: np.ndarray,
    camera_id: str = "A-05",
    zone_polygon: Optional[list[dict]] = None,
) -> list[RoadDetection]:
    """Phân tích lưới bao che trong frame.

    Hiện tại: stub trả về list rỗng (chờ model train xong).
    Khi có model: gọi predict_boxes("safety_mesh_cover", frame).
    """
    # Phase 1 stub — model chưa train
    boxes = predict_boxes("safety_mesh_cover", frame, conf=_MESH_CONF_THRESHOLD)
    if not boxes:
        return []

    results: list[RoadDetection] = []
    for cls_name, conf, x1, y1, x2, y2 in boxes:
        behavior = cls_name  # "mesh_cover" | "mesh_missing" | "mesh_torn" | "mesh_dirty"
        scenario_id = "BPTC-001"
        label_map = {
            "mesh_cover": "Lưới bao che OK",
            "mesh_missing": "Lưới bao che thiếu/hở",
            "mesh_torn": "Lưới bao che bị rách",
            "mesh_dirty": "Lưới bao che bẩn",
        }
        label = label_map.get(behavior, behavior)
        if behavior == "mesh_cover":
            # Không log sự kiện khi lưới OK
            continue

        results.append(
            RoadDetection(
                behavior=behavior,
                label=label,
                scenario_id=scenario_id,
                confidence=conf,
                bbox=[x1, y1, x2, y2],
            )
        )

    return results
