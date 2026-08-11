#!/usr/bin/env python3
"""Cổng pre-deploy — bắt buộc pass trước khi deploy BE / Pages.

Kiểm tra:
  1. Analyzer 13/13 kịch bản có hit trong 1 loop MP4 (audit_loop_coverage.py)
  2. Engine debounce ghi đủ 13 scenario_id vào EventStore (audit_loop_events.py)
  3. Regression snapshot + ROI smoke (audit_event_snapshots.py)

Chạy:
  backend-ai/.venv/bin/python scripts/audit_pre_deploy.py

Exit 0 = sẵn sàng deploy · Exit 1 = chặn deploy.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = ROOT / ".venv" / "bin" / "python"

STEPS = [
    ("Analyzer 13/13", ROOT / "scripts" / "audit_loop_coverage.py"),
    ("Engine events 13/13", ROOT / "scripts" / "audit_loop_events.py"),
    ("Regression snapshots", ROOT / "scripts" / "audit_event_snapshots.py"),
]


def _run_step(label: str, script: Path) -> int:
    print("\n" + "=" * 72)
    print(f"▶ {label}")
    print("=" * 72)
    if not script.exists():
        print(f"FAIL — thiếu script {script}")
        return 1
    env = os.environ.copy()
    env["EVENT_TEST_MODE"] = "true"
    env["A03_BPTC_EVENT_LOGGING_ENABLED"] = "true"
    env["ATGT_LANE_VIOLATION_ONLY"] = "false"
    env["ATGT_DEMO_FAKE_PLATE_FALLBACK"] = "true"
    proc = subprocess.run([str(PY), str(script)], cwd=str(ROOT), env=env)
    if proc.returncode != 0:
        print(f"\n✗ FAIL — {label}")
        return proc.returncode
    print(f"\n✓ PASS — {label}")
    return 0


def main() -> int:
    if not PY.exists():
        print(f"FAIL — không tìm thấy venv: {PY}")
        return 1

    print("=" * 72)
    print("VIFENCE PRE-DEPLOY AUDIT — 13 nhóm ATLĐ + auto-train readiness")
    print("=" * 72)

    failed = 0
    for label, script in STEPS:
        code = _run_step(label, script)
        if code != 0:
            failed += 1

    print("\n" + "=" * 72)
    if failed:
        print(f"KẾT QUẢ: {failed}/{len(STEPS)} bước FAIL — KHÔNG deploy Pages/BE")
        return 1
    print("KẾT QUẢ: TẤT CẢ PASS — OK deploy Pages + BE")
    print("")
    print("Auto-train trên VPS (sau deploy):")
    print("  AUTO_TRAIN_ENABLED=true · scheduler 00:00 & 06:00 UTC+7")
    print("  VMS_MODE_ENABLED=true · thu mẫu từ road/crane/ppe/mesh engines")
    print("  GET /training/status — theo dõi tiến độ retrain")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
