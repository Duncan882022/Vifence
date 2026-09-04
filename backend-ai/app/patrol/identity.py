"""Danh tính tuần tra — schema v8.

Cột `pers_id` lưu `tk-*` (bản nháp) hoặc gallery id `p-*` (đã định danh).
Không tự sinh `pers-0001` / `iden-0001`.

Một bảng `persons`, phân biệt bằng `status` (`draft` | `identified`).
Vector khuôn mặt nằm thẳng trong SQLite — không dựng lại embedding từ JPG mỗi
lần khởi động.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
import time
from typing import Any, Sequence

import numpy as np

from . import db

logger = logging.getLogger("patrol.identity")

# Ngưỡng nhận lại người cũ.
#
# Đo trên dữ liệu thật của bodycam: hai lần thấy **cùng một người** ở góc khác
# nhau chỉ đạt tương đồng 0,39 (trung vị) tới 0,60 (cao nhất). Khuôn mặt chụp
# từ mũ đội đầu vốn nhỏ, nhoè và lệch góc, nên embedding rời rạc hơn hẳn ảnh
# chân dung. Để 0,62 là gần như không bao giờ khớp — đúng cái đã làm một người
# bị tách thành pers-0001 … pers-0011.
MATCH_MIN_SIMILARITY = 0.52
# Phải hơn ứng viên kế tiếp ngần này mới dám nhận.
#
# Giữ nhỏ có lý do: khi một người lỡ bị tách thành vài mã, các mã đó trở thành
# "đối thủ" của nhau và biên độ lớn sẽ chặn mọi lần khớp — càng tách càng không
# gộp lại được. Người trực gộp tay được, còn nhập nhầm hai người thì khó thấy,
# nên vẫn giữ một khoảng cách tối thiểu.
MATCH_MIN_MARGIN = 0.03
# Trần số vector giữ cho mỗi người. Nhiều góc mặt thì nhận chắc hơn hẳn: lần
# gặp sau chỉ cần khớp **một** góc bất kỳ trong số đã lưu.
MAX_FACES_PER_PERSON = 24
# Góc mới giống góc đã có tới mức này thì không thêm — không mang thêm thông
# tin mà chỉ làm chậm vòng so khớp.
FACE_ANGLE_DEDUPE_SIM = 0.88

STATUS_DRAFT = "draft"
STATUS_IDENTIFIED = "identified"
STATUS_PERSON = STATUS_DRAFT  # alias — legacy callers


def _sync_gallery_after_identify(pers_id: str) -> None:
    """SQLite → worker_gallery + bindings để overlay live nhận tên."""
    try:
        from .gallery_sync import sync_person_to_gallery

        sync_person_to_gallery(pers_id)
    except Exception:  # noqa: BLE001
        logger.warning("gallery_sync skipped for %s", pers_id, exc_info=True)


def _to_blob(vec: Sequence[float]) -> tuple[bytes, int]:
    arr = np.asarray(vec, dtype=np.float32).ravel()
    norm = float(np.linalg.norm(arr))
    if norm > 0:
        arr = arr / norm
    return arr.tobytes(), int(arr.size)


def _from_blob(blob: bytes, dim: int) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32, count=dim)


# ---------------------------------------------------------------------------
# Đọc


def get_person(pers_id: str) -> dict[str, Any] | None:
    """Đọc một người, tự đi theo alias nếu mã đã bị gộp."""
    pid = resolve_alias(pers_id)
    row = db.query_one("SELECT * FROM persons WHERE pers_id = ?", (pid,))
    return dict(row) if row else None


def resolve_alias(pers_id: str) -> str:
    row = db.query_one(
        "SELECT pers_id FROM person_aliases WHERE old_pers_id = ?", (pers_id,)
    )
    return str(row["pers_id"]) if row else pers_id


def list_persons(status: str | None = None) -> list[dict[str, Any]]:
    if status:
        rows = db.query(
            "SELECT * FROM persons WHERE status = ? ORDER BY created_at DESC", (status,)
        )
    else:
        rows = db.query("SELECT * FROM persons ORDER BY created_at DESC")
    return [dict(r) for r in rows]


from ..worker_identity.gallery import (
    ENROLLMENT_POSE_COUNT,
    ENROLLMENT_POSE_REQUIRED,
    POSE_LABELS,
)

SCAN_FACES_REQUIRED = ENROLLMENT_POSE_REQUIRED
SCAN_POSE_SLOTS = ENROLLMENT_POSE_COUNT
SCAN_POSE_LABELS = POSE_LABELS
HR_ENROLL_CAMERA_IDS = ("SCAN", "SELF_ENROLL", "VERIFY")


def find_by_employee_code(employee_code: str) -> dict[str, Any] | None:
    code = employee_code.strip()
    if not code:
        return None
    row = db.query_one("SELECT * FROM persons WHERE employee_code = ?", (code,))
    return dict(row) if row else None


def face_count(pers_id: str) -> int:
    pid = resolve_alias(pers_id)
    row = db.query_one(
        "SELECT COUNT(*) AS c FROM person_faces WHERE pers_id = ?", (pid,)
    )
    return int(row["c"]) if row else 0


def _hr_enroll_vector_count(pers_id: str) -> int:
    """Vector từ quét HR / verify / self-enroll — không tính bodycam."""
    pid = resolve_alias(pers_id)
    placeholders = ",".join("?" for _ in HR_ENROLL_CAMERA_IDS)
    row = db.query_one(
        f"SELECT COUNT(*) AS c FROM person_faces"
        f" WHERE pers_id = ? AND camera_id IN ({placeholders})",
        (pid, *HR_ENROLL_CAMERA_IDS),
    )
    return int(row["c"]) if row else 0


def _build_scan_poses(captured: int) -> list[dict[str, Any]]:
    poses: list[dict[str, Any]] = []
    for slot in range(1, SCAN_POSE_SLOTS + 1):
        if slot <= SCAN_FACES_REQUIRED:
            slot_captured = captured >= slot
        else:
            slot_captured = captured >= slot
        poses.append({
            "slot": slot,
            "label": SCAN_POSE_LABELS[slot - 1],
            "captured": slot_captured,
            "optional": slot > SCAN_FACES_REQUIRED,
        })
    return poses


def _hr_scan_face_count(pers_id: str) -> int:
    """Tiến độ quét HR — tối đa số slot hiển thị."""
    return min(_hr_enroll_vector_count(pers_id), SCAN_POSE_SLOTS)


def hr_profile_for_gallery(gallery_worker_id: str) -> dict[str, Any] | None:
    """Hồ sơ HR đã import — gallery/binding không được tự tạo Định danh nếu thiếu bản ghi này."""
    from ..patrol_identity_store import lookup_patrol_binding_row

    row = lookup_patrol_binding_row((gallery_worker_id or "").strip())
    if not row:
        return None
    code = str(row.get("employee_code") or "").strip()
    if not code:
        return None
    person = find_by_employee_code(code)
    if person and person.get("status") == STATUS_IDENTIFIED:
        return person
    return None


def pers_id_for_gallery_worker(gallery_worker_id: str) -> tuple[str, str] | None:
    """Khớp gallery JPG → pers_id SQLite — draft tk-* hoặc identified p-*."""
    from ..patrol_identity_store import lookup_patrol_binding_row
    from ..patrol_ids import is_anonymous_track_id, normalize_track_id

    gid = (gallery_worker_id or "").strip()
    if not gid:
        return None

    tk = normalize_track_id(gid)
    if is_anonymous_track_id(tk):
        pid = lookup_profile_by_tk(tk)
        if pid:
            person = get_person(pid)
            name = display_name(person) if person else tk
            return pid, name or tk

    hr = hr_profile_for_gallery(gid)
    if hr:
        return str(hr["pers_id"]), display_name(hr)

    row = lookup_patrol_binding_row(gid)
    if row:
        bind_name = str(row.get("worker_name") or "").strip()
        emp = str(row.get("employee_code") or "").strip()
        if emp:
            found = find_by_employee_code(emp)
            if found:
                return str(found["pers_id"]), display_name(found)
        for alias in row.get("aliases") or []:
            tk = normalize_track_id(str(alias))
            if not is_anonymous_track_id(tk):
                continue
            pid = lookup_profile_by_tk(tk)
            if pid:
                person = get_person(pid)
                name = display_name(person) if person else bind_name or tk
                return pid, name or tk
        if bind_name:
            person = get_person(gid)
            if person:
                return gid, display_name(person)
            return gid, bind_name

    person = get_person(gid)
    if person:
        return gid, display_name(person)

    if row:
        for alias in row.get("aliases") or []:
            tk = normalize_track_id(str(alias))
            if is_anonymous_track_id(tk):
                pid = ensure_draft_for_tk(tk)
                return pid, tk
        name = str(row.get("worker_name") or gid).strip() or gid
        return gid, name

    return None


def match_gallery_embedding_for_observe(
    embedding: Sequence[float],
    *,
    camera_id: str | None = None,
) -> tuple[str | None, float]:
    """So gallery JPG — trả pers_id draft/identified nếu khớp góc mặt."""
    import numpy as np

    from ..worker_identity import face_thresholds
    from ..worker_identity.gallery import load_gallery, match_embedding

    load_gallery()
    probe = np.asarray(embedding, dtype=np.float32).ravel()
    norm = float(np.linalg.norm(probe))
    if norm <= 0:
        return None, 0.0
    probe = probe / norm

    cam = (camera_id or "HC-01").strip() or "HC-01"
    matched = match_embedding(
        probe,
        min_confidence=face_thresholds.gallery_min_confidence(cam),
        min_margin=face_thresholds.gallery_min_margin(cam),
    )
    if matched is None:
        return None, 0.0
    profile, score = matched
    gid = str(profile.worker_id or "").strip()
    if not gid:
        return None, float(score)
    resolved = pers_id_for_gallery_worker(gid)
    if resolved is None:
        return None, float(score)
    return resolved[0], float(score)


def hr_profile_for_employee_code(employee_code: str) -> dict[str, Any] | None:
    code = (employee_code or "").strip()
    if not code:
        return None
    person = find_by_employee_code(code)
    if person and person.get("status") == STATUS_IDENTIFIED:
        return person
    return None


def gallery_enrollment_stats(
    employee_code: str | None,
    *,
    pers_id: str | None = None,
) -> dict[str, Any]:
    """Thống kê quét mặt — JPG gallery là nguồn chính; vector SCAN/SELF_ENROLL là dự phòng."""
    from ..patrol_identity_store import patrol_gallery_worker_id
    from ..worker_identity.gallery import get_enrollment_status

    code = (employee_code or "").strip()
    empty_poses = _build_scan_poses(0)
    if not code:
        return {
            "gallery_worker_id": None,
            "poses_captured": 0,
            "face_count": 0,
            "complete": False,
            "poses": empty_poses,
        }

    wid = patrol_gallery_worker_id(code)
    enrollment = get_enrollment_status(wid)
    gallery_captured = int(enrollment.get("poses_captured") or 0)
    gallery_complete = bool(enrollment.get("complete"))
    poses = list(enrollment.get("poses") or empty_poses)
    hr_count = _hr_scan_face_count(pers_id) if pers_id else 0
    captured = max(gallery_captured, hr_count)
    complete = gallery_complete or hr_count >= SCAN_FACES_REQUIRED
    if complete and not gallery_complete and hr_count >= SCAN_FACES_REQUIRED:
        for pose in poses:
            pose["captured"] = True
        captured = SCAN_FACES_REQUIRED
    return {
        "gallery_worker_id": wid,
        "poses_captured": captured,
        "face_count": captured,
        "complete": complete,
        "poses": poses,
    }


def scan_enrollment_progress(pers_id: str) -> tuple[int, bool, list[dict[str, Any]]]:
    """Tiến độ quét mặt UI — gallery JPG khi đã định danh, không đếm vector patrol."""
    pid = resolve_alias(pers_id)
    person = get_person(pid)
    if person and person.get("status") == STATUS_IDENTIFIED:
        code = str(person.get("employee_code") or "").strip()
        if code:
            stats = gallery_enrollment_stats(code, pers_id=pid)
            captured = int(stats["poses_captured"])
            complete = bool(stats["complete"])
            poses = list(stats["poses"])
            if not poses:
                poses = _build_scan_poses(captured)
            return captured, complete, poses

    if person and person.get("status") == STATUS_DRAFT:
        patrol_faces = _draft_patrol_face_count(pid)
        hr_faces = _hr_scan_face_count(pid)
        captured = max(patrol_faces, hr_faces)
        complete = hr_faces >= SCAN_FACES_REQUIRED
        return captured, complete, _build_scan_poses(captured)

    captured = _hr_scan_face_count(pid)
    poses = _build_scan_poses(captured)
    return captured, captured >= SCAN_FACES_REQUIRED, poses


def get_scan_enrollment(pers_id: str) -> dict[str, Any]:
    """Trạng thái quét mặt cho trang enroll — 5 góc tối thiểu."""
    pid = resolve_alias(pers_id)
    person = get_person(pid)
    captured, complete, poses = scan_enrollment_progress(pid)
    rows = db.query(
        "SELECT id, quality, source, created_at FROM person_faces"
        " WHERE pers_id = ? ORDER BY created_at ASC",
        (pid,),
    )
    payload: dict[str, Any] = {
        "pers_id": pid,
        "full_name": person.get("full_name") if person else None,
        "employee_code": person.get("employee_code") if person else None,
        "contractor": person.get("contractor") if person else None,
        "status": person.get("status") if person else None,
        "faces_captured": captured,
        "faces_required": SCAN_FACES_REQUIRED,
        "complete": complete,
        "poses": poses,
        "face_records": len(rows),
    }
    if person and person.get("status") == STATUS_DRAFT:
        payload["draft_faces"] = _draft_faces_for_person(pid)
    return payload


def display_name(person: dict[str, Any] | None) -> str:
    """Nhãn hiện trên ROI và thẻ sự kiện."""
    if not person:
        return "Đối tượng"
    if person.get("status") == STATUS_IDENTIFIED:
        name = (person.get("full_name") or "").strip()
        return name or str(person.get("employee_code") or person["pers_id"])
    if person.get("status") == STATUS_DRAFT:
        code = str(person.get("employee_code") or "").strip()
        return code or str(person["pers_id"])
    return str(person["pers_id"])


# ---------------------------------------------------------------------------
# Khớp khuôn mặt


# Bảng khuôn mặt đổi hiếm (chỉ khi gặp người mới hoặc gán tên) nhưng bị đọc ở
# mỗi khung hình của mỗi camera. Giữ bản dựng sẵn trong RAM, huỷ khi có ghi.
_face_index: list[tuple[str, np.ndarray]] | None = None
_face_index_lock = threading.Lock()


def _invalidate_face_index() -> None:
    global _face_index
    with _face_index_lock:
        _face_index = None


def _load_face_index() -> list[tuple[str, np.ndarray]]:
    global _face_index
    with _face_index_lock:
        if _face_index is not None:
            return _face_index
    rows = db.query("SELECT pers_id, embedding, dim FROM person_faces")
    built = [
        (str(r["pers_id"]), _from_blob(r["embedding"], int(r["dim"]))) for r in rows
    ]
    with _face_index_lock:
        _face_index = built
    return built


def match_face(embedding: Sequence[float]) -> tuple[str | None, float]:
    """Tìm người khớp khuôn mặt. Trả `(pers_id, similarity)` hoặc `(None, best)`.

    Gộp theo người trước khi so cách biệt: một người có nhiều vector, nếu tính
    cách biệt trên từng vector thì hai góc mặt của **cùng một người** lại tự
    triệt tiêu nhau và không bao giờ đủ margin.
    """
    index = _load_face_index()
    if not index:
        return None, 0.0

    probe = np.asarray(embedding, dtype=np.float32).ravel()
    norm = float(np.linalg.norm(probe))
    if norm <= 0:
        return None, 0.0
    probe = probe / norm

    best_by_person: dict[str, float] = {}
    for pers_id, vec in index:
        if vec.size != probe.size:
            continue
        sim = float(np.dot(probe, vec))
        if sim > best_by_person.get(pers_id, -1.0):
            best_by_person[pers_id] = sim

    if not best_by_person:
        return None, 0.0

    ranked = sorted(best_by_person.items(), key=lambda kv: kv[1], reverse=True)
    best_id, best_sim = ranked[0]
    rival = ranked[1][1] if len(ranked) > 1 else -1.0

    if best_sim < MATCH_MIN_SIMILARITY:
        return None, best_sim
    if rival > -1.0 and (best_sim - rival) < MATCH_MIN_MARGIN:
        return None, best_sim
    return best_id, best_sim


def match_face_for_observe(embedding: Sequence[float]) -> tuple[str | None, float]:
    """Khớp mặt khi ghi track — nới margin khi điểm cao (2 tk cùng người trong đám)."""
    matched, best_sim = match_face(embedding)
    if matched:
        return matched, best_sim

    from ..worker_identity import face_thresholds

    index = _load_face_index()
    if not index:
        return None, best_sim

    probe = np.asarray(embedding, dtype=np.float32).ravel()
    norm = float(np.linalg.norm(probe))
    if norm <= 0:
        return None, 0.0
    probe = probe / norm

    best_by_person: dict[str, float] = {}
    for pers_id, vec in index:
        if vec.size != probe.size:
            continue
        sim = float(np.dot(probe, vec))
        if sim > best_by_person.get(pers_id, -1.0):
            best_by_person[pers_id] = sim

    if not best_by_person:
        return None, best_sim

    ranked = sorted(best_by_person.items(), key=lambda kv: kv[1], reverse=True)
    best_id, best_sim = ranked[0]
    rival = ranked[1][1] if len(ranked) > 1 else -1.0
    floor = face_thresholds.reuse_min_similarity()

    if best_sim < MATCH_MIN_SIMILARITY:
        return None, best_sim
    if best_sim >= max(floor, 0.78):
        return best_id, best_sim
    if best_sim >= floor and rival < floor:
        return best_id, best_sim
    return None, best_sim


def add_face(
    pers_id: str,
    embedding: Sequence[float],
    *,
    quality: float = 0.0,
    source: str = "camera",
    camera_id: str | None = None,
    image_path: str | None = None,
    conn: sqlite3.Connection | None = None,
) -> None:
    blob, dim = _to_blob(embedding)
    now = time.time()
    pid = resolve_alias(pers_id)

    def _run(c: sqlite3.Connection) -> None:
        c.execute(
            "INSERT INTO person_faces"
            "(pers_id, embedding, dim, quality, image_path, source, camera_id, created_at)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (pid, blob, dim, float(quality), image_path, source, camera_id, now),
        )
        # Giữ các vector chất lượng cao nhất, bỏ phần đuôi.
        c.execute(
            "DELETE FROM person_faces WHERE id IN ("
            "  SELECT id FROM person_faces WHERE pers_id = ?"
            "  ORDER BY quality DESC, created_at DESC LIMIT -1 OFFSET ?"
            ")",
            (pid, MAX_FACES_PER_PERSON),
        )

    if conn is not None:
        _run(conn)
    else:
        with db.tx() as c:
            _run(c)
    _invalidate_face_index()


# ---------------------------------------------------------------------------
# Ghi


def allocate_tk_profile(
    *,
    origin: str = "camera",
    now: float | None = None,
    conn: sqlite3.Connection | None = None,
) -> str:
    """Cấp mã tk-* mới — pers_id = tk id, status=draft."""
    from ..patrol_ids import format_tk

    ts = now or time.time()

    def _run(c: sqlite3.Connection) -> str:
        seq = db.next_counter(c, "tk")
        tk_id = format_tk(seq)
        c.execute(
            "INSERT INTO persons(pers_id, status, employee_code, origin, first_seen, last_seen, created_at)"
            " VALUES(?,?,?,?,?,?,?)",
            (tk_id, STATUS_DRAFT, tk_id, origin, ts, ts, ts),
        )
        return tk_id

    if conn is not None:
        return _run(conn)
    with db.tx() as c:
        return _run(c)


def lookup_profile_by_tk(tk_id: str) -> str | None:
    """Tra hồ sơ draft theo tk-* (hoặc sgc-* legacy) — trả pers_id (= tk cho draft)."""
    from ..patrol_ids import is_anonymous_track_id, normalize_track_id

    tk = normalize_track_id(tk_id)
    if not tk or not is_anonymous_track_id(tk):
        return None
    row = db.query_one("SELECT pers_id FROM persons WHERE pers_id = ?", (tk,))
    if row is not None:
        return resolve_alias(str(row["pers_id"]))
    found = find_by_employee_code(tk)
    if found and found.get("status") == STATUS_DRAFT:
        return resolve_alias(str(found["pers_id"]))
    return None


def bind_tk_profile(tk_id: str, pers_id: str, *, now: float | None = None) -> None:
    """Gắn tk registry → pers_id — RAM + SQLite."""
    from ..patrol_ids import is_anonymous_track_id, normalize_track_id

    tk = normalize_track_id(tk_id)
    pid = resolve_alias((pers_id or "").strip())
    if not tk or not pid or not is_anonymous_track_id(tk):
        return
    ts = now or time.time()
    with db.tx() as c:
        c.execute(
            "INSERT INTO track_profile_bindings(tk_id, pers_id, bound_at)"
            " VALUES(?,?,?)"
            " ON CONFLICT(tk_id) DO UPDATE SET"
            " pers_id = excluded.pers_id, bound_at = excluded.bound_at",
            (tk, pid, ts),
        )


def lookup_bound_profile_for_tk(tk_id: str) -> str | None:
    """Tra pers_id đã gắn tk — binding table, persons draft, hoặc alias."""
    from ..patrol_ids import is_anonymous_track_id, normalize_track_id

    tk = normalize_track_id(tk_id)
    if not tk or not is_anonymous_track_id(tk):
        return None
    row = db.query_one(
        "SELECT pers_id FROM track_profile_bindings WHERE tk_id = ?", (tk,)
    )
    if row is not None:
        return resolve_alias(str(row["pers_id"]))
    return lookup_profile_by_tk(tk)


def ensure_draft_for_tk(tk_id: str, *, now: float | None = None) -> str:
    """Đủ điều kiện nhận diện (tk-*) → hồ sơ bản nháp, pers_id = tk normalized."""
    from ..patrol_ids import is_anonymous_track_id, normalize_track_id

    ts = now or time.time()
    tk = normalize_track_id(tk_id)
    if not is_anonymous_track_id(tk):
        raise ValueError("invalid_tk")

    existing = lookup_profile_by_tk(tk)
    if existing:
        touch_person(existing, now=ts)
        return existing

    with db.tx() as c:
        c.execute(
            "INSERT INTO persons("
            " pers_id, status, employee_code, origin, first_seen, last_seen, created_at"
            ") VALUES(?,?,?,?,?,?,?)",
            (tk, STATUS_DRAFT, tk, "tk", ts, ts, ts),
        )
    return tk


def ensure_identified_for_gallery(
    gallery_id: str,
    *,
    full_name: str,
    employee_code: str,
    contractor: str = "",
    identified_by: str = "",
    now: float | None = None,
) -> str:
    """Đảm bảo hồ sơ identified — pers_id = gallery_id."""
    ts = now or time.time()
    gid = (gallery_id or "").strip()
    if not gid:
        raise ValueError("invalid_gallery")

    pid = resolve_alias(gid)
    existing = get_person(pid)
    if existing is not None:
        touch_person(pid, now=ts)
        name = full_name.strip()
        code = (employee_code or "").strip()
        contractor_val = (contractor or "").strip()
        identified_by_val = (identified_by or "").strip()
        with db.tx() as c:
            c.execute(
                "UPDATE persons SET status = ?, full_name = COALESCE(?, full_name),"
                " employee_code = COALESCE(?, employee_code),"
                " contractor = COALESCE(?, contractor),"
                " identified_at = COALESCE(identified_at, ?),"
                " identified_by = COALESCE(?, identified_by)"
                " WHERE pers_id = ?",
                (
                    STATUS_IDENTIFIED,
                    name or None,
                    code or None,
                    contractor_val or None,
                    ts,
                    identified_by_val or None,
                    pid,
                ),
            )
        _sync_gallery_after_identify(pid)
        return pid

    code = (employee_code or "").strip()
    if not code:
        raise ValueError("missing_employee_code")

    by_code = find_by_employee_code(code)
    if by_code is not None:
        return str(by_code["pers_id"])

    with db.tx() as c:
        c.execute(
            "INSERT INTO persons("
            " pers_id, status, full_name, employee_code, contractor,"
            " origin, identified_at, identified_by, created_at"
            ") VALUES(?,?,?,?,?,?,?,?,?)",
            (
                gid,
                STATUS_IDENTIFIED,
                full_name.strip(),
                code,
                (contractor or "").strip() or None,
                "gallery",
                ts,
                (identified_by or "").strip(),
                ts,
            ),
        )
    _sync_gallery_after_identify(gid)
    return gid


def verify_draft_profile(
    pers_id: str,
    *,
    full_name: str,
    employee_code: str,
    contractor: str = "",
    identified_by: str = "",
    enroll_session_id: str | None = None,
    face_embedding: Sequence[float] | None = None,
    face_frame: Any = None,
    now: float | None = None,
) -> dict[str, Any]:
    """Bản nháp → xác minh — upload ảnh chính diện (verify) hoặc phiên quét 3 góc."""
    pid = resolve_alias(pers_id)
    row = get_person(pid)
    if row is None:
        raise KeyError("not_found")
    if row.get("status") != STATUS_DRAFT:
        raise ValueError("not_draft")

    ts = now or time.time()
    sid = (enroll_session_id or "").strip()
    has_session = False
    if sid:
        enrollment = get_enroll_session_enrollment(sid)
        if enrollment is None or not enrollment.get("complete"):
            raise ValueError("incomplete_enrollment")
        has_session = True

    has_manual_face = face_embedding is not None
    if not has_session and not has_manual_face:
        raise ValueError("incomplete_enrollment")

    result = identify(
        pid,
        full_name=full_name,
        employee_code=employee_code,
        contractor=contractor,
        identified_by=identified_by or "verify_draft",
        now=ts,
    )
    verified_id = str(result["pers_id"])

    if has_session:
        _apply_enroll_session_vectors(
            verified_id,
            sid,
            camera_id="VERIFY",
            now=ts,
        )
        _promote_enroll_session_front_jpg(
            sid,
            gallery_worker_id=_gallery_id_for_employee(employee_code),
            worker_name=full_name,
            employee_code=employee_code,
            contractor_name=contractor or None,
        )
        with db.tx() as c:
            c.execute("DELETE FROM enroll_sessions WHERE session_id = ?", (sid,))

    if has_manual_face:
        _apply_verify_front_image(
            verified_id,
            face_embedding,
            face_frame,
            full_name=full_name,
            employee_code=employee_code,
            contractor=contractor,
            now=ts,
        )

    _sync_gallery_after_identify(verified_id)
    final = get_person(verified_id)
    assert final is not None
    return final


def _apply_verify_front_image(
    pers_id: str,
    embedding: Sequence[float],
    frame_bgr: Any,
    *,
    full_name: str,
    employee_code: str,
    contractor: str,
    now: float,
) -> None:
    """Ảnh chính diện upload tay — vector VERIFY + JPG avatar gallery."""
    add_face_angle(
        pers_id,
        embedding,
        quality=1.0,
        camera_id="VERIFY",
        now=now,
        frame=frame_bgr,
        person_bbox=(
            [0.0, 0.0, float(frame_bgr.shape[1]), float(frame_bgr.shape[0])]
            if frame_bgr is not None and hasattr(frame_bgr, "shape") and len(frame_bgr.shape) >= 2
            else None
        ),
    )
    if frame_bgr is None:
        return
    try:
        import numpy as np
        from .enroll_images import enroll_person_scan_image

        if not isinstance(frame_bgr, np.ndarray):
            return
        enroll_person_scan_image(
            _gallery_id_for_employee(employee_code),
            worker_name=full_name.strip(),
            employee_code=employee_code.strip(),
            image_bgr=frame_bgr,
            contractor_name=(contractor or "").strip() or None,
            pose_slot=1,
        )
    except Exception:  # noqa: BLE001
        logger.debug("verify front jpg skip", exc_info=True)


def _gallery_id_for_employee(employee_code: str) -> str:
    from ..patrol_identity_store import patrol_gallery_worker_id

    return patrol_gallery_worker_id(employee_code.strip())


def _apply_enroll_session_vectors(
    pers_id: str,
    session_id: str,
    *,
    camera_id: str,
    now: float | None = None,
) -> int:
    """Gắn vector phiên quét vào hồ sơ — mỗi slot một góc."""
    sid = session_id.strip()
    rows = db.query(
        "SELECT embedding, dim FROM enroll_session_faces"
        " WHERE session_id = ? ORDER BY slot ASC",
        (sid,),
    )
    ts = now or time.time()
    added = 0
    for fr in rows:
        vec = _from_blob(fr["embedding"], int(fr["dim"]))
        if add_face_angle(
            pers_id,
            vec.tolist(),
            quality=1.0,
            camera_id=camera_id,
            now=ts,
        ):
            added += 1
    return added


def _promote_enroll_session_front_jpg(
    session_id: str,
    *,
    gallery_worker_id: str,
    worker_name: str,
    employee_code: str,
    contractor_name: str | None = None,
) -> None:
    """Chỉ ghi JPG chính diện (slot 1) vào gallery — các góc khác chỉ vector."""
    from .enroll_images import list_enroll_session_face_images, promote_enroll_session_front_jpg

    promote_enroll_session_front_jpg(
        session_id,
        gallery_worker_id=gallery_worker_id,
        worker_name=worker_name,
        employee_code=employee_code,
        contractor_name=contractor_name,
        images=list_enroll_session_face_images(session_id),
    )


def _draft_patrol_face_count(pers_id: str) -> int:
    """Số vector mặt đã lưu cho hồ sơ bản nháp."""
    pid = resolve_alias(pers_id)
    row = db.query_one(
        "SELECT COUNT(*) AS c FROM person_faces WHERE pers_id = ?",
        (pid,),
    )
    return int(row["c"]) if row else 0


def _draft_faces_for_person(pers_id: str) -> list[dict[str, Any]]:
    pid = resolve_alias(pers_id)
    rows = db.query(
        "SELECT id, quality, camera_id, image_path, created_at FROM person_faces"
        " WHERE pers_id = ? ORDER BY created_at ASC",
        (pid,),
    )
    return [
        {
            "id": int(r["id"]),
            "quality": float(r["quality"] or 0),
            "camera_id": r["camera_id"],
            "path": str(r["image_path"]).strip() if r["image_path"] else None,
            "created_at": float(r["created_at"] or 0),
        }
        for r in rows
    ]


def _maybe_save_patrol_face_crop(
    pers_id: str,
    *,
    camera_id: str | None,
    frame: Any,
    person_bbox: Sequence[float] | None,
    ts: float,
) -> str | None:
    if frame is None:
        return None
    if not camera_id:
        return None
    from .camera_scope import is_patrol_metrics_camera

    manual_selfie = camera_id in {"SCAN", "VERIFY"}
    if not manual_selfie and (not person_bbox or len(person_bbox) < 4):
        return None
    if not manual_selfie and not is_patrol_metrics_camera(camera_id):
        return None
    try:
        from ..worker_identity.recognizer import extract_patrol_face_crop_bgr
        from .draft_face_images import save_draft_face_crop

        if not isinstance(frame, np.ndarray):
            frame_arr = np.asarray(frame)
        else:
            frame_arr = frame
        if frame_arr.ndim != 3:
            return None
        crop = None
        if person_bbox and len(person_bbox) >= 4:
            crop = extract_patrol_face_crop_bgr(
                frame_arr,
                [float(v) for v in person_bbox[:4]],
            )
        if crop is None and manual_selfie:
            h, w = frame_arr.shape[:2]
            crop = extract_patrol_face_crop_bgr(
                frame_arr,
                [0.0, 0.0, float(w), float(h)],
            )
        if crop is None:
            return None
        return save_draft_face_crop(pers_id, crop, ts=ts)
    except Exception:  # noqa: BLE001
        logger.debug("patrol face crop save skip", exc_info=True)
        return None


def touch_person(pers_id: str, now: float | None = None) -> None:
    ts = now or time.time()
    pid = resolve_alias(pers_id)
    with db.tx() as c:
        c.execute(
            "UPDATE persons SET last_seen = ?,"
            " first_seen = COALESCE(first_seen, ?) WHERE pers_id = ?",
            (ts, ts, pid),
        )


def add_face_angle(
    pers_id: str,
    embedding: Sequence[float],
    *,
    quality: float = 0.0,
    camera_id: str | None = None,
    now: float | None = None,
    frame: Any = None,
    person_bbox: Sequence[float] | None = None,
) -> bool:
    """Bổ sung một góc mặt cho người đã biết. Trả True nếu có lưu thêm.

    Chỉ nhận góc **khác** với những gì đã có. Điều kiện cũ ("rõ hơn hẳn góc tốt
    nhất") gần như không bao giờ đúng — điểm chất lượng nằm quanh 0.86–0.93 nên
    đòi hơn 1,1 lần là bất khả — và hậu quả là mỗi người mãi chỉ có đúng một
    vector. Một vector thì gặp lại ở góc khác là trượt.
    """
    ts = now or time.time()
    pid = resolve_alias(pers_id)

    rows = db.query(
        "SELECT embedding, dim FROM person_faces WHERE pers_id = ?", (pid,)
    )
    if len(rows) >= MAX_FACES_PER_PERSON:
        return False

    probe = np.asarray(embedding, dtype=np.float32).ravel()
    norm = float(np.linalg.norm(probe))
    if norm <= 0:
        return False
    probe = probe / norm

    for r in rows:
        vec = _from_blob(r["embedding"], int(r["dim"]))
        if vec.size == probe.size and float(np.dot(probe, vec)) > FACE_ANGLE_DEDUPE_SIM:
            return False

    image_path = _maybe_save_patrol_face_crop(
        pid,
        camera_id=camera_id,
        frame=frame,
        person_bbox=person_bbox,
        ts=ts,
    )
    add_face(
        pid,
        embedding,
        quality=quality,
        camera_id=camera_id,
        image_path=image_path,
    )
    with db.tx() as c:
        c.execute("UPDATE persons SET last_seen = ? WHERE pers_id = ?", (ts, pid))
    return True


def observe_face(
    embedding: Sequence[float],
    *,
    quality: float = 0.0,
    camera_id: str | None = None,
    now: float | None = None,
    frame: Any = None,
    person_bbox: Sequence[float] | None = None,
    preferred_tk: str | None = None,
) -> tuple[str, bool]:
    """Thấy một khuôn mặt của track **chưa biết là ai** → `(pers_id, vừa tạo)`.

    Chỉ gọi khi một track lần đầu bắt được mặt. Track đã có chủ thì dùng
    `add_face_angle` — xem ghi chú ở `sink.record_observation`.

    `preferred_tk` — tk registry trên ROI: dùng `ensure_draft_for_tk` thay vì
    cấp tk mới qua `allocate_tk_profile`.
    """
    ts = now or time.time()
    matched, _sim = match_face_for_observe(embedding)
    if matched:
        pid = resolve_alias(matched)
        with db.tx() as c:
            c.execute(
                "UPDATE persons SET last_seen = ? WHERE pers_id = ?", (ts, pid)
            )
        add_face_angle(
            pid,
            embedding,
            quality=quality,
            camera_id=camera_id,
            now=ts,
            frame=frame,
            person_bbox=person_bbox,
        )
        pref = (preferred_tk or "").strip()
        if pref:
            bind_tk_profile(pref, pid, now=ts)
        return pid, False

    gallery_pid, _gallery_sim = match_gallery_embedding_for_observe(
        embedding,
        camera_id=camera_id,
    )
    if gallery_pid:
        pid = resolve_alias(gallery_pid)
        with db.tx() as c:
            c.execute(
                "UPDATE persons SET last_seen = ? WHERE pers_id = ?", (ts, pid)
            )
        add_face_angle(
            pid,
            embedding,
            quality=quality,
            camera_id=camera_id,
            now=ts,
            frame=frame,
            person_bbox=person_bbox,
        )
        pref = (preferred_tk or "").strip()
        if pref:
            bind_tk_profile(pref, pid, now=ts)
        return pid, False

    from ..patrol_ids import is_anonymous_track_id, normalize_track_id

    pref = normalize_track_id((preferred_tk or "").strip())
    if pref and is_anonymous_track_id(pref):
        had = lookup_profile_by_tk(pref)
        bound = lookup_bound_profile_for_tk(pref)
        if bound:
            pid = resolve_alias(bound)
            bind_tk_profile(pref, pid, now=ts)
            add_face_angle(
                pid,
                embedding,
                quality=quality,
                camera_id=camera_id,
                now=ts,
                frame=frame,
                person_bbox=person_bbox,
            )
            return pid, False
        pers_id = ensure_draft_for_tk(pref, now=ts)
        bind_tk_profile(pref, pers_id, now=ts)
        add_face_angle(
            pers_id,
            embedding,
            quality=quality,
            camera_id=camera_id,
            now=ts,
            frame=frame,
            person_bbox=person_bbox,
        )
        return pers_id, had is None

    with db.tx() as c:
        pers_id = allocate_tk_profile(origin="camera", now=ts, conn=c)
        image_path = _maybe_save_patrol_face_crop(
            pers_id,
            camera_id=camera_id,
            frame=frame,
            person_bbox=person_bbox,
            ts=ts,
        )
        add_face(
            pers_id,
            embedding,
            quality=quality,
            camera_id=camera_id,
            image_path=image_path,
            conn=c,
        )
    return pers_id, True


def identify(
    pers_id: str,
    *,
    full_name: str,
    employee_code: str,
    contractor: str = "",
    identified_by: str = "",
    now: float | None = None,
) -> dict[str, Any]:
    """Gán tên cho một Người → chuyển sang Định danh, cấp `iden-xxxx`.

    Mã nhân viên đã thuộc về người khác nghĩa là nhận diện đã cấp hai mã cho
    cùng một người — gộp lại thay vì báo lỗi. Đây là tình huống thường gặp chứ
    không phải ngoại lệ: một góc nghiêng thiếu sáng là đủ để tuột ngưỡng khớp.
    """
    ts = now or time.time()
    pid = resolve_alias(pers_id)
    code = (employee_code or "").strip()
    contractor_val = (contractor or "").strip()
    identified_by_val = (identified_by or "").strip()

    existing = db.query_one(
        "SELECT * FROM persons WHERE employee_code = ? AND pers_id <> ?", (code, pid)
    )
    if existing is not None:
        keep = str(existing["pers_id"])
        merge_persons(keep, pid, now=ts)
        pid = keep

    with db.tx() as c:
        row = c.execute("SELECT * FROM persons WHERE pers_id = ?", (pid,)).fetchone()
        if row is None:
            raise KeyError(f"Không có người {pers_id}")

        c.execute(
            "UPDATE persons SET status = ?, full_name = ?,"
            " employee_code = ?, contractor = ?, identified_at = ?, identified_by = ?"
            " WHERE pers_id = ?",
            (
                STATUS_IDENTIFIED,
                full_name.strip(),
                code or None,
                contractor_val or None,
                ts,
                identified_by_val,
                pid,
            ),
        )

    result = get_person(pid)
    assert result is not None
    _sync_gallery_after_identify(pid)
    return result


def update_profile(
    pers_id: str,
    *,
    full_name: str,
    employee_code: str,
    contractor: str = "",
) -> dict[str, Any]:
    """Cập nhật hồ sơ đã import — không đổi mã định danh nội bộ."""
    pid = resolve_alias(pers_id)
    row = get_person(pid)
    if row is None:
        raise KeyError("not_found")

    name = full_name.strip()
    code = employee_code.strip()
    if not name or not code:
        raise ValueError("missing_fields")

    existing = db.query_one(
        "SELECT pers_id FROM persons WHERE employee_code = ? AND pers_id <> ?",
        (code, pid),
    )
    if existing is not None:
        raise ValueError("duplicate_employee_code")

    with db.tx() as c:
        c.execute(
            "UPDATE persons SET full_name = ?, employee_code = ?, contractor = ?"
            " WHERE pers_id = ?",
            (name, code, contractor.strip(), pid),
        )

    result = get_person(pid)
    assert result is not None
    return result


def delete_person(pers_id: str) -> bool:
    """Xóa hồ sơ và vector khuôn mặt (CASCADE)."""
    pid = resolve_alias(pers_id)
    person = get_person(pid)
    with db.tx() as c:
        cur = c.execute("DELETE FROM persons WHERE pers_id = ?", (pid,))
        deleted = cur.rowcount > 0
    if deleted:
        _invalidate_face_index()
        if person is not None:
            _purge_person_gallery_assets(person)
    return deleted


def _purge_person_gallery_assets(person: dict[str, Any]) -> None:
    """Gỡ gallery JPG + binding khi xóa hồ sơ định danh."""
    code = str(person.get("employee_code") or "").strip()
    if not code:
        return
    try:
        from ..patrol_identity_lifecycle import revoke_gallery_worker
        from ..patrol_identity_store import (
            lookup_patrol_identity,
            patrol_gallery_worker_id,
            unbind_patrol_identity,
        )
        from ..person_identity_registry import purge_gallery_worker_from_registry
        from .enroll_images import remove_gallery_worker_faces
        from ..worker_identity.gallery import remove_gallery_worker_registry
        from ..worker_identity.recognizer import reload_gallery

        wid = patrol_gallery_worker_id(code)
        binding = lookup_patrol_identity(wid) or {}
        aliases = [str(a).strip() for a in (binding.get("aliases") or []) if str(a).strip()]
        if wid not in aliases:
            aliases.append(wid)
        pers_id = str(person.get("pers_id") or "").strip()
        if pers_id and pers_id not in aliases:
            aliases.append(pers_id)

        purge_gallery_worker_from_registry(wid, aliases)
        revoke_gallery_worker(wid, aliases)
        remove_gallery_worker_faces(wid)
        remove_gallery_worker_registry(wid)
        unbind_patrol_identity(wid)
        reload_gallery()
    except Exception:  # noqa: BLE001
        logger.warning("gallery purge skipped for %s", person.get("pers_id"), exc_info=True)


def merge_persons(keep_id: str, drop_id: str, *, now: float | None = None) -> None:
    """Gộp hai mã của cùng một người. Mã bị bỏ vẫn tra ra được qua alias."""
    ts = now or time.time()
    keep = resolve_alias(keep_id)
    drop = resolve_alias(drop_id)
    if keep == drop:
        return

    with db.tx() as c:
        # Khuôn mặt dồn hết về một mối — càng nhiều góc càng nhận chắc.
        c.execute("UPDATE person_faces SET pers_id = ? WHERE pers_id = ?", (keep, drop))

        # Thẻ trùng ngày phải gộp chứ không thể dời: khoá chính chặn.
        dup_dates = [
            r["event_date"]
            for r in c.execute(
                "SELECT d.event_date FROM daily_events d"
                " WHERE d.pers_id = ? AND EXISTS ("
                "   SELECT 1 FROM daily_events k"
                "   WHERE k.pers_id = ? AND k.event_date = d.event_date)",
                (drop, keep),
            ).fetchall()
        ]
        for date in dup_dates:
            c.execute(
                "UPDATE daily_events SET"
                "  first_seen = MIN(first_seen, (SELECT first_seen FROM daily_events"
                "     WHERE pers_id = ? AND event_date = ?)),"
                "  last_seen  = MAX(last_seen,  (SELECT last_seen FROM daily_events"
                "     WHERE pers_id = ? AND event_date = ?))"
                " WHERE pers_id = ? AND event_date = ?",
                (drop, date, drop, date, keep, date),
            )
            c.execute(
                "DELETE FROM daily_events WHERE pers_id = ? AND event_date = ?",
                (drop, date),
            )
        c.execute("UPDATE daily_events SET pers_id = ? WHERE pers_id = ?", (keep, drop))
        c.execute(
            "UPDATE appearances SET subject_id = ? WHERE subject_id = ?", (keep, drop)
        )

        keep_row = c.execute(
            "SELECT first_seen, last_seen FROM persons WHERE pers_id = ?", (keep,)
        ).fetchone()
        drop_row = c.execute(
            "SELECT first_seen, last_seen FROM persons WHERE pers_id = ?", (drop,)
        ).fetchone()
        if keep_row and drop_row:
            firsts = [v for v in (keep_row["first_seen"], drop_row["first_seen"]) if v]
            lasts = [v for v in (keep_row["last_seen"], drop_row["last_seen"]) if v]
            c.execute(
                "UPDATE persons SET first_seen = ?, last_seen = ? WHERE pers_id = ?",
                (min(firsts) if firsts else ts, max(lasts) if lasts else ts, keep),
            )

        c.execute("UPDATE person_aliases SET pers_id = ? WHERE pers_id = ?", (keep, drop))
        c.execute("DELETE FROM persons WHERE pers_id = ?", (drop,))
        c.execute(
            "INSERT OR REPLACE INTO person_aliases(old_pers_id, pers_id, merged_at)"
            " VALUES(?,?,?)",
            (drop, keep, ts),
        )
    _invalidate_face_index()
    from .daystore import coalesce_subject_appearances, renumber_presence_seq

    for row in db.query(
        "SELECT DISTINCT event_date FROM appearances WHERE subject_id = ?",
        (keep,),
    ):
        date = str(row["event_date"])
        coalesce_subject_appearances(keep, date)
        # Hai người gộp lại thì hai chuỗi "lượt 1, 2, 3..." dồn vào một subject.
        # Đánh số sau khi coalesce xong, không phải trước.
        renumber_presence_seq(keep, date)


def import_identity(
    *,
    full_name: str,
    employee_code: str,
    contractor: str = "",
    embedding: Sequence[float] | None = None,
    image_path: str | None = None,
    source: str = "excel",
    now: float | None = None,
) -> dict[str, Any]:
    """Nhập hồ sơ có sẵn (Excel / trang quét mặt) — chưa từng gặp ngoài hiện trường.

    `first_seen` để trống cho tới lần camera thấy thật. Chạy lại cùng file thì
    cập nhật tại chỗ nhờ `employee_code` là khoá duy nhất.
    """
    ts = now or time.time()
    code = employee_code.strip()
    from ..patrol_identity_store import patrol_gallery_worker_id

    gallery_id = patrol_gallery_worker_id(code)
    existing = db.query_one(
        "SELECT * FROM persons WHERE employee_code = ? OR pers_id = ?",
        (code, gallery_id),
    )

    with db.tx() as c:
        if existing is None:
            pers_id = gallery_id
            c.execute(
                "INSERT INTO persons(pers_id, status, full_name,"
                " employee_code, contractor, origin, identified_at, created_at)"
                " VALUES(?,?,?,?,?,?,?,?)",
                (
                    pers_id,
                    STATUS_IDENTIFIED,
                    full_name.strip(),
                    code or None,
                    contractor.strip(),
                    source,
                    ts,
                    ts,
                ),
            )
        else:
            pers_id = str(existing["pers_id"])
            c.execute(
                "UPDATE persons SET full_name = ?, contractor = ? WHERE pers_id = ?",
                (full_name.strip(), contractor.strip(), pers_id),
            )

        if embedding is not None:
            add_face(
                pers_id,
                embedding,
                quality=1.0,
                source=source,
                image_path=image_path,
                conn=c,
            )

    result = get_person(pers_id)
    assert result is not None
    if result.get("status") == STATUS_IDENTIFIED:
        _sync_gallery_after_identify(pers_id)
    return result


# ---------------------------------------------------------------------------
# Phiên quét mặt tự phục vụ — quét trước, nhập hồ sơ (Excel fields) sau.


ENROLL_SESSION_TTL_SEC = 3600.0


def _purge_expired_enroll_sessions(now: float | None = None) -> None:
    ts = now or time.time()
    with db.tx() as c:
        c.execute("DELETE FROM enroll_sessions WHERE expires_at <= ?", (ts,))


def create_enroll_session(now: float | None = None) -> str:
    import uuid

    _purge_expired_enroll_sessions(now)
    ts = now or time.time()
    session_id = uuid.uuid4().hex
    with db.tx() as c:
        c.execute(
            "INSERT INTO enroll_sessions(session_id, created_at, expires_at)"
            " VALUES(?,?,?)",
            (session_id, ts, ts + ENROLL_SESSION_TTL_SEC),
        )
    return session_id


def _get_enroll_session_row(session_id: str, now: float | None = None) -> dict[str, Any] | None:
    _purge_expired_enroll_sessions(now)
    row = db.query_one(
        "SELECT * FROM enroll_sessions WHERE session_id = ?",
        (session_id.strip(),),
    )
    if row is None:
        return None
    ts = now or time.time()
    if float(row["expires_at"]) <= ts:
        with db.tx() as c:
            c.execute("DELETE FROM enroll_sessions WHERE session_id = ?", (session_id,))
        return None
    return dict(row)


def get_enroll_session_enrollment(session_id: str) -> dict[str, Any] | None:
    if _get_enroll_session_row(session_id) is None:
        return None
    rows = db.query(
        "SELECT slot FROM enroll_session_faces WHERE session_id = ? ORDER BY slot ASC",
        (session_id.strip(),),
    )
    captured_slots = {int(r["slot"]) for r in rows}
    count = len(captured_slots)
    poses = _build_scan_poses(count)
    return {
        "session_id": session_id.strip(),
        "faces_captured": count,
        "faces_required": SCAN_FACES_REQUIRED,
        "complete": count >= SCAN_FACES_REQUIRED,
        "poses": poses,
        "face_records": count,
    }


def add_enroll_session_face(
    session_id: str,
    embedding: Sequence[float],
    *,
    pose_slot: int | None = None,
    now: float | None = None,
) -> bool:
    if _get_enroll_session_row(session_id, now) is None:
        return False

    probe = np.asarray(embedding, dtype=np.float32).ravel()
    norm = float(np.linalg.norm(probe))
    if norm <= 0:
        return False
    probe = probe / norm

    sid = session_id.strip()
    rows = db.query(
        "SELECT slot, embedding, dim FROM enroll_session_faces WHERE session_id = ?",
        (sid,),
    )
    for r in rows:
        vec = _from_blob(r["embedding"], int(r["dim"]))
        if vec.size == probe.size and float(np.dot(probe, vec)) > FACE_ANGLE_DEDUPE_SIM:
            return False

    slot = int(pose_slot or (len(rows) + 1))
    if slot < 1 or slot > SCAN_POSE_SLOTS:
        return False

    blob, dim = _to_blob(probe)
    ts = now or time.time()
    with db.tx() as c:
        c.execute(
            "INSERT INTO enroll_session_faces(session_id, slot, embedding, dim, quality, created_at)"
            " VALUES(?,?,?,?,?,?)"
            " ON CONFLICT(session_id, slot) DO UPDATE SET"
            " embedding=excluded.embedding, dim=excluded.dim, quality=excluded.quality,"
            " created_at=excluded.created_at",
            (sid, slot, blob, dim, 1.0, ts),
        )
        c.execute(
            "UPDATE enroll_sessions SET expires_at = ? WHERE session_id = ?",
            (ts + ENROLL_SESSION_TTL_SEC, sid),
        )
    return True


def complete_enroll_session(
    session_id: str,
    *,
    full_name: str,
    employee_code: str,
    contractor: str = "",
    now: float | None = None,
) -> dict[str, Any]:
    """Gắn vector phiên quét vào hồ sơ — cùng schema import Excel."""
    if _get_enroll_session_row(session_id, now) is None:
        raise ValueError("session_not_found")

    enrollment = get_enroll_session_enrollment(session_id)
    if enrollment is None or not enrollment["complete"]:
        raise ValueError("incomplete_enrollment")

    sid = session_id.strip()
    face_rows = db.query(
        "SELECT embedding, dim FROM enroll_session_faces"
        " WHERE session_id = ? ORDER BY slot ASC",
        (sid,),
    )
    if len(face_rows) < SCAN_FACES_REQUIRED:
        raise ValueError("incomplete_enrollment")

    row = import_identity(
        full_name=full_name,
        employee_code=employee_code,
        contractor=contractor,
        embedding=None,
        source="self_enroll",
        now=now,
    )
    pers_id = str(row["pers_id"])
    _apply_enroll_session_vectors(
        pers_id,
        sid,
        camera_id="SELF_ENROLL",
        now=now,
    )
    from ..patrol_identity_store import patrol_gallery_worker_id

    _promote_enroll_session_front_jpg(
        sid,
        gallery_worker_id=patrol_gallery_worker_id(employee_code),
        worker_name=full_name,
        employee_code=employee_code,
        contractor_name=contractor or None,
    )

    with db.tx() as c:
        c.execute("DELETE FROM enroll_sessions WHERE session_id = ?", (sid,))

    result = get_person(pers_id)
    assert result is not None
    _sync_gallery_after_identify(pers_id)
    return result
