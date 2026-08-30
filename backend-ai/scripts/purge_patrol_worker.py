#!/usr/bin/env python3
"""Xóa toàn bộ dữ liệu một công nhân patrol — gallery, SQLite, bindings, snapshot.

Usage:
  python scripts/purge_patrol_worker.py --employee-code SGC-6688
  python scripts/purge_patrol_worker.py --gallery-worker-id p-SGC-6688 --yes
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import db, identity  # noqa: E402
from app.patrol.enroll_images import remove_gallery_worker_faces  # noqa: E402
from app.patrol.sink import SNAPSHOT_DIR  # noqa: E402
from app.patrol_identity_store import (  # noqa: E402
    lookup_patrol_identity,
    patrol_gallery_worker_id,
    unbind_patrol_identity,
)
from app.worker_identity.gallery import remove_gallery_worker_registry  # noqa: E402
from app.worker_identity.recognizer import reload_gallery  # noqa: E402


def _find_pers_ids(gallery_worker_id: str, employee_code: str) -> set[str]:
    ids: set[str] = set()
    row = lookup_patrol_identity(gallery_worker_id)
    if row:
        for alias in row.get("aliases") or []:
            if str(alias).startswith("pers-"):
                ids.add(str(alias))
    conn = db.get_conn()
    for r in conn.execute(
        "SELECT pers_id FROM persons WHERE employee_code = ?", (employee_code,)
    ).fetchall():
        ids.add(str(r["pers_id"]))
    for r in conn.execute(
        "SELECT old_pers_id, pers_id FROM person_aliases"
    ).fetchall():
        if str(r["pers_id"]) in ids:
            ids.add(str(r["old_pers_id"]))
    return ids


def _purge_snapshots(pers_ids: set[str]) -> int:
    removed = 0
    if not SNAPSHOT_DIR.is_dir():
        return 0
    for day_dir in SNAPSHOT_DIR.iterdir():
        if not day_dir.is_dir():
            continue
        for pid in pers_ids:
            for path in day_dir.glob(f"{pid}*.jpg"):
                if path.is_file():
                    path.unlink()
                    removed += 1
    return removed


def _purge_sqlite(pers_ids: set[str], employee_code: str) -> dict[str, int]:
    stats = {
        "persons": 0,
        "daily_events": 0,
        "appearances": 0,
        "objects": 0,
    }
    conn = db.get_conn()
    for pid in sorted(pers_ids):
        cur = conn.execute("DELETE FROM persons WHERE pers_id = ?", (pid,))
        stats["persons"] += cur.rowcount
        cur = conn.execute("DELETE FROM daily_events WHERE pers_id = ?", (pid,))
        stats["daily_events"] += cur.rowcount
        cur = conn.execute("DELETE FROM appearances WHERE subject_id = ?", (pid,))
        stats["appearances"] += cur.rowcount
        cur = conn.execute("DELETE FROM person_aliases WHERE pers_id = ? OR old_pers_id = ?", (pid, pid))
        cur = conn.execute("DELETE FROM person_faces WHERE pers_id = ?", (pid,))
    conn.commit()
    return stats


def purge_worker(*, employee_code: str | None, gallery_worker_id: str | None) -> dict:
    code = (employee_code or "").strip()
    wid = (gallery_worker_id or "").strip()
    if not wid and code:
        wid = patrol_gallery_worker_id(code)
    if not code and wid:
        row = lookup_patrol_identity(wid)
        code = str(row.get("employee_code") or "").strip() if row else ""
    if not wid:
        raise SystemExit("Thiếu --employee-code hoặc --gallery-worker-id")

    pers_ids = _find_pers_ids(wid, code)
    faces_removed = remove_gallery_worker_faces(wid)
    registry_removed = remove_gallery_worker_registry(wid)
    binding_removed = unbind_patrol_identity(wid)
    snapshots_removed = _purge_snapshots(pers_ids)
    sqlite_stats = _purge_sqlite(pers_ids, code)
    reload_gallery()
    identity._invalidate_face_index()

    return {
        "gallery_worker_id": wid,
        "employee_code": code,
        "pers_ids": sorted(pers_ids),
        "gallery_faces_removed": faces_removed,
        "gallery_registry_removed": registry_removed,
        "binding_removed": binding_removed,
        "snapshots_removed": snapshots_removed,
        **sqlite_stats,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Purge patrol worker data")
    parser.add_argument("--employee-code", default="")
    parser.add_argument("--gallery-worker-id", default="")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    args = parser.parse_args()

    code = args.employee_code.strip()
    wid = args.gallery_worker_id.strip() or (patrol_gallery_worker_id(code) if code else "")
    if not wid and not code:
        parser.error("Cần --employee-code hoặc --gallery-worker-id")

    if not args.yes:
        print(f"Sẽ xóa toàn bộ dữ liệu worker: code={code or '?'} gallery={wid or '?'}")
        confirm = input("Gõ YES để tiếp tục: ").strip()
        if confirm != "YES":
            print("Huỷ.")
            return

    out = purge_worker(employee_code=code or None, gallery_worker_id=wid or None)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
