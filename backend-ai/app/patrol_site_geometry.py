"""
Module 05 — site boundary geometry (Hành lang CT06 Quảng Yên).
Mirrors src/modules/module05-productivity/data/patrolSiteGeometry.ts
"""
from __future__ import annotations

import math
from typing import Sequence

M_PER_DEG_LAT = 111_320.0

PATROL_SITE_CENTER: tuple[float, float] = (20.928444, 106.873611)

PATROL_SITE_CORNERS: list[tuple[float, float]] = [
    (20.9462, 106.8395),
    (20.9445, 106.9375),
    (20.9165, 106.9365),
    (20.9180, 106.8385),
]

SITE_TOP, SITE_RIGHT, SITE_BOTTOM, SITE_LEFT = PATROL_SITE_CORNERS


def _site_point(u: float, v: float) -> tuple[float, float]:
    lat = (
        (1 - u) * (1 - v) * SITE_TOP[0]
        + u * (1 - v) * SITE_RIGHT[0]
        + u * v * SITE_BOTTOM[0]
        + (1 - u) * v * SITE_LEFT[0]
    )
    lng = (
        (1 - u) * (1 - v) * SITE_TOP[1]
        + u * (1 - v) * SITE_RIGHT[1]
        + u * v * SITE_BOTTOM[1]
        + (1 - u) * v * SITE_LEFT[1]
    )
    return round(lat, 6), round(lng, 6)


def _latlng_to_enu(
    lat: float,
    lng: float,
    ref_lat: float,
    ref_lng: float,
) -> tuple[float, float]:
    cos_lat = math.cos(math.radians(ref_lat))
    east = (lng - ref_lng) * M_PER_DEG_LAT * cos_lat
    north = (lat - ref_lat) * M_PER_DEG_LAT
    return east, north


def _enu_to_latlng(
    east: float,
    north: float,
    ref_lat: float,
    ref_lng: float,
) -> tuple[float, float]:
    cos_lat = math.cos(math.radians(ref_lat))
    lat = ref_lat + north / M_PER_DEG_LAT
    lng = ref_lng + east / (M_PER_DEG_LAT * max(cos_lat, 1e-6))
    return round(lat, 6), round(lng, 6)


def _cross(ax: float, ay: float, bx: float, by: float, cx: float, cy: float) -> float:
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)


def _ring_contains_point(lat: float, lng: float, ring: Sequence[tuple[float, float]]) -> bool:
    for i in range(len(ring)):
        a_lat, a_lng = ring[i]
        b_lat, b_lng = ring[(i + 1) % len(ring)]
        if _cross(a_lng, a_lat, b_lng, b_lat, lng, lat) > 1e-11:
            return False
    return True


def is_point_in_site(lat: float, lng: float, ring: Sequence[tuple[float, float]] | None = None) -> bool:
    r = ring if ring is not None else SITE_RING
    return _ring_contains_point(lat, lng, r)


def build_stadium_capsule_ring(
    west_center: tuple[float, float],
    east_center: tuple[float, float],
    envelope_points: Sequence[tuple[float, float]],
    arc_steps: int = 28,
) -> list[tuple[float, float]]:
    ref_lat = (west_center[0] + east_center[0]) / 2
    ref_lng = (west_center[1] + east_center[1]) / 2

    wx, wy = _latlng_to_enu(*west_center, ref_lat, ref_lng)
    ex, ey = _latlng_to_enu(*east_center, ref_lat, ref_lng)

    axis_len = math.hypot(ex - wx, ey - wy)
    if axis_len < 50:
        return list(envelope_points) if len(envelope_points) >= 4 else [west_center, east_center, west_center]

    ux = (ex - wx) / axis_len
    uy = (ey - wy) / axis_len
    px = -uy
    py = ux

    r = 0.0
    for lat, lng in envelope_points:
        x, y = _latlng_to_enu(lat, lng, ref_lat, ref_lng)
        perp = abs((x - wx) * px + (y - wy) * py)
        if perp > r:
            r = perp
    if r < 80:
        r = 800.0

    wcx = wx + ux * r
    wcy = wy + uy * r
    ecx = ex - ux * r
    ecy = ey - uy * r

    ring_enu: list[tuple[float, float]] = []
    straight_steps = max(10, round(axis_len / 350))

    for i in range(straight_steps + 1):
        t = i / straight_steps
        ring_enu.append((
            wcx + (ecx - wcx) * t + px * r,
            wcy + (ecy - wcy) * t + py * r,
        ))

    for i in range(1, arc_steps + 1):
        angle = (math.pi * i) / arc_steps
        ring_enu.append((
            ecx + r * math.cos(angle) * px + r * math.sin(angle) * ux,
            ecy + r * math.cos(angle) * py + r * math.sin(angle) * uy,
        ))

    for i in range(straight_steps - 1, -1, -1):
        t = i / straight_steps
        ring_enu.append((
            wcx + (ecx - wcx) * t - px * r,
            wcy + (ecy - wcy) * t - py * r,
        ))

    for i in range(1, arc_steps):
        angle = math.pi + (math.pi * i) / arc_steps
        ring_enu.append((
            wcx + r * math.cos(angle) * px + r * math.sin(angle) * ux,
            wcy + r * math.cos(angle) * py + r * math.sin(angle) * uy,
        ))

    ring = [_enu_to_latlng(e, n, ref_lat, ref_lng) for e, n in ring_enu]
    probe = envelope_points[-1] if envelope_points else west_center
    if not _ring_contains_point(probe[0], probe[1], ring):
        ring.reverse()
    return ring


CAPSULE_ENVELOPE: list[tuple[float, float]] = [
    *PATROL_SITE_CORNERS,
    _site_point(0, 0),
    _site_point(0, 1),
    _site_point(1, 0),
    _site_point(1, 1),
    _site_point(0.5, 0),
    _site_point(0.5, 1),
    PATROL_SITE_CENTER,
]

PATROL_SITE_BOUNDARY_RING: list[tuple[float, float]] = build_stadium_capsule_ring(
    _site_point(0, 0.5),
    _site_point(1, 0.5),
    CAPSULE_ENVELOPE,
)

SITE_RING = PATROL_SITE_BOUNDARY_RING


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
