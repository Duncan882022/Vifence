"""HTTP API Module 05 — đọc/ghi thẳng SQLite.

Danh tính nay nằm ở server. Trình duyệt chỉ còn cache đọc: xoá localStorage
không mất gì, và hai máy khác nhau nhìn thấy cùng một danh sách.
"""

from __future__ import annotations

import base64
import threading
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, Response

from ..auth import RequirePatrolAdmin, RequirePatrolHr, RequirePatrolRead
from ..rate_limit import rate_limit
from . import daystore, db, identity
from .audit import audit
from .schemas import (
    EnrollCompletePayload,
    EnrollScanPayload,
    IdentifyPayload,
    ImportPersonsPayload,
    MergePersonsPayload,
    PersonCreatePayload,
    PersonScanPayload,
    PersonUpdatePayload,
    PurgeDayPayload,
    SnapshotSignPayload,
)
from .snapshot_sign import sign_snapshot_path, verify_snapshot_token

router = APIRouter(prefix="/patrol", tags=["patrol"])

_import_jobs: dict[str, dict[str, Any]] = {}
_import_lock = threading.Lock()


@router.get("/health")
def patrol_health() -> dict[str, Any]:
    """Ping công khai — FE kiểm tra backend (không cần JWT)."""
    return {"ok": True, "service": "patrol"}


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
        captured, complete, _poses = identity.scan_enrollment_progress(str(row["pers_id"]))
        payload["face_count"] = captured
        payload["face_enrollment_complete"] = complete
        payload["face_vector_count"] = identity.face_count(str(row["pers_id"]))
    return payload


