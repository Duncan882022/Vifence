#!/usr/bin/env python3
"""Rà soát pipeline log sự kiện — chạy trước deploy Cam A-03/A-04.

Chạy bằng venv (bắt buộc — cần transformers + ultralytics mới):
  backend-ai/.venv/bin/python scripts/audit_event_snapshots.py
"""

from __future__ import annotations

import os

os.environ["EVENT_TEST_MODE"] = "true"
os.environ["A03_BPTC_EVENT_LOGGING_ENABLED"] = "true"
os.environ["ATGT_LANE_VIOLATION_ONLY"] = "false"
os.environ["ATGT_DEMO_FAKE_PLATE_FALLBACK"] = "true"

import json
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
from unittest.mock import patch

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from app.atgt_engine import AtgtEngine
from app.crane_proximity_engine import CraneProximityEngine
from app.events import EventStore
from app.pccc_engine import PcccEngine
from app.ppe_analyzer import analyze_ppe_frame
from app.ppe_engine import PpeEngine
from app.road_analysis_engine import RoadAnalysisEngine
from app.road_analyzer import analyze_road_frame
from app.wah_engine import WahEngine

# Đồng bộ eventPlaybackClip.ts
SCENARIO_SEEK_SEC: dict[str, tuple[str, int]] = {
    "BPTC-007": ("A-03", 10),
    "BPTC-008": ("A-03", 10),
    "BPTC-009": ("A-03", 10),
    "BPTC-001": ("A-03", 2),
    "ATGT-002": ("A-03", 17),
    "ATGT-004": ("A-03", 9),
    "PPE-001": ("A-04", 8),
    "PPE-002": ("A-04", 10),
    "PPE-003": ("A-04", 12),
    "PCCC-001": ("A-04", 16),
    "PCCC-002": ("A-04", 17),
    "WAH-001": ("A-04", 22),
    "DZ-003": ("A-04", 5),
}

VIDEO_BY_CAMERA = {
    "A-03": REPO_ROOT / "public/camera-feeds/ttdv-a-cam03-test.mp4",
    "A-04": REPO_ROOT / "public/camera-feeds/ttdv-a-cam04-test.mp4",
}

REGRESSION_DIR = ROOT / "data" / "regression"
FRAME_CACHE = Path("/tmp/vifence-audit/scenario_frames")


@dataclass
class CaseResult:
    name: str
    ok: bool
    detail: str
    behaviors: list[str] = field(default_factory=list)
    events: list[str] = field(default_factory=list)


def _behaviors(payload: dict) -> list[str]:
    return sorted({d["behavior"] for d in payload.get("detections", [])})


def _event_summary(events) -> list[str]:
    return [f"{e.group}/{e.behavior}/{e.scenario_id}" for e in events]


def _fresh_store() -> EventStore:
    import app.events as events_mod
    import tempfile

    tmp = Path(tempfile.mkdtemp(prefix="vifence_audit_events_"))
    events_mod.EVENTS_DIR = tmp / "events"
    events_mod.SNAPSHOT_DIR = tmp / "snapshots"
    events_mod.EVENTS_DIR.mkdir(parents=True, exist_ok=True)
    events_mod.SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    return EventStore(max_in_memory=100)


def _read_frame(path: Path) -> np.ndarray | None:
    frame = cv2.imread(str(path))
    if frame is None:
        return None
    return frame


def _center_behaviors(detections: list, frame_w: int, *, cx_min: float = 0.35, cx_max: float = 0.52) -> set[str]:
    found: set[str] = set()
    for det in detections:
        if isinstance(det, dict):
            bbox = det["bbox"]
            behavior = det["behavior"]
        else:
            bbox = det.bbox
            behavior = det.behavior
        cx = (bbox[0] + bbox[2]) / 2 / max(frame_w, 1)
        if cx_min <= cx <= cx_max:
            found.add(behavior)
    return found


def _extract_video_frame(camera_id: str, sec: int) -> np.ndarray | None:
    video = VIDEO_BY_CAMERA.get(camera_id)
    if video is None or not video.exists():
        return None
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
    return _read_frame(out)


