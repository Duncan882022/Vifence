"""Ảnh crop mặt JPG cho hồ sơ bản nháp tk-* — từ bodycam / flycam tuần tra."""

from __future__ import annotations

import time
from pathlib import Path

import cv2
import numpy as np

from . import db

DRAFT_FACE_PREFIX = "draft-face"
DRAFT_FACE_ROOT = db.DATA_DIR / "draft_face_images"


def draft_face_relative_path(pers_id: str, ts: float) -> str:
    safe_id = pers_id.strip().replace("/", "_").replace("\\", "_")
    return f"{DRAFT_FACE_PREFIX}/{safe_id}/{int(ts * 1000)}.jpg"


def save_draft_face_crop(
    pers_id: str,
    image_bgr: np.ndarray,
    *,
    ts: float | None = None,
) -> str | None:
    """Ghi crop mặt JPG; trả đường dẫn tương đối dùng cho snapshot sign."""
    pid = pers_id.strip()
    if not pid or image_bgr is None or not isinstance(image_bgr, np.ndarray):
        return None
    if image_bgr.size == 0:
        return None

    stamp = ts if ts is not None else time.time()
    rel = draft_face_relative_path(pid, stamp)
    safe_id = pid.replace("/", "_").replace("\\", "_")
    folder = DRAFT_FACE_ROOT / safe_id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{int(stamp * 1000)}.jpg"

    h, w = image_bgr.shape[:2]
    max_side = 512
    out = image_bgr
    if max(h, w) > max_side:
        scale = max_side / float(max(h, w))
        out = cv2.resize(
            image_bgr,
            (max(8, int(w * scale)), max(8, int(h * scale))),
            interpolation=cv2.INTER_AREA,
        )

    ok = cv2.imwrite(str(path), out, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    return rel if ok else None


def resolve_draft_face_path(relative: str) -> Path | None:
    """Đường dẫn tuyệt đối — chặn path traversal."""
    rel = (relative or "").strip().lstrip("/")
    prefix = f"{DRAFT_FACE_PREFIX}/"
    if not rel.startswith(prefix) or ".." in rel:
        return None
    sub = rel[len(prefix) :]
    if not sub:
        return None
    full = (DRAFT_FACE_ROOT / sub).resolve()
    try:
        full.relative_to(DRAFT_FACE_ROOT.resolve())
    except ValueError:
        return None
    return full if full.is_file() else None
