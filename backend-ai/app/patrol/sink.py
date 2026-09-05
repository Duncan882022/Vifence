"""Cầu nối luồng AI → SQLite tuần tra.

Luồng phân tích gọi `record_observation` mỗi khi phát hiện một người trong
khung. **Ghi thẻ sớm** sau `patrol_object_min_commit_seconds` (Đối tượng) hoặc
`patrol_person_confirm_seconds` (có mặt). `patrol_object_confirm_seconds` là cửa sổ
chọn frame đẹp nhất / thăng tier — không chặn xe hay người chạy qua; mất track → finalize ngay.
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

# Một JPG / thẻ sự kiện (obj/tk/pers) — ghi đè khi có frame đẹp hơn.
# Không dùng session.started_at: mỗi re-track ByteTrack sẽ tạo file mới.
CARD_SNAPSHOT_LUOT = 0

_SNAPSHOT_WRITE_LOCK = threading.Lock()
_last_snapshot_write: dict[str, tuple[float, float]] = {}


def _snapshot_cache_key(subject_id: str, luot_key: int | None) -> str:
    if luot_key == CARD_SNAPSHOT_LUOT:
        return subject_id
    if luot_key is not None:
        return f"{subject_id}|{luot_key}"
    return subject_id


def _snapshot_filename(subject_id: str, luot_key: int | None, ts: float) -> str:
    if luot_key == CARD_SNAPSHOT_LUOT:
        return f"{subject_id}.jpg"
    if luot_key is not None:
        return f"{subject_id}-{int(luot_key)}.jpg"
    return f"{subject_id}-{int(ts * 1000)}.jpg"


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
    face_eligible: bool = False,
    force: bool = False,
    luot_key: int | None = None,
) -> str | None:
    """Ghi file JPG — một file/thẻ (CARD_SNAPSHOT_LUOT), ghi đè khi score cao hơn."""
    ts = float(capture_ts if capture_ts is not None else time.time())
    cache_key = _snapshot_cache_key(subject_id, luot_key)
    with _SNAPSHOT_WRITE_LOCK:
        last = _last_snapshot_write.get(cache_key)
        if not force and last is not None:
            last_ts, last_score = last
            if score <= last_score and (ts - last_ts) < daystore.TOUCH_MIN_INTERVAL_SEC:
                return None
        _last_snapshot_write[cache_key] = (ts, max(score, last[1] if last else 0.0))
    return _write_snapshot(
        subject_id,
        frame,
        bbox,
        tier=tier,
        worker_id=worker_id,
        worker_name=worker_name,
        capture_ts=ts,
        score=score,
        face_eligible=face_eligible,
        luot_key=luot_key,
    )


def snapshot_score(*, face_quality: float, confidence: float) -> float:
    """Ảnh nào đáng giữ hơn.

    Thấy mặt là quan trọng hơn hẳn độ chắc của YOLO: thẻ sự kiện tồn tại để
    người trực **nhận ra ai**, mà một tấm lưng rõ nét thì không giúp được gì.
    """
    return float(face_quality) * 2.0 + float(confidence)


# BGR — đồng bộ PATROL_TIER_TOKENS heatmapDotHex trên FE (green / sky / violet).
PATROL_SNAPSHOT_TIER_COLORS_BGR: dict[str, tuple[int, int, int]] = {
    "object": (128, 222, 74),    # green-400 #4ade80 — khung nét đứt trên snapshot
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


def _snapshot_tier_rank(tier: str) -> int:
    return {"object": 0, "person": 1, "identity": 2}.get(tier, 0)


def _snapshot_meets_person_evidence_gate(
    *,
    face_eligible: bool,
    snapshot_score: float,
) -> bool:
    """Badge Người/Định danh trên JPG — cùng ngưỡng tab sự kiện (≥1.05 + face)."""
    if not face_eligible:
        return False
    return float(snapshot_score) >= daystore.PERSON_LIST_MIN_SNAPSHOT_SCORE


def _resolve_snapshot_tier(
    subject_id: str,
    *,
    tier: str | None = None,
    worker_id: str | None = None,
) -> str:
    """Tier khung/badge snapshot — đồng bộ tab sự kiện (Người = xanh, Định danh = tím)."""
    from ..patrol_entity import patrol_tier_label
    from ..patrol_identity_lifecycle import TIER_IDENTITY, TIER_PERSON, tier_for_worker_id

    wid = (worker_id or "").strip()
    explicit = (tier or "").strip()
    inferred = tier_for_worker_id(wid) if wid else "object"

    if subject_id.startswith("obj-"):
        if _snapshot_tier_rank(inferred) > 0:
            return inferred
        return "object"

    # lifecycle_tier từ ROI live là nguồn sự thật — không thăng lên identity
    # chỉ vì pers-* đã từng identify trong SQLite (tab Người ≠ khung tím).
    if explicit == TIER_PERSON:
        return TIER_PERSON
    if explicit == TIER_IDENTITY:
        if wid and not patrol_tier_label(wid) == TIER_IDENTITY:
            return TIER_PERSON
        return TIER_IDENTITY

    candidates: list[str] = []
    if explicit in PATROL_SNAPSHOT_TIER_COLORS_BGR and explicit != "object":
        candidates.append(explicit)
    if _snapshot_tier_rank(inferred) > 0:
        candidates.append(inferred)
    if identity.get_person(subject_id):
        candidates.append(_snapshot_tier(subject_id))

    if candidates:
        return max(candidates, key=_snapshot_tier_rank)

    if explicit == "object":
        return "object"
    return patrol_tier_label(wid or subject_id)


def _write_snapshot(
    subject_id: str,
    frame: Any,
    bbox: Sequence[float],
    *,
    tier: str | None = None,
    worker_id: str | None = None,
    worker_name: str | None = None,
    capture_ts: float | None = None,
    score: float = 0.0,
    face_eligible: bool = False,
    luot_key: int | None = None,
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
        bx1 = max(0, x1)
        by1 = max(0, y1)
        bx2 = min(w, x2)
        by2 = min(h, y2)
        if bx2 - bx1 < 16 or by2 - by1 < 16:
            return None

        out = frame.copy()
        from ..patrol_ids import is_person_subject_id

        person_tab_qualified = (
            is_person_subject_id(subject_id)
            and float(score) >= daystore.PERSON_LIST_MIN_SNAPSHOT_SCORE
        )
        if _snapshot_meets_person_evidence_gate(
            face_eligible=face_eligible,
            snapshot_score=score,
        ) or person_tab_qualified:
            tier_hint = tier
            if person_tab_qualified and (tier or "").strip() not in ("person", "identity"):
                from ..patrol_identity_lifecycle import TIER_PERSON

                tier_hint = TIER_PERSON
            resolved_tier = _resolve_snapshot_tier(
                subject_id,
                tier=tier_hint,
                worker_id=worker_id,
            )
        else:
            resolved_tier = "object"
        color = PATROL_SNAPSHOT_TIER_COLORS_BGR[resolved_tier]
        if resolved_tier == "object":
            draw_dashed_rectangle(out, (bx1, by1), (bx2, by2), color, thickness=1)
        else:
            cv2.rectangle(out, (bx1, by1), (bx2, by2), color, 2, cv2.LINE_AA)

        person = identity.get_person(subject_id)
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
        name = _snapshot_filename(subject_id, luot_key, ts)
        out_path = folder / name
        cv2.imwrite(str(out_path), out, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        return f"{date}/{name}"
    except Exception:  # noqa: BLE001
        return None


def resolve_snapshot_path(relative: str) -> Path | None:
    """Đường dẫn tuyệt đối của ảnh, chặn thoát ra ngoài thư mục ảnh."""
    rel = (relative or "").strip().lstrip("/")
    if not rel or ".." in rel:
        return None
    if rel.startswith("draft-face/"):
        from .draft_face_images import resolve_draft_face_path

        return resolve_draft_face_path(rel)
    full = (SNAPSHOT_DIR / rel).resolve()
    try:
        full.relative_to(SNAPSHOT_DIR.resolve())
    except ValueError:
        return None
    return full if full.is_file() else None

_tk_to_profile: dict[str, str] = {}
_lock = threading.Lock()


@dataclass
class _TrackWatch:
    first_seen: float
    confirmed: bool = False


# Theo dõi thời gian bám track trước khi ghi thẻ — tránh log cảnh thoáng qua.
_track_watch: dict[str, _TrackWatch] = {}


def _key(camera_id: str, track_id: str) -> str:
    return f"{camera_id}|{track_id}"


def _track_is_committed(key: str) -> bool:
    with _lock:
        watch = _track_watch.get(key)
        return watch is not None and watch.confirmed


def _required_min_commit_seconds(*, has_face: bool) -> float:
    from ..config import settings

    if has_face:
        return float(settings.patrol_person_confirm_seconds)
    return float(settings.patrol_object_min_commit_seconds)


def track_accumulation_window_seconds() -> float:
    """Cửa sổ giữ frame tốt nhất / thăng tier trên một track."""
    from ..config import settings

    window = float(getattr(settings, "patrol_track_accumulation_max_seconds", 0) or 0)
    if window > 0:
        return window
    return float(settings.patrol_object_confirm_seconds)


def _gate_observation_commit(
    key: str,
    *,
    has_face: bool,
    now: float,
) -> tuple[bool, float]:
    """Cho ghi SQLite sau min-commit ngắn; finalize luôn qua. Trả (ok, mốc first_seen)."""
    if _track_is_committed(key):
        return True, now

    with _lock:
        watch = _track_watch.get(key)
        if watch is None:
            watch = _TrackWatch(first_seen=now)
            _track_watch[key] = watch
        elif watch.confirmed:
            return True, now

        if now - watch.first_seen < _required_min_commit_seconds(has_face=has_face):
            return False, now

        watch.confirmed = True
        return True, watch.first_seen


def _resolve_observation_gps(
    camera_id: str,
    *,
    at_ts: float | None = None,
) -> tuple[float, float]:
    from ..patrol_gps_sim import resolve_patrol_observation_gps

    return resolve_patrol_observation_gps(camera_id, at_ts=at_ts)


def _bind_tk_profile(tk_id: str, pers_id: str) -> None:
    from ..patrol_ids import normalize_track_id

    tk = normalize_track_id(tk_id)
    pid = identity.resolve_alias((pers_id or "").strip())
    if not tk or not pid:
        return
    identity.bind_tk_profile(tk, pid)
    with _lock:
        _tk_to_profile[tk] = pid


def lookup_bound_pers_for_tk(tk_id: str) -> str | None:
    """Tra pers_id cho tk — cache RAM rồi SQLite."""
    from ..patrol_ids import normalize_track_id

    tk = normalize_track_id(tk_id)
    if not tk:
        return None
    with _lock:
        cached = _tk_to_profile.get(tk)
    if cached:
        return identity.resolve_alias(cached)
    found = identity.lookup_bound_profile_for_tk(tk)
    if found:
        with _lock:
            _tk_to_profile[tk] = found
    return found


def _ensure_profile_for_tk(
    tk_id: str,
    *,
    now: float,
    gps_lat: float | None = None,
    gps_lng: float | None = None,
) -> str:
    from ..patrol_ids import normalize_track_id

    tk = normalize_track_id(tk_id)
    existing = lookup_bound_pers_for_tk(tk)
    if existing:
        identity.touch_person(existing, now=now)
        return existing
    pers_id = identity.ensure_draft_for_tk(
        tk, now=now, gps_lat=gps_lat, gps_lng=gps_lng,
    )
    _bind_tk_profile(tk, pers_id)
    return pers_id


def _pers_id_for_lifecycle(
    lifecycle_tier: str | None,
    lifecycle_worker_id: str | None,
    *,
    now: float,
) -> str | None:
    """Map tier/worker_id từ ROI lifecycle → pers_id (tk-* hoặc gallery) cho thẻ sự kiện."""
    tier = (lifecycle_tier or "").strip()
    wid = (lifecycle_worker_id or "").strip()
    if not tier or not wid:
        return None

    from ..patrol_identity_lifecycle import TIER_IDENTITY, TIER_PERSON
    from ..patrol_entity import (
        is_patrol_gallery_id,
        resolve_patrol_gallery_id_for_worker,
    )
    from ..person_identity_registry import is_sgc_worker_id

    if tier not in (TIER_PERSON, TIER_IDENTITY):
        return None

    if identity.get_person(wid):
        return identity.resolve_alias(wid)

    gallery = wid if is_patrol_gallery_id(wid) else resolve_patrol_gallery_id_for_worker(wid)
    if gallery:
        from ..patrol_identity_store import lookup_patrol_identity_any

        row = lookup_patrol_identity_any(gallery)
        if row:
            emp = str(row.get("employee_code") or "").strip()
            if emp:
                found = identity.find_by_employee_code(emp)
                if found:
                    return str(found["pers_id"])
            resolved = identity.pers_id_for_gallery_worker(gallery)
            if resolved:
                return resolved[0]
            hr = identity.hr_profile_for_gallery(gallery)
            if hr:
                return str(hr["pers_id"])

    if is_sgc_worker_id(wid):
        return _ensure_profile_for_tk(wid, now=now)

    return None


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
    """Ghi một lần quan sát qua Event Aggregator."""
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


def forget_track(
    camera_id: str,
    track_id: str,
    *,
    now: float | None = None,
    end_reason: str | None = None,
) -> None:
    from .aggregator.engine import finalize_track

    finalize_track(camera_id, track_id, now=now, end_reason=end_reason)
    key = _key(camera_id, track_id)
    with _lock:
        _track_watch.pop(key, None)


def reset(camera_id: str | None = None) -> None:
    from .aggregator.engine import reset_sessions
    from .peak_time import reset_peak_time

    reset_sessions(camera_id)
    reset_peak_time(camera_id)
    with _lock:
        if camera_id is None:
            _track_watch.clear()
            _tk_to_profile.clear()
            return
        prefix = f"{camera_id}|"
        for k in [k for k in _track_watch if k.startswith(prefix)]:
            _track_watch.pop(k, None)
