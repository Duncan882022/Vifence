#!/usr/bin/env python3
"""
Auto-audit Module 05 Realtime Workforce Heatmap vs MD.
docs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md

Outputs JSON scorecard + runs BE/FE test suites.
Usage:
  python3 scripts/audit_workforce_md.py
  python3 scripts/audit_workforce_md.py --json-out /tmp/workforce-audit.json
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@dataclass
class Item:
    id: str
    area: str  # BE | FE | BOTH | AC
    requirement: str
    status: str  # DONE | PARTIAL | MISSING | N/A
    weight: float
    evidence: str
    gap: str = ""


def read(rel: str) -> str:
    p = ROOT / rel
    return p.read_text(encoding="utf-8") if p.exists() else ""


def has(text: str, *patterns: str) -> bool:
    return all(re.search(p, text, re.M | re.S) for p in patterns)


def score_status(status: str) -> float:
    return {"DONE": 1.0, "PARTIAL": 0.5, "N/A": 1.0, "MISSING": 0.0}.get(status, 0.0)


def build_checklist() -> list[Item]:
    be = read("backend-ai/app/workforce_engine.py")
    main = read("backend-ai/app/main.py")
    patrol = read("backend-ai/app/patrol_api.py")
    schemas = read("backend-ai/app/schemas.py")
    heatmap = read("src/modules/module05-productivity/components/PatrolDensityHeatmap.tsx")
    events = read("src/modules/module05-productivity/components/PatrolEventsPanel.tsx")
    sheet = read("src/modules/module05-productivity/components/WorkforceObjectSheet.tsx")
    types = read("src/modules/module05-productivity/types/workforceHeatmap.ts")
    ui = read("src/modules/module05-productivity/utils/workforceHeatmapUi.ts")
    mapper = read("src/modules/module05-productivity/utils/workforceEventsMapper.ts")
    page = read("src/modules/module05-productivity/Module05Page.tsx")
    svc = read("src/modules/module05-productivity/services/workforceState.service.ts")
    geo = read("src/modules/module05-productivity/components/PatrolGeoHeatmap.tsx")

    items: list[Item] = []

    def add(id_: str, area: str, req: str, status: str, evidence: str, gap: str = "", weight: float = 1.0):
        items.append(Item(id_, area, req, status, weight, evidence, gap))

    # --- BE core ---
    add("BE-3.1-modes", "BE", "Observation modes FULL/UPPER/CLOSE/PARTIAL",
        "DONE" if has(be, r"FULL_BODY", r"FACE_CLOSEUP", r"PARTIAL_BODY", r"classify_observation_mode") else "MISSING",
        "workforce_engine.classify_observation_mode")
    add("BE-3.2-sobs", "BE", "S_obs formula + HIGH/MED/LOW bands",
        "PARTIAL" if has(be, r"compute_observability", r"0\.3 \* \(1\.0 - r_crop\)") else "MISSING",
        "workforce_engine.compute_observability",
        "Q_motion hardcoded 0.85")
    add("BE-3.2-low-hold", "BE", "LOW observability holds population",
        "DONE" if has(be, r'band in \("HIGH", "MEDIUM"\) and frame_count > 0') else "MISSING",
        "ingest_frame population gate")
    add("BE-4-pop", "BE", "Zone population timeline + KPI",
        "PARTIAL" if has(be, r"population_timeline", r'"average"', r'"peak"') else "MISSING",
        "_population_payload", "trend missing; single DEFAULT_ZONE")
    add("BE-5-dedup", "BE", "Deferred dedup <0.92 no merge",
        "PARTIAL" if has(be, r"REID_STRICT = 0.92", r"_maybe_reid_candidate") else "MISSING",
        "REID_STRICT", "similarity stubbed 0.84")
    add("BE-5-merge-audit", "BE", "OBJECT_MERGED audit only",
        "DONE" if has(be, r"OBJECT_MERGED", r"show_in_ui=False") else "MISSING",
        "merge_objects_to_worker")
    add("BE-6-geodesic", "BE", "Forward geodesic position",
        "DONE" if has(be, r"forward_geodesic", r"bearing_from_bbox") else "MISSING",
        "forward_geodesic")
    add("BE-6-ekf", "BE", "EKF GPS+IMU",
        "MISSING", "—", "not implemented")
    add("BE-6-no-pos-close", "BE", "No position for CLOSEUP/PARTIAL",
        "DONE" if has(be, r"mode_allows_position") else "MISSING",
        "mode_allows_position")
    add("BE-7-ttl", "BE", "TTL ACTIVE 30s / RECENT 120s / EXPIRED omit",
        "DONE" if has(be, r"TTL_ACTIVE_S = 30", r"TTL_RECENT_S = 120", r'if status == "EXPIRED"') else "MISSING",
        "live_status + snapshot")
    add("BE-7-heat-3s", "BE", "Max 1 heat point / object / 3s",
        "DONE" if has(be, r"HEAT_INTERVAL_S = 3", r"_sample_heat") else "MISSING",
        "_sample_heat")
    add("BE-7-timedecay", "BE", "W_heat TimeDecay ~15s",
        "DONE" if has(be, r"HEAT_DECAY_S", r"_heat_time_decay") else "MISSING",
        "_heat_time_decay")
    add("BE-8-events", "BE", "POPULATION_*/HIGH_DENSITY/IDENTITY_VERIFIED + cooldowns",
        "DONE" if has(be, r"POPULATION_OBSERVED", r"CD_POP_OBS", r"HIGH_DENSITY", r"IDENTITY_VERIFIED") else "MISSING",
        "event emitters")
    add("BE-8-ws", "BE", "WS channels HELMET/OBJECT/POPULATION/EVENT",
        "MISSING" if not has(main, r"HELMET_STATE.*websocket|/ws/workforce") else "PARTIAL",
        "REST /patrol/workforce/state only", "HTTP poll substitute")
    add("BE-rest", "BE", "GET /patrol/workforce/state + events",
        "DONE" if has(main, r"/patrol/workforce/state", r"/patrol/workforce/events") else "MISSING",
        "main.py routes")
    add("BE-ingest", "BE", "Ingest from patrol analyze + heading schema",
        "DONE" if has(patrol, r"ingest_patrol_analyze_result") and has(schemas, r"heading") else "PARTIAL",
        "patrol_api + schemas")
    add("BE-2-schema", "BE", "Object schema embeddings + best frames",
        "PARTIAL" if has(be, r"possible_matches", r"identity_status") else "MISSING",
        "WorkforceObject", "no embeddings / best_frame_url")

    # --- FE ---
    add("FE-7.1-layers", "FE", "4 independent map layers",
        "DONE" if has(heatmap, r"Khu vực", r"Người", r"Mật độ", r"Mũ/Lộ trình") else "MISSING",
        "PatrolDensityHeatmap layers")
    add("FE-7.4-time", "FE", "Time filter Live|5m|15m|1h|Ca",
        "DONE" if has(ui, r"HEATMAP_TIME_TABS", r"'15m'") else "MISSING",
        "workforceHeatmapUi")
    add("FE-7.5-header", "FE", "Heatmap header ONLINE·Zone·counts·Obs",
        "DONE" if has(heatmap, r"ONLINE|online", r"quan sát|observed", r"Observability|observability") else "PARTIAL",
        "PatrolDensityHeatmap header")
    add("FE-7.2-ttl-ui", "FE", "TTL opacity ACTIVE vs RECENT + filter EXPIRED",
        "DONE" if has(heatmap, r"ACTIVE", r"EXPIRED", r"0\.92") else "PARTIAL",
        "liveObjects filter + opacity")
    add("FE-7.1-density-kde", "FE", "Density layer from heatPoints/KDE",
        "PARTIAL" if has(heatmap, r"heatPoints") else "MISSING",
        "heatPoints consumed", "PatrolDensityCanvasLayer still mock-heavy")
    add("FE-8.2-filters", "FE", "Event tabs Tất cả|Nhân lực|Định danh|Mật độ|Hệ thống",
        "DONE" if has(events, r"Nhân lực", r"Định danh", r"Mật độ", r"Hệ thống") else "MISSING",
        "PatrolEventsPanel")
    add("FE-8.2-no-raw", "FE", "Hide PERSON_DETECTED from main feed",
        "DONE" if has(events, r"PERSON_DETECTED") else "MISSING",
        "isMeaningfulFeedEvent")
    add("FE-8.1-merge", "FE", "Merge workforce events into panel",
        "DONE" if has(page, r"mergePatrolAndWorkforceEvents") and has(mapper, r"POPULATION_OBSERVED") else "MISSING",
        "Module05Page + mapper")
    add("FE-8.3-ws", "FE", "Consume WS HELMET/OBJECT/POPULATION/EVENT",
        "MISSING" if has(svc, r"poll|/patrol/workforce/state") and "WebSocket" not in svc else "PARTIAL",
        "workforceState.service HTTP poll", "2s poll substitute")
    add("FE-9-sheet", "FE", "Object bottom sheet Unknown/Verified",
        "DONE" if has(sheet, r"object_id|OBJ", r"VERIFIED|worker") else "MISSING",
        "WorkforceObjectSheet")
    add("FE-9-layout", "FE", "HEATMAP | SỰ KIỆN sections",
        "DONE" if has(page, r"PatrolDensityHeatmap", r"PatrolEventsPanel") else "MISSING",
        "Module05Page")
    add("FE-heading-cone", "FE", "Heading cone when IMU available",
        "DONE" if has(heatmap, r"headingCone|Heading") or has(geo, r"headingCone|heading") else "MISSING",
        "PatrolGeoHeatmap / heatmap")
    add("FE-types-kv", "FE", "KV snapshot types helmets/objects/zonePopulation/events/heatPoints",
        "DONE" if has(types, r"helmets", r"zonePopulation", r"heatPoints") else "MISSING",
        "workforceHeatmap.ts")
    add("FE-retro-ui", "FE", "Retroactive merge history UI",
        "MISSING", "—", "no audit history view")

    # --- Acceptance (capability) ---
    add("AC-1", "AC", "Helmet GPS + heading realtime",
        "PARTIAL" if has(be, r"heading") and has(schemas, r"heading") else "MISSING",
        "schemas + update_helmet", "<1s SLA not guaranteed")
    add("AC-2", "AC", "Partial body ≠ Object/count",
        "DONE" if has(be, r"PARTIAL_BODY") else "MISSING",
        "covered by unit test")
    add("AC-3", "AC", "Full→Close keep 1 Object",
        "DONE" if has(be, r"track_to_object", r"FACE_CLOSEUP") else "MISSING",
        "covered by unit test")
    add("AC-4", "AC", "Close-up population hold",
        "DONE" if has(be, r'band in \("HIGH", "MEDIUM"\)') else "MISSING",
        "covered by unit test")
    add("AC-5", "AC", "Face → VERIFIED",
        "DONE" if has(be, r"FACE_VERIFY", r"IDENTITY_VERIFIED") else "MISSING",
        "covered by unit test")
    add("AC-6", "AC", "Conservative dedup",
        "PARTIAL" if has(be, r"REID_STRICT") else "MISSING",
        "stub similarity")
    add("AC-7", "AC", "Retroactive merge history",
        "PARTIAL" if has(be, r"merge_objects_to_worker") else "MISSING",
        "API only; no history rewrite")
    add("AC-8", "AC", "1000 raw/min → <5 meaningful events",
        "PARTIAL" if has(be, r"CD_POP_OBS") else "MISSING",
        "cooldown + unit spam test")
    add("AC-9", "AC", "Stand still no false red heat",
        "PARTIAL" if has(be, r"HEAT_INTERVAL_S") else "MISSING",
        "no TimeDecay")
    add("AC-10", "AC", "Time filter Live↔15m",
        "DONE" if has(ui, r"heatmapWindowMs", r"'15m'") else "MISSING",
        "FE heatmapWindowMs")

    return items


def run_be_tests() -> dict:
    r = subprocess.run(
        [sys.executable, "-m", "unittest", "tests.test_workforce_engine", "-v"],
        cwd=ROOT / "backend-ai",
        capture_output=True,
        text=True,
    )
    out = (r.stderr or "") + (r.stdout or "")
    m = re.search(r"Ran (\d+) tests? in", out)
    total = int(m.group(1)) if m else 0
    ok = r.returncode == 0 and "OK" in out
    fails = re.findall(r"^(FAIL|ERROR): (\S+)", out, re.M)
    return {
        "ok": ok,
        "total": total,
        "passed": total - len(fails) if ok else max(0, total - len(fails)),
        "failed": 0 if ok else max(len(fails), 1),
        "failures": [f"{a}: {b}" for a, b in fails],
        "exit_code": r.returncode,
        "tail": "\n".join(out.strip().splitlines()[-20:]),
    }


def run_fe_tests() -> dict:
    r = subprocess.run(
        ["node", str(ROOT / "scripts/test_workforce_fe.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    out = (r.stdout or "") + (r.stderr or "")
    m = re.search(r"FE tests: (\d+)/(\d+)", out)
    passed = int(m.group(1)) if m else 0
    total = int(m.group(2)) if m else 0
    return {
        "ok": r.returncode == 0,
        "total": total,
        "passed": passed,
        "failed": total - passed if total else (0 if r.returncode == 0 else 1),
        "exit_code": r.returncode,
        "tail": "\n".join(out.strip().splitlines()[-25:]),
    }


def summarize(items: list[Item], be_tests: dict, fe_tests: dict) -> dict:
    by_status = {"DONE": 0, "PARTIAL": 0, "MISSING": 0, "N/A": 0}
    weighted = 0.0
    weight_sum = 0.0
    by_area: dict[str, dict] = {}

    for it in items:
        by_status[it.status] = by_status.get(it.status, 0) + 1
        weighted += score_status(it.status) * it.weight
        weight_sum += it.weight
        bucket = by_area.setdefault(it.area, {"DONE": 0, "PARTIAL": 0, "MISSING": 0, "N/A": 0, "score": 0.0, "w": 0.0})
        bucket[it.status] = bucket.get(it.status, 0) + 1
        bucket["score"] += score_status(it.status) * it.weight
        bucket["w"] += it.weight

    checklist_pct = round(100.0 * weighted / weight_sum, 1) if weight_sum else 0.0
    area_pct = {
        k: round(100.0 * v["score"] / v["w"], 1) if v["w"] else 0.0
        for k, v in by_area.items()
    }

    # Effectiveness: checklist + tests (tests weight 25%)
    test_pct = 0.0
    t_total = be_tests.get("total", 0) + fe_tests.get("total", 0)
    t_pass = be_tests.get("passed", 0) + fe_tests.get("passed", 0)
    if t_total:
        test_pct = 100.0 * t_pass / t_total
    effectiveness = round(0.75 * checklist_pct + 0.25 * test_pct, 1)

    missing = [asdict(i) for i in items if i.status == "MISSING"]
    partial = [asdict(i) for i in items if i.status == "PARTIAL"]

    return {
        "spec": "docs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md",
        "checklist_pct": checklist_pct,
        "test_pct": round(test_pct, 1),
        "effectiveness_pct": effectiveness,
        "by_status": by_status,
        "by_area_pct": area_pct,
        "be_tests": be_tests,
        "fe_tests": fe_tests,
        "missing": missing,
        "partial": partial,
        "items": [asdict(i) for i in items],
        "verdict": (
            "POC_READY" if effectiveness >= 75 and be_tests.get("ok") and fe_tests.get("ok")
            else "NEEDS_FOLLOWUP" if effectiveness >= 55
            else "INCOMPLETE"
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json-out", default=str(ROOT / "backend-ai/data/workforce_md_audit.json"))
    ap.add_argument("--skip-tests", action="store_true")
    args = ap.parse_args()

    items = build_checklist()
    if args.skip_tests:
        be_tests = {"ok": False, "total": 0, "passed": 0, "failed": 0, "skipped": True}
        fe_tests = {"ok": False, "total": 0, "passed": 0, "failed": 0, "skipped": True}
    else:
        print("▶ Running BE unit tests…")
        be_tests = run_be_tests()
        print(be_tests.get("tail", ""))
        print("▶ Running FE tests…")
        fe_tests = run_fe_tests()
        print(fe_tests.get("tail", ""))

    report = summarize(items, be_tests, fe_tests)
    out = Path(args.json_out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n========== WORKFORCE MD AUTO-AUDIT ==========")
    print(f"Checklist:      {report['checklist_pct']}%")
    print(f"Tests:          {report['test_pct']}%  (BE {be_tests.get('passed')}/{be_tests.get('total')}, FE {fe_tests.get('passed')}/{fe_tests.get('total')})")
    print(f"Effectiveness:  {report['effectiveness_pct']}%")
    print(f"By area:        {report['by_area_pct']}")
    print(f"Status counts:  {report['by_status']}")
    print(f"Verdict:        {report['verdict']}")
    print(f"Missing ({len(report['missing'])}):")
    for m in report["missing"]:
        print(f"  - [{m['id']}] {m['requirement']} — {m['gap'] or 'gap'}")
    print(f"Partial ({len(report['partial'])}):")
    for m in report["partial"][:12]:
        print(f"  - [{m['id']}] {m['requirement']} — {m['gap'] or 'partial'}")
    if len(report["partial"]) > 12:
        print(f"  … +{len(report['partial']) - 12} more")
    print(f"JSON: {out}")
    return 0 if report["verdict"] != "INCOMPLETE" and be_tests.get("ok", True) and fe_tests.get("ok", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
