"""Sửa lịch sử popup — tái tạo theo lần gặp từ file snapshot trên disk.

Mỗi lần gặp = các ảnh liên tiếp cách nhau ≤ GAP_FALLBACK_SEC (45s).
Burst 6 FPS trong cùng phiên → một dòng started..ended, ảnh mới nhất.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from . import db, sink
from .daystore import _resolve_appearance_subject_id
from .presence import GAP_FALLBACK_SEC, merge_source_cameras

logger = logging.getLogger("patrol.appearance_repair")

_SNAPSHOT_TS_RE = re.compile(r"^(.+)-(\d{10,16})$")


def parse_snapshot_filename(filename: str) -> tuple[str, float] | None:
    """`pers-0042-1735000000123.jpg` → (`pers-0042`, ts_sec)."""
    stem = filename.rsplit(".", 1)[0].strip()
    m = _SNAPSHOT_TS_RE.match(stem)
    if not m:
        return None
    subject_id = m.group(1).strip()
    ts_ms = int(m.group(2))
    if ts_ms > 1_000_000_000_000:
        ts = ts_ms / 1000.0
    else:
        ts = float(ts_ms)
    if not subject_id or ts <= 0:
        return None
    return subject_id, ts


def _list_disk_snapshots(date: str) -> list[tuple[str, float, str]]:
    folder = sink.SNAPSHOT_DIR / date
    if not folder.is_dir():
        return []
    out: list[tuple[str, float, str]] = []
    for path in sorted(folder.glob("*.jpg")):
        parsed = parse_snapshot_filename(path.name)
        if not parsed:
            continue
        subject_id, ts = parsed
        out.append((subject_id, ts, f"{date}/{path.name}"))
    return out


def _group_encounter_snapshots(
    files: list[tuple[float, str]],
    *,
    gap_sec: float = GAP_FALLBACK_SEC,
) -> list[tuple[float, float, str]]:
    """Gom burst ảnh → (started_at, ended_at, snapshot_path cuối phiên)."""
    if not files:
        return []
    ordered = sorted(files, key=lambda x: x[0])
    groups: list[tuple[float, float, str]] = []
    start_ts, end_ts, snap = ordered[0][0], ordered[0][0], ordered[0][1]
    for ts, rel_path in ordered[1:]:
        if ts - end_ts <= gap_sec:
            end_ts = ts
            snap = rel_path
        else:
            groups.append((start_ts, end_ts, snap))
            start_ts, end_ts, snap = ts, ts, rel_path
    groups.append((start_ts, end_ts, snap))
    return groups


def repair_day_appearance_history(date: str | None = None) -> dict[str, Any]:
    """Backfill popup theo lần gặp; xoá dòng ảnh trùng burst cũ."""
    d = date or db.today_vn()
    disk = _list_disk_snapshots(d)
    if not disk:
        return {"ok": True, "date": d, "inserted": 0, "fixed": 0, "removed": 0, "disk_files": 0}

    inserted = 0
    fixed = 0
    removed = 0

    by_subject: dict[str, list[tuple[float, str]]] = {}
    for raw_subject, ts, rel_path in disk:
        sid = _resolve_appearance_subject_id(raw_subject)
        by_subject.setdefault(sid, []).append((ts, rel_path))

    with db.tx() as conn:
        for subject_id, files in by_subject.items():
            encounters = _group_encounter_snapshots(files)
            existing = conn.execute(
                "SELECT id, started_at, ended_at, snapshot_path"
                " FROM appearances"
                " WHERE event_date = ? AND subject_id = ? AND qualified = 1"
                " AND snapshot_path IS NOT NULL AND snapshot_path != ''"
                " ORDER BY started_at ASC",
                (d, subject_id),
            ).fetchall()

            template = conn.execute(
                "SELECT camera_id, zone_id, gps_lat, gps_lng FROM appearances"
                " WHERE event_date = ? AND subject_id = ? AND qualified = 1"
                " ORDER BY ended_at DESC LIMIT 1",
                (d, subject_id),
            ).fetchone()

            # Xoá dòng ảnh cũ (burst / per-frame) — rebuild sạch từ disk.
            for row in existing:
                conn.execute("DELETE FROM appearances WHERE id = ?", (int(row["id"]),))
                removed += 1

            cam = str(template["camera_id"]) if template else "HC-02"
            zone = template["zone_id"] if template else None
            glat = template["gps_lat"] if template else None
            glng = template["gps_lng"] if template else None

            for start_ts, end_ts, rel_path in encounters:
                seq_row = conn.execute(
                    "SELECT COALESCE(MAX(presence_seq), 0) AS mx FROM appearances"
                    " WHERE event_date = ? AND subject_id = ?",
                    (d, subject_id),
                ).fetchone()
                seq = int(seq_row["mx"] or 0) + 1
                src = merge_source_cameras(None, cam)
                conn.execute(
                    "INSERT INTO appearances"
                    "(event_date, subject_id, camera_id, zone_id, started_at, ended_at,"
                    " gps_lat, gps_lng, gps_lat_end, gps_lng_end, qualified, presence_seq,"
                    " source_cameras, snapshot_path)"
                    " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        d, subject_id, cam, zone, start_ts, end_ts,
                        glat, glng, glat, glng, 1, seq, src, rel_path,
                    ),
                )
                inserted += 1
                fixed += 1

    result = {
        "ok": True,
        "date": d,
        "disk_files": len(disk),
        "subjects": len(by_subject),
        "inserted": inserted,
        "fixed": fixed,
        "removed": removed,
    }
    logger.info("appearance repair %s: %s", d, result)
    return result


def repair_recent_appearance_history(days: int = 2) -> list[dict[str, Any]]:
    """Sửa hôm nay + hôm qua (mặc định) sau deploy."""
    from datetime import datetime, timedelta

    base = datetime.strptime(db.today_vn(), "%Y-%m-%d")
    out: list[dict[str, Any]] = []
    for offset in range(max(1, days)):
        day = (base - timedelta(days=offset)).strftime("%Y-%m-%d")
        out.append(repair_day_appearance_history(day))
    return out
