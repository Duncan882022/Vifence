#!/usr/bin/env python3
"""Xóa sạch toàn bộ dữ liệu Module 05 patrol.

Usage:
  python scripts/purge_patrol_all.py --yes
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol.admin_reset import purge_patrol_all  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Purge all Module 05 patrol data")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument(
        "--reset-counters",
        action="store_true",
        help="Reset tk counter (next anonymous track starts at tk-0000001)",
    )
    args = parser.parse_args()

    if not args.yes:
        print("Sẽ xóa: SQLite persons/events, gallery faces, bindings, snapshots, track registry.")
        confirm = input("Gõ YES để tiếp tục: ").strip()
        if confirm != "YES":
            print("Huỷ.")
            return

    out = purge_patrol_all(keep_counters=not args.reset_counters)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
