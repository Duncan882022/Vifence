"""Nhận diện công nhân trong bbox người — YuNet + gallery histogram."""

from __future__ import annotations

import logging
from typing import Optional

import cv2
import numpy as np

from ..config import settings
from ..detectors.face_guard import detect_faces
from .demo_roster import demo_match_from_track
from ..unknown_detection import UNKNOWN_LABEL
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


def _best_face_in_crop(crop: np.ndarray) -> np.ndarray | None:
    ok, faces = detect_faces(crop, score_threshold=0.45)
    if not ok or faces is None or len(faces) == 0:
        return None
    best = None
    best_area = 0.0
    for face in faces:
        x, y, fw, fh = face[:4]
        area = float(fw * fh)
        if area > best_area:
            best_area = area
            x1, y1 = max(0, int(x)), max(0, int(y))
            x2 = min(crop.shape[1], int(x + fw))
            y2 = min(crop.shape[0], int(y + fh))
            best = crop[y1:y2, x1:x2]
    return best


def _match_face(frame: np.ndarray, person_bbox: list[float]) -> WorkerMatch | None:
    crop = _crop_person(frame, person_bbox)
    if crop is None:
        return None
    face = _best_face_in_crop(crop)
    if face is None or face.size == 0:
        return None
    query = _face_embedding(face)
    matched = match_embedding(query, min_confidence=settings.worker_match_min_confidence)
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
    """Luôn chạy detect mặt trong bbox người — khớp gallery hoặc Unknown."""
    if not person_bbox or len(person_bbox) < 4:
        return unknown_worker_match("no_person_bbox")

    cache_key = f"{camera_id}:{track_id or person_bbox[0]}"
    cached = _track_cache.get(cache_key)
    if cached is not None and cached.worker_id != "unknown":
        return cached

    match: WorkerMatch | None = None
    if settings.worker_recognition_enabled:
        _ensure_gallery()
        match = _match_face(frame, person_bbox)
        if match is None and settings.worker_demo_fallback_enabled and track_id:
            match = demo_match_from_track(camera_id, track_id)

    if match is None:
        crop = _crop_person(frame, person_bbox)
        face_crop = _best_face_in_crop(crop) if crop is not None else None
        source = "face_unmatched" if face_crop is not None else "face_not_found"
        match = unknown_worker_match(source)
    else:
        logger.info(
            "[worker_identity] %s → %s (%s) conf=%.2f src=%s",
            track_id or "person",
            match.worker_name,
            match.employee_code,
            match.confidence,
            match.match_source,
        )

    if match.worker_id != "unknown":
        _track_cache[cache_key] = match
    return match
