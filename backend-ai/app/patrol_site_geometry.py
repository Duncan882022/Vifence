"""
Module 05 — site boundary geometry (Hành lang CT06 Quảng Yên).
Mirrors src/modules/module05-productivity/data/patrolSiteGeometry.ts
"""
from __future__ import annotations

import math
from typing import Sequence

PATROL_SITE_CENTER: tuple[float, float] = (20.928444, 106.873611)

PATROL_SITE_CORNERS: list[tuple[float, float]] = [
    (20.9458, 106.8512),
    (20.9446, 106.9370),
    (20.9169, 106.9358),
    (20.9176, 106.8508),
]

PATROL_SITE_BOUNDARY_RING: list[tuple[float, float]] = [
    (20.9176, 106.8508),
    (20.9458, 106.8690),
    (20.9457, 106.8860),
    (20.9459, 106.9030),
    (20.9456, 106.9200),
    (20.9446, 106.9370),
    (20.9172, 106.9358),
    (20.9170, 106.9180),
    (20.9169, 106.9045),
    (20.9171, 106.8910),
    (20.9169, 106.8775),
    (20.9167, 106.8640),
]

SITE_RING = PATROL_SITE_BOUNDARY_RING


def _cross(ax: float, ay: float, bx: float, by: float, cx: float, cy: float) -> float:
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)


def is_point_in_site(lat: float, lng: float, ring: Sequence[tuple[float, float]] | None = None) -> bool:
    r = ring or SITE_RING
    for i in range(len(r)):
        a_lat, a_lng = r[i]
        b_lat, b_lng = r[(i + 1) % len(r)]
        if _cross(a_lng, a_lat, b_lng, b_lat, lng, lat) > 1e-11:
            return False
    return True


def _nearest_on_segment(
    px: float,
    py: float,
    ax: float,
    ay: float,
    bx: float,
    by: float,
) -> tuple[float, float, float]:
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    denom = abx * abx + aby * aby
    if denom <= 1e-18:
        d = math.hypot(px - ax, py - ay)
        return ax, ay, d
    t = max(0.0, min(1.0, (apx * abx + apy * aby) / denom))
    qx = ax + t * abx
    qy = ay + t * aby
    return qx, qy, math.hypot(px - qx, py - qy)


def snap_point_to_site(
    lat: float,
    lng: float,
    ring: Sequence[tuple[float, float]] | None = None,
) -> tuple[float, float, bool]:
    """
    Map matching — giữ điểm trong polygon; ngoài ranh → snap lên cạnh gần nhất.
    Returns (lat, lng, was_inside).
    """
    r = ring or SITE_RING
    if is_point_in_site(lat, lng, r):
        return float(lat), float(lng), True

    best_lat, best_lng = lat, lng
    best_d = float("inf")
    px, py = lng, lat
    for i in range(len(r)):
        a_lat, a_lng = r[i]
        b_lat, b_lng = r[(i + 1) % len(r)]
        qx, qy, d = _nearest_on_segment(px, py, a_lng, a_lat, b_lng, b_lat)
        if d < best_d:
            best_d = d
            best_lat, best_lng = qy, qx

    if not is_point_in_site(best_lat, best_lng, r):
        c_lat = sum(p[0] for p in r) / len(r)
        c_lng = sum(p[1] for p in r) / len(r)
        for t in (0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0):
            p_lat = lat + (c_lat - lat) * t
            p_lng = lng + (c_lng - lng) * t
            if is_point_in_site(p_lat, p_lng, r):
                return round(p_lat, 6), round(p_lng, 6), False

    return round(best_lat, 6), round(best_lng, 6), False
