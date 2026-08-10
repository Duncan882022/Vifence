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
            {"x": 1.0000, "y": 1.0000},
            {"x": 1.0000, "y": 0.7400},
            {"x": 0.7500, "y": 0.6950},
            {"x": 0.4850, "y": 0.6300},
            {"x": 0.3400, "y": 0.7400},
            {"x": 0.0000, "y": 0.8800},
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
        "label": "Lòng đường — TTDV-A Cam 04",
        "type": "ROAD",
        "camera_id": "A-04",
        "polygon": [
            {"x": 0.02, "y": 1.0000},
            {"x": 0.98, "y": 1.0000},
            {"x": 0.88, "y": 0.52},
            {"x": 0.12, "y": 0.48},
            {"x": 0.02, "y": 0.72},
        ],
        "exempt_from_occupancy": False,
    },
    {
        "id": "roi-buffer-a04",
        "label": "Lề đường — TTDV-A Cam 04",
        "type": "BUFFER",
        "camera_id": "A-04",
        "polygon": [
            {"x": 0.05, "y": 0.35},
            {"x": 0.12, "y": 0.42},
            {"x": 0.08, "y": 0.78},
            {"x": 0.02, "y": 0.68},
        ],
        "exempt_from_occupancy": False,
    },
]


def get_roi_zones_for_camera(camera_id: str) -> list[RoiZone]:
    return [z for z in ROAD_ROI_ZONES if z["camera_id"] == camera_id]
