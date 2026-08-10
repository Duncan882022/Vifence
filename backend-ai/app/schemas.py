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
    machine_kind: Optional[str] = None  # tower_crane | crane_green | sany_drill | road_roller | dump_truck | forklift | machinery
    machine_bbox: Optional[list[float]] = None


class PpeDetection(BaseModel):
    behavior: str  # person | hard_hat | no_helmet | safety_vest | no_vest | safety_shoes | no_shoes
    label: str
    scenario_id: str
    confidence: float
    bbox: list[float]
    worker_id: Optional[str] = None
    worker_name: Optional[str] = None
    employee_code: Optional[str] = None
    contractor_name: Optional[str] = None
    face_match_confidence: Optional[float] = None


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
    subject_bbox: Optional[list[float]] = None  # người vi phạm (snapshot PCCC heuristic)
    vehicle_plate: Optional[str] = None
    vehicle_type: Optional[str] = None
    driver_name: Optional[str] = None


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

PPE_SCENARIO_META = {
    "no_helmet": {
        "scenario_id": "PPE-001",
        "scenario_name": "Không đội mũ bảo hộ",
        "violation_type": "ppe",
        "group": "PPE",
    },
    "no_vest": {
        "scenario_id": "PPE-002",
        "scenario_name": "Không mặc áo phản quang/áo bảo hộ",
        "violation_type": "ppe",
        "group": "PPE",
    },
    "no_shoes": {
        "scenario_id": "PPE-003",
        "scenario_name": "Không mang giày BHLD",
        "violation_type": "ppe",
        "group": "PPE",
    },
    "hard_hat": {
        "scenario_id": "PPE-001",
        "scenario_name": "Mũ bảo hộ",
        "violation_type": "ppe",
        "group": "PPE",
    },
    "safety_vest": {
        "scenario_id": "PPE-002",
        "scenario_name": "Áo phản quang",
        "violation_type": "ppe",
        "group": "PPE",
    },
    "safety_shoes": {
        "scenario_id": "PPE-003",
        "scenario_name": "Giày BHLD",
        "violation_type": "ppe",
        "group": "PPE",
    },
}

WAH_SCENARIO_META = {
    "no_harness": {
        "scenario_id": "WAH-001",
        "scenario_name": "Người lao động làm việc gần mép biên không có dây an toàn",
        "violation_type": "work-at-height",
        "group": "WAH",
    },
}

ATGT_SCENARIO_META = {
    "speeding": {
        "scenario_id": "ATGT-002",
        "scenario_name": "Phương tiện vượt quá tốc độ quy định",
        "violation_type": "traffic-safety",
        "group": "ATGT",
    },
    "hard_median": {
        "scenario_id": "ATGT-004",
        "scenario_name": "Đã tổ chức phân làn (làn cứng)",
        "violation_type": "traffic-safety",
        "group": "ATGT",
    },
    "no_soft_median": {
        "scenario_id": "ATGT-004",
        "scenario_name": "Không tổ chức phân làn, luồng giao thông",
        "violation_type": "traffic-safety",
        "group": "ATGT",
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
    subject_bbox: Optional[list[float]] = None
    related_bbox: Optional[list[float]] = None
    frame_width: Optional[int] = None
    frame_height: Optional[int] = None
    created_at: float = Field(default_factory=time.time)
    confirmed_at: Optional[float] = None  # Unix timestamp khi đủ confirm (VMS)
    event_date: Optional[str] = None
    camera_id: str = "LOCAL-CAM"
    snapshot_file: Optional[str] = None
    clip_file: Optional[str] = None       # Đường dẫn clip MP4 (VMS mode)
    clip_duration_sec: Optional[float] = None
    dedup_key: Optional[str] = None
    vehicle_plate: Optional[str] = None
    vehicle_type: Optional[str] = None
    driver_name: Optional[str] = None
    worker_id: Optional[str] = None
    worker_name: Optional[str] = None
    employee_code: Optional[str] = None
    contractor_name: Optional[str] = None
    face_match_confidence: Optional[float] = None
    face_match_source: Optional[str] = None

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

    @classmethod
    def from_ppe_detection(
        cls,
        detection: PpeDetection,
        snapshot_file: Optional[str],
        event_date: Optional[str] = None,
        camera_id: str = "A-04",
    ) -> "ViolationEvent":
        meta = PPE_SCENARIO_META.get(
            detection.behavior,
            {
                "scenario_id": detection.scenario_id,
                "scenario_name": detection.label,
                "violation_type": "ppe",
                "group": "PPE",
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

    @classmethod
    def from_wah_detection(
        cls,
        detection: Detection,
        snapshot_file: Optional[str],
        event_date: Optional[str] = None,
        camera_id: str = "A-04",
    ) -> "ViolationEvent":
        meta = WAH_SCENARIO_META[detection.behavior]
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
    def from_atgt_detection(
        cls,
        detection: Detection,
        snapshot_file: Optional[str],
        event_date: Optional[str] = None,
        camera_id: str = "A-03",
    ) -> "ViolationEvent":
        meta = ATGT_SCENARIO_META[detection.behavior]
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
            vehicle_plate=detection.vehicle_plate,
            vehicle_type=detection.vehicle_type,
            driver_name=detection.driver_name,
        )


class WorkerGalleryEnrollPayload(BaseModel):
    user_id: Optional[str] = None
    cccd: Optional[str] = None
    worker_name: str
    employee_code: str
    contractor_name: Optional[str] = None
    image_b64: str
    pose_slot: int = Field(ge=1, le=3)
