"""Nhận diện công nhân trong bbox người — YuNet + gallery histogram."""

from __future__ import annotations

import logging
from typing import Optional

import cv2
import numpy as np

from ..config import settings
from ..detectors.face_guard import detect_faces
from ..unknown_detection import UNKNOWN_LABEL
from . import face_thresholds
from .face_embedder import embed_aligned_face
from .gallery import _face_embedding, gallery_dir, load_gallery, match_embedding, registry_rows
from .models import WorkerMatch

logger = logging.getLogger("worker_identity.recognizer")

_track_cache: dict[str, WorkerMatch] = {}
_gallery_loaded = False


def _ensure_gallery() -> None:
    global _gallery_loaded  # noqa: PLW0603
    if _gallery_loaded:
        return
    custom = settings.worker_gallery_dir.strip()
    base = gallery_dir() if not custom else gallery_dir().parent.parent / custom
    load_gallery(base if custom else None)
    _gallery_loaded = True


def reload_gallery() -> dict:
    global _gallery_loaded, _track_cache  # noqa: PLW0603
    _track_cache.clear()
    _gallery_loaded = False
    _ensure_gallery()
    rows = registry_rows()
    return {
        "workers_registered": len(rows),
        "workers_with_embeddings": len([r for r in rows if r.get("face_image")]),
        "gallery_dir": str(gallery_dir()),
    }


def gallery_status() -> dict:
    _ensure_gallery()
    rows = registry_rows()
    faces_dir = gallery_dir() / "faces"
    with_faces = sum(1 for r in rows if (faces_dir / str(r.get("face_image", ""))).exists())
    return {
        "enabled": settings.worker_recognition_enabled,
        "demo_fallback": settings.worker_demo_fallback_enabled,
        "workers_registered": len(rows),
        "workers_with_face_images": with_faces,
        "embeddings_loaded": len([r for r in rows if r.get("face_image")]),
        "track_cache_size": len(_track_cache),
        "min_match_confidence": settings.worker_match_min_confidence,
        "min_match_margin": settings.worker_match_min_margin,
    }


def _crop_person(frame: np.ndarray, person_bbox: list[float]) -> np.ndarray | None:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in person_bbox]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return frame[y1:y2, x1:x2].copy()


def unknown_worker_match(match_source: str = "unknown") -> WorkerMatch:
    """Không nhận diện được gallery — UI hiển thị Unknown."""
    return WorkerMatch(
        worker_id="unknown",
        worker_name=UNKNOWN_LABEL,
        employee_code="",
        contractor_name=None,
        confidence=0.0,
        match_source=match_source,
    )


def _best_face_in_crop(
    crop: np.ndarray,
    *,
    score_threshold: float = 0.65,
    selfie_mode: bool = False,
) -> np.ndarray | None:
    crop_h, crop_w = crop.shape[:2]
    if selfie_mode or crop_h < 300:
        search = crop
        max_cy_frac = 0.92
    else:
        head_h = max(int(crop_h * 0.42), 48)
        search = crop[:head_h, :]
        max_cy_frac = 0.58
    ok, faces = detect_faces(search, score_threshold=score_threshold)
    if not ok or faces is None or len(faces) == 0:
        return None
    best = None
    best_score = 0.0
    search_h = search.shape[0]
    min_face_h = max(12.0, search_h * 0.06)
    for face in faces:
        x, y, fw, fh = face[:4]
        score = float(face[14]) if len(face) > 14 else float(face[4] if len(face) > 4 else 0.0)
        if score < score_threshold:
            continue
        if fh < min_face_h:
            continue
        aspect = fw / max(fh, 1.0)
        if aspect < 0.45 or aspect > 2.05:
            continue
        face_cy = y + fh / 2.0
        if face_cy > search_h * max_cy_frac:
            continue
        area = float(fw * fh)
        rank = area + score * 40.0
        if rank > best_score:
            best_score = rank
            x1, y1 = max(0, int(x)), max(0, int(y))
            x2 = min(crop_w, int(x + fw))
            y2 = min(crop_h, int(y + fh))
            if x2 - x1 >= 8 and y2 - y1 >= 8:
                best = crop[y1:y2, x1:x2]
    return best


