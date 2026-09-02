"""Runtime config Module 05 — đồng bộ FE (ROI lag, server clock)."""

from __future__ import annotations

import time
from typing import Any

from ..config import settings


def patrol_runtime_payload() -> dict[str, Any]:
    delay_ms = max(0, int(round(float(settings.patrol_live_roi_delay_seconds) * 1000.0)))
    now_ms = int(time.time() * 1000)
    return {
        "live_roi_delay_ms": delay_ms,
        "overlay_pipeline_lag_ms": delay_ms,
        "server_time_ms": now_ms,
    }
