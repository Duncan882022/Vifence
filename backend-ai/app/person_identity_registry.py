"""ID ẩn danh sgc-0xxxxxxx — dedup người chưa nhận diện (Module 05 HC-*)."""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import numpy as np

from .config import settings
from .schemas import PpeDetection
from .track_matching import bbox_iou
from .worker_identity.gallery import embedding_similarity

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


def clear_registry() -> int:
    """Xóa toàn bộ registry sgc-* trong RAM và file — dùng khi reset test data."""
    global _state
    with _lock:
        count = len((_state or {}).get("tracks", {}))
        _state = {"next_seq": 1, "tracks": {}, "track_meta": {}}
        REGISTRY_FILE.write_text(
            json.dumps(_state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return count


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


def _as_emb(vec: list[float] | None) -> np.ndarray | None:
    if not vec or len(vec) < 8:
        return None
    return np.asarray(vec, dtype=np.float64)


def _face_compatible(
    query: np.ndarray,
    other: np.ndarray,
    *,
    for_merge: bool,
) -> bool:
    sim = embedding_similarity(query, other)
    if for_merge:
        return sim >= settings.patrol_face_reuse_min_similarity
    return sim >= settings.patrol_face_split_max_similarity


def _conflicts_frame_faces(
    worker_id: str,
    face_emb: np.ndarray,
    frame_face_assignments: dict[str, list[float]] | None,
) -> bool:
    """True nếu worker_id đã gán cho mặt khác trong cùng frame — tránh 2 người → 1 ID."""
    if not frame_face_assignments:
        return False
    for wid, emb_list in frame_face_assignments.items():
        if wid == worker_id:
            continue
        other = _as_emb(emb_list)
        if other is None:
            continue
        if _face_compatible(face_emb, other, for_merge=True):
            continue
        return True
    return False


def _remember_track_meta(
    state: dict,
    key: str,
    worker_id: str,
    person_bbox: list[float] | None,
    face_emb: list[float] | None = None,
) -> None:
    meta = state.setdefault("track_meta", {})
    entry: dict = {
        "worker_id": worker_id,
        "updated_at": time.time(),
    }
    if person_bbox and len(person_bbox) >= 4:
        entry["bbox"] = [float(v) for v in person_bbox[:4]]
    if face_emb and len(face_emb) >= 8:
        entry["face_emb"] = [float(v) for v in face_emb]
    meta[key] = entry


def _identity_face_emb(state: dict, camera_id: str, worker_id: str) -> np.ndarray | None:
    prefix = f"{camera_id}|"
    now = time.time()
    best: np.ndarray | None = None
    best_ts = 0.0
    for key, row in (state.get("track_meta") or {}).items():
        if not key.startswith(prefix):
            continue
        if str(row.get("worker_id") or "") != worker_id:
            continue
        if now - float(row.get("updated_at") or 0) > _TRACK_META_TTL_SEC:
            continue
        emb = _as_emb(row.get("face_emb"))
        if emb is None:
            continue
        ts = float(row.get("updated_at") or 0)
        if ts >= best_ts:
            best_ts = ts
            best = emb
    return best


def _find_reusable_worker_id(
    state: dict,
    camera_id: str,
    person_bbox: list[float],
    *,
    frame_w: int = 640,
    frame_h: int = 480,
    face_emb: np.ndarray | None = None,
    frame_face_assignments: dict[str, list[float]] | None = None,
) -> str | None:
    """Tái dùng ID — ưu tiên mặt; bbox chỉ khi không có mặt hoặc mặt khớp."""
    now = time.time()
    meta = state.get("track_meta") or {}
    prefix = f"{camera_id}|"

    if face_emb is not None:
        face_candidates: list[tuple[str, float]] = []
        for key, row in meta.items():
            if not key.startswith(prefix):
                continue
            if now - float(row.get("updated_at") or 0) > _TRACK_META_TTL_SEC:
                continue
            stored = _as_emb(row.get("face_emb"))
            wid = str(row.get("worker_id") or state.get("tracks", {}).get(key) or "").strip()
            if not wid or stored is None:
                continue
            sim = embedding_similarity(face_emb, stored)
            if sim < settings.patrol_face_reuse_min_similarity:
                continue
            face_candidates.append((wid, sim))

        if face_candidates:
            face_candidates.sort(key=lambda item: item[1], reverse=True)
            best_wid, best_sim = face_candidates[0]
            second_sim = face_candidates[1][1] if len(face_candidates) >= 2 else 0.0
            if best_sim - second_sim >= settings.patrol_face_reuse_min_margin:
                if not _conflicts_frame_faces(best_wid, face_emb, frame_face_assignments):
                    return best_wid

    bbox_candidates: list[tuple[str, float]] = []
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

        if face_emb is not None:
            holder_emb = _as_emb(row.get("face_emb"))
            if holder_emb is None:
                holder_emb = _identity_face_emb(state, camera_id, wid)
            if holder_emb is not None and not _face_compatible(face_emb, holder_emb, for_merge=True):
                continue

        score = iou * 2.0 + max(0.0, 1.0 - dist * 4.0)
        bbox_candidates.append((wid, score))

    if not bbox_candidates:
        return None

    bbox_candidates.sort(key=lambda item: item[1], reverse=True)
    best_wid = bbox_candidates[0][0]
    if face_emb is not None and _conflicts_frame_faces(best_wid, face_emb, frame_face_assignments):
        return None
    return best_wid


def _gallery_from_patrol_binding(worker_id: str) -> tuple[str, str] | None:
    """sgc/OBJ đã gán gallery → trả (gallery_id, worker_name)."""
    from .patrol_identity_store import lookup_gallery_worker, lookup_patrol_identity

    wid = (worker_id or "").strip()
    if not wid:
        return None
    gallery_id = lookup_gallery_worker(wid)
    if not gallery_id:
        return None
    row = lookup_patrol_identity(gallery_id) or {}
    name = str(row.get("worker_name") or gallery_id).strip()
    return gallery_id, name


def list_track_aliases_for_worker(worker_or_alias: str) -> list[str]:
    """Trả mọi track key / worker id liên quan trong registry."""
    from .patrol_identity_store import lookup_gallery_worker

    needle = (worker_or_alias or "").strip()
    if not needle:
        return []
    gallery = lookup_gallery_worker(needle) or needle
    out: set[str] = {needle, gallery}
    with _lock:
        state = _load()
        for key, wid in (state.get("tracks") or {}).items():
            w = str(wid or "").strip()
            if w in (needle, gallery) or w.upper() == needle.upper():
                out.add(w)
                if ":" in key:
                    out.add(key.split("|", 1)[-1])
    return sorted(out)


def bind_all_tracks_for_aliases(aliases: list[str], gallery_worker_id: str) -> int:
    """Gắn mọi track trong registry khớp alias → gallery worker."""
    wid = gallery_worker_id.strip()
    if not wid:
        return 0
    alias_set = {a.strip() for a in aliases if a and a.strip()}
    bound = 0
    with _lock:
        state = _load()
        for key, existing in list((state.get("tracks") or {}).items()):
            ex = str(existing or "").strip()
            if ex in alias_set or ex.upper() in {a.upper() for a in alias_set}:
                state["tracks"][key] = wid
                bound += 1
        _save(state)
    return bound


def bind_patrol_track_identity(
    camera_id: str,
    track_id: str,
    worker_id: str,
    *,
    person_bbox: list[float] | None = None,
    face_emb: list[float] | None = None,
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
            _remember_track_meta(state, key, wid, person_bbox, face_emb)
        _save(state)


def resolve_patrol_person_identity(
    detection: PpeDetection,
    camera_id: str,
    track_id: str,
    *,
    person_bbox: list[float] | None = None,
    face_emb: list[float] | None = None,
    frame_face_assignments: dict[str, list[float]] | None = None,
    frame_w: int = 640,
    frame_h: int = 480,
) -> tuple[str, str]:
    """Trả (worker_id, worker_name) — gallery verified hoặc sgc-0xxxxxxx."""
    from .worker_identity.verify import is_verified_face_match, worker_match_from_detection

    query_emb = _as_emb(face_emb)

    wid = (detection.worker_id or "").strip()
    wname = (detection.worker_name or "").strip()
    match = worker_match_from_detection(detection)
    if wid and wid != "unknown" and is_verified_face_match(match):
        key = _track_key(camera_id, track_id)
        with _lock:
            state = _load()
            state["tracks"][key] = wid
            if person_bbox and len(person_bbox) >= 4:
                _remember_track_meta(state, key, wid, person_bbox, face_emb)
            _save(state)
        return wid, wname or wid

    pb = person_bbox
    if pb is None and detection.subject_bbox and len(detection.subject_bbox) >= 4:
        pb = [float(v) for v in detection.subject_bbox]
    elif pb is None and detection.bbox and len(detection.bbox) >= 4:
        pb = [float(v) for v in detection.bbox]

    # Không có embedding mặt → chưa cấp sgc (tab Đối tượng / OBJ-only).
    if query_emb is None:
        key = _track_key(camera_id, track_id)
        with _lock:
            state = _load()
            if pb and len(pb) >= 4:
                _remember_track_meta(state, key, "", pb, None)
                _save(state)
        return "", ""

    key = _track_key(camera_id, track_id)
    with _lock:
        state = _load()
        existing = state["tracks"].get(key)
        if isinstance(existing, str) and existing.strip():
            existing = existing.strip()
            bound = _gallery_from_patrol_binding(existing)
            if bound:
                gallery_id, gallery_name = bound
                state["tracks"][key] = gallery_id
                if pb and len(pb) >= 4:
                    _remember_track_meta(state, key, gallery_id, pb, face_emb)
                _save(state)
                return gallery_id, gallery_name
            if not is_sgc_worker_id(existing):
                existing = ""
            else:
                holder_emb = _identity_face_emb(state, camera_id, existing)
                if holder_emb is not None and not _face_compatible(query_emb, holder_emb, for_merge=True):
                    existing = ""
            if existing and pb and len(pb) >= 4:
                _remember_track_meta(state, key, existing, pb, face_emb)
                _save(state)
                bound = _gallery_from_patrol_binding(existing)
                if bound:
                    return bound[0], bound[1]
                return existing, existing

        if pb and len(pb) >= 4:
            reused = _find_reusable_worker_id(
                state,
                camera_id,
                pb,
                frame_w=frame_w,
                frame_h=frame_h,
                face_emb=query_emb,
                frame_face_assignments=frame_face_assignments,
            )
            if reused:
                bound = _gallery_from_patrol_binding(reused)
                final_id = bound[0] if bound else reused
                final_name = bound[1] if bound else reused
                state["tracks"][key] = final_id
                _remember_track_meta(state, key, final_id, pb, face_emb)
                _save(state)
                return final_id, final_name

        seq = max(int(state.get("next_seq") or 1), 1)
        sgc = _format_sgc(seq)
        state["next_seq"] = seq + 1
        state["tracks"][key] = sgc
        if pb and len(pb) >= 4:
            _remember_track_meta(state, key, sgc, pb, face_emb)
        _save(state)
        return sgc, sgc
