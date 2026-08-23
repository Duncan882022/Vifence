"""
Module 05 — site boundary geometry (Cầu Sông Hốt).
Mirrors src/modules/module05-productivity/data/patrolSiteGeometry.ts
"""
from __future__ import annotations

import math
from typing import Sequence

PATROL_SITE_CENTER: tuple[float, float] = (20.933094, 106.923950)

PATROL_SITE_CORNERS: list[tuple[float, float]] = [
    (20.934409, 106.925451),
    (20.932911, 106.926792),
    (20.931753, 106.921778),
    (20.933707, 106.921705),
]

SITE_RING = PATROL_SITE_CORNERS


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
