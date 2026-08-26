#!/usr/bin/env python3
"""Audit Module 05 — Patrol HC-* (PPE mobile, Persons, GPS, metrics, bbox).

Kiểm tra pipeline tuần tra mũ/bodycam:
  - Lọc camera / sự kiện PPE + PERS
  - ID ẩn danh sgc-0xxxxxxx
  - GPS + metrics mobile (peak person, grace online)
  - PPE analyzer HC-02 (dual-range, bbox bán thân, scale mobile)
  - Engine ghi PERS-001 + PPE trên HC-*

Chạy:
  backend-ai/.venv/bin/python scripts/audit_module05_patrol.py
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import cv2
import numpy as np

os.environ.setdefault("EVENT_TEST_MODE", "true")

ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

PPE_WORKERS_JPG = REPO_ROOT / "public/camera-feeds/cam04-ppe-workers.jpg"


@dataclass
class CaseResult:
    name: str
    ok: bool
    detail: str
    extra: list[str] = field(default_factory=list)


def _read_frame(path: Path) -> np.ndarray | None:
    if not path.exists():
        return None
    return cv2.imread(str(path))


def _fresh_store():
    import app.events as events_mod
    from app.events import EventStore

    tmp = Path(tempfile.mkdtemp(prefix="vifence_audit_m05_"))
    events_mod.EVENTS_DIR = tmp / "events"
    events_mod.SNAPSHOT_DIR = tmp / "snapshots"
    events_mod.EVENTS_DIR.mkdir(parents=True, exist_ok=True)
    events_mod.SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    return EventStore(max_in_memory=200)


def _reset_patrol_runtime() -> None:
    import app.patrol_api as patrol_api

    patrol_api._patrol_gps.clear()
    patrol_api._patrol_mobile_metrics.clear()


def _temp_person_registry():
    tmp = Path(tempfile.mkdtemp(prefix="vifence_m05_registry_"))
    reg_file = tmp / "person_identity_registry.json"
    reg_file.write_text(json.dumps({"next_seq": 1, "tracks": {}}), encoding="utf-8")
    return patch("app.person_identity_registry.REGISTRY_FILE", reg_file), patch(
        "app.person_identity_registry._state",
        None,
    )


def audit_patrol_filters() -> list[CaseResult]:
    from app.patrol_api import (
        is_patrol_camera_id,
        is_patrol_module_event,
        is_patrol_person_event,
    )

    results: list[CaseResult] = []

    ok_cam = is_patrol_camera_id("HC-01") and is_patrol_camera_id("HC-02") and not is_patrol_camera_id("A-04")
    results.append(CaseResult("patrol_camera_id_hc", ok_cam, "HC-* yes · A-04 no"))

    ppe_hc = SimpleNamespace(scenario_id="PPE-002", camera_id="HC-02")
    pers_hc = SimpleNamespace(scenario_id="PERS-001", camera_id="HC-02")
    ppe_a04 = SimpleNamespace(scenario_id="PPE-002", camera_id="A-04")

    ok_evt = (
        not is_patrol_person_event(ppe_hc)
        and is_patrol_person_event(pers_hc)
        and not is_patrol_module_event(ppe_hc)
        and is_patrol_module_event(pers_hc)
        and not is_patrol_module_event(ppe_a04)
    )
    results.append(CaseResult("patrol_event_person_filter", ok_evt, "HC PERS only · PPE excluded"))

    return results


def audit_sgc_identity() -> list[CaseResult]:
    from app.person_identity_registry import (
        is_sgc_worker_id,
        resolve_patrol_person_identity,
    )
    from app.schemas import PpeDetection

    results: list[CaseResult] = []
    reg_patch, state_patch = _temp_person_registry()

    with reg_patch, state_patch:
        det = PpeDetection(
            behavior="person",
            label="person",
            scenario_id="PERS-001",
            confidence=0.9,
            bbox=[10.0, 10.0, 100.0, 200.0],
        )
        w1, n1 = resolve_patrol_person_identity(
            det, "HC-02", "p01:person", person_bbox=[10.0, 10.0, 100.0, 200.0],
        )
        w2, n2 = resolve_patrol_person_identity(
            det, "HC-02", "p01:person", person_bbox=[10.0, 10.0, 100.0, 200.0],
        )
        w3, n3 = resolve_patrol_person_identity(
            det, "HC-02", "p02:person", person_bbox=[10.0, 10.0, 100.0, 200.0],
        )
        det_far = det.model_copy(update={"bbox": [400.0, 10.0, 500.0, 200.0]})
        w4, n4 = resolve_patrol_person_identity(
            det_far,
            "HC-02",
            "p03:person",
            person_bbox=[400.0, 10.0, 500.0, 200.0],
        )

        ok_fmt = is_sgc_worker_id(w1) and w1 == n1 and w1.startswith("sgc-0") and len(w1) == 12
        ok_stable = w1 == w2
        ok_reuse = w3 == w1
        ok_new = w4 != w1 and is_sgc_worker_id(w4)

        results.append(CaseResult("sgc_id_format", ok_fmt, f"id={w1}"))
        results.append(CaseResult("sgc_id_stable_track", ok_stable, f"track p01 → {w1}"))
        results.append(CaseResult("sgc_id_reuse_nearby_track", ok_reuse, f"p02 same bbox → {w3}"))
        results.append(CaseResult("sgc_id_new_far_person", ok_new, f"far → {w4}"))

    return results


def _test_face_emb(seed: int) -> list[float]:
    vec = np.zeros(32, dtype=np.float64)
    idx = int(seed) % 32
    vec[idx] = 1.0
    return vec.tolist()


def audit_sgc_face_identity() -> list[CaseResult]:
    """Mặt — tránh 1 người → 2 ID và 2 người → 1 ID."""
    from app.person_identity_registry import resolve_patrol_person_identity
    from app.schemas import PpeDetection
    from app.worker_identity.gallery import embedding_similarity

    results: list[CaseResult] = []
    reg_patch, state_patch = _temp_person_registry()

    emb_a = _test_face_emb(11)
    emb_b = _test_face_emb(99)
    sim_ab = embedding_similarity(np.asarray(emb_a), np.asarray(emb_b))
    ok_distinct = sim_ab < 0.62

    with reg_patch, state_patch:
        det = PpeDetection(
            behavior="person",
            label="person",
            scenario_id="PERS-001",
            confidence=0.9,
            bbox=[10.0, 10.0, 100.0, 200.0],
        )
        w1, _ = resolve_patrol_person_identity(
            det,
            "HC-02",
            "p01:person",
            person_bbox=[10.0, 10.0, 100.0, 200.0],
            face_emb=emb_a,
        )
        w2, _ = resolve_patrol_person_identity(
            det,
            "HC-02",
            "p02:person",
            person_bbox=[400.0, 10.0, 500.0, 200.0],
            face_emb=emb_a,
        )
        ok_same_face = w1 == w2

        frame_faces: dict[str, list[float]] = {w1: emb_a}
        w3, _ = resolve_patrol_person_identity(
            det,
            "HC-02",
            "p03:person",
            person_bbox=[12.0, 12.0, 102.0, 202.0],
            face_emb=emb_b,
            frame_face_assignments=frame_faces,
        )
        ok_split_frame = w3 != w1

    results.append(
        CaseResult(
            "sgc_face_test_vectors_distinct",
            ok_distinct,
            f"sim(a,b)={sim_ab:.3f} (<0.62)",
        ),
    )
    results.append(
        CaseResult(
            "sgc_face_reuse_same_embedding",
            ok_same_face,
            f"track p01/p02 same face → {w1}/{w2}",
        ),
    )
    results.append(
        CaseResult(
            "sgc_face_split_same_frame",
            ok_split_frame,
            f"nearby bbox different face → {w3} vs {w1}",
        ),
    )
    return results


def audit_patrol_gps() -> list[CaseResult]:
    from app.patrol_api import get_patrol_gps, patrol_gps_payload, update_patrol_gps

    results: list[CaseResult] = []
    _reset_patrol_runtime()

    update_patrol_gps("HC-02", 10.7769, 106.7009)
    lat, lng = get_patrol_gps("HC-02")
    ok_gps = lat is not None and lng is not None and abs(lat - 10.7769) < 1e-4
    results.append(CaseResult("patrol_gps_roundtrip", ok_gps, f"lat={lat} lng={lng}"))

    update_patrol_gps("HC-02", 0.0, 0.0)
    lat2, lng2 = get_patrol_gps("HC-02")
    ok_reject = lat2 is not None and abs(lat2 - 10.7769) < 1e-4
    results.append(
        CaseResult(
            "patrol_gps_reject_zero",
            ok_reject,
            "0,0 không ghi đè GPS hợp lệ trước đó",
        ),
    )

    _reset_patrol_runtime()
    update_patrol_gps("HC-02", 0.0, 0.0)
    payload = patrol_gps_payload("HC-02")
    ok_payload = payload.get("gps_lat") is None and payload.get("gps_lng") is None
    results.append(CaseResult("patrol_gps_payload_empty", ok_payload, str(payload)))

    update_patrol_gps("A-04", 10.0, 106.0)
    lat3, lng3 = get_patrol_gps("A-04")
    results.append(
        CaseResult(
            "patrol_gps_non_hc_ignored",
            lat3 is None and lng3 is None,
            "A-04 GPS not stored",
        ),
    )

    return results


def audit_mobile_metrics() -> list[CaseResult]:
    from app.patrol_api import (
        PATROL_MOBILE_ONLINE_GRACE_SEC,
        build_patrol_metrics_payload,
        update_patrol_mobile_metrics,
    )

    results: list[CaseResult] = []
    _reset_patrol_runtime()
    store = _fresh_store()

    update_patrol_mobile_metrics(
        "HC-02",
        {
            "metrics": {"person_count": 4, "ppe_violations": 2},
            "detections": [
                {"behavior": "person", "confidence": 0.9, "worker_id": "sgc-0000001"},
                {"behavior": "person", "confidence": 0.88, "worker_id": "sgc-0000002"},
                {"behavior": "no_vest", "confidence": 0.8},
            ],
        },
    )
    update_patrol_mobile_metrics(
        "HC-02",
        {
            "metrics": {"person_count": 0, "ppe_violations": 0},
            "detections": [],
        },
    )

    payload = build_patrol_metrics_payload("HC-02", store=store, vms_workers={})
    ok_peak = payload.get("person_count") == 4
    results.append(
        CaseResult(
            "mobile_metrics_peak_person",
            ok_peak,
            f"peak={payload.get('person_count')} (frame empty kept peak)",
        ),
    )

    import app.patrol_api as patrol_api

    cached = patrol_api._patrol_mobile_metrics["HC-02"]
    cached["updated_at"] = time.time() - (PATROL_MOBILE_ONLINE_GRACE_SEC + 5)
    cached["last_frame_at"] = cached["updated_at"]
    payload2 = build_patrol_metrics_payload("HC-02", store=store, vms_workers={})
    ok_grace = payload2.get("stream_online") is False and payload2.get("person_count") == 4
    results.append(
        CaseResult(
            "mobile_metrics_offline_keeps_peak",
            ok_grace,
            f"online={payload2.get('stream_online')} persons={payload2.get('person_count')}",
        ),
    )

    agg = __import__("app.patrol_api", fromlist=["build_patrol_aggregate_metrics_payload"]).build_patrol_aggregate_metrics_payload(
        ["HC-01", "HC-02"],
        store=store,
        vms_workers={},
    )
    ok_agg = agg.get("person_count") == 4 and len(agg.get("cameras") or []) == 2
    results.append(
        CaseResult(
            "patrol_aggregate_metrics",
            ok_agg,
            f"total_person={agg.get('person_count')} cameras={len(agg.get('cameras') or [])}",
        ),
    )

    return results


def audit_mobile_frame_scale() -> list[CaseResult]:
    from app.mobile_frame_utils import analyze_engine_frame, downscale_for_mobile, scale_result_to_frame

    results: list[CaseResult] = []
    frame = np.zeros((480, 960, 3), dtype=np.uint8)
    small = downscale_for_mobile(frame, max_width=640)

    raw = {
        "type": "result",
        "detections": [
            {
                "behavior": "no_vest",
                "bbox": [100.0, 50.0, 200.0, 150.0],
                "subject_bbox": [80.0, 40.0, 220.0, 300.0],
            },
        ],
        "events": [],
    }
    scaled = scale_result_to_frame(dict(raw), frame, small)
    det = scaled["detections"][0]
    sx = frame.shape[1] / small.shape[1]
    sy = frame.shape[0] / small.shape[0]
    ok_bbox = abs(det["bbox"][2] - 200.0 * sx) < 1.5
    ok_sub = det.get("subject_bbox") and abs(det["subject_bbox"][2] - 220.0 * sx) < 1.5
    ok_dim = scaled["width"] == frame.shape[1] and scaled["height"] == frame.shape[0]
    results.append(
        CaseResult(
            "mobile_scale_bbox_subject",
            ok_bbox and ok_sub and ok_dim,
            f"bbox_x2={det['bbox'][2]:.1f} subj_x2={det['subject_bbox'][2]:.1f}",
        ),
    )

    def _fake_analyze(small_frame: np.ndarray, camera_id: str, **kwargs):
        return (
            {
                "type": "result",
                "camera_id": camera_id,
                "detections": [
                    {
                        "behavior": "person",
                        "bbox": [10.0, 10.0, 30.0, 40.0],
                        "subject_bbox": [8.0, 8.0, 32.0, 42.0],
                    },
                ],
                "metrics": {"person_count": 1, "ppe_violations": 0},
            },
            None,
        )

    out = analyze_engine_frame(frame, "HC-02", _fake_analyze, max_width=640)
    ok_engine = out["width"] == frame.shape[1] and len(out.get("detections") or []) == 1
    results.append(CaseResult("mobile_analyze_engine_frame", ok_engine, f"{out['width']}x{out['height']}"))

    return results


def audit_hc02_ppe_analyzer() -> list[CaseResult]:
    from app.ppe_analyzer import (
        _feet_assessable,
        _half_body_person,
        _plausible_person_box,
        analyze_ppe_frame,
        ppe_violation_display_bbox,
    )

    results: list[CaseResult] = []

    fw, fh = 640, 480
    small = (280.0, 120.0, 340.0, 220.0)
    close = (80.0, 40.0, 560.0, 460.0)
    ok_dual = _plausible_person_box(small, fw, fh, bodycam=True) and _plausible_person_box(
        close, fw, fh, bodycam=True,
    )
    results.append(CaseResult("hc02_dual_range_person", ok_dual, "wide + close bbox accepted"))

    half_pb = (60.0, 40.0, 260.0, 360.0)
    ok_half = _half_body_person(half_pb, fh) and not _feet_assessable(half_pb, 320, fh, camera_id="HC-02")
    results.append(
        CaseResult(
            "hc02_half_body_no_feet",
            ok_half,
            f"half={_half_body_person(half_pb, fh)} feet={_feet_assessable(half_pb, 320, fh, camera_id='HC-02')}",
        ),
    )

    pb = (80.0, 120.0, 220.0, 420.0)
    torso = (80.0, 120.0 + 300 * 0.30, 220.0, 120.0 + 300 * 0.58)
    vest = ppe_violation_display_bbox(pb, "no_vest", fh, scan_region=torso)
    vcy = (vest[1] + vest[3]) / 2
    tcy = (torso[1] + torso[3]) / 2
    ok_vest = abs(vcy - tcy) < (pb[3] - pb[1]) * 0.12
    results.append(CaseResult("hc02_vest_bbox_torso", ok_vest, f"vest_cy={vcy:.0f} torso_cy={tcy:.0f}"))

    from app.ppe_analyzer import _helmet_violation_display_bbox, _torso_assessable

    face_close_pb = (178.0, 118.0, 242.0, 140.0)
    chest_pb = (80.0, 40.0, 260.0, 420.0)
    half_chest_pb = (60.0, 40.0, 260.0, 360.0)
    ok_face_skip = not _torso_assessable(face_close_pb, 640, 480, camera_id="HC-02")
    ok_chest_ok = _torso_assessable(chest_pb, 640, 480, camera_id="HC-02")
    ok_half_chest = _torso_assessable(half_chest_pb, 320, 480, camera_id="HC-02")
    helmet_roi = _helmet_violation_display_bbox(chest_pb)
    ok_helmet_tight = helmet_roi[3] <= chest_pb[1] + (chest_pb[3] - chest_pb[1]) * 0.22
    results.append(
        CaseResult(
            "hc02_no_vest_skips_face_only",
            ok_face_skip and ok_chest_ok and ok_half_chest,
            f"face_skip={ok_face_skip} chest={ok_chest_ok} half_chest={ok_half_chest}",
        ),
    )
    results.append(
        CaseResult(
            "hc02_helmet_roi_tight",
            ok_helmet_tight,
            f"helmet_y2={helmet_roi[3]:.0f} head_bottom={chest_pb[1] + (chest_pb[3] - chest_pb[1]) * 0.22:.0f}",
        ),
    )

    frame = np.full((480, 320, 3), 90, dtype=np.uint8)
    cv2.rectangle(frame, (90, 30), (230, 340), (140, 120, 100), -1)
    cv2.rectangle(frame, (110, 50), (210, 120), (30, 30, 30), -1)
    reg_patch, state_patch = _temp_person_registry()
    with reg_patch, state_patch:
        r = analyze_ppe_frame(frame, "HC-02")
    beh = {d.get("behavior") for d in r.get("detections", [])}
    persons = [d for d in r.get("detections", []) if d.get("behavior") == "person"]
    ok_syn = "no_shoes" not in beh
    results.append(
        CaseResult(
            "hc02_analyzer_synthetic_no_shoes",
            ok_syn,
            f"persons={len(persons)} beh={sorted(beh)} (no no_shoes on half-body synth)",
        ),
    )

    img = _read_frame(PPE_WORKERS_JPG)
    if img is not None:
        reg_patch2, state_patch2 = _temp_person_registry()
        with reg_patch2, state_patch2:
            live = analyze_ppe_frame(img, "HC-02")
        lp = [d for d in live.get("detections", []) if d.get("behavior") == "person"]
        lv = [d for d in live.get("detections", []) if str(d.get("behavior", "")).startswith("no_")]
        ok_live = len(lp) >= 1 and all(
            0 <= d["bbox"][0] < d["bbox"][2] <= img.shape[1] + 1
            and 0 <= d["bbox"][1] < d["bbox"][3] <= img.shape[0] + 1
            for d in lv[:5]
            if d.get("bbox")
        )
        results.append(
            CaseResult(
                "hc02_analyzer_workers_jpg",
                ok_live,
                f"persons={len(lp)} violations={len(lv)}",
            ),
        )
    else:
        results.append(
            CaseResult(
                "hc02_analyzer_workers_jpg",
                True,
                f"skip — missing {PPE_WORKERS_JPG.name}",
            ),
        )

    return results


def audit_hc02_engine_events() -> list[CaseResult]:
    from app.ppe_engine import PpeEngine

    results: list[CaseResult] = []
    frame = _read_frame(PPE_WORKERS_JPG)
    if frame is None:
        results.append(CaseResult("hc02_engine_pers_events", True, "skip — no test image"))
        results.append(CaseResult("hc02_engine_ppe_events", True, "skip — no test image"))
        return results

    store = _fresh_store()
    _reset_patrol_runtime()
    update_patrol_gps = __import__("app.patrol_api", fromlist=["update_patrol_gps"]).update_patrol_gps
    update_patrol_gps("HC-02", 10.7769, 106.7009)

    reg_patch, state_patch = _temp_person_registry()
    all_events: list = []
    with reg_patch, state_patch:
        engine = PpeEngine(store)
        for _ in range(8):
            _, evs = engine.process_frame(frame, "HC-02")
            all_events.extend(evs)
            time.sleep(0.06)

    pers = [e for e in all_events if getattr(e, "scenario_id", "") == "PERS-001"]
    ppe = [e for e in all_events if str(getattr(e, "scenario_id", "")).startswith("PPE-")]
    ok_pers = len(pers) >= 1 and all(getattr(e, "camera_id", "") == "HC-02" for e in pers)
    ok_ppe = len(ppe) >= 1
    gps_ok = all(getattr(e, "gps_lat", None) is not None for e in pers[:3]) if pers else True

    results.append(
        CaseResult(
            "hc02_engine_pers_events",
            ok_pers and gps_ok,
            f"events={len(pers)} gps_on_pers={gps_ok}",
        ),
    )
    results.append(
        CaseResult(
            "hc02_engine_ppe_events",
            ok_ppe,
            f"events={len(ppe)} scenarios={sorted({e.scenario_id for e in ppe})}",
        ),
    )

    from app.patrol_api import build_patrol_events_payload

    rows = build_patrol_events_payload("HC-02", store=store)
    groups = {row.get("group") for row in rows}
    pers_n = sum(1 for row in rows if row.get("group") == "PERS")
    ppe_n = sum(1 for row in rows if row.get("group") == "PPE")
    ok_rows = groups <= {"PPE", "PERS"} and pers_n >= 1 and ppe_n >= 1
    results.append(
        CaseResult(
            "patrol_events_payload_hc02",
            ok_rows,
            f"rows={len(rows)} pers={pers_n} ppe={ppe_n} groups={sorted(groups)}",
        ),
    )

    return results


def audit_no_vest_snapshot_roi() -> list[CaseResult]:
    """Snapshot no_vest — ROI bám ngực, không khoanh mặt."""
    from app.events import EventStore
    from app.ppe_analyzer import snapshot_annotation_detection
    from app.schemas import PpeDetection

    results: list[CaseResult] = []
    store = _fresh_store()
    frame = np.full((480, 640, 3), 90, dtype=np.uint8)

    face_pb = [178.0, 118.0, 242.0, 140.0]
    ph = face_pb[3] - face_pb[1]
    face_det = PpeDetection(
        behavior="no_vest",
        label="Không áo phản quang",
        scenario_id="PPE-002",
        confidence=0.85,
        bbox=[178.0, 118.0, 242.0, 136.0],
        subject_bbox=list(face_pb),
    )
    face_event = store.add_ppe(
        face_det,
        frame,
        camera_id="HC-02",
        person_bbox=list(face_pb),
        track_id="p_face:no_vest",
    )
    face_roi_skipped = face_event is None or (
        face_event is not None
        and (
            face_event.bbox[2] - face_event.bbox[0] < 4
            or face_event.bbox[3] - face_event.bbox[1] < 4
        )
    )

    chest_pb = [80.0, 40.0, 260.0, 420.0]
    chest_ph = chest_pb[3] - chest_pb[1]
    chest_det = PpeDetection(
        behavior="no_vest",
        label="Không áo phản quang",
        scenario_id="PPE-002",
        confidence=0.88,
        bbox=[100.0, 50.0, 200.0, 150.0],
        subject_bbox=list(chest_pb),
    )
    chest_event = store.add_ppe(
        chest_det,
        frame,
        camera_id="HC-02",
        person_bbox=list(chest_pb),
        track_id="p_chest:no_vest",
    )
    chest_cy = (chest_event.bbox[1] + chest_event.bbox[3]) / 2.0 if chest_event else 0.0
    # HC bodycam chest band 42–68% → tâm ~55%
    expect_cy = chest_pb[1] + chest_ph * 0.55
    chest_roi_ok = (
        chest_event is not None
        and chest_event.bbox[2] - chest_event.bbox[0] >= 4
        and abs(chest_cy - expect_cy) < chest_ph * 0.14
    )

    h, w = frame.shape[:2]
    annot_face = snapshot_annotation_detection(face_det, w, h, camera_id="HC-02").bbox
    annot_chest = snapshot_annotation_detection(chest_det, w, h, camera_id="HC-02").bbox
    ok_annot_face = annot_face[2] - annot_face[0] < 4
    chest_annot_cy = (annot_chest[1] + annot_chest[3]) / 2.0
    ok_annot_chest = abs(chest_annot_cy - expect_cy) < chest_ph * 0.14

    results.append(
        CaseResult(
            "no_vest_snapshot_skips_face",
            face_roi_skipped and ok_annot_face,
            f"event_bbox={getattr(face_event, 'bbox', None)} annot={annot_face}",
        ),
    )
    results.append(
        CaseResult(
            "no_vest_snapshot_chest_roi",
            chest_roi_ok and ok_annot_chest,
            f"event_cy={chest_cy:.0f} expect={expect_cy:.0f}",
        ),
    )
    return results


def audit_person_snapshot_crop() -> list[CaseResult]:
    from app.events import EventStore
    from app.ppe_analyzer import snapshot_annotation_detection
    from app.schemas import PpeDetection

    results: list[CaseResult] = []
    store = _fresh_store()
    _reset_patrol_runtime()
    __import__("app.patrol_api", fromlist=["update_patrol_gps"]).update_patrol_gps("HC-02", 10.78, 106.70)

    frame = np.full((400, 640, 3), 120, dtype=np.uint8)
    cv2.rectangle(frame, (200, 80), (360, 340), (160, 140, 120), -1)
    det = PpeDetection(
        behavior="person",
        label="person",
        scenario_id="PERS-001",
        confidence=0.92,
        bbox=[200.0, 80.0, 360.0, 340.0],
        subject_bbox=[200.0, 80.0, 360.0, 340.0],
        worker_id="sgc-0000042",
        worker_name="sgc-0000042",
    )
    event = store.add_person(det, frame, camera_id="HC-02", track_id="p11:person")
    h, w = frame.shape[:2]
    expect = snapshot_annotation_detection(
        det, w, h, camera_id="HC-02", frame=frame,
    ).bbox
    ok_roi = event is not None and all(abs(a - b) < 0.5 for a, b in zip(event.bbox, expect))
    ok_full = event is not None and event.frame_width == w and event.frame_height == h
    ok = (
        event is not None
        and event.scenario_id == "PERS-001"
        and event.group == "PERS"
        and event.gps_lat is not None
        and event.snapshot_file
        and ok_roi
        and ok_full
    )
    path = store.resolve_snapshot_path(event.id, event.snapshot_file) if event else None
    ok_file = path is not None and path.exists()
    results.append(
        CaseResult(
            "person_event_pers001_snapshot",
            ok and ok_file,
            f"id={getattr(event, 'id', None)} roi_ok={ok_roi} full={ok_full} gps={getattr(event, 'gps_lat', None)}",
        ),
    )
    return results


def _print_section(title: str, cases: list[CaseResult]) -> int:
    failed = 0
    print(f"\n## {title}")
    for case in cases:
        mark = "PASS" if case.ok else "FAIL"
        if not case.ok:
            failed += 1
        print(f"  [{mark}] {case.name}: {case.detail}")
        for line in case.extra:
            print(f"         {line}")
    return failed


def main() -> int:
    print("=" * 72)
    print("AUDIT MODULE 05 — Patrol HC-* (PPE · Persons · GPS · metrics · bbox)")
    print("=" * 72)

    sections = [
        ("Patrol API filters", audit_patrol_filters()),
        ("Person ID sgc-*", audit_sgc_identity()),
        ("Person ID face dedup", audit_sgc_face_identity()),
        ("GPS bridge", audit_patrol_gps()),
        ("Mobile metrics", audit_mobile_metrics()),
        ("Mobile frame scale", audit_mobile_frame_scale()),
        ("HC-02 PPE analyzer", audit_hc02_ppe_analyzer()),
        ("No-vest snapshot ROI", audit_no_vest_snapshot_roi()),
        ("HC-02 engine events", audit_hc02_engine_events()),
        ("Person snapshot", audit_person_snapshot_crop()),
    ]

    total_failed = 0
    for title, cases in sections:
        total_failed += _print_section(title, cases)

    print("\n" + "=" * 72)
    if total_failed:
        print(f"KẾT QUẢ: {total_failed} case FAIL — sửa Module 05 trước deploy")
        return 1
    print("KẾT QUẢ: tất cả case PASS — OK Module 05")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
