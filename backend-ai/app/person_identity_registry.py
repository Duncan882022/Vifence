"""ID ẩn danh tk-xxxxxxx — dedup người chưa nhận diện (Module 05 HC-*)."""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import numpy as np

from .schemas import PpeDetection
from .track_matching import bbox_iou
from .patrol_ids import format_tk, is_anonymous_track_id, is_tk_worker_id, normalize_track_id
from .worker_identity.gallery import embedding_similarity

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
REGISTRY_FILE = DATA_DIR / "person_identity_registry.json"

# Vị trí cũ hơn ngần này không còn nói lên điều gì — người đã đi đâu mất rồi.
_TRACK_META_TTL_SEC = 180.0
# Khuôn mặt thì không đổi trong một ca làm việc. Dùng chung hạn 3 phút với vị trí
# nghĩa là chỉ huy đi một vòng công trường rồi gặp lại đúng người đó là hệ thống
# đã quên, cấp mã mới và đếm thêm một lần nữa.
_FACE_META_TTL_SEC = 8 * 3600.0
# Trần số dòng track_meta giữ lại — hạn khuôn mặt dài nên phải dọn, nếu không
# file registry phình theo cả ca.
_TRACK_META_MAX_ROWS = 900
_REUSE_IOU = 0.22
_REUSE_CENTER_NORM = 0.11

# Mức trùng vị trí (0–1) đủ để coi là "người hiện ra đúng chỗ track cũ vừa mất".
_REUSE_SPATIAL_STRONG = 0.55
# Và phải trùng hơn ứng viên kế tiếp ngần này thì mới dám dùng vị trí thay cho
# cách biệt khuôn mặt — nếu hai người cùng gần đó thì vị trí không phân định được.
_REUSE_SPATIAL_MARGIN = 0.30
# Bán kính chấp nhận ngay khi vừa mất dấu, tính theo tỉ lệ khung hình.
_REUSE_BASE_RADIUS = 0.12
# Người đi bộ trôi được chừng này chiều khung mỗi giây bị che.
_REUSE_DRIFT_PER_SEC = 0.10
# Trần bán kính — che đủ lâu thì vị trí hết giá trị phân định, đừng nới vô hạn.
_REUSE_MAX_DRIFT = 0.45

_lock = threading.Lock()
_state: dict | None = None


def _load() -> dict:
    """Nạp registry — chỉ next_seq sống qua restart, track map thì không.

    Track id (p01:person, p02:person…) được đánh lại từ đầu mỗi lần tiến trình
    khởi động, nên khoá "HC-02|p01:person" trong file trỏ vào người của phiên
    trước. Giữ lại sẽ dán mã cũ lên người đầu tiên bước vào khung sau restart.
    Ràng buộc gallery không nằm ở đây (patrol_identity_store) nên không mất.
    """
    global _state
    if _state is not None:
        return _state
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    next_seq = 1
    if REGISTRY_FILE.exists():
        try:
            saved = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
            next_seq = max(int(saved.get("next_seq") or 1), 1)
        except (json.JSONDecodeError, OSError, TypeError, ValueError):
            next_seq = 1
    _state = {"next_seq": next_seq, "tracks": {}, "track_meta": {}}
    return _state


def _save(state: dict) -> None:
    REGISTRY_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _format_tk(seq: int) -> str:
    return format_tk(seq)


def is_sgc_worker_id(worker_id: str | None) -> bool:
    """Legacy alias — tk-* thay sgc-*."""
    return is_anonymous_track_id(worker_id)