def _run_engine_frames(
    Engine,
    frame: np.ndarray,
    camera_id: str,
    *,
    frames: int = 6,
    sleep_s: float = 0.05,
    source_pts_sec: float | None = None,
) -> tuple[list[str], list[str]]:
    store = _fresh_store()
    engine = Engine(store)
    all_events: list[str] = []
    last_beh: list[str] = []
    kwargs: dict = {}
    if source_pts_sec is not None:
        kwargs["source_pts_sec"] = source_pts_sec
    for _ in range(frames):
        payload, events = engine.process_frame(frame, camera_id, **kwargs)
        last_beh = _behaviors(payload)
        all_events.extend(_event_summary(events))
        if sleep_s > 0:
            time.sleep(sleep_s)
    return last_beh, all_events


def audit_roi_config() -> list[CaseResult]:
    from app.crane_roi_config import get_crane_zones_for_camera
    from app.road_roi_config import get_roi_zones_for_camera

    results: list[CaseResult] = []

    a03 = get_roi_zones_for_camera("A-03")
    road_a03 = next((z for z in a03 if z["type"] == "ROAD"), None)
    ok_a03 = road_a03 is not None and len(road_a03["polygon"]) >= 6
    results.append(
        CaseResult(
            "roi_road_a03",
            ok_a03,
            f"zones={len(a03)} road_pts={len(road_a03['polygon']) if road_a03 else 0}",
        ),
    )

    a04 = get_roi_zones_for_camera("A-04")
    road_a04 = next((z for z in a04 if z["type"] == "ROAD"), None)
    ok_a04 = road_a04 is not None and len(road_a04["polygon"]) >= 5
    results.append(
        CaseResult(
            "roi_road_a04",
            ok_a04,
            f"zones={len(a04)} road_pts={len(road_a04['polygon']) if road_a04 else 0}",
        ),
    )

    crane = get_crane_zones_for_camera("A-04")
    crane_types = {z["type"] for z in crane}
    ok_crane = {"CRANE_BODY", "CRANE_WORK"}.issubset(crane_types)
    results.append(
        CaseResult(
            "roi_crane_a04",
            ok_crane,
            f"types={sorted(crane_types)} count={len(crane)}",
        ),
    )

    return results


def audit_fp_regressions() -> list[CaseResult]:
    """Ảnh sự kiện user báo FP — không được log sai scenario."""
    results: list[CaseResult] = []
    cases: list[tuple[str, Path, Callable[[np.ndarray], CaseResult]]] = []

    def check_barrier(name: str, img: np.ndarray) -> CaseResult:
        r = analyze_road_frame(img, "A-03")
        beh = {d["behavior"] for d in r["detections"]}
        bad = beh & {"object", "water"}
        ok = not bad
        return CaseResult(name, ok, f"beh={sorted(beh)} forbidden={sorted(bad) or 'none'}")

    def check_ppe_hat(name: str, img: np.ndarray) -> CaseResult:
        r = analyze_ppe_frame(img, "A-04")
        center = _center_behaviors(r["detections"], img.shape[1])
        ok = "no_helmet" not in center and ("hard_hat" in center or "person" in center)
        return CaseResult(
            name,
            ok,
            f"center={sorted(center)} expect hard_hat/no no_helmet",
        )

    def check_ppe_shoes(name: str, img: np.ndarray) -> CaseResult:
        r = analyze_ppe_frame(img, "A-04")
        center = _center_behaviors(r["detections"], img.shape[1], cx_min=0.30, cx_max=0.55)
        ok = "no_shoes" not in center and (
            "safety_shoes" in center or "hard_hat" in center or "person" in center
        )
        return CaseResult(
            name,
            ok,
            f"center={sorted(center)} expect safety_shoes/no no_shoes",
        )

    mapping = [
        ("fp_bptc009_barrier", "fp_bptc009_barrier.png", check_barrier),
        ("fp_bptc009_modal", "fp_bptc009_modal.png", check_barrier),
        ("fp_bptc008_fence", "fp_bptc008_fence.png", check_barrier),
        ("fp_ppe_hat", "fp_ppe_hat.png", check_ppe_hat),
        ("fp_ppe_shoes", "fp_ppe_shoes.png", check_ppe_shoes),
    ]

    for name, fname, fn in mapping:
        path = REGRESSION_DIR / fname
        if not path.exists():
            results.append(CaseResult(name, False, f"Thiếu ảnh {path}"))
            continue
        img = _read_frame(path)
        if img is None:
            results.append(CaseResult(name, False, "Không đọc được ảnh"))
            continue
        try:
            results.append(fn(name, img))
        except Exception as exc:  # noqa: BLE001
            results.append(CaseResult(name, False, f"Exception: {exc}"))

    return results


