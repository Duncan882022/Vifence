#!/usr/bin/env python3
"""Rà soát 13 kịch bản ATLĐ trên 1 vòng loop MP4 Cam A-03 + A-04.

Tiêu chí demo: sau 1 loop mỗi camera, analyzer phải thấy ít nhất 1 frame
có behavior tương ứng mỗi scenario (IMPLEMENTED_SAFETY_SCENARIO_IDS).

Chạy:
  backend-ai/.venv/bin/python scripts/audit_loop_coverage.py

Exit 0 = đủ 13/13 analyzer hit · Exit 1 = thiếu kịch bản — cần xem lại video / model / engine.
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from app.atgt_analyzer import analyze_atgt_frame
from app.crane_proximity_analyzer import analyze_crane_proximity_frame
from app.mesh_analyzer import analyze_mesh_frame
from app.pccc_analyzer import analyze_pccc_frame
from app.ppe_analyzer import analyze_ppe_frame
from app.road_analyzer import analyze_road_frame
from app.wah_analyzer import analyze_wah_frame

# Đồng bộ implementedSafetyCatalog.ts + eventPlaybackClip.ts
IMPLEMENTED_SCENARIO_IDS = [
    "PPE-001",
    "PPE-002",
    "PPE-003",
    "WAH-001",
    "DZ-003",
    "ATGT-002",
    "ATGT-004",
    "BPTC-001",
    "BPTC-007",
    "BPTC-008",
    "BPTC-009",
    "PCCC-001",
    "PCCC-002",
]

SCENARIO_SPEC: dict[str, tuple[str, str, frozenset[str]]] = {
    "BPTC-007": ("A-03", "road", frozenset({"mud"})),
    "BPTC-008": ("A-03", "road", frozenset({"water"})),
    "BPTC-009": ("A-03", "road", frozenset({"object"})),
    "BPTC-001": ("A-03", "mesh", frozenset({"mesh_missing", "mesh_torn", "mesh_dirty"})),
    "ATGT-002": ("A-03", "atgt", frozenset({"speeding"})),
    "ATGT-004": ("A-03", "atgt", frozenset({"no_soft_median", "soft_median"})),
    "PPE-001": ("A-04", "ppe", frozenset({"no_helmet"})),
    "PPE-002": ("A-04", "ppe", frozenset({"no_vest"})),
    "PPE-003": ("A-04", "ppe", frozenset({"no_shoes"})),
    "PCCC-001": ("A-04", "pccc", frozenset({"smoking"})),
    "PCCC-002": ("A-04", "pccc", frozenset({"fire"})),
    "WAH-001": ("A-04", "wah", frozenset({"no_harness"})),
    "DZ-003": ("A-04", "crane", frozenset({"crane_proximity"})),
}

VIDEO_BY_CAMERA = {
    "A-03": REPO_ROOT / "public/camera-feeds/ttdv-a-cam03-test.mp4",
    "A-04": REPO_ROOT / "public/camera-feeds/ttdv-a-cam04-test.mp4",
}

FRAME_CACHE = Path("/tmp/vifence-loop-coverage")


@dataclass
class ScenarioHit:
    scenario_id: str
    camera_id: str
    first_sec: int | None
    behaviors: list[str]


def _video_duration_sec(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
    ).strip()
    return float(out)


def _extract_frame(camera_id: str, sec: int) -> np.ndarray | None:
    video = VIDEO_BY_CAMERA[camera_id]
    FRAME_CACHE.mkdir(parents=True, exist_ok=True)
    out = FRAME_CACHE / f"{camera_id.replace('-', '')}_t{sec}.jpg"
    if not out.exists():
        proc = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                str(sec),
                "-i",
                str(video),
                "-frames:v",
                "1",
                str(out),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if proc.returncode != 0:
            return None
    frame = cv2.imread(str(out))
    return frame


def _analyze(engine: str, camera_id: str, frame: np.ndarray, *, sec: int) -> set[str]:
    pts = float(sec)
    if engine == "road":
        return {
            d["behavior"]
            for d in analyze_road_frame(frame, camera_id, source_pts_sec=pts)["detections"]
        }
    if engine == "atgt":
        return {d.behavior for d in analyze_atgt_frame(frame, camera_id, source_pts_sec=pts)}
    if engine == "ppe":
        return {
            d["behavior"]
            for d in analyze_ppe_frame(frame, camera_id, source_pts_sec=pts)["detections"]
        }
    if engine == "pccc":
        return {d.behavior for d in analyze_pccc_frame(frame, camera_id, source_pts_sec=pts)}
    if engine == "wah":
        return {d.behavior for d in analyze_wah_frame(frame, camera_id)}
    if engine == "crane":
        payload = analyze_crane_proximity_frame(frame, camera_id, source_pts_sec=pts)
        return {d["behavior"] for d in payload.get("detections", [])}
    if engine == "mesh":
        return {d.behavior for d in analyze_mesh_frame(frame, camera_id, source_pts_sec=pts)}
    return set()


def scan_loop_coverage() -> list[ScenarioHit]:
    hits: dict[str, ScenarioHit] = {}
    for sid in IMPLEMENTED_SCENARIO_IDS:
        cam, _, _ = SCENARIO_SPEC[sid]
        hits[sid] = ScenarioHit(sid, cam, None, [])

    for camera_id, video_path in VIDEO_BY_CAMERA.items():
        if not video_path.exists():
            raise FileNotFoundError(f"Thiếu video demo: {video_path}")
        duration = int(_video_duration_sec(video_path))
        for sec in range(duration + 1):
            frame = _extract_frame(camera_id, sec)
            if frame is None:
                continue
            for sid, (cam, engine, expect) in SCENARIO_SPEC.items():
                if cam != camera_id or hits[sid].first_sec is not None:
                    continue
                found = _analyze(engine, camera_id, frame, sec=sec) & set(expect)
                if found:
                    hits[sid].first_sec = sec
                    hits[sid].behaviors = sorted(found)

    return [hits[sid] for sid in IMPLEMENTED_SCENARIO_IDS]


def main() -> int:
    print("=" * 72)
    print("AUDIT LOOP COVERAGE — 13 kịch bản ATLĐ / 1 vòng MP4 A-03 + A-04")
    print("=" * 72)

    for cam, path in VIDEO_BY_CAMERA.items():
        if path.exists():
            print(f"  {cam}: {path.name} · {_video_duration_sec(path):.1f}s")
        else:
            print(f"  {cam}: MISSING {path}")

    results = scan_loop_coverage()
    missing: list[str] = []

    print("\n## Analyzer — frame đầu tiên có hit trong loop")
    for row in results:
        if row.first_sec is None:
            missing.append(row.scenario_id)
            print(f"  [MISS] {row.scenario_id:10} ({row.camera_id})")
        else:
            print(
                f"  [ OK ] {row.scenario_id:10} ({row.camera_id}) "
                f"t={row.first_sec:2}s  {row.behaviors}",
            )

    covered = len(IMPLEMENTED_SCENARIO_IDS) - len(missing)
    print("\n" + "=" * 72)
    print(f"KẾT QUẢ: {covered}/13 kịch bản có hit trong 1 loop")
    if missing:
        print(f"THIẾU: {', '.join(missing)}")
        print("→ Cần xem lại: nội dung MP4 demo, ROI, model, hoặc engine VMS (vd BPTC-001 mesh).")
        return 1
    print("OK — đủ 13/13 trên analyzer (chưa thay thế audit debounce engine).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
