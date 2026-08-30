"""Tripwire — chỉ +1 KPI khi vào polygon site (Cầu Sông Hốt)."""

from __future__ import annotations

from ...patrol_site_geometry import is_point_in_site
from .types import TrackSession


def site_entry_counted(
    session: TrackSession,
    *,
    gps_lat: float | None,
    gps_lng: float | None,
) -> bool:
    """True nếu lần quan sát này kích hoạt đếm session (+1).

    Đếm khi:
    - GPS hợp lệ nằm trong polygon site, và
    - vừa chuyển từ ngoài → trong, hoặc
    - session chưa được đếm và điểm đầu đã nằm trong site.
    """
    if session.counted:
        return False
    if gps_lat is None or gps_lng is None:
        return False
    if not (-90 <= gps_lat <= 90 and -180 <= gps_lng <= 180):
        return False
    if gps_lat == 0.0 and gps_lng == 0.0:
        return False

    inside = is_point_in_site(float(gps_lat), float(gps_lng))
    prev = session.was_inside_site

    session.was_inside_site = inside
    if not inside:
        return False

    if prev is False:
        session.counted = True
        return True
    if prev is None:
        session.counted = True
        return True
    return False
