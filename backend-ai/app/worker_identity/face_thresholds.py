"""Ngưỡng similarity mặt — đổi theo model đang chạy (SFace vs histogram).

Cosine của SFace nằm ở thang khác histogram: cùng người ~0.4–0.7, khác người
thường < 0.3. Dùng lại ngưỡng histogram (0.7+) sẽ không bao giờ khớp, nên mọi
call site phải hỏi module này thay vì đọc thẳng settings.
"""

from __future__ import annotations

from ..config import settings
from .face_embedder import is_deep_face_model_ready


def _deep() -> bool:
    return is_deep_face_model_ready()


def gallery_min_confidence(camera_id: str = "") -> float:
    if _deep():
        base = settings.face_deep_gallery_min_confidence
        if camera_id.startswith("HC-"):
            return max(base, settings.face_deep_patrol_gallery_min_confidence)
        return base
    base = settings.worker_match_min_confidence
    if camera_id.startswith("HC-"):
        return max(base, settings.patrol_gallery_min_confidence)
    return base


def gallery_min_margin(camera_id: str = "") -> float:
    if _deep():
        base = settings.face_deep_gallery_min_margin
        if camera_id.startswith("HC-"):
            return max(base, settings.face_deep_patrol_gallery_min_margin)
        return base
    base = settings.worker_match_min_margin
    if camera_id.startswith("HC-"):
        return max(base, settings.patrol_gallery_min_margin)
    return base


def reuse_min_similarity() -> float:
    """Ngưỡng gộp — hai embedding coi là cùng một người."""
    if _deep():
        return settings.face_deep_reuse_min_similarity
    return settings.patrol_face_reuse_min_similarity


def reuse_min_margin() -> float:
    if _deep():
        return settings.face_deep_reuse_min_margin
    return settings.patrol_face_reuse_min_margin


def split_max_similarity() -> float:
    """Dưới ngưỡng này coi là hai người khác nhau — tách ID."""
    if _deep():
        return settings.face_deep_split_max_similarity
    return settings.patrol_face_split_max_similarity
