#!/usr/bin/env python3
"""Rà soát 13 kịch bản ATLĐ — engine debounce ghi sự kiện trong 1 loop MP4.

Mô phỏng VMS: mỗi giây video chạy 6 frame AI (VMS_AI_FPS=6) rồi chuyển giây tiếp.
Khác audit_loop_coverage.py (chỉ analyzer 1 frame/giây).

Chạy:
  backend-ai/.venv/bin/python scripts/audit_loop_events.py

Exit 0 = đủ 13/13 scenario_id có event · Exit 1 = thiếu.
"""

from __future__ import annotations

import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from app.atgt_engine import AtgtEngine
from app.crane_proximity_engine import CraneProximityEngine
from app.events import EventStore
from app.mesh_analysis_engine import MeshAnalysisEngine
from app.pccc_engine import PcccEngine
from app.ppe_engine import PpeEngine
from app.road_analysis_engine import RoadAnalysisEngine
from app.wah_engine import WahEngine

from audit_loop_coverage import (  # noqa: E402
    FRAME_CACHE,
    IMPLEMENTED_SCENARIO_IDS,
    VIDEO_BY_CAMERA,
    _video_duration_sec,
)

VMS_AI_FPS = 6.0


@dataclass
class EventHit:
    scenario_id: str
    camera_id: str
    first_sec: int | None
    event_type: str | None


def _extract_frame(camera_id: str, sec: int) -> np.ndarray | None:
    video = VIDEO_BY_CAMERA[camera_id]
    FRAME_CACHE.mkdir(parents=True, exist_ok=True)
    out = FRAME_CACHE / f"{camera_id.replace('-', '')}_t{sec}.jpg"
    if not out.exists():
        subprocess.run(
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
            check=False,
        )
    return cv2.imread(str(out))


def _camera_for_scenario(sid: str) -> str:
    from audit_loop_coverage import SCENARIO_SPEC

    return SCENARIO_SPEC[sid][0]


def scan_loop_events() -> tuple[dict[str, EventHit], set[str]]:
    stores = {
        "A-03": EventStore(max_in_memory=500),
        "A-04": EventStore(max_in_memory=500),
    }
    engines_a03 = {
        "road": RoadAnalysisEngine(stores["A-03"]),
        "mesh": MeshAnalysisEngine(stores["A-03"]),
        "atgt": AtgtEngine(stores["A-03"]),
    }
    engines_a04 = {
        "ppe": PpeEngine(stores["A-04"]),
        "pccc": PcccEngine(stores["A-04"]),
        "wah": WahEngine(stores["A-04"]),
        "crane": CraneProximityEngine(stores["A-04"]),
    }

    hits: dict[str, EventHit] = {
        sid: EventHit(sid, _camera_for_scenario(sid), None, None)
        for sid in IMPLEMENTED_SCENARIO_IDS
    }
    seen: set[str] = set()
    sleep_s = 1.0 / VMS_AI_FPS

    for camera_id, video_path in VIDEO_BY_CAMERA.items():
        if not video_path.exists():
            raise FileNotFoundError(f"Thiếu video demo: {video_path}")
        engines = engines_a03 if camera_id == "A-03" else engines_a04
        duration = int(_video_duration_sec(video_path))

        for sec in range(duration + 1):
            frame = _extract_frame(camera_id, sec)
            if frame is None:
                continue
            for _ in range(int(VMS_AI_FPS)):
                for eng in engines.values():
                    try:
                        _, evs = eng.process_frame(frame, camera_id)
                    except Exception as exc:  # noqa: BLE001
                        print(f"  WARN engine {camera_id} t={sec}: {exc}")
                        continue
                    for ev in evs:
                        sid = ev.scenario_id
                        if sid not in hits:
                            continue
                        seen.add(sid)
                        if hits[sid].first_sec is None:
                            hits[sid].first_sec = sec
                            hits[sid].event_type = f"{ev.group}/{ev.behavior}/{sid}"
                time.sleep(sleep_s)

    return hits, seen


def main() -> int:
    print("=" * 72)
    print("AUDIT LOOP EVENTS — 13 kịch bản ATLĐ / engine debounce / 1 loop VMS")
    print("=" * 72)

    for cam, path in VIDEO_BY_CAMERA.items():
        if path.exists():
            print(f"  {cam}: {path.name} · {_video_duration_sec(path):.1f}s")
        else:
            print(f"  {cam}: MISSING {path}")

    hits, seen = scan_loop_events()
    missing = [sid for sid in IMPLEMENTED_SCENARIO_IDS if sid not in seen]

    print("\n## Engine — sự kiện đầu tiên trong loop (6 FPS/giây video)")
    for sid in IMPLEMENTED_SCENARIO_IDS:
        row = hits[sid]
        if sid in missing:
            print(f"  [MISS] {sid:10} ({row.camera_id})")
        else:
            print(
                f"  [ OK ] {sid:10} ({row.camera_id}) "
                f"t={row.first_sec:2}s  {row.event_type}",
            )

    covered = len(seen)
    print("\n" + "=" * 72)
    print(f"KẾT QUẢ: {covered}/13 kịch bản có sự kiện ghi log trong 1 loop")
    if missing:
        print(f"THIẾU: {', '.join(missing)}")
        return 1
    print("OK — đủ 13/13 sự kiện engine (VMS debounce).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
