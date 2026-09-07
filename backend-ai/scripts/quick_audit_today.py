#!/usr/bin/env python3
"""Quick audit patrol events today — stdout for SSH."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import db, daystore, identity  # noqa: E402


def main() -> int:
    d = db.today_vn()
    print(f"=== PATROL AUDIT {d} ===")
    objs = daystore.list_objects(d)
    pers = daystore.list_person_events(d)
    apps = daystore.list_day_presences(d)
    stats = daystore.day_stats(d)
    print(f"stats: {json.dumps(stats, ensure_ascii=False)}")
    print(f"\nOBJECTS ({len(objs)}):")
    for o in objs:
        print(
            f"  {o.get('obj_id')} score={float(o.get('snapshot_score') or 0):.3f}"
            f" promoted_to={o.get('promoted_to')}"
            f" snap={o.get('snapshot_path')}"
        )
    print(f"\nPERSONS ({len(pers)}):")
    for p in pers:
        pid = p.get("pers_id")
        person = identity.get_person(pid) if pid else None
        print(
            f"  {pid} score={float(p.get('snapshot_score') or 0):.3f}"
            f" tier_ever={p.get('tier_ever')} status={person.get('status') if person else '?'}"
            f" promoted_from={p.get('promoted_from')}"
            f" snap={p.get('snapshot_path')}"
        )
    print(f"\nAPPEARANCES qualified ({len(apps)}):")
    by_sub: dict[str, int] = {}
    for a in apps:
        sid = str(a.get("subject_id") or "")
        by_sub[sid] = by_sub.get(sid, 0) + 1
    for sid, cnt in sorted(by_sub.items(), key=lambda x: -x[1])[:20]:
        print(f"  {sid}: {cnt} lượt")
    # Duplicate obj same minute
    from collections import defaultdict

    obj_times: dict[str, list[float]] = defaultdict(list)
    for o in objs:
        obj_times[str(o.get("obj_id"))].append(float(o.get("first_seen") or 0))
    if len(objs) > 3:
        print(f"\nWARN: {len(objs)} object cards — possible over-recording")
    low_score_pers = [p for p in pers if float(p.get("snapshot_score") or 0) < 1.05]
    if low_score_pers:
        print(f"\nWARN: {len(low_score_pers)} person cards score < 1.05")
    obj_snap_pers = [
        p for p in pers
        if str(p.get("snapshot_path") or "").split("/")[-1].startswith("obj-")
    ]
    if obj_snap_pers:
        print(f"\nWARN: {len(obj_snap_pers)} person cards still have obj-* snapshot JPG")
        for p in obj_snap_pers[:5]:
            print(f"  {p.get('pers_id')} -> {p.get('snapshot_path')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
