#!/usr/bin/env python3
"""Rà soát snapshot sự kiện Module 05 — ROI, phân loại, lịch sử.

Usage:
  python scripts/audit_event_snapshots_live.py [--date 2026-09-05] [--out report.json]
"""
from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEFAULT_BASE = "https://217.217.253.247.nip.io"
SCORE_GATE = 1.05
DUPLICATE_WINDOW_SEC = 30.0
DUPLICATE_GPS_EPS = 0.00015


@dataclass
class AuditRow:
    id: str
    tier_expected: str
    tier_label_in_image: str | None
    snapshot_path: str
    snapshot_score: float
    camera: str | None
    time_vn: str
    gps: str | None
    roi_area_ratio: float | None
    roi_center_x: float | None
    roi_center_y: float | None
    classification_ok: bool
    roi_geometry_ok: bool
    history_segments: int
    history_tier_ok: bool
    issues: list[str] = field(default_factory=list)
    verdict: str = "PASS"


def _vn_time(ts: float) -> str:
    if not ts:
        return "—"
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    return dt.strftime("%H:%M:%S")


def _api(base: str, token: str, method: str, path: str, body: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(f"{base}{path}", headers=headers, data=data, method=method)
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return json.load(resp)


def _signin(base: str, user: str, pwd: str) -> str:
    data = _api(base, "", "POST", "/auth/signin", {"username": user, "password": pwd})
    return str(data["access_token"])


def _download_snapshot(base: str, token: str, path: str, dest: Path) -> bool:
    if dest.is_file() and dest.stat().st_size > 1000:
        return True
    try:
        signed = _api(base, token, "POST", "/patrol/snapshot/sign", {"path": path})
        q = urllib.parse.urlencode(
            {"path": path, "token": signed["token"], "exp": signed["exp"]},
        )
        url = f"{base}/patrol/snapshot?{q}"
        req = urllib.request.Request(url)
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(resp.read())
        return True
    except (urllib.error.URLError, KeyError, json.JSONDecodeError):
        return False


def _detect_roi_and_label(img: np.ndarray) -> tuple[str | None, float | None, float | None, float | None]:
    """Trả (tier_label, area_ratio, cx, cy) từ overlay xanh lá / sky trên JPG."""
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Xanh lá — Đối tượng (dashed border + label bg)
    green_mask = cv2.inRange(hsv, (35, 40, 80), (90, 255, 255))
    # Sky/cyan — Người
    cyan_mask = cv2.inRange(hsv, (85, 50, 80), (105, 255, 255))

    def largest_box(mask: np.ndarray) -> tuple[float, float, float] | None:
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best = None
        best_area = 0.0
        for cnt in contours:
            x, y, bw, bh = cv2.boundingRect(cnt)
            area = bw * bh
            if area < (w * h) * 0.02:
                continue
            if area > best_area:
                best_area = area
                best = (x + bw / 2.0, y + bh / 2.0, area / (w * h))
        return best

    g = largest_box(green_mask)
    c = largest_box(cyan_mask)
    if g and c:
        tier = "person" if c[2] > g[2] else "object"
        cx, cy, ar = (c if tier == "person" else g)
    elif c:
        tier, cx, cy, ar = "person", c[0], c[1], c[2]
    elif g:
        tier, cx, cy, ar = "object", g[0], g[1], g[2]
    else:
        return None, None, None, None
    return tier, ar, cx / w, cy / h


def _expected_tier(*, is_person: bool, status: str, score: float) -> str:
    if status == "identified":
        return "profile"
    if is_person and score >= SCORE_GATE:
        return "person"
    return "object"


def _gps_key(lat: float | None, lng: float | None) -> str | None:
    if lat is None or lng is None:
        return None
    return f"{round(lat / DUPLICATE_GPS_EPS)}:{round(lng / DUPLICATE_GPS_EPS)}"


def _fetch_appearances(base: str, token: str, subject_id: str, date: str) -> list[dict]:
    data = _api(
        base,
        token,
        "GET",
        f"/patrol/day/appearances?subject_id={urllib.parse.quote(subject_id)}&date={date}",
    )
    return list(data.get("segments") or [])


def _segment_event_payload(seg: dict) -> dict:
    """API trả event_payload_json (SQLite); legacy có thể dùng event_payload."""
    raw = seg.get("event_payload_json")
    if raw is None:
        raw = seg.get("event_payload")
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    if isinstance(raw, dict):
        return raw
    return {}


def _history_tier_ok(segments: list[dict]) -> tuple[int, bool]:
    if not segments:
        return 0, True
    ok = True
    for seg in segments:
        payload = _segment_event_payload(seg)
        tier = payload.get("tier_at_observation")
        if not tier:
            ok = False
    return len(segments), ok


def audit_date(
    base: str,
    token: str,
    date: str,
    cache_dir: Path,
) -> list[AuditRow]:
    bundle = _api(base, token, "GET", f"/patrol/day/bundle?date={date}")
    events = bundle.get("events") or []
    objects = bundle.get("objects") or []

    # GPS lookup from presences
    gps_by_subject: dict[str, tuple[float | None, float | None]] = {}
    for p in bundle.get("presences") or []:
        sid = str(p.get("subject_id") or "")
        gps_by_subject[sid] = (p.get("gps_lat"), p.get("gps_lng"))

    rows: list[AuditRow] = []
    person_meta: list[tuple[str, float, str | None, float]] = []

    items: list[tuple[str, dict, bool]] = []
    for e in events:
        items.append(("person", e, True))
    for o in objects:
        items.append(("object", o, False))

    for kind, row, is_person in items:
        if is_person:
            sid = str(row["pers_id"])
            card_id = f"pers:{sid}"
            path = str(row.get("snapshot_path") or "")
            score = float(row.get("snapshot_score") or 0)
            status = str(row.get("status") or "draft")
            ts = float(row.get("last_seen") or 0)
            gps = gps_by_subject.get(sid, (row.get("gps_lat"), row.get("gps_lng")))
        else:
            sid = str(row["obj_id"])
            card_id = f"obj:{sid}"
            path = str(row.get("snapshot_path") or "")
            score = float(row.get("snapshot_score") or 0)
            status = "object"
            ts = float(row.get("last_seen") or 0)
            gps = gps_by_subject.get(sid, (row.get("gps_lat"), row.get("gps_lng")))

        if not path:
            rows.append(
                AuditRow(
                    id=card_id,
                    tier_expected=_expected_tier(is_person=is_person, status=status, score=score),
                    tier_label_in_image=None,
                    snapshot_path="",
                    snapshot_score=score,
                    camera=None,
                    time_vn=_vn_time(ts),
                    gps=None,
                    roi_area_ratio=None,
                    roi_center_x=None,
                    roi_center_y=None,
                    classification_ok=False,
                    roi_geometry_ok=False,
                    history_segments=0,
                    history_tier_ok=False,
                    issues=["missing_snapshot"],
                    verdict="FAIL",
                ),
            )
            continue

        local = cache_dir / path.replace("/", "_")
        if not _download_snapshot(base, token, path, local):
            rows.append(
                AuditRow(
                    id=card_id,
                    tier_expected=_expected_tier(is_person=is_person, status=status, score=score),
                    tier_label_in_image=None,
                    snapshot_path=path,
                    snapshot_score=score,
                    camera="HC-01" if "HC" in path else None,
                    time_vn=_vn_time(ts),
                    gps=f"{gps[0]:.5f},{gps[1]:.5f}" if gps[0] and gps[1] else None,
                    roi_area_ratio=None,
                    roi_center_x=None,
                    roi_center_y=None,
                    classification_ok=False,
                    roi_geometry_ok=False,
                    history_segments=0,
                    history_tier_ok=False,
                    issues=["download_failed"],
                    verdict="FAIL",
                ),
            )
            continue

        img = cv2.imread(str(local))
        if img is None:
            issues = ["unreadable_image"]
            verdict = "FAIL"
            tier_img = None
            ar = cx = cy = None
        else:
            tier_img, ar, cx, cy = _detect_roi_and_label(img)
            issues = []
            expected = _expected_tier(is_person=is_person, status=status, score=score)
            classification_ok = tier_img == expected or (
                expected == "person" and tier_img == "person"
            ) or (expected == "object" and tier_img == "object")
            if tier_img is None:
                issues.append("no_roi_detected")
                classification_ok = False
            elif tier_img != expected and not (expected == "profile" and tier_img == "person"):
                issues.append(f"tier_mismatch:expected={expected},image={tier_img}")

            roi_geometry_ok = True
            if ar is not None and ar > 0.42:
                issues.append(f"roi_oversized:{ar:.2f}")
                roi_geometry_ok = False
            if cx is not None and (cx < 0.08 or cx > 0.92 or cy < 0.05 or cy > 0.95):
                issues.append("roi_near_frame_edge")
                roi_geometry_ok = False
            if ar is not None and ar < 0.015:
                issues.append("roi_too_small")
                roi_geometry_ok = False

            verdict = "PASS" if not issues else ("WARN" if classification_ok else "FAIL")

        segs = _fetch_appearances(base, token, sid, date)
        hist_n, hist_tier_ok = _history_tier_ok(segs)
        if hist_n == 0 and is_person:
            issues.append("history_empty")
        if not hist_tier_ok and hist_n > 0:
            issues.append("history_missing_tier_at_observation")

        if is_person:
            person_meta.append((sid, ts, _gps_key(gps[0], gps[1]), score))

        expected = _expected_tier(is_person=is_person, status=status, score=score)
        final_verdict = verdict
        if "history_missing_tier_at_observation" in issues and final_verdict == "PASS":
            final_verdict = "WARN"
        if any(i.startswith("tier_mismatch") for i in issues):
            final_verdict = "FAIL"
        if "no_roi_detected" in issues:
            final_verdict = "FAIL"

        rows.append(
            AuditRow(
                id=card_id,
                tier_expected=expected,
                tier_label_in_image=tier_img,
                snapshot_path=path,
                snapshot_score=score,
                camera="HC-01",
                time_vn=_vn_time(ts),
                gps=f"{gps[0]:.5f},{gps[1]:.5f}" if gps and gps[0] and gps[1] else None,
                roi_area_ratio=round(ar, 3) if ar is not None else None,
                roi_center_x=round(cx, 3) if cx is not None else None,
                roi_center_y=round(cy, 3) if cy is not None else None,
                classification_ok=classification_ok if img is not None else False,
                roi_geometry_ok=roi_geometry_ok if img is not None else False,
                history_segments=hist_n,
                history_tier_ok=hist_tier_ok,
                issues=issues,
                verdict=final_verdict,
            ),
        )

    # Duplicate tk cluster — same GPS bucket + time window
    person_meta.sort(key=lambda x: x[1])
    dup_groups: dict[str, list[str]] = defaultdict(list)
    for sid, ts, gkey, _ in person_meta:
        if gkey:
            dup_groups[f"{gkey}:{int(ts // DUPLICATE_WINDOW_SEC)}"].append(sid)

    dup_sids: set[str] = set()
    for members in dup_groups.values():
        if len(members) > 1:
            dup_sids.update(members)

    for r in rows:
        m = re.match(r"pers:(tk-\d+)", r.id)
        if m and m.group(1) in dup_sids:
            r.issues.append("duplicate_tk_cluster_same_gps_time")
            r.verdict = "FAIL"

    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--date", default="2026-09-05")
    parser.add_argument("--user", default="admin")
    parser.add_argument("--password", default="admin123")
    parser.add_argument("--out", default="/tmp/patrol_audit_report.json")
    parser.add_argument("--cache", default="/tmp/patrol_snapshots")
    args = parser.parse_args()

    token = _signin(args.base, args.user, args.password)
    rows = audit_date(args.base, token, args.date, Path(args.cache))

    out_path = Path(args.out)
    payload = {
        "date": args.date,
        "base": args.base,
        "total": len(rows),
        "pass": sum(1 for r in rows if r.verdict == "PASS"),
        "warn": sum(1 for r in rows if r.verdict == "WARN"),
        "fail": sum(1 for r in rows if r.verdict == "FAIL"),
        "rows": [asdict(r) for r in rows],
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Audit {args.date}: total={payload['total']} PASS={payload['pass']} WARN={payload['warn']} FAIL={payload['fail']}")
    print(f"Report: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
