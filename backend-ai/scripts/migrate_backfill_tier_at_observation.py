#!/usr/bin/env python3
"""Backfill tier_at_observation vào event_payload_json — dữ liệu trước deploy flush fallback.

Usage:
  cd backend-ai && python3 scripts/migrate_backfill_tier_at_observation.py --date 2026-09-05
  cd backend-ai && python3 scripts/migrate_backfill_tier_at_observation.py --date 2026-09-05 --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _infer_tier(subject_id: str, person_status: str | None) -> str:
    sid = (subject_id or "").strip()
    if sid.startswith("obj-"):
        return "object"
    from app.patrol import identity

    if person_status == identity.STATUS_IDENTIFIED:
        return "identity"
    from app.patrol_ids import is_person_subject_id

    if is_person_subject_id(sid):
        return "person"
    return "object"


def backfill_date(date: str, *, dry_run: bool) -> int:
    from app.patrol import db, identity

    updated = 0
    rows = db.query(
        "SELECT a.id, a.subject_id, a.event_payload_json, p.status AS person_status"
        " FROM appearances a"
        " LEFT JOIN persons p ON p.pers_id = a.subject_id"
        " WHERE a.event_date = ? AND a.qualified = 1",
        (date,),
    )
    with db.tx() as conn:
        for row in rows:
            raw = str(row["event_payload_json"] or "").strip()
            payload: dict
            if raw:
                try:
                    payload = json.loads(raw)
                    if not isinstance(payload, dict):
                        payload = {}
                except json.JSONDecodeError:
                    payload = {}
            else:
                payload = {}

            tier = str(payload.get("tier_at_observation") or "").strip()
            if tier in ("object", "person", "identity"):
                continue

            sid = identity.resolve_alias(str(row["subject_id"]))
            inferred = _infer_tier(sid, row["person_status"])
            payload["tier_at_observation"] = inferred
            if dry_run:
                print(f"would update id={row['id']} {sid} -> {inferred}")
            else:
                conn.execute(
                    "UPDATE appearances SET event_payload_json = ? WHERE id = ?",
                    (json.dumps(payload, ensure_ascii=False), int(row["id"])),
                )
            updated += 1
    return updated


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default="2026-09-05")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    n = backfill_date(args.date, dry_run=args.dry_run)
    if args.dry_run:
        print(f"Dry-run: would backfill {n} appearance rows for {args.date}")
    else:
        print(f"Backfilled tier_at_observation on {n} rows for {args.date}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
