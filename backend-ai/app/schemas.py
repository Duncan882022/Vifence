from __future__ import annotations

import time
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class MobileFramePayload(BaseModel):
    type: str = "frame"
    camera_id: str = "mobile"
    image: str
    mode: Optional[str] = None  # "road" → phân tích lòng đường (Module 04)


class RoadDetection(BaseModel):
    behavior: str  # mud | water | object
    label: str
    scenario_id: str
    confidence: float
    bbox: list[float]
    area_percent: Optional[float] = None
    object_kind: Optional[str] = None  # steel | cement_bag | brick | rust_metal | generic


class CraneProximityDetection(BaseModel):
    behavior: str  # person | crane | crane_proximity
    label: str
    scenario_id: str
    confidence: float
    bbox: list[float]
    distance_m: Optional[float] = None
    machine_kind: Optional[str] = None  # crane_green | excavator_orange | machinery


class MobileAiConfigPayload(BaseModel):
    backend_url: str
    source: str = "mobile-fe"


class Detection(BaseModel):
    """Một bbox detect được trong 1 frame (khớp tinh thần với
    { type: 'detections', detections: [...] } mà CameraJsmpegFeed.tsx bên
    frontend Vifence-CMS đã hỗ trợ)."""

    behavior: str  # "smoking" | "fire"
    label: str  # tên class gốc trả về từ model (vd "cigarette", "fire", "smoke")
    confidence: float
    bbox: list[float]  # [x1, y1, x2, y2] toạ độ pixel trên frame gốc


# Metadata tĩnh mô tả kịch bản, ăn khớp với nhóm PCCC trong
# src/modules/module03-safety/data/safetyMonitoringDictionary.ts (frontend).
# PCCC-001 đã tồn tại sẵn ở frontend. PCCC-002 là đề xuất bổ sung khi tích hợp.
SCENARIO_META = {
    "smoking": {
        "scenario_id": "PCCC-001",
        "scenario_name": "Phát hiện hút thuốc ngoài khu vực cho phép",
        "violation_type": "fire-hot-work",
        "group": "PCCC",
    },
    "fire": {
        "scenario_id": "PCCC-002",
        "scenario_name": "Phát hiện dấu hiệu cháy nổ",
        "violation_type": "fire-hot-work",
        "group": "PCCC",
    },
}

ROAD_SCENARIO_META = {
    "mud": {
        "scenario_id": "BPTC-007",
        "scenario_name": "Đường nội bộ bùn bẩn",
        "violation_type": "method-statement",
        "group": "BPTC",
    },
    "water": {
        "scenario_id": "BPTC-008",
        "scenario_name": "Đường nội bộ đọng nước",
        "violation_type": "method-statement",
        "group": "BPTC",
    },
    "object": {
        "scenario_id": "BPTC-009",
        "scenario_name": "Vật tư chiếm dụng lòng đường",
        "violation_type": "method-statement",
        "group": "BPTC",
    },
    "mesh_missing": {
        "scenario_id": "BPTC-001",
        "scenario_name": "Lưới bao che thiếu/hở",
        "violation_type": "method-statement",
        "group": "BPTC",
    },
    "mesh_torn": {
        "scenario_id": "BPTC-001",
        "scenario_name": "Lưới bao che bị rách",
        "violation_type": "method-statement",
        "group": "BPTC",
    },
    "mesh_dirty": {
        "scenario_id": "BPTC-001",
        "scenario_name": "Lưới bao che bẩn",
        "violation_type": "method-statement",
        "group": "BPTC",
    },
}

CRANE_SCENARIO_META = {
    "crane_proximity": {
        "scenario_id": "DZ-003",
        "scenario_name": "Làm việc trong vùng nguy hiểm",
        "violation_type": "danger-zone",
        "group": "DZ",
    },
    "person": {
        "scenario_id": "DZ-003",
        "scenario_name": "Làm việc trong vùng nguy hiểm",
        "violation_type": "danger-zone",
        "group": "DZ",
    },
    "crane": {
        "scenario_id": "DZ-003",
        "scenario_name": "Làm việc trong vùng nguy hiểm",
        "violation_type": "danger-zone",
        "group": "DZ",
    },
}


class ViolationEvent(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    behavior: str  # "smoking" | "fire" | "mud" | "water" | "object"
    scenario_id: str
    scenario_name: str
    violation_type: str
    group: str
    confidence: float
    bbox: list[float]
    created_at: float = Field(default_factory=time.time)
    event_date: Optional[str] = None
    camera_id: str = "LOCAL-CAM"
    snapshot_file: Optional[str] = None

    @classmethod
    def from_detection(
        cls,
        detection: Detection,
        snapshot_file: Optional[str],
        event_date: Optional[str] = None,
        camera_id: str = "LOCAL-CAM",
    ) -> "ViolationEvent":
        meta = SCENARIO_META[detection.behavior]
        created = time.time()
        day = event_date or datetime.fromtimestamp(created).strftime("%Y-%m-%d")
        return cls(
            behavior=detection.behavior,
            scenario_id=meta["scenario_id"],
            scenario_name=meta["scenario_name"],
            violation_type=meta["violation_type"],
            group=meta["group"],
            confidence=detection.confidence,
            bbox=detection.bbox,
            created_at=created,
            event_date=day,
            camera_id=camera_id,
            snapshot_file=snapshot_file,
        )

    @classmethod
    def from_road_detection(
        cls,
        detection: RoadDetection,
        snapshot_file: Optional[str],
        event_date: Optional[str] = None,
        camera_id: str = "A-03",
    ) -> "ViolationEvent":
        meta = ROAD_SCENARIO_META.get(detection.behavior)
        if meta is None:
            meta = {
                "scenario_id": detection.scenario_id,
                "scenario_name": detection.label,
                "violation_type": "method-statement",
                "group": "BPTC",
            }
        created = time.time()
        day = event_date or datetime.fromtimestamp(created).strftime("%Y-%m-%d")
        return cls(
            behavior=detection.behavior,
            scenario_id=meta["scenario_id"],
            scenario_name=meta["scenario_name"],
            violation_type=meta["violation_type"],
            group=meta["group"],
            confidence=detection.confidence,
            bbox=detection.bbox,
            created_at=created,
            event_date=day,
            camera_id=camera_id,
            snapshot_file=snapshot_file,
        )

    @classmethod
    def from_crane_detection(
        cls,
        detection: CraneProximityDetection,
        snapshot_file: Optional[str],
        event_date: Optional[str] = None,
        camera_id: str = "A-04",
    ) -> "ViolationEvent":
        meta = CRANE_SCENARIO_META.get(
            detection.behavior,
            {
                "scenario_id": detection.scenario_id,
                "scenario_name": detection.label,
                "violation_type": "danger-zone",
                "group": "DZ",
            },
        )
        created = time.time()
        day = event_date or datetime.fromtimestamp(created).strftime("%Y-%m-%d")
        return cls(
            behavior=detection.behavior,
            scenario_id=meta["scenario_id"],
            scenario_name=meta["scenario_name"],
            violation_type=meta["violation_type"],
            group=meta["group"],
            confidence=detection.confidence,
            bbox=detection.bbox,
            created_at=created,
            event_date=day,
            camera_id=camera_id,
            snapshot_file=snapshot_file,
        )
