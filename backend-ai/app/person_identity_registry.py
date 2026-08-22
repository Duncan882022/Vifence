"""ID ẩn danh sgc-0xxxxxxx — dedup người chưa nhận diện (Module 05 HC-*)."""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

from .schemas import PpeDetection
from .track_matching import bbox_iou

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
REGISTRY_FILE = DATA_DIR / "person_identity_registry.json"

_TRACK_META_TTL_SEC = 180.0
_REUSE_IOU = 0.16
_REUSE_CENTER_NORM = 0.13

_lock = threading.Lock()
_state: dict | None = None


def _load() -> dict:
    global _state
    if _state is not None:
        return _state
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if REGISTRY_FILE.exists():
        try:
            _state = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            _state = {"next_seq": 1, "tracks": {}, "track_meta": {}}
    else:
        _state = {"next_seq": 1, "tracks": {}, "track_meta": {}}
    _state.setdefault("next_seq", 1)
    _state.setdefault("tracks", {})
    _state.setdefault("track_meta", {})
    return _state


def _save(state: dict) -> None:
    REGISTRY_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _format_sgc(seq: int) -> str:
    return f"sgc-0{seq:07d}"


def _track_key(camera_id: str, track_id: str) -> str:
    return f"{camera_id}|{track_id}"


def is_sgc_worker_id(worker_id: str | None) -> bool:
    return bool(worker_id and str(worker_id).startswith("sgc-0"))


def is_identified_gallery_worker(worker_id: str | None) -> bool:
    if not worker_id or worker_id == "unknown":
        return False
    return not is_sgc_worker_id(worker_id)


def _center_distance_norm(
    a: list[float] | tuple[float, ...],
    b: list[float] | tuple[float, ...],
    frame_w: int,
    frame_h: int,
) -> float:
    acx = (float(a[0]) + float(a[2])) / 2.0
    acy = (float(a[1]) + float(a[3])) / 2.0
    bcx = (float(b[0]) + float(b[2])) / 2.0
    bcy = (float(b[1]) + float(b[3])) / 2.0
    return (
        ((acx - bcx) / max(frame_w, 1)) ** 2 + ((acy - bcy) / max(frame_h, 1)) ** 2
    ) ** 0.5


def _remember_track_meta(
    state: dict,
    key: str,
    worker_id: str,
    person_bbox: list[float] | None,
) -> None:
    meta = state.setdefault("track_meta", {})
    entry: dict = {
        "worker_id": worker_id,
        "updated_at": time.time(),
    }
    if person_bbox and len(person_bbox) >= 4:
        entry["bbox"] = [float(v) for v in person_bbox[:4]]
    meta[key] = entry


def _find_reusable_worker_id(
    state: dict,
    camera_id: str,
    person_bbox: list[float],
    *,
    frame_w: int = 640,
    frame_h: int = 480,
) -> str | None:
    """Cùng người, track_id mới — tái dùng sgc theo bbox gần (IoU / khoảng cách)."""
    now = time.time()
    meta = state.get("track_meta") or {}
    prefix = f"{camera_id}|"
    best_wid: str | None = None
    best_score = 0.0

    for key, row in meta.items():
        if not key.startswith(prefix):
            continue
        if now - float(row.get("updated_at") or 0) > _TRACK_META_TTL_SEC:
            continue
        other_bbox = row.get("bbox")
        wid = str(row.get("worker_id") or state.get("tracks", {}).get(key) or "").strip()
        if not wid or not other_bbox or len(other_bbox) < 4:
            continue
        iou = bbox_iou(person_bbox, other_bbox)
        dist = _center_distance_norm(person_bbox, other_bbox, frame_w, frame_h)
        if iou < _REUSE_IOU and dist > _REUSE_CENTER_NORM:
            continue
        score = iou * 2.0 + max(0.0, 1.0 - dist * 4.0)
        if score > best_score:
            best_score = score
            best_wid = wid

    return best_wid


def bind_patrol_track_identity(
    camera_id: str,
    track_id: str,
    worker_id: str,
    *,
    person_bbox: list[float] | None = None,
    frame_w: int = 640,
    frame_h: int = 480,
) -> None:
    """Gắn track_id → worker_id đã có (tránh cấp sgc mới cho cùng người)."""
    wid = worker_id.strip()
    if not wid or wid == "unknown":
        return
    key = _track_key(camera_id, track_id)
    with _lock:
        state = _load()
        state["tracks"][key] = wid
        if person_bbox and len(person_bbox) >= 4:
            _remember_track_meta(state, key, wid, person_bbox)
        _save(state)


def resolve_patrol_person_identity(
    detection: PpeDetection,
    camera_id: str,
    track_id: str,
    *,
    person_bbox: list[float] | None = None,
    frame_w: int = 640,
    frame_h: int = 480,
) -> tuple[str, str]:
    """Trả (worker_id, worker_name) — gallery verified hoặc sgc-0xxxxxxx."""
    from .worker_identity.verify import is_verified_face_match, worker_match_from_detection

    wid = (detection.worker_id or "").strip()
    wname = (detection.worker_name or "").strip()
    match = worker_match_from_detection(detection)
    if wid and wid != "unknown" and is_verified_face_match(match):
        key = _track_key(camera_id, track_id)
        with _lock:
            state = _load()
            state["tracks"][key] = wid
            if person_bbox and len(person_bbox) >= 4:
                _remember_track_meta(state, key, wid, person_bbox)
            _save(state)
        return wid, wname or wid

    pb = person_bbox
    if pb is None and detection.subject_bbox and len(detection.subject_bbox) >= 4:
        pb = [float(v) for v in detection.subject_bbox]
    elif pb is None and detection.bbox and len(detection.bbox) >= 4:
        pb = [float(v) for v in detection.bbox]

    key = _track_key(camera_id, track_id)
    with _lock:
        state = _load()
        existing = state["tracks"].get(key)
        if isinstance(existing, str) and existing.strip():
            existing = existing.strip()
            if pb and len(pb) >= 4:
                _remember_track_meta(state, key, existing, pb)
                _save(state)
            return existing, existing

        if pb and len(pb) >= 4:
            reused = _find_reusable_worker_id(
                state,
                camera_id,
                pb,
                frame_w=frame_w,
                frame_h=frame_h,
            )
            if reused:
                state["tracks"][key] = reused
                _remember_track_meta(state, key, reused, pb)
                _save(state)
                return reused, reused

        seq = max(int(state.get("next_seq") or 1), 1)
        sgc = _format_sgc(seq)
        state["next_seq"] = seq + 1
        state["tracks"][key] = sgc
        if pb and len(pb) >= 4:
            _remember_track_meta(state, key, sgc, pb)
        _save(state)
        return sgc, sgc
