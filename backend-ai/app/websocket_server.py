"""WebSocket detections — payload Module 05 cho Frontend Vifence.

Gom schema push (`/ws/stream/{camera_id}/detections`) tại một chỗ để HTTP poll
và WS dùng chung, tránh lệch bbox pixel vs object-fit trên FE.
"""

from __future__ import annotations

import time
from typing import Any, Mapping

from .detector import (
    count_module05_workers,
    format_module05_detections,
    is_module05_patrol_camera,
)


def _stream_status(stream_online: bool, updated_at: float) -> str:
    if not stream_online:
        return "offline"
    if updated_at <= 0:
        return "waiting"
    return "online"


def build_detections_ws_payload(
    camera_id: str,
    overlay: Mapping[str, Any],
    *,
    stream_online: bool,
    revision: int | None = None,
) -> dict[str, Any]:
    """Tin nhắn WebSocket / HTTP detections — khớp Module 05 + legacy VMS."""
    width = int(overlay.get("width") or 0)
    height = int(overlay.get("height") or 0)
    updated_at = float(overlay.get("updated_at") or 0.0)
    raw_detections = list(overlay.get("detections") or [])

    if is_module05_patrol_camera(camera_id) and width > 0 and height > 0:
        detections = format_module05_detections(raw_detections, width, height)
    else:
        detections = [dict(row) for row in raw_detections]

    total_workers = count_module05_workers(detections)
    status = _stream_status(stream_online, updated_at)

    payload: dict[str, Any] = {
        "type": "detections",
        "camera_id": camera_id,
        "status": status,
        "total_workers": total_workers,
        # FE bắt buộc xóa overlay frame trước — tránh box ma khi camera lia.
        "reset_state": True,
        "width": width,
        "height": height,
        "updated_at": updated_at,
        "detections": detections,
        "vms_ready": stream_online and updated_at > 0,
        "stream_online": stream_online,
        "roi_zones": list(overlay.get("roi_zones") or []),
        "metrics": dict(overlay.get("metrics") or {}),
    }

    if overlay.get("source_pts_sec") is not None:
        payload["source_pts_sec"] = float(overlay["source_pts_sec"])
    if overlay.get("frame_wallclock_ms") is not None:
        payload["frame_wallclock_ms"] = float(overlay["frame_wallclock_ms"])
    if overlay.get("frame_age_sec") is not None:
        payload["frame_age_sec"] = overlay["frame_age_sec"]
    emit_ms = int(time.time() * 1000)
    payload["server_emit_ms"] = emit_ms
    if is_module05_patrol_camera(camera_id):
        from .config import settings

        payload["overlay_lag_hint_ms"] = max(
            0,
            int(round(float(settings.patrol_live_roi_delay_seconds) * 1000.0)),
        )
    if revision is not None:
        payload["revision"] = revision

    return payload
