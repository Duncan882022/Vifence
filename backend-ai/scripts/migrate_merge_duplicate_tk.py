#!/usr/bin/env python3
"""Gộp card tk trùng người trong một ngày — chạy trên VPS sau deploy.

Usage:
  cd backend-ai && python3 scripts/migrate_merge_duplicate_tk.py --date 2026-09-05
  cd backend-ai && python3 scripts/migrate_merge_duplicate_tk.py --date 2026-09-05 --dry-run
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Cụm trùng đã audit ngày 2026-09-05 — phần tử đầu = tk canonical (score cao nhất).
CLUSTERS_2026_09_05: list[list[str]] = [
    ["tk-0000002", "tk-0000003"],
    ["tk-0000025", "tk-0000023", "tk-0000024", "tk-0000026"],
    ["tk-0000042", "tk-0000041", "tk-0000043"],
    ["tk-0000057", "tk-0000055"],
    ["tk-0000067", "tk-0000069", "tk-0000070", "tk-0000071"],
]


def _pick_canonical(date: str, members: list[str]) -> str:
    from app.patrol import db, identity

    best_id = members[0]
    best_score = -1.0
    for pid in members:
        resolved = identity.resolve_alias(pid)
        row = db.query_one(
            "SELECT snapshot_score FROM daily_events"
            " WHERE event_date = ? AND pers_id = ?",
            (date, resolved),
        )
        score = float(row["snapshot_score"] or 0) if row else 0.0
        if score > best_score:
            best_score = score
            best_id = resolved
    return identity.resolve_alias(best_id)


def merge_clusters(date: str, clusters: list[list[str]], *, dry_run: bool) -> int:
    from app.patrol import daystore, identity

    merged = 0
    for raw_members in clusters:
        members = [identity.resolve_alias(m) for m in raw_members]
        keep = _pick_canonical(date, members)
        drops = [m for m in members if m != keep]
        print(f"cluster keep={keep} drop={drops}")
        if dry_run:
            continue
        for drop in drops:
            daystore.merge_pers_event_cards(drop, keep)
            merged += 1
    return merged


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default="2026-09-05")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    n = merge_clusters(args.date, CLUSTERS_2026_09_05, dry_run=args.dry_run)
    if args.dry_run:
        print(f"Dry-run: would merge {sum(len(c) - 1 for c in CLUSTERS_2026_09_05)} cards")
    else:
        print(f"Merged {n} duplicate cards into canonical tk for {args.date}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