def patrol_face_bbox_in_frame(
    frame: np.ndarray,
    person_bbox: list[float],
    *,
    score_threshold: float = 0.65,
) -> tuple[float, float, float, float] | None:
    """Khung mặt trong toạ độ frame — phục vụ snapshot PERS-001."""
    if not person_bbox or len(person_bbox) < 4:
        return None
    px1, py1, px2, py2 = (float(v) for v in person_bbox[:4])
    crop = _crop_person(frame, person_bbox)
    if crop is None:
        return None
    crop_h, crop_w = crop.shape[:2]
    selfie = crop_h >= max(frame.shape[0] * 0.38, 200) or crop_w >= max(frame.shape[1] * 0.38, 200)
    if selfie or crop_h < 300:
        search = crop
        max_cy_frac = 0.92
    else:
        head_h = max(int(crop_h * 0.42), 48)
        search = crop[:head_h, :]
        max_cy_frac = 0.62

    ok, faces = detect_faces(search, score_threshold=score_threshold)
    if not ok or faces is None or len(faces) == 0:
        return None

    best: tuple[float, float, float, float] | None = None
    best_score = 0.0
    search_h = search.shape[0]
    min_face_h = max(12.0, search_h * 0.06)
    for face in faces:
        x, y, fw, fh = face[:4]
        score = float(face[14]) if len(face) > 14 else float(face[4] if len(face) > 4 else 0.0)
        if score < score_threshold or fh < min_face_h:
            continue
        aspect = fw / max(fh, 1.0)
        if aspect < 0.45 or aspect > 2.05:
            continue
        face_cy = y + fh / 2.0
        if face_cy > search_h * max_cy_frac:
            continue
        if score <= best_score:
            continue
        x1, y1 = max(0, int(x)), max(0, int(y))
        x2 = min(crop_w, int(x + fw))
        y2 = min(crop_h, int(y + fh))
        if x2 - x1 < 8 or y2 - y1 < 8:
            continue
        best_score = score
        best = (
            px1 + x1,
            py1 + y1,
            px1 + x2,
            py1 + y2,
        )
    return best


def _patrol_face_detect_min(camera_id: str = "") -> float:
    if camera_id.startswith("HC-"):
        return settings.patrol_face_detect_min_score_bodycam
    return settings.patrol_face_detect_min_score


def assess_patrol_face(
    frame: np.ndarray,
    person_bbox: list[float] | None,
    *,
    camera_id: str = "",
) -> tuple[np.ndarray | None, float, bool]:
    """Trả (embedding, score, eligible) — chỉ eligible mới cấp sgc / tab Người."""
    if not person_bbox or len(person_bbox) < 4:
        return None, 0.0, False
    crop = _crop_person(frame, person_bbox)
    if crop is None:
        return None, 0.0, False
    return _assess_patrol_face_crop(crop, camera_id=camera_id)


def _assess_patrol_face_crop(
    crop: np.ndarray,
    *,
    camera_id: str = "",
    selfie_mode: bool | None = None,
) -> tuple[np.ndarray | None, float, bool]:
    crop_h, crop_w = crop.shape[:2]
    detect_min = _patrol_face_detect_min(camera_id)
    if selfie_mode is None:
        # Bodycam cận cảnh — mặt trải trên phần lớn crop, không chỉ 42% đầu.
        selfie_mode = camera_id.startswith("HC-") and crop_h >= 160
    if selfie_mode:
        search = crop
        max_cy_frac = 0.88
    else:
        head_h = max(int(crop_h * 0.42), 48)
        search = crop[:head_h, :]
        max_cy_frac = 0.72 if crop_h < 200 else 0.62

    # Lấy candidate rộng hơn ngưỡng cuối — lọc lại trong vòng lặp.
    detect_pass = min(detect_min, 0.52)
    ok, faces = detect_faces(search, score_threshold=detect_pass)
    if not ok or faces is None or len(faces) == 0:
        return None, 0.0, False

    best_row = None
    best_face: np.ndarray | None = None
    best_det_score = 0.0
    search_h = search.shape[0]
    min_face_h = max(16.0, search_h * 0.08)
    for face in faces:
        x, y, fw, fh = face[:4]
        score = float(face[14]) if len(face) > 14 else float(face[4] if len(face) > 4 else 0.0)
        if score < detect_min:
            continue
        if fh < min_face_h:
            continue
        aspect = fw / max(fh, 1.0)
        if aspect < 0.55 or aspect > 1.85:
            continue
        face_cy = y + fh / 2.0
        if face_cy > search_h * max_cy_frac:
            continue
        if score > best_det_score:
            x1, y1 = max(0, int(x)), max(0, int(y))
            x2 = min(crop_w, int(x + fw))
            y2 = min(crop_h, int(y + fh))
            if x2 - x1 >= 8 and y2 - y1 >= 8:
                best_det_score = score
                best_row = face
                best_face = crop[y1:y2, x1:x2]

    if best_face is None:
        return None, best_det_score, False

    embedding = embed_aligned_face(search, best_row) if best_row is not None else None
    if embedding is None:
        embedding = _face_embedding(best_face)
    return embedding, best_det_score, True


