#!/usr/bin/env python3
"""Xoá sự kiện + snapshot một ngày patrol — chạy trước tuần tra mới sau deploy.

Usage:
  backend-ai/.venv/bin/python scripts/purge_patrol_day.py --date 2026-09-02 --yes
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def main() -> int:
    ap = argparse.ArgumentParser(description="Purge patrol day events/objects/snapshots")
    ap.add_argument("--date", default=None, help="YYYY-MM-DD (default: today VN)")
    ap.add_argument("--yes", action="store_true", help="Confirm purge")
    args = ap.parse_args()

    from app.patrol import db

    date = args.date or db.today_vn()
    if not args.yes:
        print(f"Cần --yes để xoá ngày {date}")
        return 1

    stats = db.purge_day(date)
    print(f"Đã purge {date}: {stats}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