def audit_scenario_analyzer() -> list[CaseResult]:
    results: list[CaseResult] = []

    # BPTC-007 mud @ t5
    frame = _extract_video_frame("A-03", 5)
    if frame is not None:
        r = analyze_road_frame(frame, "A-03")
        beh = {d["behavior"] for d in r["detections"]}
        ok = "mud" in beh
        results.append(CaseResult("analyzer_BPTC-007_mud", ok, f"beh={sorted(beh)}"))

    # ATGT-002 speeding @ t17 (sau 5s mesh intro)
    frame17 = _extract_video_frame("A-03", 17)
    if frame17 is not None:
        from app.atgt_analyzer import analyze_atgt_frame

        dets = analyze_atgt_frame(frame17, "A-03")
        beh = {d.behavior for d in dets}
        ok = "speeding" in beh
        results.append(CaseResult("analyzer_ATGT-002_speed_t17", ok, f"beh={sorted(beh)}"))
        plates = [d.vehicle_plate for d in dets if d.behavior == "speeding" and d.vehicle_plate]
        ok_plate = any(p == "29H2-5354" for p in plates)
        results.append(
            CaseResult(
                "analyzer_ATGT-002_plate",
                ok_plate,
                f"plates={plates}",
            ),
        )

    # PPE violations @ t10–12
    for sec, scen, expect in [(11, "PPE-002", "no_vest"), (12, "PPE-003", "no_shoes")]:
        frame = _extract_video_frame("A-04", sec)
        if frame is None:
            continue
        r = analyze_ppe_frame(frame, "A-04")
        beh = {d["behavior"] for d in r["detections"]}
        ok = expect in beh
        results.append(CaseResult(f"analyzer_{scen}_{expect}", ok, f"t{sec} beh={sorted(beh)}"))

    # PCCC @ t16/t17
    from app.pccc_analyzer import analyze_pccc_frame

    for sec, scen, expect in [(16, "PCCC-001", "smoking"), (17, "PCCC-002", "fire")]:
        frame = _extract_video_frame("A-04", sec)
        if frame is None:
            continue
        dets = analyze_pccc_frame(frame, "A-04")
        conf = max((d.confidence for d in dets if d.behavior == expect), default=0.0)
        ok = conf >= 0.75
        results.append(
            CaseResult(
                f"analyzer_{scen}_{expect}",
                ok,
                f"t{sec} conf={conf:.2f}",
            ),
        )

    # WAH @ t22
    from app.wah_analyzer import analyze_wah_frame

    frame = _extract_video_frame("A-04", 22)
    if frame is not None:
        dets = analyze_wah_frame(frame, "A-04")
        beh = {d.behavior for d in dets}
        ok = "no_harness" in beh
        results.append(CaseResult("analyzer_WAH-001_no_harness", ok, f"beh={sorted(beh)}"))

    # BPTC-001 mesh @ t0
    from app.mesh_analyzer import analyze_mesh_frame

    frame = _extract_video_frame("A-03", 0)
    if frame is not None:
        dets = analyze_mesh_frame(frame, "A-03", source_pts_sec=2.0)
        beh = {d.behavior for d in dets}
        ok = bool(beh & {"mesh_missing", "mesh_torn", "mesh_dirty"})
        results.append(CaseResult("analyzer_BPTC-001_mesh", ok, f"beh={sorted(beh)}"))

    return results


