#!/usr/bin/env python3
"""Backfill tier_snapshot / tier_ever — dữ liệu trước deploy TierSnapshot contract.

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


def _build_inferred_tier_snapshot(subject_id: str, tier: str) -> dict:
    from app.patrol.tier_snapshot import build_tier_snapshot

    return build_tier_snapshot(
        tier=tier,
        tier_since=0.0,
        subject_id=subject_id,
        tier_source="inferred",
    ).to_payload_dict()


def backfill_appearances(date: str, *, dry_run: bool) -> int:
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

            if payload.get("tier_snapshot"):
                continue

            sid = identity.resolve_alias(str(row["subject_id"]))
            tier = str(payload.get("tier_at_observation") or "").strip()
            if tier not in ("object", "person", "identity"):
                tier = _infer_tier(sid, row["person_status"])
            payload["tier_at_observation"] = tier
            payload["tier_snapshot"] = _build_inferred_tier_snapshot(sid, tier)
            if dry_run:
                print(f"would update appearance id={row['id']} {sid} -> {tier}")
            else:
                conn.execute(
                    "UPDATE appearances SET event_payload_json = ? WHERE id = ?",
                    (json.dumps(payload, ensure_ascii=False), int(row["id"])),
                )
            updated += 1
    return updated


def backfill_daily_events(date: str, *, dry_run: bool) -> int:
    from app.patrol import db, identity
    from app.patrol.tier_snapshot import build_tier_snapshot, higher_tier

    updated = 0
    rows = db.query(
        "SELECT e.pers_id, e.tier_ever, e.tier_snapshot_json, p.status"
        " FROM daily_events e JOIN persons p ON p.pers_id = e.pers_id"
        " WHERE e.event_date = ?",
        (date,),
    )
    with db.tx() as conn:
        for row in rows:
            if row["tier_snapshot_json"]:
                continue
            pid = identity.resolve_alias(str(row["pers_id"]))
            tier = _infer_tier(pid, row["status"])
            ever = higher_tier(str(row["tier_ever"] or "object"), tier)
            snap = build_tier_snapshot(
                tier=ever,
                tier_since=0.0,
                subject_id=pid,
                tier_source="inferred",
            )
            blob = json.dumps(snap.to_payload_dict(), ensure_ascii=False)
            if dry_run:
                print(f"would update daily_events {pid} tier_ever={ever}")
            else:
                conn.execute(
                    "UPDATE daily_events SET tier_ever = ?, tier_snapshot_json = ?"
                    " WHERE event_date = ? AND pers_id = ?",
                    (ever, blob, date, pid),
                )
            updated += 1
    return updated


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default="2026-09-05")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    app_n = backfill_appearances(args.date, dry_run=args.dry_run)
    ev_n = backfill_daily_events(args.date, dry_run=args.dry_run)
    if args.dry_run:
        print(f"Dry-run: would backfill {app_n} appearances, {ev_n} daily_events for {args.date}")
    else:
        print(f"Backfilled {app_n} appearances + {ev_n} daily_events for {args.date}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
