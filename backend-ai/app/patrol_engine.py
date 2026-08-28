"""Patrol-only inference — YOLO person + track. Không chạy pipeline PPE/vi phạm mũ."""

from __future__ import annotations

import numpy as np

from .ppe_analyzer import (
    _build_patrol_bodycam_result,
    _build_patrol_flycam_result,
    _is_helmet_bodycam,
    _is_patrol_flycam,
    reset_all_hc_patrol_state,
    reset_hc_patrol_face_assignments,
)


def analyze_patrol_frame(
    frame: np.ndarray,
    camera_id: str,
    *,
    source_pts_sec: float | None = None,
) -> dict:
    """HC-* bodycam hoặc DR-* flycam — person-only, ghi sự kiện qua patrol/sink."""
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
        return result
    return _build_patrol_bodycam_result(frame, camera_id, source_pts_sec=source_pts_sec)


class PatrolEngine:
    """VMS / mobile HC-* & DR-* — person detect, identity, heatmap drone."""

    def reset_camera(self, camera_id: str) -> None:
        from .patrol_identity_lifecycle import reset as reset_identity_lifecycle
        from .patrol_tracker import reset_patrol_trackers

        reset_patrol_trackers(camera_id)
        reset_identity_lifecycle(camera_id)
        reset_hc_patrol_face_assignments(camera_id)

    def process_frame(
        self,
        frame: np.ndarray,
        camera_id: str,
        *,
        capture_frame: np.ndarray | None = None,
        source_pts_sec: float | None = None,
    ) -> tuple[dict, list]:
        _ = capture_frame
        result = analyze_patrol_frame(
            frame,
            camera_id,
            source_pts_sec=source_pts_sec,
        )
        return result, []


patrol_engine = PatrolEngine()

# Giữ alias cũ cho script/test import từ ppe_analyzer.
analyze_patrol_person_frame = analyze_patrol_frame

__all__ = [
    "PatrolEngine",
    "analyze_patrol_frame",
    "analyze_patrol_person_frame",
    "patrol_engine",
    "reset_all_hc_patrol_state",
]
