"""Bộ nhớ Re-ID — giữ session 180s sau khi mất track ByteTrack."""

from __future__ import annotations

import threading
from dataclasses import dataclass

import numpy as np

from .types import IdentityType, PersonIdentity, TrackSession

_lock = threading.RLock()
_slots: dict[str, list["_LostSlot"]] = {}

MEMORY_TTL_SEC = 180.0
REID_MIN_COSINE = 0.85
REID_IOU_MIN = 0.30


@dataclass
class _LostSlot:
    camera_id: str
    subject_id: str
    session_id: str
    embedding: tuple[float, ...] | None
    bbox: tuple[float, float, float, float] | None
    last_seen: float
    identity_resolved: bool
    identity: PersonIdentity
    appearance_row_id: int | None
    counted: bool
    was_inside_site: bool | None
    zone_id: str | None = None


def _cosine(a: tuple[float, ...], b: tuple[float, ...]) -> float:
    va = np.asarray(a, dtype=np.float32).ravel()
    vb = np.asarray(b, dtype=np.float32).ravel()
    if va.size != vb.size or va.size == 0:
        return 0.0
    na, nb = float(np.linalg.norm(va)), float(np.linalg.norm(vb))
    if na <= 0 or nb <= 0:
        return 0.0
    return float(np.dot(va / na, vb / nb))


def _bbox_iou(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _prune(camera_id: str, now: float) -> None:
    kept = [
        s for s in _slots.get(camera_id, [])
        if now - s.last_seen <= MEMORY_TTL_SEC
    ]
    if kept:
        _slots[camera_id] = kept
    else:
        _slots.pop(camera_id, None)


def stash_session(session: TrackSession, *, embedding: tuple[float, ...] | None) -> None:
    """Lưu session vừa finalize để track mới có thể nhận lại."""
    if not session.session_id or not session.subject_id:
        return
    slot = _LostSlot(
        camera_id=session.camera_id,
        subject_id=session.subject_id,
        session_id=session.session_id,
        embedding=embedding,
        bbox=session.bbox,
        last_seen=session.last_seen_at,
        identity_resolved=session.identity_resolved,
        identity=session.identity,
        appearance_row_id=session.appearance_row_id,
        counted=session.counted,
        was_inside_site=session.was_inside_site,
        zone_id=session.zone_id,
    )
    with _lock:
        _prune(session.camera_id, session.last_seen_at)
        _slots.setdefault(session.camera_id, []).append(slot)


def try_reclaim(
    camera_id: str,
    *,
    bbox: tuple[float, float, float, float] | None,
    embedding: tuple[float, ...] | None,
    now: float,
) -> _LostSlot | None:
    """Track mới — thử gộp lại session cũ qua embedding hoặc IoU."""
    with _lock:
        _prune(camera_id, now)
        slots = _slots.get(camera_id) or []
        if not slots:
            return None

        best: _LostSlot | None = None
        best_score = REID_MIN_COSINE
        kept: list[_LostSlot] = []

        for slot in slots:
            if embedding is not None and slot.embedding is not None:
                sim = _cosine(embedding, slot.embedding)
                if sim >= best_score:
                    if best is not None:
                        kept.append(best)
                    best = slot
                    best_score = sim
                    continue
            if bbox is not None and slot.bbox is not None:
                iou = _bbox_iou(bbox, slot.bbox)
                if iou >= REID_IOU_MIN and (best is None or best_score < REID_MIN_COSINE):
                    if best is not None:
                        kept.append(best)
                    best = slot
                    best_score = REID_IOU_MIN
                    continue
            kept.append(slot)

        if best is not None:
            _slots[camera_id] = [s for s in kept if s is not best]
            if not _slots[camera_id]:
                _slots.pop(camera_id, None)
            return best
        _slots[camera_id] = kept
        return None


def apply_reclaim(session: TrackSession, slot: _LostSlot) -> None:
    session.session_id = slot.session_id
    session.subject_id = slot.subject_id
    session.identity_resolved = slot.identity_resolved
    session.identity = slot.identity
    session.appearance_row_id = slot.appearance_row_id
    session.counted = slot.counted
    session.was_inside_site = slot.was_inside_site
    if slot.zone_id:
        session.zone_id = slot.zone_id
    session.dirty = True


def reset(camera_id: str | None = None) -> None:
    with _lock:
        if camera_id is None:
            _slots.clear()
            return
        _slots.pop(camera_id, None)