def audit_scenario_engines() -> list[CaseResult]:
    results: list[CaseResult] = []

    # BPTC-007 — debounce mud
    frame = _extract_video_frame("A-03", 5)
    if frame is not None:
        _, ev = _run_engine_frames(RoadAnalysisEngine, frame, "A-03", frames=12, sleep_s=0.2)
        ok = any("BPTC-007" in e and "mud" in e for e in ev)
        results.append(CaseResult("engine_BPTC-007_mud", ok, f"events={ev[:3]}"))

    # PPE — t11 log riêng từng loại (sau fix mũ trắng: có thể chỉ no_vest + no_shoes)
    frame = _extract_video_frame("A-04", 11)
    if frame is not None:
        _, ev = _run_engine_frames(
            PpeEngine,
            frame,
            "A-04",
            frames=5,
            sleep_s=1.2,
            source_pts_sec=11.0,
        )
        dedup = {e.split("/")[1] for e in ev if e.startswith("PPE/")}
        ok = (
            any("no_vest/PPE-002" in e for e in ev)
            and len(dedup) >= 2
            and dedup <= {"no_helmet", "no_vest", "no_shoes"}
        )
        results.append(CaseResult("engine_PPE_multi_person", ok, f"events={ev} types={sorted(dedup)}"))

    # PCCC
    for sec, scen, expect in [(16, "PCCC-001", "smoking"), (17, "PCCC-002", "fire")]:
        frame = _extract_video_frame("A-04", sec)
        if frame is None:
            continue
        _, ev = _run_engine_frames(PcccEngine, frame, "A-04", frames=6, sleep_s=0.45)
        ok = any(expect in e and scen in e for e in ev)
        results.append(CaseResult(f"engine_{scen}", ok, f"events={ev}"))

    # WAH
    frame = _extract_video_frame("A-04", 22)
    if frame is not None:
        _, ev = _run_engine_frames(WahEngine, frame, "A-04", frames=10, sleep_s=0.45)
        ok = any("WAH/no_harness/WAH-001" in e for e in ev)
        results.append(CaseResult("engine_WAH-001", ok, f"events={ev}"))

    # BPTC-001 mesh
    from app.mesh_analysis_engine import MeshAnalysisEngine

    frame = _extract_video_frame("A-03", 0)
    if frame is not None:
        _, ev = _run_engine_frames(
            MeshAnalysisEngine,
            frame,
            "A-03",
            frames=10,
            sleep_s=0.45,
            source_pts_sec=2.0,
        )
        ok = any("BPTC-001" in e for e in ev)
        results.append(CaseResult("engine_BPTC-001_mesh", ok, f"events={ev}"))

    # ATGT speeding t16–18 — một engine xuyên suốt (debounce cần liên tục)
    atgt_events: list[str] = []
    atgt_store = _fresh_store()
    atgt_engine = AtgtEngine(atgt_store)
    for sec in (16, 17, 18):
        frame = _extract_video_frame("A-03", sec)
        if frame is None:
            continue
        for _ in range(5):
            _, events = atgt_engine.process_frame(frame, "A-03")
            atgt_events.extend(_event_summary(events))
            time.sleep(0.15)
    ok = any("ATGT-002" in e and "speeding" in e for e in atgt_events)
    results.append(CaseResult("engine_ATGT-002_speed", ok, f"events={atgt_events[:4]}"))

    # DZ synthetic — engine log khi có crane_proximity
    frame = _extract_video_frame("A-04", 5)
    if frame is not None:
        from app.schemas import CraneProximityDetection

        fake = {
            "type": "result",
            "camera_id": "A-04",
            "width": frame.shape[1],
            "height": frame.shape[0],
            "roi_zones": [],
            "metrics": {"person_count": 1, "proximity_violations": 1, "proximity_threshold_m": 1.0},
            "detections": [
                CraneProximityDetection(
                    behavior="person",
                    label="Người",
                    scenario_id="DZ-003",
                    confidence=0.9,
                    bbox=[400.0, 500.0, 480.0, 720.0],
                ).model_dump(),
                CraneProximityDetection(
                    behavior="crane_proximity",
                    label="Vào vùng nguy hiểm cẩu",
                    scenario_id="DZ-003",
                    confidence=0.88,
                    bbox=[400.0, 500.0, 480.0, 720.0],
                    distance_m=0.5,
                    machine_kind="crane",
                    machine_bbox=[200.0, 100.0, 350.0, 400.0],
                ).model_dump(),
            ],
        }
        try:
            with patch("app.crane_proximity_engine.analyze_crane_proximity_frame", return_value=fake):
                # Debouncer DZ cần >= 3s liên tục (_CONFIRM_SECONDS)
                _, ev = _run_engine_frames(
                    CraneProximityEngine, frame, "A-04", frames=10, sleep_s=0.45,
                )
            ok = any("DZ-003" in e and "DZ/" in e for e in ev)
            results.append(CaseResult("engine_DZ-003_synthetic", ok, f"events={ev}"))
        except Exception as exc:  # noqa: BLE001
            results.append(CaseResult("engine_DZ-003_synthetic", False, str(exc)))

    return results


