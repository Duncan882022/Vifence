"""Cầu nối luồng AI → SQLite tuần tra.

Luồng phân tích gọi `record_observation` mỗi khi xác nhận một người trong
khung. Ở đây quyết định người đó là Đối tượng (chưa thấy mặt, sống trong ngày)
hay Người/Định danh (có khuôn mặt, thực thể bền), rồi ghi thẻ sự kiện và lịch
sử xuất hiện.

Tách khỏi `ppe_engine` có chủ ý: engine kia lo vòng đời sự kiện ATLĐ, còn đây
là mô hình nghiệp vụ của Module 05. Trộn hai thứ vào nhau chính là cái đã làm
Module 05 rối tới mức phải viết lại.
"""

from __future__ import annotations

import threading
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


def _write_snapshot(subject_id: str, frame: Any, bbox: Sequence[float]) -> str | None:
    """Cắt vùng người, ghi JPG. Trả đường dẫn tương đối để lưu vào DB."""
    try:
        import cv2
        import numpy as np

        if frame is None or not isinstance(frame, np.ndarray):
            return None
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = (int(v) for v in bbox[:4])
        # Nới nhẹ để không cắt sát mép mặt.
        pad_x = int((x2 - x1) * 0.08)
        pad_y = int((y2 - y1) * 0.08)
        x1 = max(0, x1 - pad_x)
        y1 = max(0, y1 - pad_y)
        x2 = min(w, x2 + pad_x)
        y2 = min(h, y2 + pad_y)
        if x2 - x1 < 16 or y2 - y1 < 16:
            return None

        date = db.today_vn()
        folder = SNAPSHOT_DIR / date
        folder.mkdir(parents=True, exist_ok=True)
        name = f"{subject_id}.jpg"
        cv2.imwrite(str(folder / name), frame[y1:y2, x1:x2],
                    [int(cv2.IMWRITE_JPEG_QUALITY), 85])
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
_track_to_object: dict[str, str] = {}
_track_to_person: dict[str, str] = {}
_lock = threading.Lock()


def _key(camera_id: str, track_id: str) -> str:
    return f"{camera_id}|{track_id}"


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
                face_embedding, quality=face_quality, camera_id=camera_id, now=now
            )
            if obj_id:
                daystore.promote_object(obj_id, pers_id, now=now)
            with _lock:
                _track_to_person[key] = pers_id
        path, shot_score = _shot(pers_id)
        daystore.touch_person_event(
            pers_id,
            camera_id=camera_id,
            zone_id=zone_id,
            snapshot_path=path,
            snapshot_score=shot_score,
            now=now,
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
            now=now,
        )
        return known

    with _lock:
        obj_id = _track_to_object.get(key)
    obj_id = daystore.touch_object(
        obj_id,
        camera_id=camera_id,
        zone_id=zone_id,
        now=now,
    )
    with _lock:
        _track_to_object[key] = obj_id
    path, shot_score = _shot(obj_id)
    if path:
        daystore.touch_object(
            obj_id,
            camera_id=camera_id,
            zone_id=zone_id,
            snapshot_path=path,
            snapshot_score=shot_score,
            now=now,
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


def reset(camera_id: str | None = None) -> None:
    with _lock:
        if camera_id is None:
            _track_to_object.clear()
            _track_to_person.clear()
            return
        prefix = f"{camera_id}|"
        for store in (_track_to_object, _track_to_person):
            for k in [k for k in store if k.startswith(prefix)]:
                store.pop(k, None)
