"""Patrol-only inference — YOLO person + track. Không chạy pipeline PPE/vi phạm mũ."""

from __future__ import annotations

import numpy as np

from .ppe_analyzer import (
    _build_patrol_bodycam_result,
    _build_patrol_flycam_result,
    _is_helmet_bodycam,
    _is_patrol_flycam,
)


class PatrolEngine:
    """VMS / mobile HC-* & DR-* — person detect, identity, heatmap drone."""

    def process_frame(
        self,
        frame: np.ndarray,
        camera_id: str,
        *,
        capture_frame: np.ndarray | None = None,
        source_pts_sec: float | None = None,
    ) -> tuple[dict, list]:
        _ = capture_frame
        if _is_patrol_flycam(camera_id):
            result = _build_patrol_flycam_result(
                frame, camera_id, source_pts_sec=source_pts_sec,
            )
            from .drone_heatmap import ingest_drone_detections

            ingest_drone_detections(
                camera_id,
                int(result.get("width") or frame.shape[1]),
                int(result.get("height") or frame.shape[0]),
                result.get("detections") or [],
                metrics=result.get("metrics") or {},
            )
        elif _is_helmet_bodycam(camera_id):
            result = _build_patrol_bodycam_result(
                frame, camera_id, source_pts_sec=source_pts_sec,
            )
        else:
            result = _build_patrol_bodycam_result(
                frame, camera_id, source_pts_sec=source_pts_sec,
            )
        return result, []


patrol_engine = PatrolEngine()
