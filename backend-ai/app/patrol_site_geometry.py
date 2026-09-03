"""
Module 05 — site boundary geometry (Hành lang CT06 Quảng Yên).
Mirrors src/modules/module05-productivity/data/patrolSiteGeometry.ts
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

M_PER_DEG_LAT = 111_320.0

END_CAP_RADIUS_M = 1360.0
SPINE_BOW_NORTH_M = 320.0
SURVEY_BULGE_EXTRA_M = 300.0
PINCH_ARC_T = 0.587

PATROL_SITE_TIP_A: tuple[float, float] = (20.907474, 106.830878)
PATROL_SITE_TIP_B: tuple[float, float] = (20.962517, 106.945303)
PATROL_SITE_PINCH_SOUTH: tuple[float, float] = (20.928673, 106.893158)
PATROL_SITE_PINCH_NORTH: tuple[float, float] = (20.953546, 106.879254)
PATROL_SITE_CENTER: tuple[float, float] = (20.928444, 106.873611)
PATROL_SURVEY_SOUTH_BEND: tuple[float, float] = (
    round(PATROL_SITE_CENTER[0] - 0.0018, 6),
    PATROL_SITE_CENTER[1],
)

PATROL_SITE_CORNERS: list[tuple[float, float]] = [
    (
        max(PATROL_SITE_TIP_A[0], PATROL_SITE_PINCH_NORTH[0]),
        min(PATROL_SITE_TIP_A[1], PATROL_SITE_PINCH_SOUTH[1]),
    ),
    (
        max(PATROL_SITE_TIP_B[0], PATROL_SITE_PINCH_NORTH[0]),
        max(PATROL_SITE_TIP_B[1], PATROL_SITE_PINCH_SOUTH[1]),
    ),
    (
        min(PATROL_SITE_TIP_A[0], PATROL_SITE_PINCH_SOUTH[0]),
        max(PATROL_SITE_TIP_B[1], PATROL_SITE_PINCH_SOUTH[1]),
    ),
    (
        min(PATROL_SITE_TIP_A[0], PATROL_SITE_PINCH_SOUTH[0]),
        min(PATROL_SITE_TIP_A[1], PATROL_SITE_PINCH_SOUTH[1]),
    ),
]


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


def _lerp_pt(a: tuple[float, float], b: tuple[float, float], t: float) -> tuple[float, float]:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _sub(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return (a[0] - b[0], a[1] - b[1])


def _add(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return (a[0] + b[0], a[1] + b[1])


def _scale(v: tuple[float, float], s: float) -> tuple[float, float]:
    return (v[0] * s, v[1] * s)


def _normalize(v: tuple[float, float]) -> tuple[float, float]:
    length = math.hypot(v[0], v[1]) or 1.0
    return (v[0] / length, v[1] / length)


def _perp(v: tuple[float, float]) -> tuple[float, float]:
    return (-v[1], v[0])


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


def _catmull_rom_chain(
    points: Sequence[tuple[float, float]],
    samples_per_seg: int = 18,
) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for i in range(len(points) - 1):
        p0 = points[max(0, i - 1)]
        p1 = points[i]
        p2 = points[i + 1]
        p3 = points[min(len(points) - 1, i + 2)]
        for s in range(samples_per_seg):
            t = s / samples_per_seg
            t2 = t * t
            t3 = t2 * t
            out.append(
                (
                    0.5
                    * (
                        (2 * p1[0])
                        + (-p0[0] + p2[0]) * t
                        + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                        + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
                    ),
                    0.5
                    * (
                        (2 * p1[1])
                        + (-p0[1] + p2[1]) * t
                        + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                        + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
                    ),
                )
            )
    out.append(points[-1])
    return out


def _cap_arc_through_apex(
    apex: tuple[float, float],
    south: tuple[float, float],
    north: tuple[float, float],
    steps: int = 24,
) -> list[tuple[float, float]]:
    mid = _lerp_pt(south, north, 0.5)
    inward = _normalize(_sub(mid, apex))
    radius = abs(_sub(mid, apex)[0] * inward[0] + _sub(mid, apex)[1] * inward[1])
    center = _add(apex, _scale(inward, radius))
    angle_south = math.atan2(south[1] - center[1], south[0] - center[0])
    angle_north = math.atan2(north[1] - center[1], north[0] - center[0])
    angle_apex = math.atan2(apex[1] - center[1], apex[0] - center[0])

    sweep_short = angle_north - angle_south
    while sweep_short <= 0:
        sweep_short += math.pi * 2
    sweep_long = sweep_short - math.pi * 2

    def _contains_apex(sweep: float) -> bool:
        for k in range(101):
            ang = angle_south + sweep * (k / 100)
            delta = ang - angle_apex
            while delta > math.pi:
                delta -= math.pi * 2
            while delta < -math.pi:
                delta += math.pi * 2
            if abs(delta) < 0.05:
                return True
        return False

    sweep = sweep_short if _contains_apex(sweep_short) else sweep_long
    pts: list[tuple[float, float]] = []
    for i in range(steps + 1):
        ang = angle_south + (sweep * i) / steps
        pts.append(
            (
                center[0] + radius * math.cos(ang),
                center[1] + radius * math.sin(ang),
            )
        )
    return pts


@dataclass(frozen=True)
class _ArcLengthTable:
    curve: list[tuple[float, float]]
    cumulative: list[float]
    total: float


def _build_arc_length_table(curve: Sequence[tuple[float, float]]) -> _ArcLengthTable:
    cumulative = [0.0]
    for i in range(1, len(curve)):
        cumulative.append(
            cumulative[-1]
            + math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1])
        )
    return _ArcLengthTable(list(curve), cumulative, cumulative[-1] if cumulative else 0.0)


def _point_at_arc_u(table: _ArcLengthTable, u: float) -> tuple[float, float]:
    if not table.curve:
        return (0.0, 0.0)
    if table.total <= 0:
        return table.curve[0]
    target = max(0.0, min(1.0, u)) * table.total
    i = 1
    while i < len(table.cumulative) and table.cumulative[i] < target:
        i += 1
    i0 = max(0, i - 1)
    span = table.cumulative[i] - table.cumulative[i0]
    frac = (target - table.cumulative[i0]) / span if span > 0 else 0.0
    a = table.curve[i0]
    b = table.curve[min(len(table.curve) - 1, i)]
    return (a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac)


def _half_at(keys: Sequence[tuple[float, float]], t: float) -> float:
    half = keys[-1][1]
    for i in range(len(keys) - 1):
        ta, ha = keys[i]
        tb, hb = keys[i + 1]
        if ta <= t <= tb:
            f = (t - ta) / max(1e-6, tb - ta)
            half = ha + (hb - ha) * f
            break
    return half


def _build_curved_corridor_model() -> tuple[
    list[tuple[float, float]],
    _ArcLengthTable,
    _ArcLengthTable,
    float,
    float,
]:
    ref_lat = (PATROL_SITE_TIP_A[0] + PATROL_SITE_TIP_B[0]) / 2
    ref_lng = (PATROL_SITE_TIP_A[1] + PATROL_SITE_TIP_B[1]) / 2

    tip_a = _latlng_to_enu(*PATROL_SITE_TIP_A, ref_lat, ref_lng)
    tip_b = _latlng_to_enu(*PATROL_SITE_TIP_B, ref_lat, ref_lng)
    pinch_s = _latlng_to_enu(*PATROL_SITE_PINCH_SOUTH, ref_lat, ref_lng)
    pinch_n = _latlng_to_enu(*PATROL_SITE_PINCH_NORTH, ref_lat, ref_lng)
    south_bend = _latlng_to_enu(*PATROL_SURVEY_SOUTH_BEND, ref_lat, ref_lng)
    survey = _latlng_to_enu(*PATROL_SITE_CENTER, ref_lat, ref_lng)

    mid_pinch = _lerp_pt(pinch_s, pinch_n, 0.5)
    inward_a = _normalize(_sub(mid_pinch, tip_a))
    inward_b = _normalize(_sub(mid_pinch, tip_b))
    attach_a = _add(tip_a, _scale(inward_a, END_CAP_RADIUS_M))
    attach_b = _add(tip_b, _scale(inward_b, END_CAP_RADIUS_M))
    bow_mid = _add(_lerp_pt(attach_a, attach_b, 0.5), (0.0, SPINE_BOW_NORTH_M))

    survey_south_half = math.hypot(south_bend[0] - survey[0], south_bend[1] - survey[1])

    spine = _catmull_rom_chain(
        [
            attach_a,
            _lerp_pt(attach_a, survey, 0.5),
            _lerp_pt(survey, bow_mid, 0.35),
            _lerp_pt(bow_mid, attach_b, 0.65),
            attach_b,
        ]
    )

    half_south_keys = (
        (0.0, END_CAP_RADIUS_M),
        (0.14, END_CAP_RADIUS_M * 0.84),
        (0.36, survey_south_half + SURVEY_BULGE_EXTRA_M),
        (0.425, survey_south_half + SURVEY_BULGE_EXTRA_M * 0.55),
        (PINCH_ARC_T, 1430.0),
        (1.0, END_CAP_RADIUS_M),
    )
    half_north_keys = (
        (0.0, END_CAP_RADIUS_M * 0.96),
        (PINCH_ARC_T, 1820.0),
        (1.0, END_CAP_RADIUS_M * 0.96),
    )

    south_edge: list[tuple[float, float]] = []
    north_edge: list[tuple[float, float]] = []
    n = len(spine)

    for i in range(n):
        t = i / max(1, n - 1)
        half_s = _half_at(half_south_keys, t)
        half_n = _half_at(half_north_keys, t)
        prev = spine[max(0, i - 1)]
        nxt = spine[min(n - 1, i + 1)]
        tangent = _normalize(_sub(nxt, prev))
        normal = _perp(tangent)
        south_edge.append(_add(spine[i], _scale(normal, -half_s)))
        north_edge.append(_add(spine[i], _scale(normal, half_n)))

    west_cap = _cap_arc_through_apex(tip_a, south_edge[0], north_edge[0], steps=36)
    east_cap = _cap_arc_through_apex(tip_b, north_edge[-1], south_edge[-1], steps=36)

    ring_enu = [
        *west_cap[:-1],
        *north_edge[1:-1],
        *east_cap[:-1],
        *list(reversed(south_edge[1:])),
    ]
    ring = [_enu_to_latlng(e, n, ref_lat, ref_lng) for e, n in ring_enu]
    if not _ring_contains_point(*PATROL_SITE_CENTER, ring):
        ring.reverse()

    return (
        ring,
        _build_arc_length_table(south_edge),
        _build_arc_length_table(north_edge),
        ref_lat,
        ref_lng,
    )


(
    PATROL_SITE_BOUNDARY_RING,
    _SOUTH_TABLE,
    _NORTH_TABLE,
    _REF_LAT,
    _REF_LNG,
) = _build_curved_corridor_model()

SITE_RING = PATROL_SITE_BOUNDARY_RING


def _site_point(u: float, v: float) -> tuple[float, float]:
    u_clamped = max(0.0, min(1.0, u))
    v_clamped = max(0.0, min(1.0, v))
    south = _point_at_arc_u(_SOUTH_TABLE, u_clamped)
    north = _point_at_arc_u(_NORTH_TABLE, u_clamped)
    return _enu_to_latlng(
        south[0] + (north[0] - south[0]) * v_clamped,
        south[1] + (north[1] - south[1]) * v_clamped,
        _REF_LAT,
        _REF_LNG,
    )


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
