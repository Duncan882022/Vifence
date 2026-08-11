"""ROI + hiệu chuẩn khoảng cách máy cẩu — Cam A-04."""

from __future__ import annotations

from typing import TypedDict

from .violation_thresholds import VIOLATION_MIN_CONFIDENCE


class RoiPoint(TypedDict):
    x: float
    y: float


class CraneRoiZone(TypedDict, total=False):
    id: str
    label: str
    type: str
    cameraId: str
    polygon: list[RoiPoint]
    pixels_per_meter: float


CRANE_ROI_ZONES: list[CraneRoiZone] = [
    {
        "id": "roi-crane-body-a04",
        "label": "Thân máy cẩu — TTDV-A Cam 04",
        "type": "CRANE_BODY",
        "cameraId": "A-04",
        "pixels_per_meter": 92.0,
        "polygon": [
            {"x": 0.18, "y": 0.10},
            {"x": 0.82, "y": 0.10},
            {"x": 0.78, "y": 0.54},
            {"x": 0.22, "y": 0.50},
        ],
    },
    {
        "id": "roi-crane-work-a04",
        "label": "Vùng làm việc gần cẩu — Cam 04",
        "type": "CRANE_WORK",
        "cameraId": "A-04",
        "polygon": [
            {"x": 0.02, "y": 1.0000},
            {"x": 0.98, "y": 1.0000},
            {"x": 0.88, "y": 0.52},
            {"x": 0.12, "y": 0.48},
            {"x": 0.02, "y": 0.72},
        ],
    },
]

PROXIMITY_THRESHOLD_METERS = 1.0
EVENT_MIN_CONFIDENCE = VIOLATION_MIN_CONFIDENCE
PERSON_MIN_CONFIDENCE = 0.45
CRANE_MIN_CONFIDENCE = 0.50
DEFAULT_PIXELS_PER_METER = 92.0


def get_crane_zones_for_camera(camera_id: str) -> list[CraneRoiZone]:
    return [z for z in CRANE_ROI_ZONES if z["cameraId"] == camera_id]


def get_crane_body_zone(camera_id: str) -> CraneRoiZone | None:
    for zone in get_crane_zones_for_camera(camera_id):
        if zone["type"] == "CRANE_BODY":
            return zone
    return None


def get_crane_work_zone(camera_id: str) -> CraneRoiZone | None:
    for zone in get_crane_zones_for_camera(camera_id):
        if zone["type"] == "CRANE_WORK":
            return zone
    return None