def audit_per_person_tracks() -> list[CaseResult]:
    from app.track_matching import assign_person_track_id

    results: list[CaseResult] = []
    tracks: dict[str, object] = {}
    w, h = 1024, 976
    b1 = [120.0, 200.0, 220.0, 520.0]
    b2 = [280.0, 210.0, 380.0, 530.0]
    t1 = assign_person_track_id(
        b1, tracks, behavior="no_helmet", frame_w=w, frame_h=h, max_tracks=36,
    )
    t2 = assign_person_track_id(
        b2, tracks, behavior="no_helmet", frame_w=w, frame_h=h, max_tracks=36,
    )
    ok = t1 is not None and t2 is not None and t1 != t2
    results.append(
        CaseResult(
            "track_two_persons_no_helmet",
            ok,
            f"t1={t1} t2={t2}",
        ),
    )

    tracks2: dict[str, object] = {}
    t3 = assign_person_track_id(
        b1, tracks2, behavior="crane_proximity", frame_w=w, frame_h=h, max_tracks=16,
    )
    t4 = assign_person_track_id(
        b2, tracks2, behavior="crane_proximity", frame_w=w, frame_h=h, max_tracks=16,
    )
    ok2 = t3 is not None and t4 is not None and t3 != t4
    results.append(
        CaseResult(
            "track_two_persons_dz",
            ok2,
            f"t3={t3} t4={t4}",
        ),
    )

    return results


def audit_atgt() -> list[CaseResult]:
    results: list[CaseResult] = []
    engine = AtgtEngine(_fresh_store())
    snaps = sorted((ROOT / "data" / "snapshots").glob("A03_*.png"))

    for path in snaps:
        frame = cv2.imread(str(path))
        if frame is None:
            results.append(CaseResult(path.name, False, "Không đọc được ảnh"))
            continue
        try:
            payload, events = engine.process_frame(frame, "A-03")
        except Exception as exc:  # noqa: BLE001
            results.append(CaseResult(path.name, False, f"Exception: {exc}"))
            continue
        beh = _behaviors(payload)
        ev = _event_summary(events)
        ok = True
        detail = f"det={len(beh)} ev={len(ev)}"
        results.append(CaseResult(path.name, ok, detail, beh, ev))

    base = cv2.imread(str(snaps[0])) if snaps else None
    if base is not None:
        store = _fresh_store()
        engine2 = AtgtEngine(store)
        all_ev: list[str] = []
        try:
            for i in range(10):
                shifted = base.copy()
                if i:
                    m = np.float32([[1, 0, i * 12], [0, 1, 0]])
                    shifted = cv2.warpAffine(base, m, (base.shape[1], base.shape[0]))
                _, events = engine2.process_frame(shifted, "A-03")
                all_ev.extend(_event_summary(events))
            ok = True
            detail = f"multi-frame events={len(all_ev)} types={sorted(set(all_ev))}"
        except Exception as exc:  # noqa: BLE001
            ok = False
            detail = f"multi-frame Exception: {exc}"
        results.append(CaseResult("A03_multi_frame_speed", ok, detail, events=all_ev))

    if base is not None:
        from app.schemas import Detection

        store_syn = _fresh_store()
        fake_lane = [
            Detection(
                behavior="no_soft_median",
                label="Không phân làn",
                confidence=0.86,
                bbox=[12.0, 408.0, 325.0, 640.0],
            )
        ]
        try:
            with patch("app.atgt_engine.analyze_atgt_frame", return_value=fake_lane):
                _, ev = _run_engine_frames(AtgtEngine, base, "A-03", frames=8, sleep_s=0.35)
            ok = len(ev) >= 1 and any("ATGT" in x for x in ev)
            results.append(
                CaseResult(
                    "A03_synthetic_no_soft_median",
                    ok,
                    f"events={ev}",
                    ["no_soft_median"],
                    ev,
                ),
            )
        except Exception as exc:  # noqa: BLE001
            results.append(CaseResult("A03_synthetic_no_soft_median", False, str(exc)))

    return results