def clear_registry() -> int:
    """Xóa toàn bộ registry tk-* trong RAM và file — dùng khi reset test data.

    Giữ next_seq để ID không bao giờ bị cấp lại: alias thủ công cũ còn trong
    localStorage sẽ không dán tên người cũ lên người mới sau khi reset.
    """
    global _state
    with _lock:
        current = _load()
        count = len(current.get("tracks", {}))
        next_seq = int(current.get("next_seq") or 1)
        _state = {"next_seq": next_seq, "tracks": {}, "track_meta": {}}
        REGISTRY_FILE.write_text(
            json.dumps(_state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return count


def _track_key(camera_id: str, track_id: str) -> str:
    return f"{camera_id}|{track_id}"


def peek_patrol_track_identity(camera_id: str, track_id: str) -> str:
    """Mã đã gắn cho track, hoặc "" — tra cứu thuần, không bao giờ cấp mã mới.

    Dùng cho khung hình không thấy mặt: người đã nhận diện rồi quay lưng thì giữ
    nguyên mã, còn người chưa từng thấy mặt vẫn là Đối tượng.
    """
    with _lock:
        state = _load()
        raw = str(state.get("tracks", {}).get(_track_key(camera_id, track_id)) or "")
        return normalize_track_id(raw) if raw else ""


def is_identified_gallery_worker(worker_id: str | None) -> bool:
    if not worker_id or worker_id == "unknown":
        return False
    return not is_sgc_worker_id(worker_id)


def _center_distance_norm(
    a: list[float] | tuple[float, ...],
    b: list[float] | tuple[float, ...],
    frame_w: int,
    frame_h: int,
) -> float:
    acx = (float(a[0]) + float(a[2])) / 2.0
    acy = (float(a[1]) + float(a[3])) / 2.0
    bcx = (float(b[0]) + float(b[2])) / 2.0
    bcy = (float(b[1]) + float(b[3])) / 2.0
    return (
        ((acx - bcx) / max(frame_w, 1)) ** 2 + ((acy - bcy) / max(frame_h, 1)) ** 2
    ) ** 0.5


def _expected_emb_dim() -> int:
    from .worker_identity.face_embedder import (
        HISTOGRAM_EMBED_DIM,
        SFACE_EMBED_DIM,
        is_deep_face_model_ready,
    )

    return SFACE_EMBED_DIM if is_deep_face_model_ready() else HISTOGRAM_EMBED_DIM


def _as_emb(vec: list[float] | None) -> np.ndarray | None:
    if not vec or len(vec) < 8:
        return None
    # Embedding lưu từ model cũ khác chiều — bỏ qua thay vì so sánh sai không gian.
    if len(vec) != _expected_emb_dim():
        return None
    return np.asarray(vec, dtype=np.float64)


def _face_compatible(
    query: np.ndarray,
    other: np.ndarray,
    *,
    for_merge: bool,
) -> bool:
    from .worker_identity import face_thresholds

    sim = embedding_similarity(query, other)
    if for_merge:
        return sim >= face_thresholds.reuse_min_similarity()
    return sim >= face_thresholds.split_max_similarity()


def _conflicts_frame_faces(
    worker_id: str,
    face_emb: np.ndarray,
    frame_face_assignments: dict[str, list[float]] | None,
) -> bool:
    """True nếu worker_id đã gán cho mặt khác không tương thích — tránh 2 người → 1 ID."""
    if not frame_face_assignments:
        return False
    existing = _as_emb(frame_face_assignments.get(worker_id))
    if existing is None:
        return False
    return not _face_compatible(face_emb, existing, for_merge=True)


def _remember_track_meta(
    state: dict,
    key: str,
    worker_id: str,
    person_bbox: list[float] | None,
    face_emb: list[float] | None = None,
) -> None:
    meta = state.setdefault("track_meta", {})
    entry: dict = {
        "worker_id": worker_id,
        "updated_at": time.time(),
    }
    if person_bbox and len(person_bbox) >= 4:
        entry["bbox"] = [float(v) for v in person_bbox[:4]]
    if face_emb and len(face_emb) >= 8:
        entry["face_emb"] = [float(v) for v in face_emb]
    meta[key] = entry
    _prune_track_meta(state)


def _prune_track_meta(state: dict) -> None:
    """Dọn dòng đã hết hạn, rồi cắt bớt dòng cũ nhất nếu vẫn vượt trần."""
    meta = state.get("track_meta") or {}
    if len(meta) <= _TRACK_META_MAX_ROWS:
        return
    now = time.time()
    for key in [
        k
        for k, row in meta.items()
        if now - float(row.get("updated_at") or 0) > _FACE_META_TTL_SEC
    ]:
        meta.pop(key, None)
    if len(meta) <= _TRACK_META_MAX_ROWS:
        return
    ordered = sorted(meta.items(), key=lambda kv: float(kv[1].get("updated_at") or 0))
    for key, _row in ordered[: len(meta) - _TRACK_META_MAX_ROWS]:
        meta.pop(key, None)


def _identity_face_emb(state: dict, camera_id: str, worker_id: str) -> np.ndarray | None:
    prefix = f"{camera_id}|"
    now = time.time()
    best: np.ndarray | None = None
    best_ts = 0.0
    for key, row in (state.get("track_meta") or {}).items():
        if not key.startswith(prefix):
            continue
        if str(row.get("worker_id") or "") != worker_id:
            continue
        if now - float(row.get("updated_at") or 0) > _FACE_META_TTL_SEC:
            continue
        emb = _as_emb(row.get("face_emb"))
        if emb is None:
            continue
        ts = float(row.get("updated_at") or 0)
        if ts >= best_ts:
            best_ts = ts
            best = emb
    return best


def _spatial_agreement(
    person_bbox: list[float] | tuple[float, ...],
    other_bbox: list[float] | tuple[float, ...] | None,
    frame_w: int,
    frame_h: int,
    age_sec: float,
) -> float:
    """0–1 — bbox hiện tại trùng chỗ ứng viên tới mức nào, nới dần theo thời gian.

    Lấy giá trị tốt hơn giữa chồng lấn và khoảng cách tâm: người bị che rồi hiện
    ra thường lệch đủ để IoU về 0 trong khi tâm vẫn còn rất gần, còn người ngồi
    bị che một phần thì tâm dịch nhưng vùng vẫn chồng nhau.

    Bán kính chấp nhận phải giãn theo thời gian đã mất dấu. Dùng một ngưỡng cố
    định thì đúng cho lúc vừa bị che, nhưng người bị khuất năm giây đã đi tiếp
    một quãng và mọi ứng viên đều trượt — đúng lúc cần nối lại nhất thì phép so
    lại từ chối.
    """
    if not other_bbox or len(other_bbox) < 4:
        return 0.0
    iou = bbox_iou(person_bbox, other_bbox)
    dist = _center_distance_norm(person_bbox, other_bbox, frame_w, frame_h)
    drift = min(_REUSE_DRIFT_PER_SEC * max(0.0, age_sec), _REUSE_MAX_DRIFT)
    tolerance = _REUSE_BASE_RADIUS + drift
    by_iou = min(1.0, iou / 0.35) if iou > 0.0 else 0.0
    by_dist = max(0.0, 1.0 - dist / tolerance)
    return max(by_iou, by_dist)


def _find_reusable_worker_id(
    state: dict,
    camera_id: str,
    person_bbox: list[float],
    *,
    frame_w: int = 640,
    frame_h: int = 480,
    face_emb: np.ndarray | None = None,
    frame_face_assignments: dict[str, list[float]] | None = None,
) -> str | None:
    """Tái dùng ID — ưu tiên mặt; bbox chỉ khi không có mặt hoặc mặt khớp."""
    from .worker_identity import face_thresholds

    now = time.time()
    meta = state.get("track_meta") or {}
    prefix = f"{camera_id}|"

    if face_emb is not None:
        same_floor = face_thresholds.reuse_min_similarity()
        cross_floor = face_thresholds.cross_camera_min_similarity()
        # Gom theo mã người, không theo dòng track: cùng một công nhân thường có
        # nhiều dòng (nhiều track, nhiều mũ) và mỗi dòng giữ một mảnh bằng chứng
        # khác nhau. Xét rời từng dòng thì dòng khoẻ về mặt lại che mất dòng khoẻ
        # về vị trí của chính người đó.
        merged: dict[str, tuple[float, float]] = {}
        for key, row in meta.items():
            same_camera = key.startswith(prefix)
            age = now - float(row.get("updated_at") or 0)
            if age > _FACE_META_TTL_SEC:
                continue
            stored = _as_emb(row.get("face_emb"))
            wid = str(row.get("worker_id") or state.get("tracks", {}).get(key) or "").strip()
            if not wid or stored is None:
                continue
            sim = embedding_similarity(face_emb, stored)
            if sim < (same_floor if same_camera else cross_floor):
                continue
            spatial = (
                _spatial_agreement(person_bbox, row.get("bbox"), frame_w, frame_h, age)
                if same_camera
                else 0.0
            )
            prev_sim, prev_spatial = merged.get(wid, (0.0, 0.0))
            merged[wid] = (max(prev_sim, sim), max(prev_spatial, spatial))

        face_candidates = [(wid, sim, sp) for wid, (sim, sp) in merged.items()]

        if face_candidates:
            face_candidates.sort(key=lambda item: item[1], reverse=True)
            best_wid, best_sim, best_spatial = face_candidates[0]
            others = face_candidates[1:]
            rival = others[0][1] if others else 0.0
            reuse_ok = best_sim - rival >= face_thresholds.reuse_min_margin()

            if not reuse_ok and best_spatial >= _REUSE_SPATIAL_STRONG:
                # Đám đông cùng đội mũ bảo hộ kéo cách biệt giữa hai ứng viên
                # xuống sát 0 — đúng lúc cần nối lại track vừa vỡ nhất thì phép
                # so mặt lại từ chối. Vị trí người hiện ra so với chỗ track cũ
                # vừa mất là bằng chứng độc lập với khuôn mặt, nên khi nó trùng
                # rõ rệt hơn hẳn mọi ứng viên khác thì hai tín hiệu yếu cộng lại
                # vẫn chắc hơn một tín hiệu mạnh đứng một mình.
                rival_spatial = max((row[2] for row in others), default=0.0)
                reuse_ok = best_spatial - rival_spatial >= _REUSE_SPATIAL_MARGIN

            if reuse_ok and not _conflicts_frame_faces(
                best_wid, face_emb, frame_face_assignments,
            ):
                return best_wid

    bbox_candidates: list[tuple[str, float]] = []
    for key, row in meta.items():
        if not key.startswith(prefix):
            continue
        if now - float(row.get("updated_at") or 0) > _TRACK_META_TTL_SEC:
            continue
        other_bbox = row.get("bbox")
        wid = str(row.get("worker_id") or state.get("tracks", {}).get(key) or "").strip()
        if not wid or not other_bbox or len(other_bbox) < 4:
            continue
        iou = bbox_iou(person_bbox, other_bbox)
        dist = _center_distance_norm(person_bbox, other_bbox, frame_w, frame_h)
        if iou < _REUSE_IOU and dist > _REUSE_CENTER_NORM:
            continue

        if face_emb is not None:
            holder_emb = _as_emb(row.get("face_emb"))
            if holder_emb is None:
                holder_emb = _identity_face_emb(state, camera_id, wid)
            if holder_emb is not None and not _face_compatible(face_emb, holder_emb, for_merge=True):
                continue

        score = iou * 2.0 + max(0.0, 1.0 - dist * 4.0)
        bbox_candidates.append((wid, score))

    if not bbox_candidates:
        return None

    bbox_candidates.sort(key=lambda item: item[1], reverse=True)
    best_wid = bbox_candidates[0][0]
    if face_emb is not None and _conflicts_frame_faces(best_wid, face_emb, frame_face_assignments):
        return None
    return best_wid


def _finalize_identity_pair(worker_id: str, worker_name: str) -> tuple[str, str]:
    from .patrol_entity import resolve_patrol_worker_display_name

    wid = (worker_id or "").strip()
    return wid, resolve_patrol_worker_display_name(wid, worker_name)


def borrow_cross_camera_patrol_worker(
    camera_id: str,
    person_bbox: list[float],
    *,
    frame: np.ndarray,
    frame_w: int,
    frame_h: int,
    face_emb: list[float] | None = None,
) -> tuple[str, str] | None:
    """Reuse worker_id từ cam tuần tra khác — cùng người phải cùng mã trên site."""
    from .patrol_flight_mode import is_patrol_identity_unified_camera

    if not is_patrol_identity_unified_camera(camera_id):
        return None

    query = _as_emb(face_emb)
    if query is None:
        from .worker_identity.recognizer import recover_patrol_face_embedding

        recovered = recover_patrol_face_embedding(frame, person_bbox, camera_id=camera_id)
        if recovered is not None:
            query = _as_emb(recovered[0])

    if query is None:
        return None

    with _lock:
        state = _load()
        reused = _find_reusable_worker_id(
            state,
            camera_id,
            person_bbox,
            frame_w=frame_w,
            frame_h=frame_h,
            face_emb=query,
        )
    if not reused:
        return None

    bound = _gallery_from_patrol_binding(reused)
    if bound:
        return _finalize_identity_pair(bound[0], bound[1])
    return _finalize_identity_pair(reused, reused)


def _match_sqlite_patrol_face(face_emb: np.ndarray) -> tuple[str, str] | None:
    """Khớp vector SQLite person_faces — ưu tiên hồ sơ patrol đã enroll."""
    from .patrol import identity as patrol_identity
    from .patrol_identity_store import patrol_gallery_worker_id

    vec = face_emb.tolist() if hasattr(face_emb, "tolist") else list(face_emb)
    matched, _sim = patrol_identity.match_face(vec)
    if not matched:
        return None
    person = patrol_identity.get_person(matched)
    if not person:
        return None
    if person.get("status") == patrol_identity.STATUS_IDENTIFIED:
        code = str(person.get("employee_code") or "").strip()
        gid = patrol_gallery_worker_id(code) if code else matched
        return gid, patrol_identity.display_name(person)
    return matched, str(matched)


def _match_patrol_gallery_from_embedding(
    face_emb: np.ndarray,
    *,
    camera_id: str,
    frame_face_assignments: dict[str, list[float]] | None = None,
) -> tuple[str, str, float] | None:
    """Khớp histogram mặt với gallery — trả (gallery_id, worker_name, score)."""
    from .patrol_identity_store import lookup_patrol_identity
    from .worker_identity import face_thresholds
    from .worker_identity.gallery import load_gallery, match_embedding

    load_gallery()
    matched = match_embedding(
        face_emb,
        min_confidence=face_thresholds.gallery_min_confidence(camera_id),
        min_margin=face_thresholds.gallery_min_margin(camera_id),
    )
    if matched is None:
        return None
    profile, score = matched
    gallery_id = str(profile.worker_id or "").strip()
    if not gallery_id:
        return None
    from .patrol import identity as patrol_identity

    hr = patrol_identity.hr_profile_for_gallery(gallery_id)
    if hr is None:
        return None
    name = patrol_identity.display_name(hr)
    if _conflicts_frame_faces(gallery_id, face_emb, frame_face_assignments):
        return None
    return gallery_id, name, float(score)


def _apply_patrol_gallery_to_detection(
    detection: PpeDetection,
    gallery_id: str,
    gallery_name: str,
    score: float,
) -> None:
    detection.worker_id = gallery_id
    detection.worker_name = gallery_name
    detection.face_match_confidence = round(score, 3)
    detection.face_match_source = "face"


def _gallery_from_patrol_binding(worker_id: str) -> tuple[str, str] | None:
    """sgc/OBJ đã gán gallery → trả (gallery_id, worker_name)."""
    from .patrol_identity_store import lookup_gallery_worker, lookup_patrol_identity

    wid = (worker_id or "").strip()
    if not wid:
        return None
    gallery_id = lookup_gallery_worker(wid)
    if not gallery_id:
        return None
    row = lookup_patrol_identity(gallery_id) or {}
    name = str(row.get("worker_name") or gallery_id).strip()
    return gallery_id, name


def list_track_aliases_for_worker(worker_or_alias: str) -> list[str]:
    """Trả mọi track key / worker id liên quan trong registry."""
    from .patrol_identity_store import lookup_gallery_worker

    needle = (worker_or_alias or "").strip()
    if not needle:
        return []
    gallery = lookup_gallery_worker(needle) or needle
    out: set[str] = {needle, gallery}
    with _lock:
        state = _load()
        for key, wid in (state.get("tracks") or {}).items():
            w = str(wid or "").strip()
            if w in (needle, gallery) or w.upper() == needle.upper():
                out.add(w)
                if ":" in key:
                    out.add(key.split("|", 1)[-1])
    return sorted(out)


def bind_all_tracks_for_aliases(aliases: list[str], gallery_worker_id: str) -> int:
    """Gắn mọi track trong registry khớp alias → gallery worker."""
    wid = gallery_worker_id.strip()
    if not wid:
        return 0
    alias_set = {a.strip() for a in aliases if a and a.strip()}
    bound = 0
    with _lock:
        state = _load()
        for key, existing in list((state.get("tracks") or {}).items()):
            ex = str(existing or "").strip()
            if ex in alias_set or ex.upper() in {a.upper() for a in alias_set}:
                state["tracks"][key] = wid
                bound += 1
        _save(state)
    return bound


def purge_gallery_worker_from_registry(
    gallery_worker_id: str,
    aliases: list[str] | None = None,
) -> int:
    """Gỡ gallery worker khỏi track map — hạ về sgc-* nếu có trong aliases."""
    wid = (gallery_worker_id or "").strip()
    if not wid:
        return 0
    alias_set = {wid, *(a.strip() for a in (aliases or []) if a and a.strip())}
    sgc_fallback = next((a for a in alias_set if is_sgc_worker_id(a)), "")
    changed = 0
    with _lock:
        state = _load()
        tracks = state.setdefault("tracks", {})
        meta = state.setdefault("track_meta", {})
        for key, existing in list(tracks.items()):
            ex = str(existing or "").strip()
            if ex not in alias_set:
                continue
            replacement = sgc_fallback
            tracks[key] = replacement
            entry = meta.get(key)
            if isinstance(entry, dict) and str(entry.get("worker_id") or "").strip() in alias_set:
                entry["worker_id"] = replacement
            changed += 1
        for entry in meta.values():
            if not isinstance(entry, dict):
                continue
            if str(entry.get("worker_id") or "").strip() in alias_set:
                entry["worker_id"] = sgc_fallback
        _save(state)
    return changed


def bind_patrol_track_identity(
    camera_id: str,
    track_id: str,
    worker_id: str,
    *,
    person_bbox: list[float] | None = None,
    face_emb: list[float] | None = None,
    frame_w: int = 640,
    frame_h: int = 480,
) -> None:
    """Gắn track_id → worker_id đã có (tránh cấp sgc mới cho cùng người)."""
    wid = worker_id.strip()
    if not wid or wid == "unknown":
        return
    key = _track_key(camera_id, track_id)
    with _lock:
        state = _load()
        state["tracks"][key] = wid
        if person_bbox and len(person_bbox) >= 4:
            _remember_track_meta(state, key, wid, person_bbox, face_emb)
        _save(state)


def _bodycam_face_dominant_bbox(
    person_bbox: list[float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Cận mặt cam trước HC-* — đủ tiêu chí cấp sgc dù face embed fail 1 frame."""
    x1, y1, x2, y2 = (float(v) for v in person_bbox[:4])
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    aspect = pw / ph
    bh_ratio = ph / max(float(frame_h), 1.0)
    # Selfie cam trước — bbox lớn, gần vuông
    if bh_ratio >= 0.38 and 0.42 <= aspect <= 1.35:
        return True
    if aspect >= 0.72 and bh_ratio < 0.62:
        return True
    if y1 < frame_h * 0.12 and y2 < frame_h * 0.62 and bh_ratio < 0.55:
        return True
    if aspect >= 0.55 and bh_ratio < 0.42:
        return True
    return False


def _assign_new_tk(state: dict, key: str, pb: list[float] | None, face_emb: list[float] | None) -> tuple[str, str]:
    seq = max(int(state.get("next_seq") or 1), 1)
    tk_id = _format_tk(seq)
    state["next_seq"] = seq + 1
    state["tracks"][key] = tk_id
    if pb and len(pb) >= 4:
        _remember_track_meta(state, key, tk_id, pb, face_emb)
    _save(state)
    return tk_id, tk_id


def resolve_patrol_person_identity(
    detection: PpeDetection,
    camera_id: str,
    track_id: str,
    *,
    person_bbox: list[float] | None = None,
    face_emb: list[float] | None = None,
    frame_face_assignments: dict[str, list[float]] | None = None,
    frame_w: int = 640,
    frame_h: int = 480,
) -> tuple[str, str]:
    """Trả (worker_id, worker_name) — gallery verified hoặc tk-xxxxxxx."""
    from .worker_identity.verify import is_verified_face_match, worker_match_from_detection

    query_emb = _as_emb(face_emb)

    wid = (detection.worker_id or "").strip()
    wname = (detection.worker_name or "").strip()
    match = worker_match_from_detection(detection)
    gallery_verified = bool(wid and wid != "unknown" and is_verified_face_match(match, camera_id))
    if (
        gallery_verified
        and query_emb is not None
        and _conflicts_frame_faces(wid, query_emb, frame_face_assignments)
    ):
        gallery_verified = False

    if gallery_verified:
        key = _track_key(camera_id, track_id)
        with _lock:
            state = _load()
            state["tracks"][key] = wid
            if person_bbox and len(person_bbox) >= 4:
                _remember_track_meta(state, key, wid, person_bbox, face_emb)
            _save(state)
        return _finalize_identity_pair(wid, wname or wid)

    pb = person_bbox
    if pb is None and detection.subject_bbox and len(detection.subject_bbox) >= 4:
        pb = [float(v) for v in detection.subject_bbox]
    elif pb is None and detection.bbox and len(detection.bbox) >= 4:
        pb = [float(v) for v in detection.bbox]

    if query_emb is not None:
        gallery_hit = _match_patrol_gallery_from_embedding(
            query_emb,
            camera_id=camera_id,
            frame_face_assignments=frame_face_assignments,
        )
        if gallery_hit is not None:
            gallery_id, gallery_name, score = gallery_hit
            key = _track_key(camera_id, track_id)
            with _lock:
                state = _load()
                state["tracks"][key] = gallery_id
                if pb and len(pb) >= 4:
                    _remember_track_meta(state, key, gallery_id, pb, face_emb)
                _save(state)
            _apply_patrol_gallery_to_detection(detection, gallery_id, gallery_name, score)
            return _finalize_identity_pair(gallery_id, gallery_name)

        sqlite_hit = _match_sqlite_patrol_face(query_emb)
        if sqlite_hit is not None:
            gallery_id, gallery_name = sqlite_hit
            key = _track_key(camera_id, track_id)
            with _lock:
                state = _load()
                state["tracks"][key] = gallery_id
                if pb and len(pb) >= 4:
                    _remember_track_meta(state, key, gallery_id, pb, face_emb)
                _save(state)
            _apply_patrol_gallery_to_detection(detection, gallery_id, gallery_name, 1.0)
            return _finalize_identity_pair(gallery_id, gallery_name)

    # Không có embedding mặt — giữ sgc/gallery đã gán; HC cận mặt vẫn cấp sgc mới.
    if query_emb is None:
        key = _track_key(camera_id, track_id)
        with _lock:
            state = _load()
            existing = state["tracks"].get(key)
            if isinstance(existing, str) and existing.strip():
                existing = existing.strip()
                from .patrol_entity import is_patrol_gallery_id

                bound = _gallery_from_patrol_binding(existing)
                if bound:
                    gallery_id, gallery_name = bound
                    state["tracks"][key] = gallery_id
                    if pb and len(pb) >= 4:
                        _remember_track_meta(state, key, gallery_id, pb, None)
                    _save(state)
                    return _finalize_identity_pair(gallery_id, gallery_name)
                if is_sgc_worker_id(existing) or is_patrol_gallery_id(existing):
                    if pb and len(pb) >= 4:
                        _remember_track_meta(state, key, existing, pb, None)
                        _save(state)
                    return _finalize_identity_pair(existing, existing)

            if pb and len(pb) >= 4:
                _remember_track_meta(state, key, "", pb, None)
                _save(state)
        return "", ""

    key = _track_key(camera_id, track_id)
    with _lock:
        state = _load()
        existing = state["tracks"].get(key)
        if isinstance(existing, str) and existing.strip():
            existing = existing.strip()
            bound = _gallery_from_patrol_binding(existing)
            if bound:
                gallery_id, gallery_name = bound
                state["tracks"][key] = gallery_id
                if pb and len(pb) >= 4:
                    _remember_track_meta(state, key, gallery_id, pb, face_emb)
                _save(state)
                return _finalize_identity_pair(gallery_id, gallery_name)
            if not is_sgc_worker_id(existing):
                existing = ""
            else:
                holder_emb = _identity_face_emb(state, camera_id, existing)
                if holder_emb is not None and not _face_compatible(query_emb, holder_emb, for_merge=True):
                    existing = ""
            if existing and pb and len(pb) >= 4:
                _remember_track_meta(state, key, existing, pb, face_emb)
                _save(state)
                bound = _gallery_from_patrol_binding(existing)
                if bound:
                    return _finalize_identity_pair(bound[0], bound[1])
                return _finalize_identity_pair(existing, existing)

        if pb and len(pb) >= 4:
            reused = _find_reusable_worker_id(
                state,
                camera_id,
                pb,
                frame_w=frame_w,
                frame_h=frame_h,
                face_emb=query_emb,
                frame_face_assignments=frame_face_assignments,
            )
            if reused:
                bound = _gallery_from_patrol_binding(reused)
                final_id = bound[0] if bound else reused
                final_name = bound[1] if bound else reused
                state["tracks"][key] = final_id
                _remember_track_meta(state, key, final_id, pb, face_emb)
                _save(state)
                return _finalize_identity_pair(final_id, final_name)

        seq = max(int(state.get("next_seq") or 1), 1)
        tk_id = _format_tk(seq)
        state["next_seq"] = seq + 1
        state["tracks"][key] = tk_id
        if pb and len(pb) >= 4:
            _remember_track_meta(state, key, tk_id, pb, face_emb)
        _save(state)
        return _finalize_identity_pair(tk_id, tk_id)
