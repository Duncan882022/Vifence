"""Gallery công nhân — ảnh khuôn mặt + embedding histogram (OpenCV)."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from .models import WorkerProfile

logger = logging.getLogger("worker_identity.gallery")

_BASE = Path(__file__).resolve().parent.parent.parent / "data" / "worker_gallery"
_REGISTRY: list[tuple[WorkerProfile, np.ndarray]] = []
ENROLLMENT_POSE_COUNT = 3
POSE_LABELS = ("Chính diện", "Nghiêng trái", "Nghiêng phải")


def gallery_dir() -> Path:
    return _BASE


def user_id_to_worker_id(user_id: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]", "", user_id.strip())[:40]
    return f"u-{safe}" if safe else "u-unknown"


def cccd_to_worker_id(cccd: str) -> str:
    digits = re.sub(r"\D", "", cccd.strip())
    if len(digits) < 9:
        raise ValueError("cccd_invalid")
    return f"c-{digits[:20]}"


def resolve_worker_id(*, user_id: Optional[str] = None, cccd: Optional[str] = None) -> str:
    if cccd and cccd.strip():
        return cccd_to_worker_id(cccd)
    if user_id and user_id.strip():
        return user_id_to_worker_id(user_id)
    raise ValueError("missing_identity")


def face_filename(worker_id: str, pose_slot: int) -> str:
    if pose_slot <= 1:
        return f"{worker_id}.jpg"
    return f"{worker_id}-{pose_slot}.jpg"


def _face_paths_for_row(row: dict) -> list[str]:
    paths: list[str] = []
    if row.get("face_images"):
        paths.extend(str(p) for p in row["face_images"])
    elif row.get("face_image"):
        paths.append(str(row["face_image"]))
    worker_id = str(row.get("worker_id", ""))
    if worker_id:
        for slot in range(1, ENROLLMENT_POSE_COUNT + 1):
            paths.append(face_filename(worker_id, slot))
    deduped: list[str] = []
    for name in paths:
        if name not in deduped:
            deduped.append(name)
    return deduped


def _histogram_embedding(face_bgr: np.ndarray) -> np.ndarray:
    """Dự phòng khi thiếu SFace — chỉ mô tả độ sáng, không phân biệt được người."""
    gray = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)
    hist = cv2.calcHist([resized], [0], None, [32], [0, 256])
    cv2.normalize(hist, hist)
    return hist.flatten()


def _face_embedding(face_bgr: np.ndarray) -> np.ndarray:
    from .face_embedder import embed_face_image

    deep = embed_face_image(face_bgr)
    if deep is not None:
        return deep
    return _histogram_embedding(face_bgr)


def _similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom <= 1e-9:
        return 0.0
    return float(np.dot(a, b) / denom)


def embedding_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine mặt — 0.0 khi hai vector khác không gian (histogram cũ vs SFace)."""
    if a is None or b is None or len(a) != len(b):
        return 0.0
    return _similarity(a, b)


def face_histogram_embedding(face_bgr: np.ndarray) -> np.ndarray:
    return _face_embedding(face_bgr)


def load_gallery(base_dir: Optional[Path] = None) -> int:
    global _REGISTRY  # noqa: PLW0603
    root = base_dir or _BASE
    registry_path = root / "workers.json"
    faces_dir = root / "faces"
    loaded: list[tuple[WorkerProfile, np.ndarray]] = []

    if not registry_path.exists():
        logger.warning("[worker_identity] Không tìm thấy %s", registry_path)
        _REGISTRY = []
        return 0

    rows = json.loads(registry_path.read_text(encoding="utf-8"))
    for row in rows:
        profile = WorkerProfile(
            worker_id=str(row["worker_id"]),
            worker_name=str(row["worker_name"]),
            employee_code=str(row["employee_code"]),
            contractor_name=row.get("contractor_name"),
        )
        for image_name in _face_paths_for_row(row):
            image_path = faces_dir / image_name
            if not image_path.exists():
                continue
            img = cv2.imread(str(image_path))
            if img is None:
                continue
            loaded.append((profile, _face_embedding(img)))

    _REGISTRY = loaded
    logger.info("[worker_identity] Gallery: %d/%d công nhân có embedding.", len(loaded), len(rows))
    return len(loaded)


def match_embedding(
    query: np.ndarray,
    *,
    min_confidence: float,
    min_margin: float = 0.0,
) -> tuple[WorkerProfile, float] | None:
    if not _REGISTRY:
        return None
    ranked: list[tuple[WorkerProfile, float]] = []
    for profile, emb in _REGISTRY:
        if len(emb) != len(query):
            continue
        ranked.append((profile, _similarity(query, emb)))
    ranked.sort(key=lambda item: item[1], reverse=True)
    if not ranked or ranked[0][1] < min_confidence:
        return None
    # Margin so với người KHÁC — nhiều pose cùng worker không được coi là đối thủ.
    best_profile = ranked[0][0]
    rival = next(
        (score for profile, score in ranked[1:] if profile.worker_id != best_profile.worker_id),
        None,
    )
    if rival is not None and min_margin > 0.0 and ranked[0][1] - rival < min_margin:
        return None
    return ranked[0]


