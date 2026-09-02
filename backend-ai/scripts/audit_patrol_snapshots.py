#!/usr/bin/env python3
"""Audit Module 05 patrol snapshots — bắt buộc pass trước deploy DR-03/HC-*.

Kiểm tra theo yêu cầu bài toán:
  1. DR-03 street: ≥2 person detection trên frame đám đông (face-anchor)
  2. Snapshot ROI: bbox JPG ≤ 40% diện tích khung (không crowd 80%)
  3. JPG dedupe: cùng luot_key → 1 file, ghi đè khi score tăng
  4. Appearance: re-track cùng obj trong gap 45s → extend row, không spam INSERT
  5. Coalesce: obj re-acquire tuần tự gộp; 2 track song song giữ 2 dòng

Chạy:
  backend-ai/.venv/bin/python scripts/audit_patrol_snapshots.py
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from dataclasses import dataclass, field
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("EVENT_TEST_MODE", "true")
os.environ.setdefault("PATROL_DRONE_ALTITUDE_OVERRIDES", "DR-03:3")

USER_DR03_FRAME = Path(
    "/home/ubuntu/.cursor/projects/workspace/assets/"
    "01a0614e-5643-7a12-8541-a99494615443.jpg"
)


@dataclass
class CaseResult:
    name: str
    ok: bool
    detail: str
    extra: list[str] = field(default_factory=list)


def _bbox_area_ratio(box: tuple[float, float, float, float], w: int, h: int) -> float:
    x1, y1, x2, y2 = box
    return max(0.0, x2 - x1) * max(0.0, y2 - y1) / max(float(w * h), 1.0)


def audit_dr03_multi_person() -> CaseResult:
    from app.patrol_engine import analyze_patrol_frame

    candidates = [
        USER_DR03_FRAME,
        REPO_ROOT / "public/camera-feeds/cam04-ppe-workers.jpg",
    ]
    frame = None
    used = ""
    for path in candidates:
        if path.is_file():
            frame = cv2.imread(str(path))
            used = str(path.name)
            break
    if frame is None:
        return CaseResult("dr03_multi_person", False, "không có frame test")

    result = analyze_patrol_frame(frame, "DR-03")
    persons = [d for d in result.get("detections", []) if d.get("behavior") == "person"]
    ok = len(persons) >= 2
    return CaseResult(
        "dr03_multi_person",
        ok,
        f"frame={used} persons={len(persons)} (cần ≥2)",
        extra=[str((d.get("subject_bbox") or d.get("bbox"))) for d in persons[:4]],
    )


def audit_snapshot_roi_clamp() -> CaseResult:
    from app.patrol_person_visibility import patrol_snapshot_draw_bbox

    fw, fh = 1290, 658
    crowd = (0.0, 80.0, 1280.0, 620.0)
    out = patrol_snapshot_draw_bbox(crowd, fw, fh)
    ratio = _bbox_area_ratio(out, fw, fh)
    ok = ratio <= 0.40
    return CaseResult(
        "snapshot_roi_clamp",
        ok,
        f"crowd area={ratio:.2f} (max 0.40) out={tuple(round(v, 1) for v in out)}",
    )


def audit_jpg_one_file_per_luot() -> CaseResult:
    from app.patrol import db, sink

    tmp = tempfile.TemporaryDirectory()
    db.close()
    db.DATA_DIR = Path(tmp.name)
    db.DB_FILE = Path(tmp.name) / "patrol.db"
    sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
    db.get_conn()
    sink.reset()

    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    bbox = (100.0, 80.0, 220.0, 400.0)
    subject = "obj-20260902-0099"
    paths: list[str] = []
    for score in (0.5, 0.7, 0.9):
        p = sink._write_snapshot(  # noqa: SLF001
            subject,
            frame,
            bbox,
            score=score,
            luot_key=sink.CARD_SNAPSHOT_LUOT,
            capture_ts=12_000.0 + score,
        )
        if p:
            paths.append(p)

    files = list(sink.SNAPSHOT_DIR.rglob("*.jpg"))
    card_file = sink.SNAPSHOT_DIR / "1970-01-01" / f"{subject}.jpg"
    ok = len(files) == 1 and card_file.is_file() and len(set(paths)) <= 1
    tmp.cleanup()
    return CaseResult(
        "jpg_one_file_per_card",
        ok,
        f"files={len(files)} paths={paths} card={card_file.name}",
    )


def audit_appearance_extend_same_obj() -> CaseResult:
    from app.patrol import daystore, db

    tmp = tempfile.TemporaryDirectory()
    db.close()
    db.DATA_DIR = Path(tmp.name)
    db.DB_FILE = Path(tmp.name) / "patrol.db"
    db.get_conn()

    obj_id = "obj-20260902-0050"
    row1 = daystore.upsert_track_appearance(
        appearance_id=None,
        event_date="2026-09-02",
        subject_id=obj_id,
        camera_id="DR-03",
        zone_id=None,
        track_id="ptk-a",
        session_id="sess-a",
        started_at=1000.0,
        ended_at=1010.0,
        gps_lat=20.93,
        gps_lng=106.92,
        payload_json="{}",
        interactions_json="[]",
    )
    extend = daystore.find_extendable_track_appearance_row(
        "2026-09-02", obj_id, "DR-03", 1025.0,
    )
    ok_extend = extend == row1

    row2 = daystore.upsert_track_appearance(
        appearance_id=extend,
        event_date="2026-09-02",
        subject_id=obj_id,
        camera_id="DR-03",
        zone_id=None,
        track_id="ptk-b",
        session_id="sess-b",
        started_at=1000.0,
        ended_at=1030.0,
        gps_lat=20.93,
        gps_lng=106.92,
        payload_json="{}",
        interactions_json="[]",
    )
    count = db.query_one(
        "SELECT COUNT(*) AS c FROM appearances WHERE subject_id = ?",
        (obj_id,),
    )["c"]
    merged = daystore.coalesce_subject_appearances(obj_id, "2026-09-02", camera_id="DR-03")
    count_after = db.query_one(
        "SELECT COUNT(*) AS c FROM appearances WHERE subject_id = ?",
        (obj_id,),
    )["c"]

    tmp.cleanup()
    ok = ok_extend and row2 == row1 and count == 1 and count_after == 1
    return CaseResult(
        "appearance_extend_same_obj",
        ok,
        f"extend={extend} rows={count}→{count_after} merged={merged}",
    )


def audit_parallel_obj_keeps_two_rows() -> CaseResult:
    from app.patrol import daystore, db

    tmp = tempfile.TemporaryDirectory()
    db.close()
    db.DATA_DIR = Path(tmp.name)
    db.DB_FILE = Path(tmp.name) / "patrol.db"
    db.get_conn()

    obj_id = "obj-20260902-0051"
    daystore.upsert_track_appearance(
        appearance_id=None,
        event_date="2026-09-02",
        subject_id=obj_id,
        camera_id="DR-03",
        zone_id=None,
        track_id="ptk-a",
        session_id="sess-a",
        started_at=1000.0,
        ended_at=1030.0,
        gps_lat=20.93,
        gps_lng=106.92,
        payload_json="{}",
        interactions_json="[]",
    )
    daystore.upsert_track_appearance(
        appearance_id=None,
        event_date="2026-09-02",
        subject_id=obj_id,
        camera_id="DR-03",
        zone_id=None,
        track_id="ptk-b",
        session_id="sess-b",
        started_at=1005.0,
        ended_at=1028.0,
        gps_lat=20.93,
        gps_lng=106.92,
        payload_json="{}",
        interactions_json="[]",
    )
    merged = daystore.coalesce_subject_appearances(obj_id, "2026-09-02", camera_id="DR-03")
    count = db.query_one(
        "SELECT COUNT(*) AS c FROM appearances WHERE subject_id = ?",
        (obj_id,),
    )["c"]
    tmp.cleanup()
    ok = merged == 0 and count == 2
    return CaseResult(
        "parallel_obj_keeps_two_rows",
        ok,
        f"merged={merged} rows={count} (cần 2)",
    )


def audit_pytest_snapshot_suite() -> CaseResult:
    import subprocess

    tests = [
        "tests/test_patrol_snapshot_flush_integration.py",
        "tests/test_patrol_overlay_bbox.py",
        "tests/test_patrol_face_anchor.py",
        "tests/test_patrol_aggregator.py",
        "tests/test_patrol_identity_stability.py",
    ]
    proc = subprocess.run(
        [str(ROOT / ".venv" / "bin" / "python"), "-m", "pytest", *tests, "-q"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    ok = proc.returncode == 0
    tail = (proc.stdout or proc.stderr or "").strip().splitlines()[-3:]
    return CaseResult(
        "pytest_snapshot_suite",
        ok,
        "pass" if ok else "FAIL",
        extra=tail,
    )


AUDITS = [
    audit_dr03_multi_person,
    audit_snapshot_roi_clamp,
    audit_jpg_one_file_per_luot,
    audit_appearance_extend_same_obj,
    audit_parallel_obj_keeps_two_rows,
    audit_pytest_snapshot_suite,
]


def main() -> int:
    print("=" * 72)
    print("PATROL SNAPSHOT AUDIT — Module 05 (pre-deploy)")
    print("=" * 72)

    failed = 0
    for fn in AUDITS:
        try:
            result = fn()
        except Exception as exc:  # noqa: BLE001
            result = CaseResult(fn.__name__, False, f"EXCEPTION: {exc}")
        mark = "PASS" if result.ok else "FAIL"
        print(f"[{mark}] {result.name}: {result.detail}")
        for line in result.extra:
            print(f"       {line}")
        if not result.ok:
            failed += 1

    print("=" * 72)
    if failed:
        print(f"KẾT QUẢ: {failed}/{len(AUDITS)} FAIL — không deploy")
        return 1
    print("KẾT QUẢ: TẤT CẢ PASS — OK deploy patrol backend")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
