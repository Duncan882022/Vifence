"""
GPS tuần tra — neo tại tâm Cầu Sông Hốt, delta thiết bị mô phỏng di chuyển trong polygon.

Mirror FE: src/modules/module05-productivity/utils/positionEngine.ts (mapRelativeGpsToSite).
"""
from __future__ import annotations

import math

from .patrol_site_geometry import PATROL_SITE_CENTER, snap_point_to_site

M_PER_DEG_LAT = 111_320.0

_gps_anchor: dict[str, tuple[float, float]] = {}


def _latlon_to_enu(lat: float, lng: float, ref_lat: float, ref_lng: float) -> tuple[float, float]:
    cos_lat = math.cos(math.radians(ref_lat))
    east = (lng - ref_lng) * M_PER_DEG_LAT * cos_lat
    north = (lat - ref_lat) * M_PER_DEG_LAT
    return east, north


def _enu_to_latlon(east: float, north: float, ref_lat: float, ref_lng: float) -> tuple[float, float]:
    cos_lat = math.cos(math.radians(ref_lat))
    lat = ref_lat + north / M_PER_DEG_LAT
    lng = ref_lng + east / (M_PER_DEG_LAT * max(cos_lat, 1e-6))
    return lat, lng


def map_patrol_device_gps_to_site(camera_id: str, lat: float, lng: float) -> tuple[float, float]:
    """Lần fix đầu → tâm công trường; sau đó = tâm + (GPS hiện tại − GPS mốc), không cap km."""
    cid = (camera_id or "").strip()
    anchor = _gps_anchor.get(cid)
    if anchor is None:
        _gps_anchor[cid] = (lat, lng)
        return PATROL_SITE_CENTER

    d_east, d_north = _latlon_to_enu(lat, lng, anchor[0], anchor[1])
    site_lat, site_lng = PATROL_SITE_CENTER
    out_lat, out_lng = _enu_to_latlon(d_east, d_north, site_lat, site_lng)
    matched_lat, matched_lng, _ = snap_point_to_site(out_lat, out_lng)
    return matched_lat, matched_lng


def patrol_site_center_fallback() -> tuple[float, float]:
    return PATROL_SITE_CENTER


def reset_patrol_gps_anchors(camera_id: str | None = None) -> None:
    if camera_id is None:
        _gps_anchor.clear()
        return
    _gps_anchor.pop(camera_id.strip(), None)
