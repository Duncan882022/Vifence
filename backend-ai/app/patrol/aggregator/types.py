"""Kiểu dữ liệu cho Event Aggregator — một session = một track (ptk-*)."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class IdentityType(str, Enum):
    UNKNOWN = "UNKNOWN"
    KNOWN = "KNOWN"  # p-* / gallery
    ANONYMOUS = "ANONYMOUS"  # sgc-*


@dataclass
class BestFaceFrame:
    quality: float
    captured_at: float
    embedding: tuple[float, ...] | None = None


@dataclass
class InteractionRecord:
    object_id: str
    action: str = "touch"
    timestamp: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        from datetime import datetime, timezone

        ts = datetime.fromtimestamp(self.timestamp, tz=timezone.utc).isoformat()
        return {
            "object_id": self.object_id,
            "action": self.action,
            "timestamp": ts,
        }


@dataclass
class PersonIdentity:
    person_id: str | None = None
    identity_type: IdentityType = IdentityType.UNKNOWN
    confidence: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "person_id": self.person_id or "",
            "type": self.identity_type.value,
            "confidence": round(float(self.confidence), 4),
        }


@dataclass
class TrackSession:
    """Một hành trình ByteTrack — buffer in-memory, flush khi mất track."""

    camera_id: str
    track_id: str
    zone_id: str | None = None
    started_at: float = 0.0
    last_seen_at: float = 0.0
    bbox: tuple[float, float, float, float] | None = None

    # session_id ổn định qua Re-ID — khác track_id ByteTrack
    session_id: str | None = None
    counted: bool = False
    was_inside_site: bool | None = None

    # Cache định danh — True → bỏ qua re-embedding/gallery
    identity_resolved: bool = False
    identity: PersonIdentity = field(default_factory=PersonIdentity)
    subject_id: str | None = None  # pers-* hoặc obj-* sau promote

    best_faces: list[BestFaceFrame] = field(default_factory=list)
    interactions: list[InteractionRecord] = field(default_factory=list)

    appearance_row_id: int | None = None
    last_flush_at: float = 0.0
    dirty: bool = False
    committed: bool = False

    @property
    def session_key(self) -> str:
        return f"{self.camera_id}|{self.track_id}"

    @property
    def duration_seconds(self) -> float:
        return max(0.0, self.last_seen_at - self.started_at)

    def touch(self, ts: float, bbox: tuple[float, float, float, float] | None) -> None:
        if self.started_at <= 0:
            self.started_at = ts
        self.last_seen_at = ts
        if bbox is not None:
            self.bbox = bbox


@dataclass
class ObservationInput:
    """Đầu vào một khung hình cho aggregator."""

    camera_id: str
    track_id: str
    ts: float
    person_bbox: tuple[float, float, float, float] | None = None
    zone_id: str | None = None
    face_embedding: tuple[float, ...] | None = None
    face_quality: float = 0.0
    face_eligible: bool = False
    confidence: float = 0.0
    frame: Any = None
    lifecycle_tier: str | None = None
    lifecycle_worker_id: str | None = None
    worker_name: str | None = None
    touched_object_id: str | None = None
    density_only: bool = False
