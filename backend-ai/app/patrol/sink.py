"""Cầu nối luồng AI → SQLite tuần tra.

Luồng phân tích gọi `record_observation` mỗi khi phát hiện một người trong
khung. **Chưa ghi thẻ ngay** — phải bám track đủ vài giây (`patrol_object_confirm_seconds`
/ `patrol_face_object_confirm_seconds` trong config) rồi mới chốt sự kiện vào SQLite.
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


def snapshot_score(*, face_quality: float, confidence: float) -> float:
    """Ảnh nào đáng giữ hơn.

    Thấy mặt là quan trọng hơn hẳn độ chắc của YOLO: thẻ sự kiện tồn tại để
    người trực **nhận ra ai**, mà một tấm lưng rõ nét thì không giúp được gì.
    """
    return float(face_quality) * 2.0 + float(confidence)


def _snapshot_tier(subject_id: str) -> str:
    if subject_id.startswith("obj-"):
        return "object"
    person = identity.get_person(subject_id)
    if person and person.get("status") == identity.STATUS_IDENTIFIED:
        return "identity"
    return "person"


def _write_snapshot(subject_id: str, frame: Any, bbox: Sequence[float]) -> str | None:
    """Full-frame JPG + khung ROI tuần tra — đồng bộ overlay live & popup."""
    try:
        import cv2
        import numpy as np

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
        tier = _snapshot_tier(subject_id)
        colors_bgr = {
            "object": (184, 163, 148),
            "person": (250, 180, 56),
            "identity": (250, 120, 167),
        }
        color = colors_bgr[tier]
        if tier == "object":
            draw_dashed_rectangle(out, (bx1, by1), (bx2, by2), color, thickness=1)
        else:
            cv2.rectangle(out, (bx1, by1), (bx2, by2), color, 2, cv2.LINE_AA)

        person = identity.get_person(subject_id) if not subject_id.startswith("obj-") else None
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
            object_id=subject_id,
            worker_name=identity.display_name(person) if person else None,
        )

        max_side = 1280
        fh, fw = out.shape[:2]
        if max(fh, fw) > max_side:
            scale = max_side / max(fh, fw)
            out = cv2.resize(out, (int(fw * scale), int(fh * scale)), interpolation=cv2.INTER_AREA)

        date = db.today_vn()
        folder = SNAPSHOT_DIR / date
        folder.mkdir(parents=True, exist_ok=True)
        name = f"{subject_id}.jpg"
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
_track_to_object: dict[str, str] = {}
_track_to_person: dict[str, str] = {}
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
        return key in _track_to_object or key in _track_to_person


def _required_confirm_seconds(*, has_face: bool) -> float:
    from ..config import settings

    if has_face:
        return float(settings.patrol_face_object_confirm_seconds)
    return float(settings.patrol_object_confirm_seconds)


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


def record_observation(
    *,
    camera_id: str,
    track_id: str,
    face_embedding: Sequence[float] | None = None,
    face_quality: float = 0.0,
    confidence: float = 0.0,
    frame: Any = None,
    person_bbox: Sequence[float] | None = None,
    zone_id: str | None = None,
    now: float | None = None,
) -> str | None:
    """Ghi một lần quan sát. Trả `pers-*` nếu đã nhận ra mặt, `obj-*` nếu chưa.

    Có khuôn mặt thì thăng thẳng lên Người: `promote_object` kéo theo cả lịch
    sử xuất hiện đã tích luỹ lúc còn là Đối tượng, nên không mất quãng thời
    gian quan sát ban đầu.
    """
    if not camera_id or not track_id:
        return None

    key = _key(camera_id, track_id)
    ts = float(now if now is not None else time.time())

    if not face_embedding or len(face_embedding) == 0:
        if frame is not None and person_bbox is not None:
            from ..worker_identity.recognizer import recover_patrol_face_embedding

            recovered = recover_patrol_face_embedding(
                frame,
                [float(v) for v in person_bbox[:4]],
                camera_id=camera_id,
            )
            if recovered is not None:
                face_embedding, face_quality = recovered

    score = snapshot_score(face_quality=face_quality, confidence=confidence)

    def _shot(subject_id: str) -> tuple[str | None, float]:
        if frame is None or person_bbox is None:
            return None, 0.0
        path = _write_snapshot(subject_id, frame, person_bbox)
        return path, score if path else 0.0

    if face_embedding is not None and len(face_embedding) > 0:
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
        path, shot_score = _shot(pers_id)
        write_ts = anchor_ts if not bound else ts
        daystore.touch_person_event(
            pers_id,
            camera_id=camera_id,
            zone_id=zone_id,
            snapshot_path=path,
            snapshot_score=shot_score,
            now=write_ts,
        )
        if not bound and ts > write_ts:
            daystore.touch_person_event(
                pers_id,
                camera_id=camera_id,
                zone_id=zone_id,
                snapshot_path=path,
                snapshot_score=shot_score,
                now=ts,
            )
        return pers_id

    # Track này từng thấy mặt rồi thì đã là Người — quay lưng một lúc không
    # kéo nó tụt về Đối tượng.
    known = _known_person_for_track(key)
    if known:
        path, shot_score = _shot(known)
        daystore.touch_person_event(
            known,
            camera_id=camera_id,
            zone_id=zone_id,
            snapshot_path=path,
            snapshot_score=shot_score,
            now=ts,
        )
        return known

    ok, anchor_ts = _gate_observation_commit(key, has_face=False, now=ts)
    if not ok:
        return None

    with _lock:
        obj_id = _track_to_object.get(key)
    first_write = obj_id is None
    obj_id = daystore.touch_object(
        obj_id,
        camera_id=camera_id,
        zone_id=zone_id,
        now=anchor_ts if first_write else ts,
    )
    with _lock:
        _track_to_object[key] = obj_id
    if first_write and ts > anchor_ts:
        obj_id = daystore.touch_object(
            obj_id,
            camera_id=camera_id,
            zone_id=zone_id,
            now=ts,
        )
    # Không gắn ảnh portrait lên thẻ Đối tượng — mặt đủ rõ thuộc tab Người.
    if face_quality < _OBJECT_FACE_QUALITY_MAX:
        path, shot_score = _shot(obj_id)
        if path:
            daystore.touch_object(
                obj_id,
                camera_id=camera_id,
                zone_id=zone_id,
                snapshot_path=path,
                snapshot_score=shot_score,
                now=ts,
            )
    return obj_id


def _known_person_for_track(key: str) -> str | None:
    with _lock:
        pers = _track_to_person.get(key)
    if not pers:
        return None
    return identity.resolve_alias(pers)


def forget_track(camera_id: str, track_id: str) -> None:
    key = _key(camera_id, track_id)
    with _lock:
        _track_to_object.pop(key, None)
        _track_to_person.pop(key, None)
        _track_watch.pop(key, None)


def reset(camera_id: str | None = None) -> None:
    with _lock:
        if camera_id is None:
            _track_to_object.clear()
            _track_to_person.clear()
            _track_watch.clear()
            return
        prefix = f"{camera_id}|"
        for store in (_track_to_object, _track_to_person, _track_watch):
            for k in [k for k in store if k.startswith(prefix)]:
                store.pop(k, None)