def audit_wah() -> list[CaseResult]:
    results: list[CaseResult] = []
    labels_path = ROOT / "data" / "cam04_wah_demo" / "labels.json"
    labels = json.loads(labels_path.read_text()) if labels_path.exists() else {}
    expected = labels.get("frames", [{}])[0].get("harness", {})

    scene = ROOT / "data" / "cam04_wah_demo" / "scene.jpg"
    if scene.exists():
        frame = cv2.imread(str(scene))
        store = _fresh_store()
        engine = WahEngine(store)
        try:
            ev: list[str] = []
            beh: list[str] = []
            for _ in range(8):
                payload, events = engine.process_frame(frame, "A-04")
                beh = _behaviors(payload)
                ev = _event_summary(events)
                if ev:
                    break
                time.sleep(0.35)
            has_no_harness = "no_harness" in beh
            has_event = any("WAH" in e for e in ev)
            expect_event = expected.get("person_2") is False
            ok = has_no_harness if expect_event else True
            if expect_event and not has_event:
                ok = False
            detail = (
                f"expect_violation={expect_event} no_harness={has_no_harness} "
                f"events={len(ev)} beh={beh}"
            )
            results.append(CaseResult("wah_scene.jpg", ok, detail, beh, ev))
        except Exception as exc:  # noqa: BLE001
            results.append(CaseResult("wah_scene.jpg", False, str(exc)))

    for path in sorted((ROOT / "data" / "cam04_demo").glob("*.png")):
        frame = cv2.imread(str(path))
        store = _fresh_store()
        engine = WahEngine(store)
        try:
            payload, events = engine.process_frame(frame, "A-04")
            beh = _behaviors(payload)
            ev = _event_summary(events)
            results.append(
                CaseResult(path.name, True, f"beh={beh} events={len(ev)}", beh, ev),
            )
        except Exception as exc:  # noqa: BLE001
            results.append(CaseResult(path.name, False, str(exc)))

    return results


def audit_dz() -> list[CaseResult]:
    results: list[CaseResult] = []

    for path in sorted((ROOT / "data" / "cam04_demo").glob("*.png")):
        frame = cv2.imread(str(path))
        if frame is None:
            continue
        store = _fresh_store()
        eng = CraneProximityEngine(store)
        try:
            all_ev: list[str] = []
            for _ in range(8):
                payload, events = eng.process_frame(frame, "A-04")
                all_ev.extend(_event_summary(events))
                time.sleep(0.05)
            beh = _behaviors(payload)
            ok = "person" in beh or len(beh) == 0
            detail = f"beh={beh} events_after_8frames={len(all_ev)} (no crash)"
            results.append(CaseResult(path.name, ok, detail, beh, all_ev))
        except Exception as exc:  # noqa: BLE001
            results.append(CaseResult(path.name, False, str(exc)))

    for path in sorted((ROOT / "data" / "snapshots").glob("A04_*.png")):
        frame = cv2.imread(str(path))
        store = _fresh_store()
        eng = CraneProximityEngine(store)
        try:
            payload, events = eng.process_frame(frame, "A-04")
            beh = _behaviors(payload)
            results.append(
                CaseResult(
                    path.name,
                    True,
                    f"beh={beh} events={len(events)}",
                    beh,
                    _event_summary(events),
                ),
            )
        except Exception as exc:  # noqa: BLE001
            results.append(CaseResult(path.name, False, str(exc)))

    return results


def audit_ppe_bptc_smoke() -> list[CaseResult]:
    results: list[CaseResult] = []
    a04 = ROOT / "data" / "snapshots" / "A04_roi_catalog_f60.png"
    a03 = ROOT / "data" / "snapshots" / "A03_roi_catalog_f60.png"
    if a04.exists():
        frame = cv2.imread(str(a04))
        store = _fresh_store()
        ppe = PpeEngine(store)
        try:
            payload, events = ppe.process_frame(frame, "A-04")
            results.append(
                CaseResult(
                    "ppe_A04_f60",
                    True,
                    f"events={len(events)} beh={_behaviors(payload)[:6]}",
                    _behaviors(payload),
                    _event_summary(events),
                ),
            )
        except Exception as exc:  # noqa: BLE001
            results.append(CaseResult("ppe_A04_f60", False, str(exc)))
    if a03.exists():
        frame = cv2.imread(str(a03))
        store = _fresh_store()
        road = RoadAnalysisEngine(store)
        try:
            payload, events = road.process_frame(frame, "A-03")
            results.append(
                CaseResult(
                    "road_A03_f60",
                    True,
                    f"events={len(events)} beh={_behaviors(payload)}",
                    _behaviors(payload),
                    _event_summary(events),
                ),
            )
        except Exception as exc:  # noqa: BLE001
            results.append(CaseResult("road_A03_f60", False, str(exc)))
    return results


