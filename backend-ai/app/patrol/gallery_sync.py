"""Đồng bộ hồ sơ SQLite (pers/iden) → gallery live + patrol_identity_bindings.

SQLite `person_faces` dùng cho thẻ sự kiện / day store. Overlay live và
`resolve_patrol_person_identity` vẫn đọc worker_gallery + bindings JSON — nếu
chỉ self-enroll SQLite mà không sync thì camera thấy mặt nhưng ROI vẫn hiện
sgc/anonymous, và tab Người không gắn được tên gallery.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from . import db, identity
from .sink import SNAPSHOT_DIR, resolve_snapshot_path

logger = logging.getLogger("patrol.gallery_sync")


def _latest_snapshot_path(pers_id: str) -> Path | None:
    """Ảnh patrol_snapshots mới nhất của pers — thường là `{date}/{pers_id}.jpg`."""
    pid = identity.resolve_alias(pers_id)
    if not SNAPSHOT_DIR.is_dir():
        return None

    candidates: list[tuple[float, Path]] = []
    for day_dir in SNAPSHOT_DIR.iterdir():
        if not day_dir.is_dir():
            continue
        direct = day_dir / f"{pid}.jpg"
        if direct.is_file():
            candidates.append((direct.stat().st_mtime, direct))
        resolved = resolve_snapshot_path(f"{day_dir.name}/{pid}.jpg")
        if resolved is not None and resolved.is_file():
            candidates.append((resolved.stat().st_mtime, resolved))

    if not candidates:
        row = db.query_one(
            "SELECT snapshot_path FROM daily_events WHERE pers_id = ?"
            " AND snapshot_path IS NOT NULL ORDER BY last_seen DESC LIMIT 1",
            (pid,),
        )
        if row and row.get("snapshot_path"):
            resolved = resolve_snapshot_path(str(row["snapshot_path"]))
            if resolved is not None and resolved.is_file():
                candidates.append((resolved.stat().st_mtime, resolved))

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def sync_person_to_gallery(pers_id: str) -> dict[str, Any]:
    """Gallery worker + binding từ hồ sơ đã định danh. Trả metadata sync."""
    from ..patrol_identity_store import bind_patrol_identity, patrol_gallery_worker_id
    from ..worker_identity.gallery import enroll_face
    from ..worker_identity.recognizer import reload_gallery

    pid = identity.resolve_alias(pers_id)
    person = identity.get_person(pid)
    if person is None:
        return {"ok": False, "error": "not_found", "pers_id": pid}

    if person.get("status") != identity.STATUS_IDENTIFIED:
        return {"ok": False, "error": "not_identified", "pers_id": pid}

    full_name = str(person.get("full_name") or "").strip()
    employee_code = str(person.get("employee_code") or "").strip()
    contractor = str(person.get("contractor") or "").strip()
    if not full_name or not employee_code:
        return {"ok": False, "error": "missing_profile_fields", "pers_id": pid}

    gallery_worker_id = patrol_gallery_worker_id(employee_code)
    aliases = sorted({
        pid,
        str(person.get("iden_code") or "").strip(),
        gallery_worker_id,
        employee_code,
    })
    aliases = [a for a in aliases if a]

    bind_patrol_identity(
        gallery_worker_id=gallery_worker_id,
        worker_name=full_name,
        employee_code=employee_code,
        contractor_name=contractor,
        alias_keys=aliases,
    )

    face_enrolled = False
    snapshot = _latest_snapshot_path(pid)
    if snapshot is not None:
        try:
            image_bgr = cv2.imread(str(snapshot))
            if image_bgr is not None and isinstance(image_bgr, np.ndarray):
                enroll_face(
                    gallery_worker_id,
                    full_name,
                    employee_code,
                    image_bgr,
                    contractor_name=contractor or None,
                    pose_slot=1,
                )
                face_enrolled = True
                reload_gallery()
        except Exception as exc:  # noqa: BLE001
            logger.warning("gallery_sync enroll failed pers=%s: %s", pid, exc)

    return {
        "ok": True,
        "pers_id": pid,
        "gallery_worker_id": gallery_worker_id,
        "face_enrolled": face_enrolled,
        "snapshot_used": str(snapshot) if snapshot else None,
    }


def sync_all_identified_to_gallery() -> dict[str, Any]:
    rows = db.query(
        "SELECT pers_id FROM persons WHERE status = ? AND employee_code IS NOT NULL",
        (identity.STATUS_IDENTIFIED,),
    )
    results: list[dict[str, Any]] = []
    synced = 0
    for row in rows:
        out = sync_person_to_gallery(str(row["pers_id"]))
        results.append(out)
        if out.get("ok"):
            synced += 1
    return {"ok": True, "total": len(rows), "synced": synced, "results": results}
