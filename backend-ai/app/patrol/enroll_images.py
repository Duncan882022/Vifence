"""Ảnh selfie phiên quét mặt — JPG chỉ slot chính diện; vector lưu SQLite."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from ..worker_identity.gallery import ENROLLMENT_POSE_COUNT, enroll_face, face_filename, gallery_dir

logger = logging.getLogger("patrol.enroll_images")

_DATA = Path(__file__).resolve().parent.parent.parent / "data"
SESSION_IMAGES_ROOT = _DATA / "enroll_session_images"


def session_images_dir(session_id: str) -> Path:
    safe = session_id.strip()
    return SESSION_IMAGES_ROOT / safe


def save_enroll_session_face_image(
    session_id: str,
    pose_slot: int,
    image_bgr: np.ndarray,
) -> Path | None:
    """Chỉ lưu JPG phiên cho slot 1 (chính diện) — các góc khác chỉ vector."""
    slot = int(pose_slot)
    if slot != 1:
        return None
    if slot < 1 or slot > ENROLLMENT_POSE_COUNT:
        return None
    root = session_images_dir(session_id)
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{slot}.jpg"
    ok = cv2.imwrite(str(path), image_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not ok:
        return None
    return path


def list_enroll_session_face_images(session_id: str) -> list[tuple[int, Path]]:
    root = session_images_dir(session_id)
    if not root.is_dir():
        return []
    out: list[tuple[int, Path]] = []
    path = root / "1.jpg"
    if path.is_file():
        out.append((1, path))
    return out


def clear_enroll_session_images(session_id: str) -> None:
    root = session_images_dir(session_id)
    if root.is_dir():
        shutil.rmtree(root, ignore_errors=True)


def promote_enroll_session_front_jpg(
    session_id: str,
    *,
    gallery_worker_id: str,
    worker_name: str,
    employee_code: str,
    contractor_name: str | None = None,
    images: list[tuple[int, Path]] | None = None,
) -> dict[str, Any]:
    """Ghi JPG chính diện vào worker_gallery — vector đã gắn qua SQLite."""
    from ..worker_identity.recognizer import reload_gallery

    wid = gallery_worker_id.strip()
    imgs = images if images is not None else list_enroll_session_face_images(session_id)
    enrolled = 0
    for slot, path in imgs:
        if slot != 1:
            continue
        frame = cv2.imread(str(path))
        if frame is None or not isinstance(frame, np.ndarray):
            continue
        enroll_face(
            wid,
            worker_name.strip(),
            employee_code.strip(),
            frame,
            contractor_name=contractor_name,
            pose_slot=1,
        )
        enrolled += 1
    clear_enroll_session_images(session_id)
    if enrolled:
        reload_gallery()
    logger.info(
        "[enroll_images] promote session=%s gallery=%s front_jpg=%d",
        session_id[:8],
        wid,
        enrolled,
    )
    return {"gallery_worker_id": wid, "poses_enrolled": enrolled}


def promote_enroll_session_to_gallery(
    session_id: str,
    *,
    gallery_worker_id: str,
    worker_name: str,
    employee_code: str,
    contractor_name: str | None = None,
) -> dict[str, Any]:
    """Alias — chỉ promote JPG chính diện."""
    return promote_enroll_session_front_jpg(
        session_id,
        gallery_worker_id=gallery_worker_id,
        worker_name=worker_name,
        employee_code=employee_code,
        contractor_name=contractor_name,
    )


def enroll_person_scan_image(
    gallery_worker_id: str,
    *,
    worker_name: str,
    employee_code: str,
    image_bgr: np.ndarray,
    contractor_name: str | None = None,
    pose_slot: int,
) -> bool:
    """Quét bổ sung — chỉ slot 1 ghi gallery JPG."""
    if int(pose_slot) != 1:
        return False
    from ..worker_identity.recognizer import reload_gallery

    enroll_face(
        gallery_worker_id.strip(),
        worker_name.strip(),
        employee_code.strip(),
        image_bgr,
        contractor_name=contractor_name,
        pose_slot=1,
    )
    reload_gallery()
    return True


def remove_gallery_worker_faces(gallery_worker_id: str) -> int:
    """Xóa JPG gallery của một worker (chỉ file chính diện + legacy pose files)."""
    wid = gallery_worker_id.strip()
    if not wid:
        return 0
    faces_dir = gallery_dir() / "faces"
    removed = 0
    for slot in range(1, ENROLLMENT_POSE_COUNT + 1):
        path = faces_dir / face_filename(wid, slot)
        if path.is_file():
            path.unlink()
            removed += 1
    return removed
