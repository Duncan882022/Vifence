"""Cầu nối luồng AI → SQLite tuần tra.

Luồng phân tích gọi `record_observation` mỗi khi phát hiện một người trong
khung. **Chưa ghi thẻ ngay** — phải bám track đủ vài giây (`patrol_object_confirm_seconds`
cho Đối tượng / `patrol_person_confirm_seconds` khi `face_eligible`) rồi mới chốt SQLite.
Chỉ thăng Người khi analyzer đã đánh dấu `face_eligible`; sink không tự recover embedding.
Sau đó quyết định Đối tượng (chưa thấy mặt) hay Người/Định danh (có khuôn mặt),
rồi ghi thẻ sự kiện và lịch sử xuất hiện.

Tách khỏi `ppe_engine` có chủ ý: engine kia lo vòng đời sự kiện ATLĐ, còn đây
là mô hình nghiệp vụ của Module 05. Trộn hai thứ vào nhau chính là cái đã làm
Module 05 rối tới mức phải viết lại.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from . import daystore, db, identity

SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"

_SNAPSHOT_WRITE_LOCK = threading.Lock()
_last_snapshot_write: dict[str, tuple[float, float]] = {}


def _maybe_write_snapshot(
    subject_id: str,
    frame: Any,
    bbox: Sequence[float],
    *,
    score: float = 0.0,
    tier: str | None = None,
    worker_id: str | None = None,
    worker_name: str | None = None,
    capture_ts: float | None = None,
) -> str | None:
    """Ghi file JPG — tối đa mỗi TOUCH_MIN_INTERVAL_SEC, trừ khi ảnh rõ hơn."""
    ts = float(capture_ts if capture_ts is not None else time.time())
    with _SNAPSHOT_WRITE_LOCK:
        last = _last_snapshot_write.get(subject_id)
        if last is not None:
            last_ts, last_score = last
            if score <= last_score and (ts - last_ts) < daystore.TOUCH_MIN_INTERVAL_SEC:
                return None
        _last_snapshot_write[subject_id] = (ts, max(score, last[1] if last else 0.0))
    return _write_snapshot(
        subject_id,
        frame,
        bbox,
        tier=tier,
        worker_id=worker_id,
        worker_name=worker_name,
        capture_ts=ts,
    )


def snapshot_score(*, face_quality: float, confidence: float) -> float:
    """Ảnh nào đáng giữ hơn.

    Thấy mặt là quan trọng hơn hẳn độ chắc của YOLO: thẻ sự kiện tồn tại để
    người trực **nhận ra ai**, mà một tấm lưng rõ nét thì không giúp được gì.
    """
    return float(face_quality) * 2.0 + float(confidence)


# BGR — đồng bộ PATROL_TIER_TOKENS heatmapDotHex trên FE (slate / sky / violet).
PATROL_SNAPSHOT_TIER_COLORS_BGR: dict[str, tuple[int, int, int]] = {
    "object": (184, 163, 148),   # slate-400 #94a3b8
    "person": (248, 189, 56),    # sky-400 #38bdf8
    "identity": (250, 139, 167), # violet-400 #a78bfa
}


def _snapshot_tier(subject_id: str) -> str:
    if subject_id.startswith("obj-"):
        return "object"
    person = identity.get_person(subject_id)
    if person and person.get("status") == identity.STATUS_IDENTIFIED:
        return "identity"
    return "person"


def _resolve_snapshot_tier(
    subject_id: str,
    *,
    tier: str | None = None,
    worker_id: str | None = None,
) -> str:
    """Ưu tiên lifecycle tier (ROI live) — không suy lại từ SQLite khi đã có."""
    if subject_id.startswith("obj-"):
        return "object"
    explicit = (tier or "").strip()
    if explicit in PATROL_SNAPSHOT_TIER_COLORS_BGR:
        return explicit
    from ..patrol_entity import patrol_tier_label

    return patrol_tier_label(worker_id or subject_id)


def _write_snapshot(
    subject_id: str,
    frame: Any,
    bbox: Sequence[float],
    *,
    tier: str | None = None,
    worker_id: str | None = None,
    worker_name: str | None = None,
    capture_ts: float | None = None,
) -> str | None:
    """Full-frame JPG + khung ROI tuần tra — đồng bộ overlay live & popup."""
    try:
        import cv2
        import numpy as np

        from ..patrol_entity import resolve_patrol_worker_display_name
        from ..snapshot_compose import draw_dashed_rectangle, draw_snapshot_roi_badge

        if frame is None or not isinstance(frame, np.ndarray):
            return None
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = (int(v) for v in bbox[:4])
        pad_x = int((x2 - x1) * 0.04)
        pad_y = int((y2 - y1) * 0.04)
        bx1 = max(0, x1 - pad_x)
        by1 = max(0, y1 - pad_y)
        bx2 = min(w, x2 + pad_x)
        by2 = min(h, y2 + pad_y)
        if bx2 - bx1 < 16 or by2 - by1 < 16:
            return None

        out = frame.copy()
        resolved_tier = _resolve_snapshot_tier(
            subject_id,
            tier=tier,
            worker_id=worker_id,
        )
        color = PATROL_SNAPSHOT_TIER_COLORS_BGR[resolved_tier]
        if resolved_tier == "object":
            draw_dashed_rectangle(out, (bx1, by1), (bx2, by2), color, thickness=1)
        else:
            cv2.rectangle(out, (bx1, by1), (bx2, by2), color, 2, cv2.LINE_AA)

        person = identity.get_person(subject_id) if subject_id.startswith("pers-") else None
        wid = (worker_id or "").strip()
        if resolved_tier == "object":
            badge_worker_id = None
            badge_worker_name = None
            badge_object_id = subject_id
        elif resolved_tier == "identity":
            badge_worker_id = wid or subject_id
            badge_worker_name = resolve_patrol_worker_display_name(
                badge_worker_id,
                worker_name or (identity.display_name(person) if person else None),
            )
            badge_object_id = subject_id
        else:
            badge_worker_id = wid or subject_id
            badge_worker_name = None
            badge_object_id = subject_id

        draw_snapshot_roi_badge(
            out,
            bx1,
            by1,
            bx2,
            by2,
            color,
            scenario_id=None,
            confidence=0.9,
            behavior="person",
            worker_id=badge_worker_id,
            worker_name=badge_worker_name,
            object_id=badge_object_id,
        )

        max_side = 1280
        fh, fw = out.shape[:2]
        if max(fh, fw) > max_side:
            scale = max_side / max(fh, fw)
            out = cv2.resize(out, (int(fw * scale), int(fh * scale)), interpolation=cv2.INTER_AREA)

        ts = float(capture_ts if capture_ts is not None else time.time())
        date = db.today_vn(ts)
        folder = SNAPSHOT_DIR / date
        folder.mkdir(parents=True, exist_ok=True)
        # Mỗi lần chụp một file — lịch sử popup đổi ảnh theo lượt xuất hiện.
        stamp = int(ts * 1000)
        name = f"{subject_id}-{stamp}.jpg"
        cv2.imwrite(str(folder / name), out, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        return f"{date}/{name}"
    except Exception:  # noqa: BLE001
        return None


def resolve_snapshot_path(relative: str) -> Path | None:
    """Đường dẫn tuyệt đối của ảnh, chặn thoát ra ngoài thư mục ảnh."""
    rel = (relative or "").strip().lstrip("/")
    if not rel or ".." in rel:
        return None
    full = (SNAPSHOT_DIR / rel).resolve()
    try:
        full.relative_to(SNAPSHOT_DIR.resolve())
    except ValueError:
        return None
    return full if full.is_file() else None

# Track của tracker chỉ sống trong phiên và được đánh lại số sau mỗi lần khởi
# động, nên không lưu xuống đĩa. Hai map này chỉ để biết một track đang được
# đại diện bởi Đối tượng nào, hoặc đã thăng lên Người nào.
# Ngưỡng chất lượng mặt — dưới đây coi là chưa đủ mặt cho tab Đối tượng.
_OBJECT_FACE_QUALITY_MAX = 0.2
# Track ByteTrack mất dấu ~5s rồi cấp id mới — cùng người đứng yên bị đếm 2 lần
# nếu không tái dùng thẻ Đối tượng theo vị trí trên cùng camera.
_STALE_OBJECT_SEC = 12.0
_STALE_IOU_MIN = 0.30
# Định danh đã biết — vươn vai / đổi tư thế làm bbox lệch nhiều; nới IoU + cửa sổ.
_STALE_IDENTIFIED_SEC = 30.0
_STALE_IDENTIFIED_IOU_MIN = 0.12
_track_to_object: dict[str, str] = {}
_track_to_person: dict[str, str] = {}
_sgc_to_person: dict[str, str] = {}
_track_bbox: dict[str, tuple[float, float, float, float]] = {}
_lock = threading.Lock()


@dataclass
class _TrackWatch:
    first_seen: float
    confirmed: bool = False


@dataclass
class _StaleSlot:
    subject_id: str
    bbox: tuple[float, float, float, float] | None
    last_seen: float


# Theo dõi thời gian bám track trước khi ghi thẻ — tránh log cảnh thoáng qua.
_track_watch: dict[str, _TrackWatch] = {}
# Track vừa mất, chờ track mới cùng vị trí nhận lại — tách Người / Đối tượng
# để nhóm lẫn mặt và lưng không nuốt nhau.
_stale_objects: dict[str, list[_StaleSlot]] = {}
_stale_persons: dict[str, list[_StaleSlot]] = {}


def _key(camera_id: str, track_id: str) -> str:
    return f"{camera_id}|{track_id}"


def _track_is_committed(key: str) -> bool:
    with _lock:
        return key in _track_to_object or key in _track_to_person


def _required_confirm_seconds(*, has_face: bool) -> float:
    from ..config import settings

    if has_face:
        return float(settings.patrol_person_confirm_seconds)
    return float(settings.patrol_object_confirm_seconds)


def _face_commits_person_tier(
    *,
    face_eligible: bool,
    face_embedding: Sequence[float] | None,
) -> bool:
    """Chỉ lên tab Người khi pipeline face đã pass eligible — không suy từ embedding lẻ."""
    if not face_eligible:
        return False
    return face_embedding is not None and len(face_embedding) > 0


def _gate_observation_commit(
    key: str,
    *,
    has_face: bool,
    now: float,
) -> tuple[bool, float]:
    """Chỉ cho ghi SQLite sau khi bám track đủ giây. Trả (ok, mốc first_seen)."""
    if _track_is_committed(key):
        return True, now

    with _lock:
        watch = _track_watch.get(key)
        if watch is None:
            watch = _TrackWatch(first_seen=now)
            _track_watch[key] = watch
        elif watch.confirmed:
            return True, now

        if now - watch.first_seen < _required_confirm_seconds(has_face=has_face):
            return False, now

        watch.confirmed = True
        return True, watch.first_seen


def _as_bbox(person_bbox: Sequence[float] | None) -> tuple[float, float, float, float] | None:
    if person_bbox is None or len(person_bbox) < 4:
        return None
    return (
        float(person_bbox[0]),
        float(person_bbox[1]),
        float(person_bbox[2]),
        float(person_bbox[3]),
    )


def _bbox_iou(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _note_track_bbox(key: str, person_bbox: Sequence[float] | None) -> None:
    box = _as_bbox(person_bbox)
    if box is None:
        return
    with _lock:
        _track_bbox[key] = box


def _live_object_ids() -> set[str]:
    return set(_track_to_object.values())


def _live_person_ids() -> set[str]:
    return set(_track_to_person.values())


def _reuse_stale_slot(
    store: dict[str, list[_StaleSlot]],
    camera_id: str,
    person_bbox: Sequence[float] | None,
    now: float,
    live_ids: set[str],
) -> str | None:
    """Track mới cùng camera, cùng chỗ → nhận lại thẻ cũ cùng tầng."""
    box = _as_bbox(person_bbox)
    if box is None:
        return None
    slots = store.get(camera_id) or []
    kept: list[_StaleSlot] = []
    best: _StaleSlot | None = None
    best_iou = _STALE_IOU_MIN
    for slot in slots:
        if now - slot.last_seen > _STALE_OBJECT_SEC:
            continue
        if slot.subject_id in live_ids:
            continue
        if slot.bbox is None:
            kept.append(slot)
            continue
        iou = _bbox_iou(box, slot.bbox)
        if iou >= best_iou:
            if best is not None:
                kept.append(best)
            best = slot
            best_iou = iou
        else:
            kept.append(slot)
    if best is not None:
        store[camera_id] = kept
        return best.subject_id
    store[camera_id] = kept
    return None


def _reuse_stale_object(
    camera_id: str,
    person_bbox: Sequence[float] | None,
    now: float,
) -> str | None:
    with _lock:
        return _reuse_stale_slot(
            _stale_objects, camera_id, person_bbox, now, _live_object_ids(),
        )


def _reuse_stale_person(
    camera_id: str,
    person_bbox: Sequence[float] | None,
    now: float,
) -> str | None:
    with _lock:
        reused = _reuse_stale_slot(
            _stale_persons, camera_id, person_bbox, now, _live_person_ids(),
        )
    if reused:
        return reused
    return _reuse_stale_identified_person(camera_id, person_bbox, now)


def _reuse_stale_identified_person(
    camera_id: str,
    person_bbox: Sequence[float] | None,
    now: float,
) -> str | None:
    """Posture change — bbox lệch; hồ sơ đã định danh vẫn gộp, không đẻ pers mới."""
    box = _as_bbox(person_bbox)
    if box is None:
        return None
    with _lock:
        slots = list(_stale_persons.get(camera_id) or [])
        live_ids = _live_person_ids()
    best_id: str | None = None
    best_iou = _STALE_IDENTIFIED_IOU_MIN
    for slot in slots:
        if now - slot.last_seen > _STALE_IDENTIFIED_SEC:
            continue
        if slot.subject_id in live_ids:
            continue
        person = identity.get_person(slot.subject_id)
        if not person or person.get("status") != identity.STATUS_IDENTIFIED:
            continue
        if slot.bbox is None:
            continue
        iou = _bbox_iou(box, slot.bbox)
        if iou >= best_iou:
            best_id = slot.subject_id
            best_iou = iou
    return best_id


def _stash_stale(
    store: dict[str, list[_StaleSlot]],
    camera_id: str,
    subject_id: str,
    bbox: tuple[float, float, float, float] | None,
    ts: float,
) -> None:
    slots = store.setdefault(camera_id, [])
    slots.append(_StaleSlot(subject_id=subject_id, bbox=bbox, last_seen=ts))
    if len(slots) > 24:
        del slots[:-24]


def _resolve_observation_gps(
    camera_id: str,
    *,
    at_ts: float | None = None,
) -> tuple[float, float]:
    from ..patrol_gps_sim import resolve_patrol_observation_gps

    return resolve_patrol_observation_gps(camera_id, at_ts=at_ts)


def _apply_gallery_identity_to_pers(
    pers_id: str,
    lifecycle_worker_id: str | None,
    worker_name: str | None = None,
    *,
    lifecycle_tier: str | None = None,
    now: float | None = None,
) -> None:
    """Gallery match (p-DUNCAN, …) → SQLite persons.status = identified."""
    from ..patrol_entity import is_patrol_gallery_id, resolve_patrol_gallery_id_for_worker

    wid = (lifecycle_worker_id or "").strip()
    gallery = wid if is_patrol_gallery_id(wid) else resolve_patrol_gallery_id_for_worker(wid)
    if not gallery:
        return

    pid = identity.resolve_alias(pers_id)
    person = identity.get_person(pid)
    if person is None or person.get("status") == identity.STATUS_IDENTIFIED:
        return

    try:
        from ..patrol_identity_store import lookup_patrol_identity

        row = lookup_patrol_identity(gallery) or {}
    except Exception:
        row = {}

    full_name = (worker_name or row.get("worker_name") or gallery).strip()
    employee_code = str(row.get("employee_code") or "").strip()
    if not employee_code and gallery.lower().startswith("p-"):
        employee_code = gallery[2:].strip()
    if not employee_code:
        employee_code = gallery
    contractor = str(row.get("contractor_name") or "").strip()

    identity.identify(
        pid,
        full_name=full_name,
        employee_code=employee_code,
        contractor=contractor,
        identified_by="gallery_match",
        now=now,
    )


def _bind_sgc_to_person(sgc_id: str, pers_id: str) -> None:
    sgc = (sgc_id or "").strip().lower()
    pid = identity.resolve_alias((pers_id or "").strip())
    if not sgc or not pid.startswith("pers-"):
        return
    with _lock:
        _sgc_to_person[sgc] = pid


def _ensure_pers_for_sgc(sgc_id: str, *, now: float) -> str:
    sgc = (sgc_id or "").strip().lower()
    with _lock:
        existing = _sgc_to_person.get(sgc)
    if existing:
        return identity.resolve_alias(existing)
    pers_id = identity.create_person(origin="sgc", now=now)
    _bind_sgc_to_person(sgc, pers_id)
    return pers_id


def _pers_id_for_lifecycle(
    lifecycle_tier: str | None,
    lifecycle_worker_id: str | None,
    *,
    now: float,
) -> str | None:
    """Map tier/worker_id từ ROI lifecycle → pers-* cho thẻ sự kiện."""
    tier = (lifecycle_tier or "").strip()
    wid = (lifecycle_worker_id or "").strip()
    if not tier or not wid:
        return None

    from ..patrol_identity_lifecycle import TIER_IDENTITY, TIER_PERSON
    from ..patrol_entity import (
        is_patrol_gallery_id,
        is_patrol_iden_id,
        is_patrol_pers_id,
        resolve_patrol_gallery_id_for_worker,
    )
    from ..person_identity_registry import is_sgc_worker_id

    if tier not in (TIER_PERSON, TIER_IDENTITY):
        return None

    if is_patrol_pers_id(wid):
        return identity.resolve_alias(wid) if identity.get_person(wid) else None

    if is_patrol_iden_id(wid):
        row = db.query_one("SELECT pers_id FROM persons WHERE iden_code = ?", (wid,))
        return str(row["pers_id"]) if row else None

    gallery = wid if is_patrol_gallery_id(wid) else resolve_patrol_gallery_id_for_worker(wid)
    if gallery:
        from ..patrol_identity_store import lookup_patrol_identity

        row = lookup_patrol_identity(gallery)
        if row:
            emp = str(row.get("employee_code") or "").strip()
            if emp:
                found = identity.find_by_employee_code(emp)
                if found:
                    return str(found["pers_id"])

    if is_sgc_worker_id(wid):
        return _ensure_pers_for_sgc(wid, now=now)

    return None


def _commit_lifecycle_person_event(
    key: str,
    *,
    pers_id: str,
    camera_id: str,
    zone_id: str | None,
    frame: Any,
    person_bbox: Sequence[float] | None,
    score: float,
    ts: float,
    anchor_ts: float,
    seen_since: float | None = None,
    face_eligible: bool = False,
    lifecycle_tier: str | None = None,
    lifecycle_worker_id: str | None = None,
    worker_name: str | None = None,
) -> str:
    pid = identity.resolve_alias(pers_id)
    with _lock:
        obj_id = _track_to_object.pop(key, None)
        _track_to_person[key] = pid
    if obj_id:
        daystore.promote_object(obj_id, pid, now=anchor_ts)
    _apply_gallery_identity_to_pers(
        pid,
        lifecycle_worker_id,
        worker_name=worker_name,
        lifecycle_tier=lifecycle_tier,
        now=ts,
    )
    path: str | None = None
    shot_score = 0.0
    if face_eligible and frame is not None and person_bbox is not None:
        path = _maybe_write_snapshot(
            pid,
            frame,
            person_bbox,
            score=score,
            tier=lifecycle_tier,
            worker_id=lifecycle_worker_id,
            capture_ts=ts,
        )
        shot_score = score if path else 0.0
    gps_lat, gps_lng = _resolve_observation_gps(camera_id, at_ts=ts)
    daystore.touch_person_event(
        pid,
        camera_id=camera_id,
        zone_id=zone_id,
        snapshot_path=path,
        snapshot_score=shot_score,
        face_eligible=face_eligible,
        now=ts,
        seen_since=seen_since if seen_since is not None else anchor_ts,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
    )
    return pid


def record_observation(
    *,
    camera_id: str,
    track_id: str,
    face_embedding: Sequence[float] | None = None,
    face_quality: float = 0.0,
    face_eligible: bool = False,
    confidence: float = 0.0,
    frame: Any = None,
    person_bbox: Sequence[float] | None = None,
    zone_id: str | None = None,
    now: float | None = None,
    density_only: bool = False,
    lifecycle_tier: str | None = None,
    lifecycle_worker_id: str | None = None,
    worker_name: str | None = None,
    touched_object_id: str | None = None,
) -> str | None:
    """Ghi một lần quan sát. Trả `pers-*` nếu đã nhận ra (mặt hoặc lifecycle ROI).

    Khi ``PATROL_USE_AGGREGATOR=1``: delegate sang ``aggregator.engine`` (buffer
    theo track, identity ∥ behavior). Ngược lại giữ cây if/else legacy bên dưới.
    """
    from ..config import settings

    if settings.patrol_use_aggregator:
        from .aggregator.engine import ingest_observation

        return ingest_observation(
            camera_id=camera_id,
            track_id=track_id,
            face_embedding=face_embedding,
            face_quality=face_quality,
            face_eligible=face_eligible,
            confidence=confidence,
            frame=frame,
            person_bbox=person_bbox,
            zone_id=zone_id,
            now=now,
            density_only=density_only,
            lifecycle_tier=lifecycle_tier,
            lifecycle_worker_id=lifecycle_worker_id,
            worker_name=worker_name,
            touched_object_id=touched_object_id,
        )

    return _record_observation_legacy(
        camera_id=camera_id,
        track_id=track_id,
        face_embedding=face_embedding,
        face_quality=face_quality,
        face_eligible=face_eligible,
        confidence=confidence,
        frame=frame,
        person_bbox=person_bbox,
        zone_id=zone_id,
        now=now,
        density_only=density_only,
        lifecycle_tier=lifecycle_tier,
        lifecycle_worker_id=lifecycle_worker_id,
        worker_name=worker_name,
    )


def _record_observation_legacy(
    *,
    camera_id: str,
    track_id: str,
    face_embedding: Sequence[float] | None = None,
    face_quality: float = 0.0,
    face_eligible: bool = False,
    confidence: float = 0.0,
    frame: Any = None,
    person_bbox: Sequence[float] | None = None,
    zone_id: str | None = None,
    now: float | None = None,
    density_only: bool = False,
    lifecycle_tier: str | None = None,
    lifecycle_worker_id: str | None = None,
    worker_name: str | None = None,
) -> str | None:
    """Luồng ghi sự kiện legacy — sequential if/else."""
    if not camera_id or not track_id:
        return None

    key = _key(camera_id, track_id)
    ts = float(now if now is not None else time.time())
    _note_track_bbox(key, person_bbox)

    score = snapshot_score(face_quality=face_quality, confidence=confidence)
    gps_lat, gps_lng = _resolve_observation_gps(camera_id, at_ts=ts)

    def _shot(
        subject_id: str,
        *,
        tier: str | None = None,
        worker_id: str | None = None,
        worker_name: str | None = None,
    ) -> tuple[str | None, float]:
        if frame is None or person_bbox is None:
            return None, 0.0
        path = _maybe_write_snapshot(
            subject_id,
            frame,
            person_bbox,
            score=score,
            tier=tier or lifecycle_tier,
            worker_id=worker_id or lifecycle_worker_id,
            worker_name=worker_name,
            capture_ts=ts,
        )
        return path, score if path else 0.0

    def _person_touch(
        pers_id: str,
        *,
        seen_since: float | None = None,
        with_snapshot: bool = True,
    ) -> None:
        _apply_gallery_identity_to_pers(
            pers_id,
            lifecycle_worker_id,
            worker_name,
            lifecycle_tier=lifecycle_tier,
            now=ts,
        )
        path, shot_score = (None, 0.0)
        if with_snapshot and face_eligible:
            from ..patrol_entity import patrol_tier_label

            snap_tier = lifecycle_tier or patrol_tier_label(lifecycle_worker_id or pers_id)
            path, shot_score = _shot(
                pers_id,
                tier=snap_tier,
                worker_id=lifecycle_worker_id or pers_id,
            )
        daystore.touch_person_event(
            pers_id,
            camera_id=camera_id,
            zone_id=zone_id,
            snapshot_path=path,
            snapshot_score=shot_score,
            face_eligible=face_eligible,
            now=ts,
            seen_since=seen_since,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
        )

    if _face_commits_person_tier(face_eligible=face_eligible, face_embedding=face_embedding):
        # Trong một track, danh tính chỉ được quyết **một lần**.
        #
        # Tracker đã bảo đảm đây vẫn là người lúc nãy; chạy lại so khớp mỗi
        # khung hình ở 6 FPS chỉ tạo thêm cơ hội hụt ngưỡng, mà hụt một lần là
        # đẻ ra một mã mới cho chính người đang đứng đó. Đúng cách đã sinh ra
        # pers-0001 tới pers-0011 cho cùng một người.
        bound = _known_person_for_track(key)
        if not bound:
            ok, anchor_ts = _gate_observation_commit(key, has_face=True, now=ts)
            if not ok:
                return None
        else:
            anchor_ts = ts

        if bound:
            pers_id = bound
            # Góc mặt mới của người đã biết là thứ quý nhất: lần sau gặp lại
            # bằng track khác sẽ có nhiều góc để đối chiếu.
            identity.add_face_angle(
                pers_id, face_embedding, quality=face_quality, camera_id=camera_id
            )
        else:
            with _lock:
                obj_id = _track_to_object.pop(key, None)
            pers_id, _created = identity.observe_face(
                face_embedding, quality=face_quality, camera_id=camera_id, now=ts
            )
            if obj_id:
                daystore.promote_object(obj_id, pers_id, now=anchor_ts)
            with _lock:
                _track_to_person[key] = pers_id
        if lifecycle_worker_id:
            from ..person_identity_registry import is_sgc_worker_id

            if is_sgc_worker_id(lifecycle_worker_id):
                _bind_sgc_to_person(lifecycle_worker_id, pers_id)
        _person_touch(
            pers_id,
            seen_since=None if bound else anchor_ts,
            with_snapshot=True,
        )
        return pers_id

    # Track này từng thấy mặt rồi thì đã là Người — quay lưng một lúc không
    # kéo nó tụt về Đối tượng. Không chụp ảnh khi không còn mặt đủ rõ.
    known = _known_person_for_track(key)
    if known:
        _person_touch(known, with_snapshot=face_eligible)
        return known

    lifecycle_pers = _pers_id_for_lifecycle(
        lifecycle_tier,
        lifecycle_worker_id,
        now=ts,
    )
    ok, anchor_ts = _gate_observation_commit(
        key,
        has_face=lifecycle_pers is not None,
        now=ts,
    )
    if not ok:
        return None

    if lifecycle_pers:
        return _commit_lifecycle_person_event(
            key,
            pers_id=lifecycle_pers,
            camera_id=camera_id,
            zone_id=zone_id,
            frame=frame,
            person_bbox=person_bbox,
            score=score,
            ts=ts,
            anchor_ts=anchor_ts,
            face_eligible=face_eligible,
            lifecycle_tier=lifecycle_tier,
            lifecycle_worker_id=lifecycle_worker_id,
            worker_name=worker_name,
        )

    # Track mới, chưa mặt: ưu tiên nhận lại Người vừa mất track cùng chỗ
    # (quay lưng). Không khớp thì mới là Đối tượng — để nhóm lẫn mặt/lưng
    # không bị gộp một thẻ.
    reused_person = _reuse_stale_person(camera_id, person_bbox, ts)
    if reused_person:
        pers_id = identity.resolve_alias(reused_person)
        with _lock:
            _track_to_person[key] = pers_id
        _person_touch(
            pers_id,
            seen_since=anchor_ts,
            with_snapshot=face_eligible,
        )
        return pers_id

    with _lock:
        obj_id = _track_to_object.get(key)
    first_write = obj_id is None
    if first_write:
        obj_id = _reuse_stale_object(camera_id, person_bbox, ts)
        first_write = obj_id is None
    obj_id = daystore.touch_object(
        obj_id,
        camera_id=camera_id,
        zone_id=zone_id,
        now=ts,
        seen_since=anchor_ts if first_write else None,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
    )
    with _lock:
        _track_to_object[key] = obj_id
    # Không gắn ảnh portrait lên thẻ Đối tượng — mặt đủ rõ thuộc tab Người.
    if face_quality < _OBJECT_FACE_QUALITY_MAX:
        path, shot_score = _shot(obj_id, tier="object")
        if path:
            daystore.touch_object(
                obj_id,
                camera_id=camera_id,
                zone_id=zone_id,
                snapshot_path=path,
                snapshot_score=shot_score,
                now=ts,
                gps_lat=gps_lat,
                gps_lng=gps_lng,
            )
    return obj_id


def _known_person_for_track(key: str) -> str | None:
    with _lock:
        pers = _track_to_person.get(key)
    if not pers:
        return None
    return identity.resolve_alias(pers)


def forget_track(camera_id: str, track_id: str, *, now: float | None = None) -> None:
    from ..config import settings

    if settings.patrol_use_aggregator:
        from .aggregator.engine import finalize_track

        finalize_track(camera_id, track_id, now=now)
        key = _key(camera_id, track_id)
        with _lock:
            _track_watch.pop(key, None)
        return

    key = _key(camera_id, track_id)
    ts = float(now if now is not None else time.time())
    with _lock:
        obj_id = _track_to_object.pop(key, None)
        pers_id = _track_to_person.pop(key, None)
        bbox = _track_bbox.pop(key, None)
        _track_watch.pop(key, None)
        if pers_id:
            _stash_stale(_stale_persons, camera_id, pers_id, bbox, ts)
        elif obj_id:
            _stash_stale(_stale_objects, camera_id, obj_id, bbox, ts)


def reset(camera_id: str | None = None) -> None:
    from ..config import settings

    if settings.patrol_use_aggregator:
        from .aggregator.engine import reset_sessions

        reset_sessions(camera_id)

    with _lock:
        if camera_id is None:
            _track_to_object.clear()
            _track_to_person.clear()
            _sgc_to_person.clear()
            _track_watch.clear()
            _track_bbox.clear()
            _stale_objects.clear()
            _stale_persons.clear()
            return
        prefix = f"{camera_id}|"
        for store in (_track_to_object, _track_to_person, _track_watch, _track_bbox):
            for k in [k for k in store if k.startswith(prefix)]:
                store.pop(k, None)
        _stale_objects.pop(camera_id, None)
        _stale_persons.pop(camera_id, None)