@router.get("/persons")
def list_persons(status: str | None = None, _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
    """Danh sách Người (`status=person`) hoặc Định danh (`status=identified`)."""
    rows = identity.list_persons(status)
    return {
        "ok": True,
        "items": [_person_payload(r, with_face_stats=True) for r in rows],
    }


@router.get("/persons/lookup")
def lookup_person(employee_code: str, _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
    """Tra cứu hồ sơ theo mã nhân viên — dùng trước khi quét mặt."""
    code = (employee_code or "").strip()
    if not code:
        return {"ok": False, "error": "missing_employee_code"}
    row = identity.find_by_employee_code(code)
    if row is None:
        return {"ok": False, "error": "not_found"}
    return {"ok": True, "person": _person_payload(row)}


@router.post("/persons")
def create_person(
    payload: PersonCreatePayload,
    user: RequirePatrolHr = None,  # noqa: ARG001
) -> dict[str, Any]:
    """Tạo một hồ sơ rồi quét mặt — HR, không cần quyền admin import."""
    full_name = payload.full_name.strip()
    employee_code = payload.employee_code.strip()
    contractor = (payload.contractor or "").strip()
    if not full_name or not employee_code:
        return {"ok": False, "error": "missing_fields"}
    try:
        row = identity.import_identity(
            full_name=full_name,
            employee_code=employee_code,
            contractor=contractor,
            embedding=None,
            source="hr_create",
        )
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
    audit("person_create", actor=user.username, subject_id=str(row["pers_id"]))
    return {"ok": True, "person": _person_payload(row, with_face_stats=True)}


@router.get("/persons/{pers_id}")
def get_person(pers_id: str, _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
    row = identity.get_person(pers_id)
    if row is None:
        return {"ok": False, "error": "not_found"}
    return {"ok": True, "person": _person_payload(row, with_face_stats=True)}


@router.patch("/persons/{pers_id}")
def update_person(
    pers_id: str,
    payload: PersonUpdatePayload,
    user: RequirePatrolHr = None,  # noqa: ARG001
) -> dict[str, Any]:
    """Sửa họ tên, mã NV, đơn vị — giữ nguyên vector mặt."""
    full_name = (payload.full_name or "").strip()
    employee_code = (payload.employee_code or "").strip()
    contractor = (payload.contractor or "").strip()
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
    audit("person_update", actor=user.username, subject_id=pers_id)
    return {"ok": True, "person": _person_payload(row, with_face_stats=True)}


@router.delete("/persons/{pers_id}")
def delete_person(pers_id: str, user: RequirePatrolAdmin = None) -> dict[str, Any]:  # noqa: ARG001
    """Xóa hồ sơ công nhân và vector mặt."""
    if not identity.delete_person(pers_id):
        return {"ok": False, "error": "not_found"}
    audit("person_delete", actor=user.username, subject_id=pers_id)
    return {"ok": True}


@router.get("/persons/{pers_id}/enrollment")
def person_enrollment(pers_id: str, _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
    row = identity.get_person(pers_id)
    if row is None:
        return {"ok": False, "error": "not_found"}
    return {"ok": True, "enrollment": identity.get_scan_enrollment(pers_id)}


@router.get("/day/events")
def day_events(date: str | None = None, _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
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
            "snapshot_score": float(r.get("snapshot_score") or 0),
        }
        for r in rows
    ]
    return {"ok": True, "date": date or db.today_vn(), "items": items}


@router.get("/day/objects")
def day_objects(date: str | None = None, _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
    """Đối tượng trong ngày — chưa thấy mặt, hết ngày là xoá."""
    return {
        "ok": True,
        "date": date or db.today_vn(),
        "items": daystore.list_objects(date),
    }


@router.get("/day/stats")
def day_stats(date: str | None = None, _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
    """KPI đếm chuẩn — Người · Lượt gặp · Quan sát chưa gán."""
    return {"ok": True, **daystore.day_stats(date)}


@router.get("/day/presences")
def day_presences(date: str | None = None, _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
    """Mọi lượt gặp qualified — heatmap GPS."""
    d = date or db.today_vn()
    items = daystore.list_day_presences(d)
    return {"ok": True, "date": d, "items": items}


@router.get("/day/appearances")
def day_appearances(
    subject_id: str,
    date: str | None = None,
    _user: RequirePatrolRead = None,  # noqa: ARG001
) -> dict[str, Any]:
    sid = (subject_id or "").strip()
    if not sid:
        return {"ok": False, "error": "missing_subject_id"}
    result = daystore.list_appearances(sid, date)
    return {"ok": True, "subject_id": sid, "date": date or db.today_vn(), **result}


@router.get("/day/bundle")
def day_bundle(date: str | None = None, _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
    """Gộp stats + events + objects + presences — một transaction đọc."""
    d = date or db.today_vn()
    with db.tx() as conn:
        conn.execute("BEGIN IMMEDIATE")
        stats = daystore.day_stats(d)
        events = daystore.list_person_events(d)
        objects = daystore.list_objects(d)
        presences = daystore.list_day_presences(d)
    event_items = [
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
            "snapshot_score": float(r.get("snapshot_score") or 0),
        }
        for r in events
    ]
    return {
        "ok": True,
        "date": d,
        "stats": stats,
        "events": event_items,
        "objects": objects,
        "presences": presences,
    }


def _run_import_job(job_id: str, items: list[dict[str, Any]], actor: str) -> None:
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
        embedding = _embed_face_b64(str(image_b64)) if image_b64 else None
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
    with _import_lock:
        _import_jobs[job_id] = {
            "status": "done",
            "total": len(items),
            "success": success,
            "failed": len(items) - success,
            "results": results,
        }
    audit("persons_import", actor=actor, meta={"job_id": job_id, "success": success})


@router.post("/persons/import")
def import_persons(
    request: Request,
    payload: ImportPersonsPayload,
    user: RequirePatrolAdmin = None,  # noqa: ARG001
) -> dict[str, Any]:
    """Nhập hàng loạt từ Excel — async job khi > 10 rows."""
    rate_limit(request, key="patrol_import", max_calls=5, window_sec=60.0)
    items = [row.model_dump() for row in payload.items]
    if len(items) <= 10:
        _run_import_job("__sync__", items, user.username)
        job = _import_jobs.pop("__sync__")
        return {"ok": True, **job}
    job_id = uuid.uuid4().hex
    with _import_lock:
        _import_jobs[job_id] = {"status": "running", "total": len(items)}
    thread = threading.Thread(
        target=_run_import_job,
        args=(job_id, items, user.username),
        daemon=True,
    )
    thread.start()
    return {"ok": True, "job_id": job_id, "status": "running"}


@router.get("/import/{job_id}/status")
def import_job_status(job_id: str, _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
    with _import_lock:
        job = _import_jobs.get(job_id)
    if job is None:
        return {"ok": False, "error": "not_found"}
    return {"ok": True, "job_id": job_id, **job}


@router.post("/enroll/session")
def create_enroll_session(request: Request) -> dict[str, Any]:
    """Bắt đầu phiên quét tự phục vụ — công nhân quét trước, nhập hồ sơ sau."""
    rate_limit(request, key="patrol_enroll_session", max_calls=20, window_sec=60.0)
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
def scan_enroll_session_face(
    request: Request,
    session_id: str,
    payload: EnrollScanPayload,
) -> dict[str, Any]:
    """Quét góc mặt vào phiên tạm — chưa gắn hồ sơ."""
    rate_limit(request, key="patrol_enroll_scan", max_calls=30, window_sec=60.0)
    if identity.get_enroll_session_enrollment(session_id) is None:
        return {"ok": False, "error": "session_not_found"}

    emb = _embed_face_b64(payload.image_b64)
    if emb is None:
        return {"ok": False, "error": "no_face_detected"}

    frame = _decode_face_b64(payload.image_b64)
    slot = payload.pose_slot
    added = identity.add_enroll_session_face(session_id, emb, pose_slot=slot)
    if added and frame is not None:
        from .enroll_images import save_enroll_session_face_image

        save_enroll_session_face_image(session_id, slot, frame)
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
def complete_enroll_session(
    request: Request,
    session_id: str,
    payload: EnrollCompletePayload,
) -> dict[str, Any]:
    """Hoàn tất — nhập hồ sơ giống import Excel, gắn vector đã quét."""
    rate_limit(request, key="patrol_enroll_complete", max_calls=10, window_sec=60.0)
    full_name = payload.full_name.strip()
    employee_code = payload.employee_code.strip()
    contractor = (payload.contractor or "").strip()
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

    audit("enroll_complete", actor="self_enroll", subject_id=str(row["pers_id"]))
    return {
        "ok": True,
        "person": _person_payload(row, with_face_stats=True),
        "enrollment": identity.get_scan_enrollment(str(row["pers_id"])),
    }


@router.post("/persons/{pers_id}/scan")
def scan_person_face(
    request: Request,
    pers_id: str,
    payload: PersonScanPayload,
    user: RequirePatrolHr = None,  # noqa: ARG001
) -> dict[str, Any]:
    """Quét thêm góc mặt — vector lưu vào `person_faces` cho nhận diện tuần tra."""
    rate_limit(request, key="patrol_person_scan", max_calls=30, window_sec=60.0)
    if identity.get_person(pers_id) is None:
        return {"ok": False, "error": "not_found"}

    emb = _embed_face_b64(payload.image_b64)
    if emb is None:
        return {"ok": False, "error": "no_face_detected"}

    frame = _decode_face_b64(payload.image_b64)
    added = identity.add_face_angle(
        pers_id, emb, quality=1.0, camera_id="SCAN", now=time.time()
    )
    if added and frame is not None:
        person = identity.get_person(pers_id)
        code = str(person.get("employee_code") or "").strip() if person else ""
        name = str(person.get("full_name") or "").strip() if person else ""
        contractor = str(person.get("contractor") or "").strip() if person else ""
        if code and name:
            from ..patrol_identity_store import patrol_gallery_worker_id
            from .enroll_images import enroll_person_scan_image

            enrollment = identity.get_scan_enrollment(pers_id)
            slot = int(payload.pose_slot or len(enrollment.get("poses") or []) or 1)
            enroll_person_scan_image(
                patrol_gallery_worker_id(code),
                worker_name=name,
                employee_code=code,
                image_bgr=frame,
                contractor_name=contractor or None,
                pose_slot=slot,
            )
            from .gallery_sync import sync_person_to_gallery

            sync_person_to_gallery(pers_id)
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
def identify_person(
    pers_id: str,
    payload: IdentifyPayload,
    user: RequirePatrolHr = None,  # noqa: ARG001
) -> dict[str, Any]:
    """Gán tên cho một Người → Định danh."""
    full_name = payload.full_name.strip()
    employee_code = payload.employee_code.strip()
    contractor = (payload.contractor or "").strip()

    if identity.get_person(pers_id) is None:
        return {"ok": False, "error": "not_found"}

    row = identity.identify(
        pers_id,
        full_name=full_name,
        employee_code=employee_code,
        contractor=contractor,
        identified_by=user.username,
    )
    audit("person_identify", actor=user.username, subject_id=pers_id)
    return {"ok": True, "person": _person_payload(row), "face_added": False}


@router.post("/persons/merge")
def merge_persons(
    payload: MergePersonsPayload,
    user: RequirePatrolHr = None,  # noqa: ARG001
) -> dict[str, Any]:
    """Gộp hai mã của cùng một người — mã bị bỏ vẫn tra ra được."""
    keep = payload.keep.strip()
    drop = payload.drop.strip()
    identity.merge_persons(keep, drop)
    row = identity.get_person(keep)
    audit("persons_merge", actor=user.username, subject_id=keep, meta={"drop": drop})
    return {"ok": True, "person": _person_payload(row) if row else None}


@router.post("/admin/repair-appearances")
def repair_appearances(
    date: str | None = None,
    days: int = 2,
    user: RequirePatrolAdmin = None,  # noqa: ARG001
) -> dict[str, Any]:
    """Backfill lịch sử popup từ snapshot files — sửa dòng gộp 10:03→10:07."""
    from .appearance_repair import repair_day_appearance_history, repair_recent_appearance_history

    if date:
        out = repair_day_appearance_history(date)
    else:
        out = {"ok": True, "days": repair_recent_appearance_history(max(1, min(days, 14)))}
    audit("appearance_repair", actor=user.username, meta={"date": date, "days": days})
    return out


@router.post("/persons/sync-gallery")
def sync_gallery_persons(_user: RequirePatrolAdmin = None) -> dict:  # noqa: ARG001
    """Backfill gallery live từ mọi hồ sơ đã định danh (admin)."""
    from .gallery_sync import sync_all_identified_to_gallery

    return sync_all_identified_to_gallery()


@router.delete("/day/events")
def purge_day_events(
    date: str | None = None,
    user: RequirePatrolAdmin = None,  # noqa: ARG001
) -> dict[str, Any]:
    """Xoá thẻ sự kiện một ngày — giữ nguyên hồ sơ Định danh đã import."""
    stats = db.purge_day(date)
    audit("day_purge", actor=user.username, meta={"date": date or db.today_vn()})
    return {"ok": True, **stats}


@router.post("/snapshot/sign")
def sign_snapshot(payload: SnapshotSignPayload, _user: RequirePatrolRead = None) -> dict:  # noqa: ARG001
    signed = sign_snapshot_path(payload.path)
    return {"ok": True, "path": payload.path, **signed}


@router.get("/snapshot")
def patrol_snapshot(
    path: str,
    token: str | None = None,
    exp: int | None = None,
):
    """Ảnh chụp — `<img>` không gửi Bearer; dùng token HMAC ký từ POST /snapshot/sign."""
    from .sink import resolve_snapshot_path

    if token and exp is not None:
        if not verify_snapshot_token(path, token, int(exp)):
            return Response(status_code=403)
    elif not settings_patrol_auth_disabled():
        return Response(status_code=401)

    full = resolve_snapshot_path(path)
    if full is None:
        return Response(status_code=404)
    return FileResponse(str(full), media_type="image/jpeg")


def settings_patrol_auth_disabled() -> bool:
    from ..config import settings

    return settings.patrol_auth_disabled


def _gallery_face_sign_path(worker_id: str, slot: int) -> str:
    return f"gallery-face/{worker_id.strip()}/{int(slot)}"


@router.get("/gallery/{worker_id}/faces")
def gallery_worker_faces(worker_id: str, _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
    """Trạng thái quét mặt gallery + URL ảnh đã ký cho popup định danh."""
    from urllib.parse import quote

    from ..worker_identity.gallery import get_enrollment_status

    wid = worker_id.strip()
    if not wid:
        return {"ok": False, "error": "missing_worker_id"}

    enrollment = get_enrollment_status(wid)
    poses_out: list[dict[str, Any]] = []
    for pose in enrollment.get("poses") or []:
        slot = int(pose.get("slot") or 0)
        entry = dict(pose)
        entry["url"] = None
        if pose.get("captured") and slot >= 1:
            signed = sign_snapshot_path(_gallery_face_sign_path(wid, slot))
            entry["url"] = (
                f"/patrol/gallery/face?worker_id={quote(wid, safe='')}"
                f"&slot={slot}&token={signed['token']}&exp={signed['exp']}"
            )
        poses_out.append(entry)

    return {
        "ok": True,
        "worker_id": wid,
        "worker_name": enrollment.get("worker_name"),
        "employee_code": enrollment.get("employee_code"),
        "poses": poses_out,
        "poses_captured": enrollment.get("poses_captured", 0),
        "complete": enrollment.get("complete", False),
    }


@router.get("/gallery/face")
def gallery_worker_face(
    worker_id: str,
    slot: int,
    token: str | None = None,
    exp: int | None = None,
):
    """Ảnh khuôn mặt gallery — `<img>` dùng token HMAC ký từ GET /gallery/{id}/faces."""
    from ..worker_identity.gallery import face_filename, gallery_dir

    wid = worker_id.strip()
    pose_slot = int(slot)
    if not wid or pose_slot < 1 or pose_slot > 3:
        return Response(status_code=400)

    sign_path = _gallery_face_sign_path(wid, pose_slot)
    if token and exp is not None:
        if not verify_snapshot_token(sign_path, token, int(exp)):
            return Response(status_code=403)
    elif not settings_patrol_auth_disabled():
        return Response(status_code=401)

    filename = face_filename(wid, pose_slot)
    full = gallery_dir() / "faces" / filename
    if not full.is_file():
        return Response(status_code=404)
    return FileResponse(str(full), media_type="image/jpeg")


def _embed_face_b64(image_b64: str) -> list[float] | None:
    """Ảnh base64 → vector khuôn mặt. Không thấy mặt thì trả None."""
    frame = _decode_face_b64(image_b64)
    if frame is None:
        return None

    from ..worker_identity.recognizer import embed_enrollment_selfie

    emb = embed_enrollment_selfie(frame)
    if emb is None:
        return None
    return emb.tolist()


def _decode_face_b64(image_b64: str):
    """Ảnh base64 → frame BGR (OpenCV)."""
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
    return frame


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
        from ..patrol_gps_sim import (
            patrol_site_center_fallback,
            resolve_patrol_observation_gps,
        )

        gps_lat, gps_lng = (
            resolve_patrol_observation_gps(camera_id, at_ts=ts)
            if camera_id
            else patrol_site_center_fallback()
        )
    except Exception:
        from ..patrol_gps_sim import patrol_site_center_fallback

        gps_lat, gps_lng = patrol_site_center_fallback()
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
        face_eligible=True,
        now=ts,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
    )
    return pers_id


@router.post("/drone/telemetry")
def post_drone_telemetry(payload: dict[str, Any], _user: RequirePatrolRead = None) -> dict[str, Any]:  # noqa: ARG001
    """Cập nhật độ cao flycam — quyết định aerial (mật độ) vs proximity (AI như mũ)."""
    from ..patrol_flight_mode import (
        patrol_flight_mode_payload,
        update_patrol_drone_altitude,
    )

    camera_id = str(payload.get("camera_id") or "").strip().upper()
    if not camera_id.startswith("DR-"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Chỉ hỗ trợ camera DR-*")
    try:
        altitude_m = float(payload["altitude_m"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="missing_altitude_m") from exc

    lat = payload.get("lat")
    lng = payload.get("lng")
    heading = payload.get("heading")
    update_patrol_drone_altitude(
        camera_id,
        altitude_m,
        lat=float(lat) if lat is not None else None,
        lng=float(lng) if lng is not None else None,
        heading=float(heading) if heading is not None else None,
    )
    return {"ok": True, **patrol_flight_mode_payload(camera_id)}
