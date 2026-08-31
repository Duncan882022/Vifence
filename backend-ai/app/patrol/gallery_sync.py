"""Đồng bộ hồ sơ SQLite (pers/iden) → patrol_identity_bindings + gallery live.

Ảnh khuôn mặt trong worker_gallery chỉ đến từ phiên quét selfie
(`enroll_images.promote_enroll_session_to_gallery` / quét thêm góc) — không
copy snapshot bodycam tuần tra làm avatar.
"""

from __future__ import annotations

import logging
from typing import Any

from . import db, identity

logger = logging.getLogger("patrol.gallery_sync")


def sync_person_to_gallery(pers_id: str) -> dict[str, Any]:
    """Bind gallery worker + alias từ hồ sơ đã định danh."""
    from ..patrol_identity_store import bind_patrol_identity, patrol_gallery_worker_id
    from ..worker_identity.gallery import get_enrollment_status
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

    enrollment = get_enrollment_status(gallery_worker_id)
    if int(enrollment.get("poses_captured") or 0) > 0:
        reload_gallery()

    return {
        "ok": True,
        "pers_id": pid,
        "gallery_worker_id": gallery_worker_id,
        "face_enrolled": bool(enrollment.get("poses_captured")),
        "poses_captured": enrollment.get("poses_captured", 0),
        "gallery_complete": enrollment.get("complete", False),
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
