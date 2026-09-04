"""
Module 05 — site boundary geometry (Cầu Sông Hốt).
Mirrors src/modules/module05-productivity/data/patrolSiteGeometry.ts
"""
from __future__ import annotations

import math
from typing import Sequence

M_PER_DEG_LAT = 111_320.0

PATROL_SITE_BOUNDARY_RING: list[tuple[float, float]] = [
    (20.955148, 106.924572),
    (20.957172, 106.934593),
    (20.953906, 106.93528),
    (20.952243, 106.925838),
]

PATROL_SITE_TIP_A: tuple[float, float] = PATROL_SITE_BOUNDARY_RING[0]
PATROL_SITE_TIP_B: tuple[float, float] = PATROL_SITE_BOUNDARY_RING[1]
PATROL_SITE_PINCH_SOUTH: tuple[float, float] = PATROL_SITE_BOUNDARY_RING[3]
PATROL_SITE_PINCH_NORTH: tuple[float, float] = PATROL_SITE_BOUNDARY_RING[0]

PATROL_SITE_CENTER: tuple[float, float] = (
    round(sum(p[0] for p in PATROL_SITE_BOUNDARY_RING) / len(PATROL_SITE_BOUNDARY_RING), 6),
    round(sum(p[1] for p in PATROL_SITE_BOUNDARY_RING) / len(PATROL_SITE_BOUNDARY_RING), 6),
)

PATROL_SURVEY_SOUTH_BEND: tuple[float, float] = (
    round(PATROL_SITE_CENTER[0] - 0.0004, 6),
    PATROL_SITE_CENTER[1],
)

PATROL_SITE_CORNERS: list[tuple[float, float]] = [
    (
        max(p[0] for p in PATROL_SITE_BOUNDARY_RING),
        min(p[1] for p in PATROL_SITE_BOUNDARY_RING),
    ),
    (
        max(p[0] for p in PATROL_SITE_BOUNDARY_RING),
        max(p[1] for p in PATROL_SITE_BOUNDARY_RING),
    ),
    (
        min(p[0] for p in PATROL_SITE_BOUNDARY_RING),
        max(p[1] for p in PATROL_SITE_BOUNDARY_RING),
    ),
    (
        min(p[0] for p in PATROL_SITE_BOUNDARY_RING),
        min(p[1] for p in PATROL_SITE_BOUNDARY_RING),
    ),
]

SITE_RING = PATROL_SITE_BOUNDARY_RING


def _ring_contains_point(lat: float, lng: float, ring: Sequence[tuple[float, float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]
        yj, xj = ring[j]
        intersects = (yi > lat) != (yj > lat) and lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
        if intersects:
            inside = not inside
        j = i
    return inside


def is_point_in_site(lat: float, lng: float, ring: Sequence[tuple[float, float]] | None = None) -> bool:
    r = ring if ring is not None else SITE_RING
    return _ring_contains_point(lat, lng, r)


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

    c_lat = sum(p[0] for p in r) / len(r)
    c_lng = sum(p[1] for p in r) / len(r)
    for t in (0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0):
        p_lat = best_lat + (c_lat - best_lat) * t
        p_lng = best_lng + (c_lng - best_lng) * t
        if is_point_in_site(p_lat, p_lng, r):
            return round(p_lat, 6), round(p_lng, 6), False
    for t in (0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0):
        p_lat = lat + (c_lat - lat) * t
        p_lng = lng + (c_lng - lng) * t
        if is_point_in_site(p_lat, p_lng, r):
            return round(p_lat, 6), round(p_lng, 6), False

    return round(best_lat, 6), round(best_lng, 6), False
