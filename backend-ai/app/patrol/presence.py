"""Presence tuần tra — gộp/tách lượt gặp theo GPS + thời gian."""

from __future__ import annotations

import json
import math
from typing import Any

# Mặc định — override qua config nếu có.
T_MAX_SEC_DEFAULT = 600.0
D_MERGE_M_DEFAULT = 50.0
GAP_FALLBACK_SEC = 45.0


def _settings() -> Any:
    from ..config import settings

    return settings


def presence_t_max_sec() -> float:
    return float(getattr(_settings(), "patrol_presence_t_max_sec", T_MAX_SEC_DEFAULT))


def presence_d_merge_m() -> float:
    return float(getattr(_settings(), "patrol_presence_d_merge_m", D_MERGE_M_DEFAULT))


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Khoảng cách mét giữa hai điểm WGS84."""
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _gps_pair(row: Any) -> tuple[float | None, float | None]:
    lat = row["gps_lat_end"] if "gps_lat_end" in row.keys() else None
    lng = row["gps_lng_end"] if "gps_lng_end" in row.keys() else None
    if lat is None and "gps_lat" in row.keys():
        lat = row["gps_lat"]
    if lng is None and "gps_lng" in row.keys():
        lng = row["gps_lng"]
    if lat is None or lng is None:
        return None, None
    try:
        return float(lat), float(lng)
    except (TypeError, ValueError):
        return None, None


def should_extend_presence(
    row: Any,
    ts: float,
    gps_lat: float | None,
    gps_lng: float | None,
    *,
    camera_id: str,
    t_max_sec: float | None = None,
    d_merge_m: float | None = None,
) -> bool:
    """Cùng chỗ / che khuất ngắn → gộp 1 lượt; xa GPS hoặc quá T_max → lượt mới."""
    t_max = t_max_sec if t_max_sec is not None else presence_t_max_sec()
    d_merge = d_merge_m if d_merge_m is not None else presence_d_merge_m()
    ended = float(row["ended_at"])
    gap = ts - ended
    if gap > t_max:
        return False

    last_lat, last_lng = _gps_pair(row)
    has_current = (
        gps_lat is not None
        and gps_lng is not None
        and not (gps_lat == 0 and gps_lng == 0)
    )
    has_last = last_lat is not None and last_lng is not None

    if has_current and has_last:
        dist = haversine_m(last_lat, last_lng, float(gps_lat), float(gps_lng))
        return dist <= d_merge

    # Không GPS: giữ hành vi cũ theo camera + gap ngắn (test / indoor).
    prev_cam = str(row["camera_id"] or "")
    if prev_cam != camera_id:
        return False
    return gap <= GAP_FALLBACK_SEC


def merge_source_cameras(existing: str | None, camera_id: str) -> str:
    cams: list[str] = []
    if existing:
        try:
            parsed = json.loads(existing)
            if isinstance(parsed, list):
                cams = [str(c) for c in parsed if c]
        except (json.JSONDecodeError, TypeError):
            cams = []
    if camera_id and camera_id not in cams:
        cams.append(camera_id)
    return json.dumps(cams)


def parse_source_cameras(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(c) for c in parsed if c]
    except (json.JSONDecodeError, TypeError):
        pass
    return []