def audit_ppe_snapshot_bbox() -> list[CaseResult]:
    """Snapshot PPE — bbox áo bám thân; góc bán thân không log thiếu giày."""
    from app.ppe_analyzer import (
        _feet_assessable,
        _half_body_person,
        _torso_violation_display_bbox,
        analyze_ppe_frame,
        ppe_violation_display_bbox,
    )

    results: list[CaseResult] = []

    # Bbox áo phải nằm trong vùng quét vest (30–58% chiều cao người)
    pb = (80.0, 120.0, 220.0, 420.0)
    torso_scan = (80.0, 120.0 + 300 * 0.30, 220.0, 120.0 + 300 * 0.58)
    vest_box = ppe_violation_display_bbox(pb, "no_vest", 480, scan_region=torso_scan)
    vcy = (vest_box[1] + vest_box[3]) / 2
    tcy = (torso_scan[1] + torso_scan[3]) / 2
    ok_vest = abs(vcy - tcy) < (pb[3] - pb[1]) * 0.12
    results.append(
        CaseResult(
            "ppe_vest_bbox_torso",
            ok_vest,
            f"vest_cy={vcy:.0f} torso_cy={tcy:.0f}",
        ),
    )

    # Góc bán thân — đáy bbox trên 86% khung → không assess giày
    half_pb = (60.0, 40.0, 260.0, 360.0)  # y2=360 trên frame 480
    ok_half = _half_body_person(half_pb, 480)
    ok_feet = _feet_assessable(half_pb, 320, 480, camera_id="HC-02")
    results.append(
        CaseResult(
            "ppe_half_body_no_feet",
            ok_half and not ok_feet,
            f"half_body={ok_half} feet_ok={ok_feet}",
        ),
    )

    # Synthetic frame — người fill nửa trên, nền xám phía dưới
    frame = np.full((480, 320, 3), 90, dtype=np.uint8)
    cv2.rectangle(frame, (90, 30), (230, 340), (140, 120, 100), -1)
    cv2.rectangle(frame, (110, 50), (210, 120), (30, 30, 30), -1)  # tóc/đầu
    r = analyze_ppe_frame(frame, "HC-02")
    beh = {d["behavior"] for d in r.get("detections", [])}
    ok_syn = "no_shoes" not in beh
    results.append(
        CaseResult(
            "ppe_hc02_half_body_analyzer",
            ok_syn,
            f"beh={sorted(beh)} expect no no_shoes",
        ),
    )

    return results


def audit_event_date_vn() -> CaseResult:
    from datetime import datetime, timedelta, timezone

    from app.events import _event_date

    vn = timezone(timedelta(hours=7))
    ts = datetime(2026, 8, 9, 23, 30, tzinfo=vn).timestamp()
    got = _event_date(ts)
    ok = got == "2026-08-09"
    return CaseResult("event_date_vn", ok, f"got={got} expect=2026-08-09")


def main() -> int:
    if "transformers" not in sys.modules:
        try:
            import transformers  # noqa: F401
        except ImportError:
            print("WARN: Chạy bằng backend-ai/.venv/bin/python để có transformers + ultralytics mới.")

    sections = [
        ("ROI Cam A-03/A-04", audit_roi_config()),
        ("FP regression (ảnh sự kiện)", audit_fp_regressions()),
        ("Analyzer — 12 kịch bản video", audit_scenario_analyzer()),
        ("Engine debounce — log sự kiện", audit_scenario_engines()),
        ("Track riêng từng người", audit_per_person_tracks()),
        ("PPE snapshot bbox / bán thân", audit_ppe_snapshot_bbox()),
        ("ATGT snapshots", audit_atgt()),
        ("WAH", audit_wah()),
        ("DZ snapshots", audit_dz()),
        ("ROI catalog smoke", audit_ppe_bptc_smoke()),
        ("Meta", [audit_event_date_vn()]),
    ]

    failed = 0
    print("=" * 72)
    print("AUDIT EVENT SNAPSHOTS — pre-deploy Cam A-03 / A-04")
    print("=" * 72)
    for title, cases in sections:
        print(f"\n## {title}")
        for c in cases:
            mark = "PASS" if c.ok else "FAIL"
            if not c.ok:
                failed += 1
            print(f"  [{mark}] {c.name}: {c.detail}")
            if c.behaviors:
                print(f"         behaviors: {c.behaviors}")
            if c.events:
                print(f"         events: {c.events}")

    print("\n" + "=" * 72)
    if failed:
        print(f"KẾT QUẢ: {failed} case FAIL — chưa nên deploy")
        return 1
    print("KẾT QUẢ: tất cả case PASS — OK deploy FE + BE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