def list_profiles() -> list[WorkerProfile]:
    return [profile for profile, _ in _REGISTRY]


def registry_rows() -> list[dict]:
    registry_path = _BASE / "workers.json"
    if not registry_path.exists():
        return []
    return json.loads(registry_path.read_text(encoding="utf-8"))


def _write_registry(rows: list[dict]) -> None:
    root = gallery_dir()
    root.mkdir(parents=True, exist_ok=True)
    registry_path = root / "workers.json"
    registry_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def get_enrollment_status(worker_id: str) -> dict:
    rows = registry_rows()
    row = next((r for r in rows if str(r.get("worker_id")) == worker_id), None)
    faces_dir = gallery_dir() / "faces"
    poses: list[dict] = []
    captured = 0
    for slot in range(1, ENROLLMENT_POSE_COUNT + 1):
        filename = face_filename(worker_id, slot)
        exists = (faces_dir / filename).exists()
        if exists:
            captured += 1
        poses.append({
            "slot": slot,
            "label": POSE_LABELS[slot - 1],
            "captured": exists,
            "filename": filename,
        })
    return {
        "worker_id": worker_id,
        "worker_name": row.get("worker_name") if row else None,
        "employee_code": row.get("employee_code") if row else None,
        "contractor_name": row.get("contractor_name") if row else None,
        "poses_required": ENROLLMENT_POSE_COUNT,
        "poses_captured": captured,
        "complete": captured >= ENROLLMENT_POSE_COUNT,
        "poses": poses,
    }


def enroll_face(
    worker_id: str,
    worker_name: str,
    employee_code: str,
    image_bgr: np.ndarray,
    *,
    contractor_name: Optional[str] = None,
    pose_slot: int = 1,
    cccd: Optional[str] = None,
) -> dict:
    if pose_slot < 1 or pose_slot > ENROLLMENT_POSE_COUNT:
        raise ValueError(f"pose_slot phải từ 1 đến {ENROLLMENT_POSE_COUNT}")

    root = gallery_dir()
    faces_dir = root / "faces"
    faces_dir.mkdir(parents=True, exist_ok=True)

    filename = face_filename(worker_id, pose_slot)
    image_path = faces_dir / filename
    ok = cv2.imwrite(str(image_path), image_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not ok:
        raise RuntimeError("Không ghi được ảnh khuôn mặt")

    rows = registry_rows()
    row = next((r for r in rows if str(r.get("worker_id")) == worker_id), None)
    if row is None:
        row = {
            "worker_id": worker_id,
            "worker_name": worker_name,
            "employee_code": employee_code,
            "contractor_name": contractor_name,
            "face_images": [],
        }
        rows.append(row)
    else:
        row["worker_name"] = worker_name
        row["employee_code"] = employee_code
        if contractor_name is not None:
            row["contractor_name"] = contractor_name

    if cccd:
        row["cccd"] = re.sub(r"\D", "", cccd.strip())[:20]

    images = [face_filename(worker_id, slot) for slot in range(1, ENROLLMENT_POSE_COUNT + 1)]
    row["face_images"] = images
    row["face_image"] = images[0]
    _write_registry(rows)
    load_gallery()
    logger.info("[worker_identity] Enroll %s pose=%d → %s", worker_id, pose_slot, filename)
    return get_enrollment_status(worker_id)


def remove_gallery_worker_registry(worker_id: str) -> bool:
    """Xóa một worker khỏi workers.json (không xóa file JPG — dùng enroll_images)."""
    global _REGISTRY  # noqa: PLW0603
    wid = worker_id.strip()
    rows = registry_rows()
    kept = [r for r in rows if str(r.get("worker_id")) != wid]
    if len(kept) == len(rows):
        return False
    _write_registry(kept)
    _REGISTRY = []
    load_gallery()
    return True


def clear_gallery_storage() -> dict[str, int]:
    """Xóa toàn bộ workers.json + ảnh faces/ và làm trống registry RAM."""
    global _REGISTRY  # noqa: PLW0603
    root = gallery_dir()
    faces_dir = root / "faces"
    removed_faces = 0
    if faces_dir.is_dir():
        for path in faces_dir.iterdir():
            if path.is_file():
                path.unlink()
                removed_faces += 1
    prev_count = len(registry_rows())
    _write_registry([])
    _REGISTRY = []
    logger.info(
        "[worker_identity] Gallery cleared: %d workers, %d face files removed.",
        prev_count,
        removed_faces,
    )
    return {"workers_cleared": prev_count, "face_files_removed": removed_faces}
