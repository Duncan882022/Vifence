"""Sửa lịch sử xuất hiện bị gộp sai — tái tạo từ file snapshot trên disk.

Trước fix PR #162, `_touch_appearance` kéo dài `ended_at` trên cùng một dòng
(10:03→10:07). Ảnh vẫn lưu riêng từng file `{subject_id}-{ts_ms}.jpg` — dùng
để backfill mỗi ảnh = một dòng popup.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from . import db, identity, sink
from .daystore import _resolve_appearance_subject_id
from .presence import merge_source_cameras, parse_source_cameras

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


def repair_day_appearance_history(date: str | None = None) -> dict[str, Any]:
    """Backfill popup history từ snapshot files; xoá dòng gộp sai."""
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
            files.sort(key=lambda x: x[0])
            existing = conn.execute(
                "SELECT id, started_at, ended_at, camera_id, zone_id,"
                " gps_lat, gps_lng, gps_lat_end, gps_lng_end,"
                " snapshot_path, source_cameras, presence_seq"
                " FROM appearances"
                " WHERE event_date = ? AND subject_id = ? AND qualified = 1"
                " ORDER BY started_at ASC",
                (d, subject_id),
            ).fetchall()

            known_paths = {
                str(r["snapshot_path"]).strip()
                for r in existing
                if r["snapshot_path"]
            }
            template = existing[-1] if existing else None

            for ts, rel_path in files:
                if rel_path in known_paths:
                    continue
                cam = str(template["camera_id"]) if template else "HC-02"
                zone = template["zone_id"] if template else None
                glat = template["gps_lat"] if template else None
                glng = template["gps_lng"] if template else None
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
                        d, subject_id, cam, zone, ts, ts,
                        glat, glng, glat, glng, 1, seq, src, rel_path,
                    ),
                )
                known_paths.add(rel_path)
                inserted += 1

            merged_rows = [
                r for r in existing
                if float(r["ended_at"]) - float(r["started_at"]) > 1.0
            ]
            for row in merged_rows:
                row_id = int(row["id"])
                start = float(row["started_at"])
                end = float(row["ended_at"])
                snaps_in_range = [
                    (ts, path) for ts, path in files
                    if start - 1.0 <= ts <= end + 1.0
                ]
                row_path = str(row["snapshot_path"] or "").strip()

                if len(snaps_in_range) > 1:
                    conn.execute("DELETE FROM appearances WHERE id = ?", (row_id,))
                    removed += 1
                    continue

                if len(snaps_in_range) == 1:
                    ts, path = snaps_in_range[0]
                    if row_path and row_path != path:
                        conn.execute("DELETE FROM appearances WHERE id = ?", (row_id,))
                        removed += 1
                    else:
                        conn.execute(
                            "UPDATE appearances SET started_at = ?, ended_at = ?, snapshot_path = ?"
                            " WHERE id = ?",
                            (ts, ts, path, row_id),
                        )
                        fixed += 1
                    continue

                if row_path:
                    conn.execute(
                        "UPDATE appearances SET ended_at = started_at WHERE id = ?",
                        (row_id,),
                    )
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