def recover_patrol_face_embedding(
    frame: np.ndarray,
    person_bbox: list[float],
    *,
    camera_id: str = "",
) -> tuple[list[float], float] | None:
    """Thử lại trước khi ghi Đối tượng — dùng crop selfie khi analyze path fail."""
    vec, score, eligible = assess_patrol_face(frame, person_bbox, camera_id=camera_id)
    if eligible and vec is not None:
        return vec.tolist(), float(score)

    if not camera_id.startswith("HC-"):
        return None

    crop = _crop_person(frame, person_bbox)
    if crop is None:
        return None

    vec2, score2, eligible2 = _assess_patrol_face_crop(
        crop, camera_id=camera_id, selfie_mode=True,
    )
    if eligible2 and vec2 is not None:
        return vec2.tolist(), float(score2)
    return None


def _match_face_crop(face: np.ndarray, *, camera_id: str = "") -> WorkerMatch | None:
    if face is None or face.size == 0:
        return None
    query = _face_embedding(face)
    matched = match_embedding(
        query,
        min_confidence=face_thresholds.gallery_min_confidence(camera_id),
        min_margin=face_thresholds.gallery_min_margin(camera_id),
    )
    if matched is None:
        return None
    profile, score = matched
    return WorkerMatch(
        worker_id=profile.worker_id,
        worker_name=profile.worker_name,
        employee_code=profile.employee_code,
        contractor_name=profile.contractor_name,
        confidence=round(score, 3),
        match_source="face",
    )


def identify_person(
    frame: np.ndarray,
    person_bbox: list[float] | None,
    *,
    camera_id: str,
    track_id: Optional[str] = None,
) -> WorkerMatch:
    """Detect mặt trong bbox người — chỉ khớp gallery khi thấy mặt rõ; không gán tên demo/cache khi quay lưng."""
    if not person_bbox or len(person_bbox) < 4:
        return unknown_worker_match("no_person_bbox")

    cache_key = f"{camera_id}:{track_id or int(person_bbox[0])}"
    crop = _crop_person(frame, person_bbox)
    if crop is None:
        _track_cache.pop(cache_key, None)
        return unknown_worker_match("no_person_bbox")

    face = _best_face_in_crop(crop)
    if face is None:
        _track_cache.pop(cache_key, None)
        return unknown_worker_match("face_not_found")

    if not settings.worker_recognition_enabled:
        return unknown_worker_match("recognition_disabled")

    _ensure_gallery()
    match = _match_face_crop(face, camera_id=camera_id)
    if match is None:
        _track_cache.pop(cache_key, None)
        return unknown_worker_match("face_unmatched")

    logger.info(
        "[worker_identity] %s → %s (%s) conf=%.2f src=%s",
        track_id or "person",
        match.worker_name,
        match.employee_code,
        match.confidence,
        match.match_source,
    )
    _track_cache[cache_key] = match
    return match


def extract_person_face_embedding(
    frame: np.ndarray,
    person_bbox: list[float] | None,
) -> np.ndarray | None:
    """Embedding mặt trong bbox người — dùng dedup patrol (không cần khớp gallery)."""
    if not person_bbox or len(person_bbox) < 4:
        return None
    crop = _crop_person(frame, person_bbox)
    if crop is None:
        return None
    crop_h = crop.shape[0]
    face = _best_face_in_crop(crop)
    if face is None and crop_h < 420:
        face = _best_face_in_crop(crop, score_threshold=0.55, selfie_mode=True)
    if face is None:
        return None
    return _face_embedding(face)
