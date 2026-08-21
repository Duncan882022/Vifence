#!/usr/bin/env python3
"""Evidence audit — các lỗi user báo (ATGT-004, BPTC-001 mesh 5s intro).

Chạy:
  backend-ai/.venv/bin/python scripts/audit_user_reported_fixes.py

In bảng PASS/FAIL có timestamp sự kiện mô phỏng engine (không synthetic).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

# Production-like debounce (ngắn confirm mesh/ATGT cho 1 loop demo).
os.environ.setdefault("EVENT_TEST_MODE", "false")
os.environ.setdefault("A03_BPTC_EVENT_LOGGING_ENABLED", "true")
os.environ.setdefault("ATGT_LANE_VIOLATION_ONLY", "false")
os.environ.setdefault("ATGT_DEMO_ENABLED", "true")

from app.atgt_analyzer import (  # noqa: E402
    _detect_fence_median,
    _roi_mask,
    analyze_atgt_frame,
)
from app.atgt_engine import AtgtEngine  # noqa: E402
from app.cam03_scene_demo import (  # noqa: E402
    _frame_drift,
    _frame_small,
    is_cam03_mesh_segment,
    resolve_cam03_mesh_demo,
)
from app.events import EventStore  # noqa: E402
from app.mesh_analysis_engine import MeshAnalysisEngine  # noqa: E402

VIDEO = REPO_ROOT / "public" / "camera-feeds" / "ttdv-a-cam03-test.mp4"
MESH_REF = REPO_ROOT / "public" / "camera-feeds" / "cam03-mesh-demo.jpg"


@dataclass
class Check:
    id: str
    pass_: bool
    detail: str
    evidence: dict


def _extract(sec: float) -> np.ndarray | None:
    out = Path(f"/tmp/vifence_audit_t{sec:.1f}.jpg")
    subprocess.run(
        [
            "ffmpeg", "-y", "-ss", str(sec),
            "-i", str(VIDEO), "-frames:v", "1", str(out),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return cv2.imread(str(out))


def _duration() -> float:
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "csv=p=0", str(VIDEO),
        ],
        text=True,
    ).strip()
    return float(out)


def _run_engine_events(
    engine,
    frame: np.ndarray,
    camera_id: str,
    *,
    source_pts_sec: float,
    passes: int = 8,
    sleep_s: float = 0.35,
) -> list:
    events = []
    kwargs = {"source_pts_sec": source_pts_sec}
    for _ in range(passes):
        _, evs = engine.process_frame(frame, camera_id, **kwargs)
        events.extend(evs)
        time.sleep(sleep_s)
    return events


def main() -> int:
    checks: list[Check] = []
    if not VIDEO.is_file():
        print(f"MISSING {VIDEO}")
        return 1

    dur = _duration()
    checks.append(
        Check(
            "video_duration_20s",
            dur >= 19.5,
            f"duration={dur:.2f}s (cần ~20s = 5s mesh + body)",
            {"duration_sec": dur},
        ),
    )

    mesh_img = cv2.imread(str(MESH_REF))
    for sec in (0.0, 2.5, 4.0, 5.0):
        frame = _extract(sec)
        if frame is None or mesh_img is None:
            continue
        drift = _frame_drift(_frame_small(frame), _frame_small(mesh_img))
        in_mesh = is_cam03_mesh_segment(sec)
        if sec < 5.0:
            ok = in_mesh and drift < 3.0
        else:
            ok = not in_mesh
        checks.append(
            Check(
                f"video_mesh_intro_t{sec:g}",
                ok,
                f"drift_vs_mesh={drift:.1f} mesh_segment={in_mesh}",
                {"sec": sec, "drift": round(drift, 2), "mesh_segment": in_mesh},
            ),
        )

    frame_mesh = _extract(2.0)
    if frame_mesh is not None:
        demo = resolve_cam03_mesh_demo("A-03", frame_mesh, source_pts_sec=2.0)
        beh = [d.behavior for d in demo] if demo else []
        checks.append(
            Check(
                "analyzer_BPTC001_mesh_t2",
                "mesh_missing" in beh and "mesh_dirty" in beh,
                f"behaviors={beh}",
                {"behaviors": beh, "bbox_count": len(beh)},
            ),
        )

        store = EventStore(max_in_memory=20)
        mesh_eng = MeshAnalysisEngine(store)
        evs = _run_engine_events(mesh_eng, frame_mesh, "A-03", source_pts_sec=2.0)
        bptc = [e for e in evs if e.scenario_id == "BPTC-001"]
        checks.append(
            Check(
                "engine_BPTC001_event_t2",
                len(bptc) >= 1,
                f"events={len(bptc)} ids={[e.id for e in bptc[:3]]}",
                {
                    "count": len(bptc),
                    "behaviors": [e.behavior for e in bptc],
                    "confidences": [round(e.confidence, 3) for e in bptc],
                },
            ),
        )

    for sec, expect_atgt004 in ((9.0, True), (17.0, False)):
        frame = _extract(sec)
        if frame is None:
            continue
        h, w = frame.shape[:2]
        mask = _roi_mask("A-03", w, h)
        fence = _detect_fence_median(frame, mask) is not None
        dets = analyze_atgt_frame(frame, "A-03", source_pts_sec=sec)
        nsm = [d for d in dets if d.behavior == "no_soft_median"]
        checks.append(
            Check(
                f"analyzer_ATGT004_t{int(sec)}",
                (len(nsm) >= 1) if expect_atgt004 else (len(nsm) == 0),
                f"fence={fence} no_soft_median={len(nsm)}",
                {
                    "fence": fence,
                    "no_soft_median": len(nsm),
                    "lane_behaviors": [d.behavior for d in dets if d.behavior.endswith("median")],
                },
            ),
        )
        store = EventStore(max_in_memory=20)
        atgt = AtgtEngine(store)
        evs = _run_engine_events(atgt, frame, "A-03", source_pts_sec=sec)
        atgt004 = [e for e in evs if e.scenario_id == "ATGT-004"]
        atgt002 = [e for e in evs if e.scenario_id == "ATGT-002"]
        checks.append(
            Check(
                f"engine_ATGT004_event_t{int(sec)}",
                (len(atgt004) >= 1) if expect_atgt004 else (len(atgt004) == 0),
                f"ATGT-004={len(atgt004)} ATGT-002={len(atgt002)} (fence={fence})",
                {
                    "ATGT-004": len(atgt004),
                    "ATGT-002": len(atgt002),
                    "fence": fence,
                    "sample_labels": [e.behavior for e in atgt004[:1]],
                },
            ),
        )

    print("=" * 72)
    print("AUDIT USER REPORTED FIXES — evidence")
    print("=" * 72)
    print(f"Video: {VIDEO.name} · {dur:.2f}s\n")

    failed = 0
    for c in checks:
        tag = "PASS" if c.pass_ else "FAIL"
        if not c.pass_:
            failed += 1
        print(f"  [{tag}] {c.id}")
        print(f"         {c.detail}")
        if c.evidence:
            print(f"         evidence: {json.dumps(c.evidence, ensure_ascii=False)}")

    report_path = ROOT / "data" / "audit_user_reported_fixes.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps([asdict(c) for c in checks], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"\n→ JSON: {report_path}")
    print("=" * 72)
    print(f"KẾT QUẢ: {len(checks) - failed}/{len(checks)} PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
