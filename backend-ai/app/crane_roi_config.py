"""ROI + hiệu chuẩn khoảng cách máy cẩu — Cam A-04."""

from __future__ import annotations

from typing import TypedDict


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


# ROI máy xúc (bên phải) — fallback khi JPEG nén làm lệch màu detect
GREEN_EXCAVATOR_ROI: list[RoiPoint] = [
    {"x": 0.34, "y": 0.30},
    {"x": 0.97, "y": 0.32},
    {"x": 0.97, "y": 0.82},
    {"x": 0.30, "y": 0.78},
]

CRANE_ROI_ZONES: list[CraneRoiZone] = [
    {
        "id": "roi-crane-body-a04",
        "label": "Thân máy cẩu — TTDV-A Cam 04",
        "type": "CRANE_BODY",
        "cameraId": "A-04",
        "pixels_per_meter": 92.0,
        "polygon": [
            {"x": 0.32, "y": 0.06},
            {"x": 0.94, "y": 0.10},
            {"x": 0.90, "y": 0.52},
            {"x": 0.26, "y": 0.46},
        ],
    },
    {
        "id": "roi-crane-work-a04",
        "label": "Vùng làm việc gần cẩu — Cam 04",
        "type": "CRANE_WORK",
        "cameraId": "A-04",
        "polygon": [
            {"x": 0.08, "y": 0.42},
            {"x": 0.96, "y": 0.44},
            {"x": 0.96, "y": 0.98},
            {"x": 0.04, "y": 0.98},
        ],
    },
]

PROXIMITY_THRESHOLD_METERS = 1.0
EVENT_MIN_CONFIDENCE = 0.80
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
