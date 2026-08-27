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


def _person_payload(row: dict[str, Any], *, with_face_stats: bool = False) -> dict[str, Any]:
    payload = {
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
    if with_face_stats:
        count = identity.face_count(str(row["pers_id"]))
        payload["face_count"] = count
        payload["face_enrollment_complete"] = count >= identity.SCAN_FACES_REQUIRED
    return payload


@router.get("/persons")
def list_persons(status: str | None = None) -> dict[str, Any]:
    """Danh sách Người (`status=person`) hoặc Định danh (`status=identified`)."""
    rows = identity.list_persons(status)
    return {
        "ok": True,
        "items": [_person_payload(r, with_face_stats=True) for r in rows],
    }


@router.get("/persons/lookup")
def lookup_person(employee_code: str) -> dict[str, Any]:
    """Tra cứu hồ sơ theo mã nhân viên — dùng trước khi quét mặt."""
    code = (employee_code or "").strip()
    if not code:
        return {"ok": False, "error": "missing_employee_code"}
    row = identity.find_by_employee_code(code)
    if row is None:
        return {"ok": False, "error": "not_found"}
    return {"ok": True, "person": _person_payload(row)}


@router.get("/persons/{pers_id}")
def get_person(pers_id: str) -> dict[str, Any]:
    row = identity.get_person(pers_id)
    if row is None:
        return {"ok": False, "error": "not_found"}
    return {"ok": True, "person": _person_payload(row, with_face_stats=True)}


@router.patch("/persons/{pers_id}")
def update_person(pers_id: str, payload: dict) -> dict[str, Any]:
    """Sửa họ tên, mã NV, đơn vị — giữ nguyên vector mặt."""
    full_name = str(payload.get("full_name") or payload.get("ho_ten") or "").strip()
    employee_code = str(payload.get("employee_code") or payload.get("ma_nv") or "").strip()
    contractor = str(payload.get("contractor") or payload.get("don_vi") or "").strip()
    if not full_name or not employee_code:
        return {"ok": False, "error": "missing_fields"}
    if identity.get_person(pers_id) is None:
        return {"ok": False, "error": "not_found"}
    try:
        row = identity.update_profile(
            pers_id,
            full_name=full_name,
            employee_code=employee_code,
            contractor=contractor,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "duplicate_employee_code":
            return {"ok": False, "error": "duplicate_employee_code"}
        return {"ok": False, "error": code}
    except KeyError:
        return {"ok": False, "error": "not_found"}
    return {"ok": True, "person": _person_payload(row, with_face_stats=True)}


@router.delete("/persons/{pers_id}")
def delete_person(pers_id: str) -> dict[str, Any]:
    """Xóa hồ sơ công nhân và vector mặt."""
    if not identity.delete_person(pers_id):
        return {"ok": False, "error": "not_found"}
    return {"ok": True}


@router.get("/persons/{pers_id}/enrollment")
def person_enrollment(pers_id: str) -> dict[str, Any]:
    row = identity.get_person(pers_id)
    if row is None:
        return {"ok": False, "error": "not_found"}
    return {"ok": True, "enrollment": identity.get_scan_enrollment(pers_id)}


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


@router.get("/day/stats")
def day_stats(date: str | None = None) -> dict[str, Any]:
    """KPI đếm chuẩn — Người · Lượt gặp · Quan sát chưa gán."""
    return {"ok": True, **daystore.day_stats(date)}


@router.get("/day/presences")
def day_presences(date: str | None = None) -> dict[str, Any]:
    """Mọi lượt gặp qualified — heatmap GPS."""
    d = date or db.today_vn()
    items = daystore.list_day_presences(d)
    return {"ok": True, "date": d, "items": items}


@router.get("/day/appearances")
def day_appearances(subject_id: str, date: str | None = None) -> dict[str, Any]:
    sid = (subject_id or "").strip()
    if not sid:
        return {"ok": False, "error": "missing_subject_id"}
    result = daystore.list_appearances(sid, date)
    return {"ok": True, "subject_id": sid, "date": date or db.today_vn(), **result}


@router.post("/persons/import")
def import_persons(payload: dict) -> dict[str, Any]:
    """Nhập hàng loạt từ Excel — upsert theo `employee_code`."""
    items = payload.get("items") or []
    if not isinstance(items, list):
        return {"ok": False, "error": "invalid_items"}

    results: list[dict[str, Any]] = []
    success = 0
    for raw in items:
        full_name = str(raw.get("full_name") or raw.get("ho_ten") or "").strip()
        employee_code = str(raw.get("employee_code") or raw.get("ma_nv") or "").strip()
        contractor = str(raw.get("contractor") or raw.get("don_vi") or "").strip()
        image_b64 = raw.get("image_b64")

        if not full_name or not employee_code:
            results.append({
                "ok": False,
                "employee_code": employee_code or None,
                "error": "missing_fields",
            })
            continue

        embedding = None
        if image_b64:
            embedding = _embed_face_b64(str(image_b64))

        try:
            row = identity.import_identity(
                full_name=full_name,
                employee_code=employee_code,
                contractor=contractor,
                embedding=embedding,
                source="excel",
            )
            results.append({
                "ok": True,
                "employee_code": employee_code,
                "pers_id": row["pers_id"],
                "face_added": embedding is not None,
            })
            success += 1
        except Exception as exc:  # noqa: BLE001
            results.append({
                "ok": False,
                "employee_code": employee_code,
                "error": str(exc),
            })

    return {
        "ok": True,
        "total": len(items),
        "success": success,
        "failed": len(items) - success,
        "results": results,
    }


@router.post("/enroll/session")
def create_enroll_session() -> dict[str, Any]:
    """Bắt đầu phiên quét tự phục vụ — công nhân quét trước, nhập hồ sơ sau."""
    session_id = identity.create_enroll_session()
    enrollment = identity.get_enroll_session_enrollment(session_id)
    return {"ok": True, "session_id": session_id, "enrollment": enrollment}


@router.get("/enroll/{session_id}")
def enroll_session_status(session_id: str) -> dict[str, Any]:
    enrollment = identity.get_enroll_session_enrollment(session_id)
    if enrollment is None:
        return {"ok": False, "error": "session_not_found"}
    return {"ok": True, "enrollment": enrollment}


@router.post("/enroll/{session_id}/scan")
def scan_enroll_session_face(session_id: str, payload: dict) -> dict[str, Any]:
    """Quét góc mặt vào phiên tạm — chưa gắn hồ sơ."""
    if identity.get_enroll_session_enrollment(session_id) is None:
        return {"ok": False, "error": "session_not_found"}

    image_b64 = payload.get("image_b64")
    if not image_b64:
        return {"ok": False, "error": "missing_image"}

    emb = _embed_face_b64(str(image_b64))
    if emb is None:
        return {"ok": False, "error": "no_face_detected"}

    pose_slot = payload.get("pose_slot")
    slot = int(pose_slot) if pose_slot is not None else None
    added = identity.add_enroll_session_face(session_id, emb, pose_slot=slot)
    enrollment = identity.get_enroll_session_enrollment(session_id)
    if enrollment is None:
        return {"ok": False, "error": "session_not_found"}
    if not added:
        return {
            "ok": True,
            "face_added": False,
            "message": "duplicate_angle",
            "enrollment": enrollment,
        }
    return {"ok": True, "face_added": True, "enrollment": enrollment}


@router.post("/enroll/{session_id}/complete")
def complete_enroll_session(session_id: str, payload: dict) -> dict[str, Any]:
    """Hoàn tất — nhập hồ sơ giống import Excel, gắn vector đã quét."""
    full_name = str(payload.get("full_name") or payload.get("ho_ten") or "").strip()
    employee_code = str(payload.get("employee_code") or payload.get("ma_nv") or "").strip()
    contractor = str(payload.get("contractor") or payload.get("don_vi") or "").strip()
    if not full_name or not employee_code:
        return {"ok": False, "error": "missing_fields"}

    try:
        row = identity.complete_enroll_session(
            session_id,
            full_name=full_name,
            employee_code=employee_code,
            contractor=contractor,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "session_not_found":
            return {"ok": False, "error": "session_not_found"}
        if code == "incomplete_enrollment":
            return {"ok": False, "error": "incomplete_enrollment"}
        return {"ok": False, "error": code}

    return {
        "ok": True,
        "person": _person_payload(row, with_face_stats=True),
        "enrollment": identity.get_scan_enrollment(str(row["pers_id"])),
    }


@router.post("/persons/{pers_id}/scan")
def scan_person_face(pers_id: str, payload: dict) -> dict[str, Any]:
    """Quét thêm góc mặt — vector lưu vào `person_faces` cho nhận diện tuần tra."""
    if identity.get_person(pers_id) is None:
        return {"ok": False, "error": "not_found"}

    image_b64 = payload.get("image_b64")
    if not image_b64:
        return {"ok": False, "error": "missing_image"}

    emb = _embed_face_b64(str(image_b64))
    if emb is None:
        return {"ok": False, "error": "no_face_detected"}

    added = identity.add_face_angle(
        pers_id, emb, quality=1.0, camera_id="SCAN", now=time.time()
    )
    if not added:
        return {
            "ok": True,
            "face_added": False,
            "message": "duplicate_angle",
            "enrollment": identity.get_scan_enrollment(pers_id),
        }

    return {
        "ok": True,
        "face_added": True,
        "enrollment": identity.get_scan_enrollment(pers_id),
    }


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


@router.delete("/day/events")
def purge_day_events(date: str | None = None) -> dict[str, Any]:
    """Xoá thẻ sự kiện một ngày — giữ nguyên hồ sơ Định danh đã import."""
    stats = db.purge_day(date)
    return {"ok": True, **stats}


@router.get("/snapshot")
def patrol_snapshot(path: str):
    """Ảnh chụp của thẻ sự kiện. Đường dẫn bị chặn thoát khỏi thư mục ảnh."""
    from fastapi.responses import FileResponse, Response

    from .sink import resolve_snapshot_path

    full = resolve_snapshot_path(path)
    if full is None:
        return Response(status_code=404)
    return FileResponse(str(full), media_type="image/jpeg")


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

    from ..worker_identity.recognizer import embed_enrollment_selfie

    emb = embed_enrollment_selfie(frame)
    if emb is None:
        return None
    return emb.tolist()


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
    try:
        from .patrol_api import get_patrol_gps

        gps_lat, gps_lng = get_patrol_gps(camera_id) if camera_id else (None, None)
    except Exception:
        gps_lat, gps_lng = None, None
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
        gps_lat=gps_lat,
        gps_lng=gps_lng,
    )
    return pers_id
