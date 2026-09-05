"""Contract tầng thống nhất Module 05 — live ROI, snapshot, bundle, lịch sử.

Một struct duy nhất thay cho nhiều lớp suy tầng rời (lifecycle, snapshot_tier,
persons.status, snapshotScore FE). Nguồn ghi: ``patrol_identity_lifecycle``;
downstream chỉ đọc hoặc copy frozen vào SQLite.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from ..patrol_identity_lifecycle import (
    TIER_IDENTITY,
    TIER_OBJECT,
    TIER_PERSON,
    TIER_LABEL_VI,
    tier_for_worker_id,
)

TIER_RANK: dict[str, int] = {
    TIER_OBJECT: 0,
    TIER_PERSON: 1,
    TIER_IDENTITY: 2,
}


class TierSnapshot(BaseModel):
    tier: str = TIER_OBJECT
    tier_rank: int = 0
    tier_since: float = 0.0
    subject_id: str = ""
    worker_id: str | None = None
    worker_name: str | None = None
    face_eligible: bool = False
    confidence: float = 0.0
    snapshot_score: float = 0.0
    promoted_from: list[str] = Field(default_factory=list)
    promoted_at: float | None = None
    bbox: list[float] = Field(default_factory=list)
    track_id: str = ""
    camera_id: str = ""
    tier_source: str = "lifecycle"

    @property
    def tier_label_vi(self) -> str:
        return TIER_LABEL_VI.get(self.tier, self.tier)

    def to_payload_dict(self) -> dict[str, Any]:
        d = self.model_dump()
        d["tier_label_vi"] = self.tier_label_vi
        d["tier_at_observation"] = self.tier
        return d

    @classmethod
    def from_payload_dict(cls, data: dict[str, Any] | None) -> TierSnapshot | None:
        if not data:
            return None
        if "tier" in data and isinstance(data.get("tier"), str):
            return cls.model_validate(data)
        tier = str(data.get("tier_at_observation") or "").strip()
        if not tier:
            return None
        return cls(tier=tier, tier_source="inferred")


def higher_tier(a: str, b: str) -> str:
    ra = TIER_RANK.get(a, 0)
    rb = TIER_RANK.get(b, 0)
    return a if ra >= rb else b


def resolve_badge_confidence(
    *,
    yolo_confidence: float = 0.0,
    face_match_confidence: float | None = None,
    face_quality: float = 0.0,
    tier: str,
) -> float:
    """% hiển thị trên bbox — ưu tiên face match, rồi face quality, rồi YOLO."""
    if tier == TIER_IDENTITY and face_match_confidence is not None:
        return max(0.0, min(1.0, float(face_match_confidence)))
    if face_quality > 0:
        return max(0.0, min(1.0, float(face_quality)))
    return max(0.0, min(1.0, float(yolo_confidence)))


def compute_snapshot_score(*, face_quality: float, confidence: float) -> float:
    return float(face_quality) * 2.0 + float(confidence)


def resolve_subject_id(
    *,
    worker_id: str | None,
    object_id: str | None = None,
    pers_id: str | None = None,
) -> str:
    wid = (worker_id or "").strip()
    if wid and wid != "unknown":
        from ..patrol_ids import normalize_track_id

        tk = normalize_track_id(wid)
        if tk:
            return tk
        if wid.startswith("p-"):
            return wid
    if pers_id:
        return pers_id.strip()
    return (object_id or "").strip()


def build_tier_snapshot(
    *,
    tier: str,
    tier_since: float,
    subject_id: str,
    worker_id: str | None = None,
    worker_name: str | None = None,
    face_eligible: bool = False,
    confidence: float = 0.0,
    face_quality: float = 0.0,
    face_match_confidence: float | None = None,
    promoted_from: list[str] | None = None,
    promoted_at: float | None = None,
    bbox: list[float] | None = None,
    track_id: str = "",
    camera_id: str = "",
    tier_source: str = "lifecycle",
) -> TierSnapshot:
    """Xây TierSnapshot từ lifecycle + metadata frame."""
    t = (tier or TIER_OBJECT).strip()
    inferred = tier_for_worker_id(worker_id)
    if TIER_RANK.get(inferred, 0) > TIER_RANK.get(t, 0):
        t = inferred

    conf = resolve_badge_confidence(
        yolo_confidence=confidence,
        face_match_confidence=face_match_confidence,
        face_quality=face_quality,
        tier=t,
    )
    snap_score = compute_snapshot_score(face_quality=face_quality, confidence=confidence)

    return TierSnapshot(
        tier=t,
        tier_rank=TIER_RANK.get(t, 0),
        tier_since=tier_since,
        subject_id=(subject_id or "").strip(),
        worker_id=(worker_id or "").strip() or None,
        worker_name=(worker_name or "").strip() or None,
        face_eligible=bool(face_eligible),
        confidence=conf,
        snapshot_score=snap_score,
        promoted_from=list(promoted_from or []),
        promoted_at=promoted_at,
        bbox=list(bbox or []),
        track_id=(track_id or "").strip(),
        camera_id=(camera_id or "").strip(),
        tier_source=tier_source,
    )


def attach_tier_snapshot_to_detection(
    det: Any,
    *,
    tier: str,
    tier_since: float,
    camera_id: str,
    track_id: str,
    worker_id: str | None = None,
    worker_name: str | None = None,
    subject_id: str | None = None,
    face_eligible: bool = False,
    confidence: float = 0.0,
    face_quality: float = 0.0,
    face_match_confidence: float | None = None,
    promoted_from: list[str] | None = None,
    promoted_at: float | None = None,
    bbox: list[float] | None = None,
    tier_source: str = "lifecycle",
) -> TierSnapshot:
    """Gắn tier_snapshot lên PpeDetection — đồng bộ ROI WS và ghi sự kiện."""
    wid = (worker_id or getattr(det, "worker_id", None) or "").strip() or None
    sid = (subject_id or "").strip() or resolve_subject_id(worker_id=wid)
    snap = build_tier_snapshot(
        tier=tier,
        tier_since=tier_since,
        subject_id=sid,
        worker_id=wid,
        worker_name=worker_name,
        face_eligible=face_eligible,
        confidence=confidence,
        face_quality=face_quality,
        face_match_confidence=face_match_confidence,
        promoted_from=promoted_from,
        promoted_at=promoted_at,
        bbox=bbox or list(getattr(det, "bbox", []) or []),
        track_id=track_id,
        camera_id=camera_id,
        tier_source=tier_source,
    )
    det.tier = snap.tier
    try:
        from ..schemas import TierSnapshotPayload

        det.tier_snapshot = TierSnapshotPayload.model_validate(snap.model_dump())
    except Exception:  # noqa: BLE001
        pass
    return snap
