"""ROI lòng đường — đồng bộ với housekeepingRoiConfig.ts (Module 04)."""

from __future__ import annotations

from typing import TypedDict


class RoiPoint(TypedDict):
    x: float
    y: float


class RoiZone(TypedDict):
    id: str
    label: str
    type: str
    camera_id: str
    polygon: list[RoiPoint]
    exempt_from_occupancy: bool


ROAD_ROI_ZONES: list[RoiZone] = [
    {
        "id": "roi-road-a03",
        "label": "Lòng đường — TTDV-A Cam 03",
        "type": "ROAD",
        "camera_id": "A-03",
        "polygon": [
            {"x": 0.0000, "y": 1.0000},
            {"x": 0.0800, "y": 0.9000},
            {"x": 0.1400, "y": 0.7800},
            {"x": 0.2400, "y": 0.6600},
            {"x": 0.3600, "y": 0.5800},
            {"x": 0.5000, "y": 0.5400},
            {"x": 0.6400, "y": 0.5800},
            {"x": 0.7600, "y": 0.6600},
            {"x": 0.8800, "y": 0.7600},
            {"x": 0.9600, "y": 0.8800},
            {"x": 1.0000, "y": 1.0000},
        ],
        "exempt_from_occupancy": False,
    },
    {
        "id": "roi-buffer-a03",
        "label": "Lề đường — TTDV-A Cam 03",
        "type": "BUFFER",
        "camera_id": "A-03",
        "polygon": [
            {"x": 0.02, "y": 0.38},
            {"x": 0.08, "y": 0.45},
            {"x": 0.05, "y": 0.90},
            {"x": 0.0, "y": 0.82},
        ],
        "exempt_from_occupancy": False,
    },
    {
        "id": "roi-road-a04",
        "label": "Lòng đường — Sân Tập A",
        "type": "ROAD",
        "camera_id": "A-04",
        "polygon": [
            {"x": 0.12, "y": 0.42},
            {"x": 0.88, "y": 0.38},
            {"x": 0.92, "y": 0.72},
            {"x": 0.08, "y": 0.78},
        ],
        "exempt_from_occupancy": False,
    },
]


def get_roi_zones_for_camera(camera_id: str) -> list[RoiZone]:
    return [z for z in ROAD_ROI_ZONES if z["camera_id"] == camera_id]
