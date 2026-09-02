"""Enrichment helpers for GET /patrol/day/bundle — GPS + tk binding."""

from __future__ import annotations

from typing import Any

from . import db
from ..patrol_ids import is_anonymous_track_id, normalize_track_id


def tk_bindings_for_pers_ids(pers_ids: list[str]) -> dict[str, str]:
    """pers_id → tk_id (mới nhất) từ track_profile_bindings."""
    ids = [p.strip() for p in pers_ids if (p or "").strip()]
    if not ids:
        return {}
    placeholders = ",".join("?" * len(ids))
    rows = db.query(
        f"SELECT pers_id, tk_id, bound_at FROM track_profile_bindings"
        f" WHERE pers_id IN ({placeholders}) ORDER BY bound_at DESC",
        tuple(ids),
    )
    out: dict[str, str] = {}
    for row in rows:
        pid = str(row["pers_id"])
        if pid in out:
            continue
        tk = normalize_track_id(str(row["tk_id"]))
        if tk:
            out[pid] = tk
    return out


def gps_lookup_from_presences(presences: list[dict[str, Any]]) -> dict[str, tuple[float, float]]:
    """subject_id → (lat, lng) từ lượt presence mới nhất."""
    scratch: dict[str, tuple[float, float, float]] = {}
    for row in presences:
        sid = str(row.get("subject_id") or "").strip()
        if not sid:
            continue
        lat = row.get("gps_lat_end")
        if lat is None:
            lat = row.get("gps_lat")
        lng = row.get("gps_lng_end")
        if lng is None:
            lng = row.get("gps_lng")
        if lat is None or lng is None:
            continue
        try:
            lat_f, lng_f = float(lat), float(lng)
        except (TypeError, ValueError):
            continue
        if lat_f == 0.0 and lng_f == 0.0:
            continue
        sort_key = float(row.get("ended_at") or 0) * 10 + float(row.get("presence_seq") or 0)
        prev = scratch.get(sid)
        if prev is None or sort_key >= prev[2]:
            scratch[sid] = (lat_f, lng_f, sort_key)
    return {sid: (lat_f, lng_f) for sid, (lat_f, lng_f, _sk) in scratch.items()}


def resolve_track_worker_id(pers_id: str, tk_map: dict[str, str]) -> str | None:
    pid = (pers_id or "").strip()
    if not pid:
        return None
    bound = tk_map.get(pid)
    if bound:
        return bound
    if is_anonymous_track_id(pid):
        return normalize_track_id(pid)
    return None
