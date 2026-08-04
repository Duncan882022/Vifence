"""Catalog ROI — Cam A-04: máy khoan, cẩu tháp, máy xúc, người."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .crane_proximity_analyzer import (
    MACHINERY_LABELS,
    _bbox_edge_distance_px,
    _detect_machinery_units,
    _get_person_detector,
    _machinery_search_mask,
)
from .crane_roi_config import (
    DEFAULT_PIXELS_PER_METER,
    PROXIMITY_THRESHOLD_METERS,
    get_crane_zones_for_camera,
)
from .unknown_detection import PERSON_UNKNOWN_LABEL

# BGR — đồng bộ CraneProximityOverlay
CRANE_CATALOG_STYLES: dict[str, dict[str, Any]] = {
    "tower_crane": {
        "label": "Máy cẩu tháp",
        "color": (80, 220, 255),
        "scenario": "DZ-003",
    },
    "sany_drill": {
        "label": "Máy khoan",
        "color": (40, 140, 255),
        "scenario": "DZ-003",
    },
    "crane_green": {
        "label": "Máy xúc",
        "color": (80, 220, 80),
        "scenario": "DZ-003",
    },
    "person": {
        "label": PERSON_UNKNOWN_LABEL,
        "color": (200, 200, 200),
        "scenario": "DZ-003",
    },
    "crane_proximity": {
        "label": "DZ",
        "color": (80, 80, 255),
        "scenario": "DZ-003",
    },
}


@dataclass
class CraneCatalogDetection:
    kind: str
    label: str
    bbox: tuple[int, int, int, int]
    confidence: float
    behavior: str
    distance_m: float | None = None
    nearest_machine: str | None = None


def _polygon_to_pts(polygon: list[dict], w: int, h: int) -> np.ndarray:
    return np.array(
        [[int(p["x"] * w), int(p["y"] * h)] for p in polygon],
        dtype=np.int32,
    )


def analyze_crane_catalog(
    frame: np.ndarray,
    camera_id: str = "A-04",
) -> tuple[list[CraneCatalogDetection], list[list[dict]]]:
    """Detect catalog — 3 máy + người trong vùng Cam 04."""
    h, w = frame.shape[:2]
    search = _machinery_search_mask(h, w)
    px_per_m = DEFAULT_PIXELS_PER_METER
    catalog: list[CraneCatalogDetection] = []

    units = _detect_machinery_units(frame, search)
    for unit in units:
        catalog.append(
            CraneCatalogDetection(
                kind=unit.kind,
                label=MACHINERY_LABELS.get(unit.kind, unit.label),
                bbox=unit.bbox,
                confidence=unit.confidence,
                behavior="crane",
            )
        )

    person_dets = _get_person_detector().predict(frame)
    for det in person_dets:
        if det.confidence < 0.35:
            continue
        box = tuple(int(v) for v in det.bbox)
        nearest_kind: str | None = None
        nearest_label: str | None = None
        nearest_dist_m = float("inf")
        for unit in units:
            dist_m = _bbox_edge_distance_px(box, unit.bbox) / px_per_m
            if dist_m < nearest_dist_m:
                nearest_dist_m = dist_m
                nearest_kind = unit.kind
                nearest_label = MACHINERY_LABELS.get(unit.kind, unit.label)

        dist_out = round(nearest_dist_m, 2) if nearest_dist_m < float("inf") else None
        catalog.append(
            CraneCatalogDetection(
                kind="person",
                label=PERSON_UNKNOWN_LABEL,
                bbox=box,
                confidence=round(det.confidence, 3),
                behavior="person",
                distance_m=dist_out,
                nearest_machine=nearest_label,
            )
        )

        if (
            nearest_kind
            and dist_out is not None
            and dist_out <= PROXIMITY_THRESHOLD_METERS
        ):
            catalog.append(
                CraneCatalogDetection(
                    kind="crane_proximity",
                    label=f"Làm việc gần máy · {nearest_label}",
                    bbox=box,
                    confidence=min(0.98, 0.75 + det.confidence * 0.2),
                    behavior="crane_proximity",
                    distance_m=dist_out,
                    nearest_machine=nearest_label,
                )
            )

    zones = get_crane_zones_for_camera(camera_id)
    polys = [z.get("polygon", []) for z in zones if z.get("polygon")]
    return catalog, polys


def _draw_zone(
    out: np.ndarray,
    polygon: list[dict],
    *,
    fill: tuple[int, int, int],
    border: tuple[int, int, int],
    alpha: float,
    label: str | None = None,
) -> None:
    h, w = out.shape[:2]
    pts = _polygon_to_pts(polygon, w, h)
    overlay = out.copy()
    cv2.fillPoly(overlay, [pts], fill)
    cv2.addWeighted(overlay, alpha, out, 1 - alpha, 0, out)
    cv2.polylines(out, [pts], True, border, 2, cv2.LINE_AA)
    if label and len(pts) > 0:
        cx = int(pts[:, 0].mean())
        cy = int(pts[:, 1].min()) + 18
        cv2.putText(
            out, label, (cx - 60, cy),
            cv2.FONT_HERSHEY_SIMPLEX, 0.42, border, 1, cv2.LINE_AA,
        )


def _draw_detailed_bbox(
    out: np.ndarray,
    det: CraneCatalogDetection,
    *,
    scale: float,
) -> None:
    style = CRANE_CATALOG_STYLES.get(det.kind, CRANE_CATALOG_STYLES["person"])
    color = style["color"]
    x1, y1, x2, y2 = det.bbox

    cv2.rectangle(out, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)
    for cx, cy in ((x1, y1), (x2, y1), (x1, y2), (x2, y2)):
        cv2.circle(out, (cx, cy), 4, color, -1, cv2.LINE_AA)
        cv2.circle(out, (cx, cy), 4, (20, 20, 20), 1, cv2.LINE_AA)

    tag = f"{det.label} {det.confidence * 100:.0f}%"
    if det.distance_m is not None and det.kind == "person":
        tag += f" · {det.distance_m:.2f}m"
    font = cv2.FONT_HERSHEY_SIMPLEX
    thickness = 1
    (tw, th), _ = cv2.getTextSize(tag, font, scale, thickness)
    ty = max(y1 - 6, th + 8)
    cv2.rectangle(out, (x1, ty - th - 8), (x1 + tw + 8, ty + 4), (16, 16, 16), -1)
    cv2.rectangle(out, (x1, ty - th - 8), (x1 + tw + 8, ty + 4), color, 1)
    cv2.putText(out, tag, (x1 + 4, ty - 2), font, scale, color, thickness, cv2.LINE_AA)

    if det.kind == "person" and det.nearest_machine and det.distance_m is not None:
        sub = f"↔ {det.nearest_machine} ({det.distance_m:.2f}m)"
        cv2.putText(
            out, sub, (x1, y2 + int(14 * scale / 0.45)),
            font, scale * 0.85, color, 1, cv2.LINE_AA,
        )


def render_crane_catalog(
    frame: np.ndarray,
    detections: list[CraneCatalogDetection],
    zone_polygons: list[list[dict]],
    *,
    camera_id: str = "A-04",
    show_legend: bool = True,
) -> np.ndarray:
    """Vẽ ROI vùng + bbox chi tiết từng đối tượng."""
    out = frame.copy()
    h, w = out.shape[:2]
    zones = get_crane_zones_for_camera(camera_id)

    for zone in zones:
        poly = zone.get("polygon", [])
        if not poly:
            continue
        ztype = zone.get("type", "")
        if ztype == "CRANE_BODY":
            _draw_zone(
                out, poly,
                fill=(60, 180, 255), border=(200, 160, 60), alpha=0.06,
                label="ROI thân máy",
            )
        elif ztype == "CRANE_WORK":
            _draw_zone(
                out, poly,
                fill=(80, 200, 255), border=(255, 180, 80), alpha=0.05,
                label="ROI vùng làm việc",
            )

    scale = max(0.40, min(0.55, w / 1500))
    order = {"tower_crane": 0, "sany_drill": 1, "crane_green": 2, "person": 3, "crane_proximity": 4}
    for det in sorted(detections, key=lambda d: order.get(d.kind, 9)):
        if det.behavior == "crane_proximity":
            continue
        _draw_detailed_bbox(out, det, scale=scale)

    title = f"Cam {camera_id} — ROI Catalog (máy cẩu / khoan / xúc / người)"
    cv2.putText(out, title, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(out, title, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 200, 80), 1, cv2.LINE_AA)

    if show_legend:
        kinds = ["tower_crane", "sany_drill", "crane_green", "person"]
        present = [k for k in kinds if any(d.kind == k for d in detections)]
        lx, ly = 12, h - 14 - len(present) * 24
        cv2.rectangle(out, (8, ly - 12), (min(w - 8, 260), h - 8), (16, 16, 16), -1)
        cv2.rectangle(out, (8, ly - 12), (min(w - 8, 260), h - 8), (80, 80, 80), 1)
        for i, kind in enumerate(present):
            style = CRANE_CATALOG_STYLES[kind]
            y = ly + i * 24
            cv2.rectangle(out, (16, y - 10), (32, y + 4), style["color"], -1)
            cv2.putText(
                out, style["label"], (40, y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (230, 230, 230), 1, cv2.LINE_AA,
            )

    count_m = sum(1 for d in detections if d.behavior == "crane")
    count_p = sum(1 for d in detections if d.behavior == "person")
    cv2.putText(
        out,
        f"Máy: {count_m} · Người: {count_p} · ngưỡng ≤ {PROXIMITY_THRESHOLD_METERS}m",
        (12, 52),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.42,
        (200, 200, 200),
        1,
        cv2.LINE_AA,
    )

    return out


def save_crane_catalog_snapshot(
    frame: np.ndarray,
    camera_id: str,
    output_path: Path,
) -> dict:
    detections, zone_polys = analyze_crane_catalog(frame, camera_id)
    rendered = render_crane_catalog(frame, detections, zone_polys, camera_id=camera_id)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), rendered)
    core = [d for d in detections if d.behavior != "crane_proximity"]
    return {
        "path": str(output_path),
        "count": len(core),
        "detections": [
            {
                "kind": d.kind,
                "label": d.label,
                "behavior": d.behavior,
                "confidence": round(d.confidence, 3),
                "bbox": list(d.bbox),
                "distance_m": d.distance_m,
                "nearest_machine": d.nearest_machine,
            }
            for d in core
        ],
    }
