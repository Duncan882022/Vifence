"""HTTP API Module 05 — đọc/ghi thẳng SQLite.

Danh tính nay nằm ở server. Trình duyệt chỉ còn cache đọc: xoá localStorage
không mất gì, và hai máy khác nhau nhìn thấy cùng một danh sách.
"""

from __future__ import annotations

import base64
import time
from typing import Any

from fastapi import APIRouter

from . import daystore, db, identity

router = APIRouter(prefix="/patrol", tags=["patrol"])


def _person_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "pers_id": row["pers_id"],
        "status": row["status"],
        "iden_code": row.get("iden_code"),
        "display_name": identity.display_name(row),
        "full_name": row.get("full_name"),
        "employee_code": row.get("employee_code"),
        "contractor": row.get("contractor"),
        "origin": row.get("origin"),
        "first_seen": row.get("first_seen"),
        "last_seen": row.get("last_seen"),
        "identified_at": row.get("identified_at"),
    }


@router.get("/persons")
def list_persons(status: str | None = None) -> dict[str, Any]:
    """Danh sách Người (`status=person`) hoặc Định danh (`status=identified`)."""
    rows = identity.list_persons(status)
    return {"ok": True, "items": [_person_payload(r) for r in rows]}


@router.get("/persons/{pers_id}")
def get_person(pers_id: str) -> dict[str, Any]:
    row = identity.get_person(pers_id)
    if row is None:
        return {"ok": False, "error": "not_found"}
    return {"ok": True, "person": _person_payload(row)}


@router.get("/day/events")
def day_events(date: str | None = None) -> dict[str, Any]:
    """Thẻ Người + Định danh trong ngày — mỗi người đúng một thẻ."""
    rows = daystore.list_person_events(date)
    items = [
        {
            "event_date": r["event_date"],
            "pers_id": r["pers_id"],
            "status": r["status"],
            "iden_code": r.get("iden_code"),
            "display_name": identity.display_name(r),
            "full_name": r.get("full_name"),
            "employee_code": r.get("employee_code"),
            "contractor": r.get("contractor"),
            "first_seen": r["first_seen"],
            "last_seen": r["last_seen"],
            "snapshot_path": r.get("snapshot_path"),
        }
        for r in rows
    ]
    return {"ok": True, "date": date or db.today_vn(), "items": items}


@router.get("/day/objects")
def day_objects(date: str | None = None) -> dict[str, Any]:
    """Đối tượng trong ngày — chưa thấy mặt, hết ngày là xoá."""
    return {
        "ok": True,
        "date": date or db.today_vn(),
        "items": daystore.list_objects(date),
    }


@router.get("/day/appearances")
def day_appearances(subject_id: str, date: str | None = None) -> dict[str, Any]:
    sid = (subject_id or "").strip()
    if not sid:
        return {"ok": False, "error": "missing_subject_id"}
    result = daystore.list_appearances(sid, date)
    return {"ok": True, "subject_id": sid, "date": date or db.today_vn(), **result}


@router.post("/persons/{pers_id}/identify")
def identify_person(pers_id: str, payload: dict) -> dict[str, Any]:
    """Gán tên cho một Người → Định danh.

    Ảnh gửi kèm được nhúng thành vector và lưu vào `person_faces`, nên lần sau
    gặp lại là tự nhận — kể cả ngày hôm sau, kể cả mũ khác.
    """
    full_name = str(payload.get("full_name") or "").strip()
    employee_code = str(payload.get("employee_code") or "").strip()
    contractor = str(payload.get("contractor") or "").strip()
    identified_by = str(payload.get("identified_by") or "").strip()
    image_b64 = payload.get("image_b64")

    if not full_name or not employee_code:
        return {"ok": False, "error": "missing_fields"}
    if identity.get_person(pers_id) is None:
        return {"ok": False, "error": "not_found"}

    face_added = False
    if image_b64:
        emb = _embed_face_b64(str(image_b64))
        if emb is not None:
            identity.add_face(
                pers_id, emb, quality=1.0, source="manual", image_path=None
            )
            face_added = True

    row = identity.identify(
        pers_id,
        full_name=full_name,
        employee_code=employee_code,
        contractor=contractor,
        identified_by=identified_by,
    )
    return {"ok": True, "person": _person_payload(row), "face_added": face_added}


@router.post("/persons/merge")
def merge_persons(payload: dict) -> dict[str, Any]:
    """Gộp hai mã của cùng một người — mã bị bỏ vẫn tra ra được."""
    keep = str(payload.get("keep") or "").strip()
    drop = str(payload.get("drop") or "").strip()
    if not keep or not drop:
        return {"ok": False, "error": "missing_fields"}
    identity.merge_persons(keep, drop)
    row = identity.get_person(keep)
    return {"ok": True, "person": _person_payload(row) if row else None}


@router.delete("/day/reset")
def reset_patrol_db() -> dict[str, Any]:
    """Xoá sạch dữ liệu tuần tra. Bộ đếm giữ nguyên để mã không cấp lại."""
    counts = db.reset_all(keep_counters=True)
    return {"ok": True, **counts}


def _embed_face_b64(image_b64: str) -> list[float] | None:
    """Ảnh base64 → vector khuôn mặt. Không thấy mặt thì trả None."""
    import cv2
    import numpy as np

    try:
        raw = base64.b64decode(image_b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None
    if frame is None:
        return None

    from ..worker_identity.recognizer import assess_patrol_face

    h, w = frame.shape[:2]
    vec, _score, eligible = assess_patrol_face(frame, [0.0, 0.0, float(w), float(h)])
    if not eligible or vec is None:
        return None
    return vec.tolist()


def observe_person_face(
    embedding: list[float],
    *,
    camera_id: str,
    quality: float = 0.0,
    zone_id: str | None = None,
    snapshot_path: str | None = None,
    snapshot_score: float = 0.0,
    obj_id: str | None = None,
    now: float | None = None,
) -> str:
    """Luồng AI gọi khi bắt được khuôn mặt — trả `pers_id`.

    Đang là Đối tượng thì thăng luôn sang Người, kéo theo cả lịch sử xuất hiện
    đã tích luỹ từ lúc chưa nhận ra mặt.
    """
    ts = now or time.time()
    pers_id, _ = identity.observe_face(
        embedding, quality=quality, camera_id=camera_id, now=ts
    )
    if obj_id:
        daystore.promote_object(obj_id, pers_id, now=ts)
    daystore.touch_person_event(
        pers_id,
        camera_id=camera_id,
        zone_id=zone_id,
        snapshot_path=snapshot_path,
        snapshot_score=snapshot_score,
        now=ts,
    )
    return pers_id
