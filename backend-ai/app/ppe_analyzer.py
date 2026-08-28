"""Phát hiện PPE — mũ, áo phản quang, giày (3 model YOLO + heuristic fallback)."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import cv2
import numpy as np

from .auto_train.inference import predict_boxes
from .detectors.person_detector import PersonDetector
from .schemas import PpeDetection
from .violation_thresholds import VIOLATION_MIN_CONFIDENCE

logger = logging.getLogger("ppe_analyzer")

PPE_SCENARIO = {
    "hard_hat": "PPE-001",
    "no_helmet": "PPE-001",
    "safety_vest": "PPE-002",
    "no_vest": "PPE-002",
    "safety_shoes": "PPE-003",
    "no_shoes": "PPE-003",
    "person": "PERS-001",
}

PPE_LABELS = {
    "hard_hat": "Mũ BHLD",
    "no_helmet": "Không mũ BHLD",
    "safety_vest": "Áo phản quang",
    "no_vest": "Không áo phản quang",
    "safety_shoes": "Giày BHLD",
    "no_shoes": "Không giày BHLD",
    "person": "CN",
}

_PERSON_CONF = 0.40
_PERSON_CONF_BODYCAM = 0.22
_PERSON_CONF_FLYCAM = 0.15
_PERSON_CONF_STRICT = 0.48
# Dưới mốc này đường vẽ ROI mới đòi thêm bằng chứng (mặt / dáng xa / tín hiệu da).
_PERSON_CONF_DISPLAY_CORROBORATE = 0.45
_VIOLATION_CONF = VIOLATION_MIN_CONFIDENCE
_ITEM_IOU = 0.12
_HELMET_MODEL_MIN_CONF = 0.55
_SHOE_MODEL_MIN_CONF = 0.52
_MODEL_MIN_CONF = 0.62


def _is_helmet_bodycam(camera_id: str) -> bool:
    """HC-xx patrol — góc cận (sát người) và góc rộng (đám đông xa) đều hợp lệ."""
    return camera_id.startswith("HC-")


def _is_patrol_flycam(camera_id: str) -> bool:
    """DR-* flycam tuần tra — góc cao, người nhỏ, không anchor mặt."""
    return camera_id.startswith("DR-")

_person_detector: PersonDetector | None = None
_hc_frame_face_assignments: dict[str, dict[str, list[float]]] = {}


def reset_hc_patrol_face_assignments(camera_id: str) -> None:
    """Đầu frame HC-* — reset map mặt trong khung để tránh gộp 2 người."""
    _hc_frame_face_assignments[camera_id] = {}


def reset_all_hc_patrol_state() -> int:
    """Xóa toàn bộ patrol person tracks và face assignments — dùng khi reset test data."""
    from .patrol_identity_lifecycle import reset as reset_identity_lifecycle
    from .patrol_tracker import reset_patrol_trackers

    count = reset_patrol_trackers()
    reset_identity_lifecycle()
    _hc_frame_face_assignments.clear()
    return count


def assign_patrol_track_ids(
    camera_id: str,
    person_boxes: list[tuple[tuple[float, float, float, float], float]],
    *,
    now: float | None = None,
    frame: np.ndarray | None = None,
) -> list[str | None]:
    """Gán track cho **cả frame** một lượt qua ByteTrack (`patrol_tracker`).

    Phải ghép theo cả khung mới đúng: gán tuần tự từng người rồi chặn lẫn nhau
    (cách cũ) khiến người vào sau cướp track của người kia tuỳ thứ tự YOLO trả về.

    Có `frame` thì ước lượng luôn dịch chuyển của cả khung hình, để tracker
    phân biệt "người đi" với "người đeo lia mũ".
    """
    if not _is_helmet_bodycam(camera_id) and not _is_patrol_flycam(camera_id):
        return [None] * len(person_boxes)
    from .patrol_tracker import get_patrol_tracker

    shift = (0.0, 0.0)
    if frame is not None:
        from .patrol.egomotion import estimate_shift

        shift = estimate_shift(camera_id, frame)

    tracker = get_patrol_tracker(camera_id)
    return tracker.update(
        [(tuple(float(v) for v in box), float(conf)) for box, conf in person_boxes],
        now=now if now is not None else time.time(),
        camera_shift=shift,
    )


def _assign_patrol_person_identity(
    person_det: PpeDetection,
    person_box: tuple[float, float, float, float],
    *,
    frame: np.ndarray,
    camera_id: str,
    frame_w: int,
    frame_h: int,
    track_id: str | None,
) -> None:
    """HC-* / DR-* — gán sgc hoặc để trống (Đối tượng) lên detection trả về FE."""
    if not _is_helmet_bodycam(camera_id) and not _is_patrol_flycam(camera_id):
        return
    if not track_id:
        return

    person_bbox = [float(v) for v in person_box]

    if _is_patrol_flycam(camera_id):
        from .patrol_flight_mode import is_patrol_flycam_aerial

        if is_patrol_flycam_aerial(camera_id):
            # Góc trên cao — YOLO đếm người, không nhận diện mặt / gallery.
            from .patrol_identity_lifecycle import observe as observe_track_identity

            observe_track_identity(
                camera_id,
                track_id,
                worker_id="",
                worker_name="",
            )
            person_det.worker_id = ""
            person_det.worker_name = ""
            person_det.track_id = track_id
            person_det.tier = "object"
            person_det.face_eligible = False
            try:
                from .patrol.sink import record_observation

                record_observation(
                    camera_id=camera_id,
                    track_id=track_id,
                    face_embedding=None,
                    face_quality=0.0,
                    confidence=float(person_det.confidence or 0.0),
                    frame=frame,
                    person_bbox=person_bbox,
                    density_only=True,
                )
            except Exception:  # noqa: BLE001
                logger.exception("[patrol] Flycam aerial — không ghi được quan sát mật độ")
            return
        # proximity flycam — rơi xuống nhánh bodycam bên dưới.

    from .patrol_identity_lifecycle import observe as observe_track_identity, peek as peek_track_lifecycle
    from .person_identity_registry import (
        borrow_cross_camera_patrol_worker,
        peek_patrol_track_identity,
        resolve_patrol_person_identity,
    )
    from .worker_identity.recognizer import assess_patrol_face

    # Cùng thước đo "thấy mặt" với đường ghi sự kiện — nếu không, nhãn ROI và
    # tab sự kiện sẽ nói hai điều khác nhau về cùng một người.
    face_vec, _face_score, face_eligible = assess_patrol_face(
        frame, person_bbox, camera_id=camera_id,
    )
    face_emb = face_vec.tolist() if face_vec is not None else None

    # JPEG nhỏ / góc drone — assess fail trong khi recover selfie vẫn lấy được embedding.
    from .patrol_flight_mode import is_patrol_helmet_like

    if not face_eligible and is_patrol_helmet_like(camera_id):
        from .worker_identity.recognizer import recover_patrol_face_embedding

        recovered = recover_patrol_face_embedding(frame, person_bbox, camera_id=camera_id)
        if recovered is not None:
            face_emb, _face_score = recovered
            face_eligible = True

    frame_faces = _hc_frame_face_assignments.setdefault(camera_id, {})
    worker_id = ""
    worker_name = ""

    if face_eligible and face_emb is not None:
        worker_id, worker_name = resolve_patrol_person_identity(
            person_det,
            camera_id,
            track_id,
            person_bbox=person_bbox,
            face_emb=face_emb,
            frame_face_assignments=frame_faces,
            frame_w=frame_w,
            frame_h=frame_h,
        )
        if worker_id:
            frame_faces[worker_id] = face_emb
    else:
        borrowed = borrow_cross_camera_patrol_worker(
            camera_id,
            person_bbox,
            frame=frame,
            frame_w=frame_w,
            frame_h=frame_h,
            face_emb=face_emb,
        )
        cached = peek_track_lifecycle(camera_id, track_id)
        peek_id = peek_patrol_track_identity(camera_id, track_id) or ""
        if borrowed:
            worker_id, worker_name = borrowed
        elif cached and cached.worker_id:
            worker_id = cached.worker_id or peek_id
            worker_name = cached.worker_name
        elif peek_id:
            worker_id = peek_id
        if worker_id and not worker_name:
            from .patrol_entity import resolve_patrol_worker_display_name

            worker_name = resolve_patrol_worker_display_name(worker_id, "")

    # Tầng lấy từ state machine chứ không suy lại mỗi frame: track đã lên Người /
    # Định danh thì giữ nguyên nhãn kể cả khung hình này quay lưng.
    resolved = observe_track_identity(
        camera_id,
        track_id,
        worker_id=worker_id,
        worker_name=worker_name,
    )

    person_det.worker_id = resolved.worker_id
    person_det.worker_name = resolved.worker_name
    person_det.track_id = track_id
    person_det.tier = resolved.tier
    person_det.face_eligible = face_eligible and face_emb is not None

    # Ghi vào kho tuần tra (SQLite). Vector khuôn mặt chỉ tồn tại ở đúng chỗ
    # này trong cả vòng phân tích — không đẩy qua PpeDetection vì nó được
    # serialize thẳng xuống trình duyệt.
    try:
        from .patrol.sink import record_observation

        record_observation(
            camera_id=camera_id,
            track_id=track_id,
            face_embedding=face_emb if person_det.face_eligible else None,
            face_quality=float(_face_score or 0.0),
            confidence=float(person_det.confidence or 0.0),
            frame=frame,
            person_bbox=person_bbox,
        )
    except Exception:  # noqa: BLE001
        # Kho tuần tra hỏng không được kéo sập luồng live.
        logger.exception("[patrol] Không ghi được quan sát vào SQLite")


def _patrol_person_passes_event_gate(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    face_eligible: bool = False,
    has_stable_id: bool = False,
) -> bool:
    from .patrol_person_visibility import patrol_person_meets_detection_gate

    return patrol_person_meets_detection_gate(
        person_box,
        frame_w,
        frame_h,
        face_dominant=_face_dominant_person_box(person_box, frame_w, frame_h),
        face_eligible=face_eligible,
        has_stable_id=has_stable_id,
    )


def _patrol_person_passes_display_gate(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    camera_id: str,
) -> bool:
    from .patrol_flight_mode import is_patrol_flycam_aerial, is_patrol_helmet_like
    from .patrol_person_visibility import patrol_person_meets_display_gate

    if is_patrol_helmet_like(camera_id):
        return patrol_person_meets_display_gate(person_box, frame_w, frame_h)
    if is_patrol_flycam_aerial(camera_id):
        return patrol_person_meets_display_gate(
            person_box, frame_w, frame_h, flycam=True,
        )
    return patrol_person_meets_display_gate(person_box, frame_w, frame_h)


def _assign_patrol_person_display_only(
    person_det: PpeDetection,
    *,
    camera_id: str,
    track_id: str | None,
    frame: np.ndarray | None = None,
    person_box: tuple[float, float, float, float] | None = None,
) -> None:
    """ROI-only — track id + nhãn đã cache, không chạy face/embed lại.

    Track đã commit (obj/pers) vẫn touch sink để sự kiện không đứng khi quay
    lưng hoặc ngồi — những khung hình không đủ gate hình học ghi sự kiện.
    """
    if not track_id:
        return
    from .patrol_identity_lifecycle import peek as peek_track_identity

    person_det.track_id = track_id
    cached = peek_track_identity(camera_id, track_id)
    if cached is not None:
        person_det.worker_id = cached.worker_id
        person_det.worker_name = cached.worker_name
        person_det.tier = cached.tier
    else:
        person_det.tier = "object"

    if cached is None or not cached.worker_id:
        return
    try:
        from .patrol.sink import record_observation

        record_observation(
            camera_id=camera_id,
            track_id=track_id,
            confidence=float(person_det.confidence or 0.0),
            frame=frame,
            person_bbox=[float(v) for v in person_box] if person_box is not None else None,
        )
    except Exception:  # noqa: BLE001
        logger.exception("[patrol] Không touch sink cho track display-only")


def _get_person_detector() -> PersonDetector:
    global _person_detector
    if _person_detector is None:
        _person_detector = PersonDetector(conf_threshold=_PERSON_CONF)
        _person_detector.load()
    return _person_detector


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _intersection_area(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    return (ix2 - ix1) * (iy2 - iy1)


def _sub_region(box: tuple[float, float, float, float], y0: float, y1: float) -> tuple[float, float, float, float]:
    x1, py1, x2, py2 = box
    ph = py2 - py1
    return x1, py1 + ph * y0, x2, py1 + ph * y1


def _head_region_for_helmet(person_box: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """Vùng quét mũ — mở rộng nhẹ phía trên bbox YOLO (có thể tràn sang nền phía sau)."""
    return _cap_region_for_helmet(person_box)


def _chest_scan_region(
    person_box: tuple[float, float, float, float],
    *,
    camera_id: str = "",
) -> tuple[float, float, float, float]:
    """Vùng ngực áo BHLD — tránh cổ/mặt (trên) và bụng (dưới).

    Bodycam HC-* cận mặt: hạ band xuống 42–68% để không khoanh mắt/trán.
    """
    if _is_helmet_bodycam(camera_id):
        return _sub_region(person_box, 0.42, 0.68)
    return _sub_region(person_box, 0.30, 0.58)


def _torso_violation_scan_region(
    person_box: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    """Vùng quét áo — khớp chest band trong analyze_ppe_frame."""
    return _chest_scan_region(person_box)


def _torso_violation_display_bbox(
    person_box: tuple[float, float, float, float],
    *,
    scan_region: tuple[float, float, float, float] | None = None,
) -> tuple[float, float, float, float]:
    """Vùng áo BHLD snapshot — bám ngực, không tràn lên vai/cổ."""
    region = scan_region or _chest_scan_region(person_box)
    x1, y1, x2, y2 = region
    pw = max(x2 - x1, 1.0)
    ph = max(y2 - y1, 1.0)
    return (
        x1 + pw * 0.08,
        y1 + ph * 0.06,
        x2 - pw * 0.08,
        y2 - ph * 0.08,
    )


def _helmet_violation_display_bbox(
    person_box: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    """ROI snapshot no_helmet — gọn vùng đỉnh đầu, không kéo quá cao."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    return (
        x1 + pw * 0.16,
        max(0.0, y1 - ph * 0.08),
        x2 - pw * 0.16,
        y1 + ph * 0.20,
    )


def ppe_violation_display_bbox(
    person_box: tuple[float, float, float, float],
    behavior: str,
    frame_h: int,
    *,
    scan_region: tuple[float, float, float, float] | None = None,
) -> tuple[float, float, float, float]:
    """BBox hiển thị snapshot/overlay — bám vùng quét PPE thực tế."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    if behavior == "no_helmet":
        return _helmet_violation_display_bbox(person_box)
    if behavior == "no_vest":
        return _torso_violation_display_bbox(
            person_box,
            scan_region=scan_region or _torso_violation_scan_region(person_box),
        )
    if behavior == "no_shoes":
        if scan_region and len(scan_region) >= 4:
            return scan_region
        return _feet_region(person_box, frame_h)
    return person_box


def _face_dominant_person_box(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """True khi bbox người gần như chỉ mặt/đầu — không đủ ngực để chấm áo."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    aspect = pw / ph
    bh_ratio = ph / max(float(frame_h), 1.0)
    # Cận mặt: khung vuông/ngang hoặc thân thấp trên nửa trên ảnh.
    if aspect >= 0.72 and bh_ratio < 0.62:
        return True
    if y1 < frame_h * 0.12 and y2 < frame_h * 0.62 and bh_ratio < 0.55:
        return True
    if aspect >= 0.55 and bh_ratio < 0.42:
        return True
    return False


def _vest_roi_overlaps_face(
    person_box: tuple[float, float, float, float],
    roi_box: tuple[float, float, float, float],
    *,
    max_head_overlap_ratio: float = 0.18,
    camera_id: str = "",
) -> bool:
    """ROI áo trùng vùng mặt/đầu — không vẽ snapshot."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    # Bodycam: đầu/cổ ~ top 36% — đủ chặn mắt/trán, không nuốt band ngực 42–68%.
    head_frac = 0.36 if _is_helmet_bodycam(camera_id) else 0.26
    head = (x1 + pw * 0.08, y1, x2 - pw * 0.08, y1 + ph * head_frac)
    roi_area = max((roi_box[2] - roi_box[0]) * (roi_box[3] - roi_box[1]), 1.0)
    if _intersection_area(roi_box, head) / roi_area > max_head_overlap_ratio:
        return True
    rcy = (roi_box[1] + roi_box[3]) / 2.0
    min_rcy_frac = 0.45 if _is_helmet_bodycam(camera_id) else 0.28
    if rcy < y1 + ph * min_rcy_frac:
        return True
    return False


def _resolve_vest_snapshot_bbox(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    camera_id: str = "",
) -> tuple[float, float, float, float] | None:
    """BBox ROI snapshot no_vest — luôn bám ngực, không khoanh mặt."""
    if _face_dominant_person_box(person_box, frame_w, frame_h):
        return None
    if not _torso_assessable(person_box, frame_w, frame_h, camera_id=camera_id):
        return None

    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    chest = _chest_scan_region(person_box, camera_id=camera_id)
    display = _torso_violation_display_bbox(person_box, scan_region=chest)
    clipped = _clip_box_to_frame(display, frame_w, frame_h)

    min_y1_frac = 0.42 if _is_helmet_bodycam(camera_id) else 0.30
    min_y1 = y1 + ph * min_y1_frac
    if clipped[1] < min_y1:
        clipped = (clipped[0], min_y1, clipped[2], clipped[3])

    min_h = max(ph * 0.08, float(frame_h) * 0.035)
    if _is_helmet_bodycam(camera_id):
        min_h = max(ph * 0.10, float(frame_h) * 0.042)
    if (clipped[3] - clipped[1]) < min_h:
        return None

    if _vest_roi_overlaps_face(person_box, clipped, camera_id=camera_id):
        return None

    if _is_helmet_bodycam(camera_id):
        rcy = (clipped[1] + clipped[3]) / 2.0
        if rcy < y1 + ph * 0.45:
            return None

    return clipped


def snapshot_annotation_detection(
    detection: PpeDetection,
    frame_w: int,
    frame_h: int,
    *,
    camera_id: str = "",
    frame: object | None = None,
) -> PpeDetection:
    """BBox vẽ ROI snapshot — vest/helmet tái tính từ bbox người, không dùng bbox lệch."""
    if detection.behavior in ("no_vest", "safety_vest"):
        pb = raw_person_bbox(detection)
        if pb and len(pb) >= 4:
            person_tuple = tuple(float(v) for v in pb)
            resolved = _resolve_vest_snapshot_bbox(
                person_tuple,
                frame_w,
                frame_h,
                camera_id=camera_id,
            )
            if resolved is not None:
                return detection.model_copy(
                    update={"bbox": [float(v) for v in resolved]},
                )
            return detection.model_copy(update={"bbox": [0.0, 0.0, 0.0, 0.0]})

    if detection.behavior == "no_helmet":
        pb = raw_person_bbox(detection)
        if pb and len(pb) >= 4:
            helmet = _clip_box_to_frame(
                _helmet_violation_display_bbox(tuple(float(v) for v in pb)),
                frame_w,
                frame_h,
            )
            return detection.model_copy(update={"bbox": [float(v) for v in helmet]})

    if detection.behavior == "person":
        pb = raw_person_bbox(detection)
        if pb and len(pb) >= 4:
            person_tuple = tuple(float(v) for v in pb)
            if frame is not None:
                from .patrol_person_visibility import resolve_patrol_person_snapshot_bbox

                resolved = resolve_patrol_person_snapshot_bbox(
                    frame,
                    person_tuple,
                    frame_w,
                    frame_h,
                    camera_id=camera_id,
                )
                if resolved is not None:
                    return detection.model_copy(
                        update={"bbox": [float(v) for v in resolved]},
                    )
                return detection.model_copy(update={"bbox": [0.0, 0.0, 0.0, 0.0]})
            clipped = _clip_box_to_frame(person_tuple, frame_w, frame_h)
            return detection.model_copy(update={"bbox": [float(v) for v in clipped]})

    if detection.bbox and len(detection.bbox) >= 4:
        clipped = _clip_box_to_frame(
            tuple(float(v) for v in detection.bbox),
            frame_w,
            frame_h,
        )
        return detection.model_copy(update={"bbox": [float(v) for v in clipped]})
    return detection


def raw_person_bbox(det: PpeDetection) -> list[float]:
    """BBox YOLO gốc — dùng cho snapshot PPE, không dùng bbox overlay đã cắt."""
    if det.subject_bbox and len(det.subject_bbox) >= 4:
        return [float(v) for v in det.subject_bbox]
    return [float(v) for v in det.bbox]


def _cap_region_for_helmet(person_box: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """Vùng quét mũ (detect) — mở nhẹ phía trên bbox YOLO; ROI snapshot dùng _helmet_violation_display_bbox."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    return (
        x1 + pw * 0.06,
        max(0.0, y1 - ph * 0.22),
        x2 - pw * 0.06,
        y1 + ph * 0.10,
    )


def _helmet_detection_valid(
    person_box: tuple[float, float, float, float],
    helmet_box: tuple[float, float, float, float],
) -> bool:
    """Mũ phải đủ lớn và nằm trên đỉnh bbox người — loại mảnh sáng máy xúc."""
    px1, py1, px2, py2 = person_box
    ph = max(py2 - py1, 1.0)
    pw = max(px2 - px1, 1.0)
    hx1, hy1, hx2, hy2 = helmet_box
    hw = max(hx2 - hx1, 0.0)
    hh = max(hy2 - hy1, 0.0)
    if hw < pw * 0.20 or hh < ph * 0.045:
        return False
    cx = (hx1 + hx2) / 2.0
    cy = (hy1 + hy2) / 2.0
    if cx < px1 + pw * 0.10 or cx > px2 - pw * 0.10:
        return False
    cap_like = hw >= pw * 0.38
    if cap_like:
        if cy > py1 + ph * 0.14 or cy < py1 - ph * 0.48:
            return False
    elif cy > py1 + ph * 0.10 or cy < py1 - ph * 0.06:
        return False
    return True


def _scan_white_helmet_cap(
    frame: np.ndarray,
    person_box: tuple[float, float, float, float],
) -> tuple[float, float, float, float] | None:
    """Quét mũ trắng/vàng trên đỉnh người — xử lý bbox YOLO cắt thấp (mũ nằm trên y1)."""
    cap_region = _cap_region_for_helmet(person_box)
    crop = _region_crop(frame, cap_region)
    if crop.size == 0:
        return None
    crop_h, crop_w = crop.shape[:2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([0, 0, 138]), np.array([180, 90, 255])),
        cv2.inRange(hsv, np.array([15, 55, 95]), np.array([40, 255, 255])),
    )
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), 2)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best: tuple[float, tuple[int, int, int, int]] | None = None
    for cnt in sorted(cnts, key=cv2.contourArea, reverse=True)[:8]:
        area = cv2.contourArea(cnt)
        if area < 72:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw < crop_w * 0.24 or bh < crop_h * 0.07:
            continue
        aspect = bw / max(bh, 1)
        if not 0.65 <= aspect <= 3.8:
            continue
        cy = y + bh / 2.0
        if cy < crop_h * 0.08 and area < 220:
            continue
        score = area + (36.0 if cy >= crop_h * 0.34 else 0.0)
        if best is None or score > best[0]:
            best = (score, (x, y, bw, bh))
    if best is None:
        return None
    x, y, bw, bh = best[1]
    rx1, ry1, _, _ = cap_region
    helmet = (rx1 + x, ry1 + y, rx1 + x + bw, ry1 + y + bh)
    if not _helmet_detection_valid(person_box, helmet):
        return None
    return helmet


def _resolve_person_helmet(
    frame: np.ndarray,
    person_box: tuple[float, float, float, float],
    head: tuple[float, float, float, float],
    helmet_items: list[tuple[tuple[float, float, float, float], float]],
    *,
    camera_id: str = "A-04",
) -> tuple[tuple[float, float, float, float], float] | None:
    bodycam = _is_helmet_bodycam(camera_id)
    min_conf = 0.78 if bodycam else _HELMET_MODEL_MIN_CONF
    model_helmet = _best_helmet_for_head(helmet_items, head, min_conf=min_conf)
    if model_helmet and _helmet_detection_valid(person_box, model_helmet[0]):
        return model_helmet
    if bodycam:
        return None
    hb = _heuristic_helmet(frame, head)
    if hb and _helmet_detection_valid(person_box, hb):
        return (hb, 0.62)
    cap = _scan_white_helmet_cap(frame, person_box)
    if cap:
        return (cap, 0.68)
    return None


def _feet_region(
    person_box: tuple[float, float, float, float],
    frame_h: int,
) -> tuple[float, float, float, float]:
    """Vùng mắt cá — hẹp hơn, tránh gom quá nhiều nền bùn công trường."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    fy1 = y1 + ph * 0.80
    fy2 = min(float(frame_h), y2 + ph * 0.04)
    return x1, fy1, x2, fy2


def _foot_environment_ratios(crop: np.ndarray) -> dict[str, float]:
    """Tách nền đất/bùn/vũng khỏi da chân — tránh false-positive no_shoes trên nền công trường."""
    if crop.size == 0:
        return {"mud_ratio": 0.0, "pants_ratio": 0.0, "puddle_ratio": 0.0}
    h, w = crop.shape[:2]
    area = max(h * w, 1)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mud = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([8, 25, 25]), np.array([28, 170, 130])),
        cv2.inRange(hsv, np.array([0, 0, 35]), np.array([180, 55, 110])),
    )
    pants = cv2.inRange(hsv, np.array([95, 35, 25]), np.array([130, 255, 180]))
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    puddle = cv2.bitwise_and(
        (gray < 88).astype(np.uint8) * 255,
        cv2.inRange(hsv, np.array([0, 0, 20]), np.array([180, 80, 120])),
    )
    return {
        "mud_ratio": float(cv2.countNonZero(mud)) / area,
        "pants_ratio": float(cv2.countNonZero(pants)) / area,
        "puddle_ratio": float(cv2.countNonZero(puddle)) / area,
    }


def _foot_skin_mask(hsv: np.ndarray) -> np.ndarray:
    """Da chân — loại bùn nâu/xám công trường (hay gây FP no_shoes)."""
    skin = cv2.inRange(hsv, np.array([0, 38, 88]), np.array([18, 145, 245]))
    mud = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([8, 20, 25]), np.array([28, 150, 120])),
        cv2.inRange(hsv, np.array([0, 0, 35]), np.array([180, 70, 125])),
    )
    return cv2.bitwise_and(skin, cv2.bitwise_not(mud))


def _upper_foot_skin_ratio(crop: np.ndarray) -> float:
    """Tỷ lệ da ở nửa trên vùng chân — tách khỏi bùn phía dưới crop."""
    if crop.size == 0:
        return 0.0
    h, w = crop.shape[:2]
    upper = crop[: max(int(h * 0.58), 1)]
    if upper.size == 0:
        return 0.0
    hsv = cv2.cvtColor(upper, cv2.COLOR_BGR2HSV)
    skin = _foot_skin_mask(hsv)
    return float(cv2.countNonZero(skin)) / max(upper.shape[0] * upper.shape[1], 1)


def _feet_view_obstructed(env: dict[str, float]) -> bool:
    """Không đủ căn cứ — nền bùn/vũng che chân (Cam A-04 hay FP no_shoes)."""
    mud = env.get("foot_mud_ratio", env["mud_ratio"])
    if mud > 0.28:
        return True
    if env.get("mud_ratio", 0.0) > 0.36:
        return True
    return env.get("foot_puddle_ratio", env["puddle_ratio"]) > 0.30


def _region_crop(frame: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return frame[0:0, 0:0]
    return frame[y1:y2, x1:x2]


def _looks_like_white_helmet_dome(crop: np.ndarray) -> tuple[int, int, int, int] | None:
    """Mũ trắng phủ gần hết head crop — contour full-frame bị anti-glare rule chặn."""
    crop_h, crop_w = crop.shape[:2]
    if crop_h < 12 or crop_w < 10:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    upper_rows = max(int(crop_h * 0.38), 1)
    mid_rows = max(int(crop_h * 0.62), upper_rows + 1)
    v_top = float(np.mean(hsv[:upper_rows, :, 2]))
    v_mid = float(np.mean(hsv[upper_rows:mid_rows, :, 2]))
    v_bot = float(np.mean(hsv[mid_rows:, :, 2])) if mid_rows < crop_h else v_mid
    mean_s = float(np.mean(hsv[:, :, 1]))
    if v_top < 168 or mean_s > 88:
        return None
    skin = cv2.inRange(hsv, np.array([0, 20, 40]), np.array([25, 180, 220]))
    skin_ratio = cv2.countNonZero(skin) / max(crop_h * crop_w, 1)
    if skin_ratio > 0.10:
        return None
    dome = v_top >= v_mid + 8 or (v_top >= 185 and v_bot <= v_top - 18 and v_top >= v_mid + 3)
    if not dome:
        return None
    cap_rows = crop[: max(int(crop_h * 0.52), 1)]
    cap_hsv = cv2.cvtColor(cap_rows, cv2.COLOR_BGR2HSV)
    bright = cv2.inRange(cap_hsv, np.array([0, 0, 155]), np.array([180, 75, 255]))
    bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), 1)
    ys, xs = np.where(bright > 0)
    if len(xs) < 12:
        return None
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    if x1 - x0 < 8 or y1 - y0 < 6:
        return None
    return x0, y0, x1 + 1, y1 + 1


def _helmet_cap_plausible(x: int, y: int, bw: int, bh: int, crop_w: int, crop_h: int) -> bool:
    """Mũ nằm trên đỉnh đầu — loại dải sáng nền trời/lưới ở mép khung."""
    if bw < 8 or bh < 6:
        return False
    if x <= 1 and bw >= crop_w * 0.78:
        return False
    if x + bw >= crop_w - 1 and bw >= crop_w * 0.78:
        return False
    if y > crop_h * 0.55:
        return False
    cx = x + bw / 2
    if cx < crop_w * 0.14 or cx > crop_w * 0.86:
        return False
    aspect = bw / max(bh, 1)
    if not 0.45 <= aspect <= 4.5:
        return False
    return True


def _helmet_patch_looks_real(
    crop: np.ndarray,
    x: int,
    y: int,
    bw: int,
    bh: int,
    contour_area: float,
    crop_w: int,
) -> bool:
    patch = crop[y : y + bh, x : x + bw]
    if patch.size == 0:
        return False
    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
    mean_s = float(np.mean(hsv[:, :, 1]))
    mean_v = float(np.mean(hsv[:, :, 2]))
    fill = contour_area / max(bw * bh, 1)
    if mean_s < 38 and mean_v < 150:
        return False
    if mean_s < 42 and mean_v < 145 and bw >= crop_w * 0.40:
        return False
    if fill < 0.22 and mean_s < 35:
        return False
    return True


def _heuristic_helmet(frame: np.ndarray, head: tuple[float, float, float, float]) -> tuple[float, float, float, float] | None:
    crop = _region_crop(frame, head)
    if crop.size == 0:
        return None
    crop_h, crop_w = crop.shape[:2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([0, 0, 150]), np.array([180, 65, 255])),
        cv2.inRange(hsv, np.array([15, 60, 100]), np.array([40, 255, 255])),
    )
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), 1)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best: tuple[float, tuple[int, int, int, int]] | None = None
    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if area < 40:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        plausible = _helmet_cap_plausible(x, y, bw, bh, crop_w, crop_h)
        full_dome = (
            not plausible
            and x <= 2
            and y <= 6
            and bw >= crop_w * 0.62
            and _looks_like_white_helmet_dome(crop) is not None
        )
        if not plausible and not full_dome:
            continue
        if not full_dome and not _helmet_patch_looks_real(crop, x, y, bw, bh, area, crop_w):
            continue
        score = area + (24.0 if y <= crop_h * 0.22 else 0.0)
        if best is None or score > best[0]:
            best = (score, (x, y, bw, bh))
    if best is not None:
        x, y, bw, bh = best[1]
        hx1, hy1, _, _ = head
        return hx1 + x, hy1 + y, hx1 + x + bw, hy1 + y + bh

    dome_box = _looks_like_white_helmet_dome(crop)
    if dome_box is not None:
        x0, y0, x1, y1 = dome_box
        hx1, hy1, _, _ = head
        return hx1 + x0, hy1 + y0, hx1 + x1, hy1 + y1

    upper = crop[: max(int(crop_h * 0.62), 1)]
    if upper.size == 0:
        return None
    upper_hsv = cv2.cvtColor(upper, cv2.COLOR_BGR2HSV)
    cap = cv2.inRange(upper_hsv, np.array([0, 0, 155]), np.array([180, 60, 255]))
    cap = cv2.morphologyEx(cap, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), 1)
    cap_cnts, _ = cv2.findContours(cap, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in sorted(cap_cnts, key=cv2.contourArea, reverse=True):
        area = cv2.contourArea(cnt)
        if area < 36:
            break
        x, y, bw, bh = cv2.boundingRect(cnt)
        if not _helmet_cap_plausible(x, y, bw, bh, upper.shape[1], upper.shape[0]):
            continue
        if not _helmet_patch_looks_real(upper, x, y, bw, bh, area, upper.shape[1]):
            continue
        hx1, hy1, _, _ = head
        return hx1 + x, hy1 + y, hx1 + x + bw, hy1 + y + bh
    return None


def _heuristic_vest(
    frame: np.ndarray,
    torso: tuple[float, float, float, float],
    *,
    min_contour_area: float = 180.0,
) -> tuple[float, float, float, float] | None:
    crop = _region_crop(frame, torso)
    if crop.size == 0:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([25, 85, 85]), np.array([45, 255, 255])),
        cv2.inRange(hsv, np.array([38, 65, 65]), np.array([85, 255, 255])),
    )
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), 2)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    cnt = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(cnt) < min_contour_area:
        return None
    x, y, bw, bh = cv2.boundingRect(cnt)
    tx1, ty1, _, _ = torso
    return tx1 + x, ty1 + y, tx1 + x + bw, ty1 + y + bh


def _resolve_person_vest(
    frame: np.ndarray,
    torso: tuple[float, float, float, float],
    vest_items: list,
    *,
    camera_id: str = "",
) -> tuple[tuple[float, float, float, float], float] | None:
    """Áo BHLD — bodycam HC-*: heuristic dễ FP, cần model hoặc blob vest đủ lớn."""
    bodycam = _is_helmet_bodycam(camera_id)
    model_min = 0.58 if bodycam else 0.70
    model_vest = _best_in_region(vest_items, torso)
    if model_vest and model_vest[1] >= model_min:
        return model_vest

    heuristic_min = 320.0 if bodycam else 180.0
    vb = _heuristic_vest(frame, torso, min_contour_area=heuristic_min)
    if vb is None:
        return None
    if not bodycam:
        return (vb, 0.60)

    tx1, ty1, tx2, ty2 = torso
    tw = max(tx2 - tx1, 1.0)
    th = max(ty2 - ty1, 1.0)
    vw = max(vb[2] - vb[0], 0.0)
    vh = max(vb[3] - vb[1], 0.0)
    if vw >= tw * 0.28 and vh >= th * 0.18:
        return (vb, 0.62)
    return None


def _feet_metrics(frame: np.ndarray, feet: tuple[float, float, float, float]) -> dict[str, float]:
    crop = _region_crop(frame, feet)
    env = _foot_environment_ratios(crop)
    if crop.size == 0:
        return {
            "skin_ratio": 0.0,
            "lower_skin_ratio": 0.0,
            "bottom_dark_nonskin": 0.0,
            "max_shoe_contour": 0.0,
            "bottom_area": 0.0,
            "bottom_skin_ratio": 0.0,
            "shoe_aspect": 0.0,
            "mud_ratio": 0.0,
            "pants_ratio": 0.0,
            "puddle_ratio": 0.0,
            "foot_mud_ratio": 0.0,
            "foot_puddle_ratio": 0.0,
        }
    h, w = crop.shape[:2]
    foot_band = crop[int(h * 0.35) :, :]
    foot_env = _foot_environment_ratios(foot_band) if foot_band.size > 0 else env
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    skin = _foot_skin_mask(hsv)
    skin_ratio = float(skin.sum() / 255) / (h * w)

    lower = crop[int(h * 0.35) :]
    lh, lw = lower.shape[:2]
    lower_hsv = cv2.cvtColor(lower, cv2.COLOR_BGR2HSV)
    lower_skin = _foot_skin_mask(lower_hsv)
    lower_skin_ratio = float(lower_skin.sum() / 255) / (lh * lw) if lh * lw else 0.0

    bottom = crop[int(h * 0.55) :]
    bh, bw = bottom.shape[:2]
    bottom_hsv = cv2.cvtColor(bottom, cv2.COLOR_BGR2HSV)
    bottom_skin = _foot_skin_mask(bottom_hsv)
    bottom_gray = cv2.cvtColor(bottom, cv2.COLOR_BGR2GRAY)
    bottom_dark = (bottom_gray < 90).astype(np.uint8) * 255
    bottom_mud = cv2.inRange(bottom_hsv, np.array([8, 20, 25]), np.array([28, 150, 120]))
    bottom_dark = cv2.bitwise_and(bottom_dark, cv2.bitwise_not(bottom_skin))
    bottom_dark = cv2.bitwise_and(bottom_dark, cv2.bitwise_not(bottom_mud))
    bottom_dark_nonskin = float(bottom_dark.sum() / 255) / (bh * bw) if bh * bw else 0.0

    cnts, _ = cv2.findContours(bottom_dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    max_shoe_contour = float(max((cv2.contourArea(c) for c in cnts), default=0.0))
    bottom_area = float(bh * bw)
    bottom_skin_ratio = float(bottom_skin.sum() / 255) / bottom_area if bottom_area else 0.0

    shoe_aspect = 0.0
    if cnts:
        cnt = max(cnts, key=cv2.contourArea)
        _, _, bw2, bh2 = cv2.boundingRect(cnt)
        shoe_aspect = float(bh2 / max(bw2, 1))

    return {
        "skin_ratio": skin_ratio,
        "lower_skin_ratio": lower_skin_ratio,
        "bottom_dark_nonskin": bottom_dark_nonskin,
        "max_shoe_contour": max_shoe_contour,
        "bottom_area": bottom_area,
        "bottom_skin_ratio": bottom_skin_ratio,
        "shoe_aspect": shoe_aspect,
        "mud_ratio": env["mud_ratio"],
        "pants_ratio": env["pants_ratio"],
        "puddle_ratio": env["puddle_ratio"],
        "foot_mud_ratio": foot_env["mud_ratio"],
        "foot_puddle_ratio": foot_env["puddle_ratio"],
    }


def _min_shoe_contour(bottom_area: float) -> float:
    return max(70.0, bottom_area * 0.065)


def _looks_barefoot_or_open_footwear(metrics: dict[str, float], *, foot_crop: np.ndarray | None = None) -> bool:
    """Chân trần / dép — cần da rõ ở vùng mắt cá, không phải bùn nền."""
    if _feet_view_obstructed(metrics):
        return False
    if metrics.get("mud_ratio", 0.0) > 0.30 or metrics.get("foot_mud_ratio", 0.0) > 0.26:
        return False
    if metrics.get("pants_ratio", 0.0) > 0.16 and metrics.get("max_shoe_contour", 0.0) < 40:
        return False

    upper_skin = _upper_foot_skin_ratio(foot_crop) if foot_crop is not None and foot_crop.size else 0.0
    if upper_skin < 0.07:
        return False

    lower_skin = metrics["lower_skin_ratio"]
    bottom_dark = metrics["bottom_dark_nonskin"]
    max_contour = metrics["max_shoe_contour"]
    bottom_area = metrics.get("bottom_area", 0.0)
    bottom_skin = metrics.get("bottom_skin_ratio", 0.0)
    shoe_aspect = metrics.get("shoe_aspect", 0.0)
    min_contour = _min_shoe_contour(bottom_area)

    if lower_skin > 0.92 and bottom_dark < 0.06 and upper_skin > 0.10:
        return True

    # Vệt bùn / nhiễu dọc — không phải chân trần
    if shoe_aspect > 1.6 and max_contour < min_contour * 0.42:
        return False
    if max_contour < 28 and bottom_dark < 0.12:
        return False

    # Giày bảo hộ — contour đủ lớn, tối, không phải dép mỏng
    if shoe_aspect >= 0.72 and max_contour >= min_contour and bottom_dark >= 0.10:
        return False
    if bottom_dark >= 0.115 and max_contour >= 100:
        if shoe_aspect >= 0.66 or bottom_skin < 0.80:
            return False
    if shoe_aspect < 0.66 and bottom_skin > 0.82 and max_contour >= 95:
        return False

    # Dép / hở ngón — da rõ + không có khối giày
    if (
        max_contour < min_contour * 1.35
        and shoe_aspect < 0.66
        and bottom_skin > 0.80
        and lower_skin > 0.78
        and upper_skin > 0.09
    ):
        return True
    if lower_skin > 0.82 and upper_skin > 0.10 and max_contour < min_contour * 0.85:
        return True

    return False


def _split_feet_halves(
    feet: tuple[float, float, float, float],
) -> tuple[tuple[float, float, float, float], tuple[float, float, float, float]]:
    x1, y1, x2, y2 = feet
    fw = x2 - x1
    gap = max(4.0, fw * 0.08)
    mid = (x1 + x2) / 2
    left = (x1, y1, mid - gap / 2, y2)
    right = (mid + gap / 2, y1, x2, y2)
    return left, right


def _best_shoe_for_feet(
    items: list[tuple[tuple[float, float, float, float], float]],
    feet: tuple[float, float, float, float],
) -> tuple[tuple[float, float, float, float], float] | None:
    """Model giày thường bbox cả 2 bên — khớp trước khi tách trái/phải."""
    x1, y1, x2, y2 = feet
    sole_y1 = y1 + (y2 - y1) * 0.20
    best: tuple[tuple[float, float, float, float], float] | None = None
    for box, conf in items:
        if conf < _SHOE_MODEL_MIN_CONF:
            continue
        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        if not (x1 - (x2 - x1) * 0.05 <= cx <= x2 + (x2 - x1) * 0.05):
            continue
        if not (sole_y1 <= cy <= y2 + (y2 - y1) * 0.12):
            continue
        if _iou(box, feet) < 0.06:
            continue
        if best is None or conf > best[1]:
            best = (box, conf)
    return best


def _best_shoe_for_foot(
    items: list[tuple[tuple[float, float, float, float], float]],
    foot: tuple[float, float, float, float],
) -> tuple[tuple[float, float, float, float], float] | None:
    """Model giày — khớp tâm/overlap vùng mắt cá."""
    x1, y1, x2, y2 = foot
    sole_y1 = y1 + (y2 - y1) * 0.35
    best: tuple[tuple[float, float, float, float], float] | None = None
    for box, conf in items:
        if conf < _SHOE_MODEL_MIN_CONF:
            continue
        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        if not (x1 <= cx <= x2 and sole_y1 <= cy <= y2 + (y2 - y1) * 0.08):
            continue
        if _iou(box, foot) < 0.03 and not (x1 <= box[0] and box[2] <= x2):
            continue
        if best is None or conf > best[1]:
            best = (box, conf)
    return best


def _shoe_detection_for_foot(
    frame: np.ndarray,
    foot: tuple[float, float, float, float],
    *,
    shoe_items: list[tuple[tuple[float, float, float, float], float]] | None = None,
) -> tuple[str, tuple[float, float, float, float], float] | None:
    """Trả ('safety_shoes'|'no_shoes', bbox, conf) cho một bên chân."""
    fx1, fy1, fx2, fy2 = foot
    if fx2 - fx1 < 8 or fy2 - fy1 < 8:
        return None

    foot_crop = _region_crop(frame, foot)
    metrics = _feet_metrics(frame, foot)

    if shoe_items and not _feet_view_obstructed(metrics):
        model_shoe = _best_shoe_for_foot(shoe_items, foot)
        if model_shoe:
            return ("safety_shoes", model_shoe[0], model_shoe[1])

    sb = _heuristic_shoes(frame, foot, metrics=metrics, foot_crop=foot_crop)
    if sb:
        return ("safety_shoes", sb, 0.58)

    if _feet_view_obstructed(metrics):
        return None

    if not _looks_barefoot_or_open_footwear(metrics, foot_crop=foot_crop):
        min_contour = _min_shoe_contour(metrics["bottom_area"])
        if (
            metrics["bottom_dark_nonskin"] >= 0.10
            and metrics["max_shoe_contour"] >= min_contour
        ):
            return ("safety_shoes", _shoe_bbox_from_feet(foot), 0.55)

    if _looks_barefoot_or_open_footwear(metrics, foot_crop=foot_crop):
        return ("no_shoes", foot, 0.55)

    return None


def _evaluate_foot_shoes(
    frame: np.ndarray,
    foot: tuple[float, float, float, float],
    *,
    shoe_items: list[tuple[tuple[float, float, float, float], float]] | None = None,
) -> tuple[str, tuple[float, float, float, float], float] | None:
    """Đánh giá một bên chân — không suy luận thiếu giày khi không đủ căn cứ."""
    det = _shoe_detection_for_foot(frame, foot, shoe_items=shoe_items)
    if det is not None:
        return det

    foot_crop = _region_crop(frame, foot)
    metrics = _feet_metrics(frame, foot)
    if _feet_view_obstructed(metrics):
        return None

    if not _looks_barefoot_or_open_footwear(metrics, foot_crop=foot_crop):
        min_contour = _min_shoe_contour(metrics["bottom_area"])
        if (
            metrics["bottom_dark_nonskin"] >= 0.08
            and metrics["max_shoe_contour"] >= min_contour * 0.85
        ):
            return ("safety_shoes", _shoe_bbox_from_feet(foot), 0.52)

    return None


def _shoe_detections_for_person(
    frame: np.ndarray,
    feet: tuple[float, float, float, float],
    person_conf: float,
    *,
    shoe_items: list[tuple[tuple[float, float, float, float], float]] | None = None,
) -> list[tuple[str, tuple[float, float, float, float], float]]:
    """Quét 2 chân — PPE-003 chỉ khi CẢ HAI chân đều thiếu giày; một bên không detect → không phạt."""
    _ = person_conf

    if shoe_items:
        foot_metrics = _feet_metrics(frame, feet)
        if not _feet_view_obstructed(foot_metrics):
            paired = _best_shoe_for_feet(shoe_items, feet)
            if paired:
                return [("safety_shoes", paired[0], paired[1])]

    left, right = _split_feet_halves(feet)
    left_det = _evaluate_foot_shoes(frame, left, shoe_items=shoe_items)
    right_det = _evaluate_foot_shoes(frame, right, shoe_items=shoe_items)

    left_state = left_det[0] if left_det else None
    right_state = right_det[0] if right_det else None

    out: list[tuple[str, tuple[float, float, float, float], float]] = []
    if left_state == "safety_shoes" and left_det:
        out.append(left_det)
    if right_state == "safety_shoes" and right_det:
        out.append(right_det)
    if out:
        return out

    if left_state == "no_shoes" and right_state == "no_shoes" and left_det and right_det:
        return [left_det, right_det]

    return []


def _shoe_bbox_from_feet(feet: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = feet
    fh = y2 - y1
    return x1, y1 + fh * 0.55, x2, y2


def _heuristic_shoes(
    frame: np.ndarray,
    feet: tuple[float, float, float, float],
    *,
    metrics: dict[str, float] | None = None,
    foot_crop: np.ndarray | None = None,
) -> tuple[float, float, float, float] | None:
    crop = foot_crop if foot_crop is not None else _region_crop(frame, feet)
    m = metrics if metrics is not None else _feet_metrics(frame, feet)
    if _feet_view_obstructed(m):
        return None
    if _looks_barefoot_or_open_footwear(m, foot_crop=crop):
        return None

    if crop.size == 0:
        return None
    h, w = crop.shape[:2]
    bottom = crop[int(h * 0.45) :]
    bh, bw = bottom.shape[:2]
    if bh <= 0 or bw <= 0:
        return None

    hsv = cv2.cvtColor(bottom, cv2.COLOR_BGR2HSV)
    skin = _foot_skin_mask(hsv)
    mud = cv2.inRange(hsv, np.array([8, 20, 25]), np.array([28, 150, 120]))
    gray = cv2.cvtColor(bottom, cv2.COLOR_BGR2GRAY)
    dark = (gray < 95).astype(np.uint8) * 255
    dark = cv2.bitwise_and(dark, cv2.bitwise_not(skin))
    dark = cv2.bitwise_and(dark, cv2.bitwise_not(mud))
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((5, 3), np.uint8), 1)
    cnts, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    cnt = max(cnts, key=cv2.contourArea)
    area = cv2.contourArea(cnt)
    min_area = max(70.0, bh * bw * 0.06)
    if area < min_area:
        return None
    x, y, bw2, bh2 = cv2.boundingRect(cnt)
    if bw2 < bw * 0.22:
        return None
    if bh2 < max(6, bh * 0.12):
        return None
    cx = x + bw2 / 2
    if cx < bw * 0.18 or cx > bw * 0.82:
        return None
    off_y = int(h * 0.45)
    fx1, fy1, _, _ = feet
    return fx1 + x, fy1 + off_y + y, fx1 + x + bw2, fy1 + off_y + y + bh2


def _model_items(task_id: str, frame: np.ndarray, class_name: str) -> list[tuple[tuple[float, float, float, float], float]]:
    boxes = predict_boxes(task_id, frame)
    return [((x1, y1, x2, y2), conf) for label, x1, y1, x2, y2, conf in boxes if label == class_name]


def _best_in_region(
    items: list[tuple[tuple[float, float, float, float], float]],
    region: tuple[float, float, float, float],
) -> tuple[tuple[float, float, float, float], float] | None:
    best: tuple[tuple[float, float, float, float], float] | None = None
    for box, conf in items:
        if _iou(box, region) >= _ITEM_IOU and (best is None or conf > best[1]):
            best = (box, conf)
    return best


def _best_helmet_for_head(
    items: list[tuple[tuple[float, float, float, float], float]],
    head: tuple[float, float, float, float],
    *,
    min_conf: float = _HELMET_MODEL_MIN_CONF,
) -> tuple[tuple[float, float, float, float], float] | None:
    """Model mũ thường bbox nhỏ — khớp tâm/overlap vùng đỉnh, không chỉ IoU toàn head."""
    x1, y1, x2, y2 = head
    cap_y2 = y1 + (y2 - y1) * 0.62
    best: tuple[tuple[float, float, float, float], float] | None = None
    for box, conf in items:
        if conf < min_conf:
            continue
        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        if not (x1 <= cx <= x2 and y1 - (y2 - y1) * 0.12 <= cy <= cap_y2):
            continue
        cap_region = (x1, y1, x2, cap_y2)
        if _iou(box, head) < 0.04 and _iou(box, cap_region) < 0.06:
            continue
        if best is None or conf > best[1]:
            best = (box, conf)
    return best


@dataclass
class _PersonPpe:
    person_box: tuple[float, float, float, float]
    person_conf: float


def _bbox_containment(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    """Tỉ lệ diện tích bbox nhỏ hơn nằm trong giao — bắt nested YOLO trùng người."""
    inter = _intersection_area(a, b)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    smaller = min(area_a, area_b)
    return inter / smaller if smaller > 0 else 0.0


def _dedupe_person_boxes(
    persons: list[_PersonPpe],
    *,
    iou_threshold: float = 0.35,
    containment_threshold: float = 0.45,
    camera_id: str = "",
) -> list[_PersonPpe]:
    """Một người — một bbox: loại box nhỏ lồng/trùng box lớn hơn."""
    if camera_id.startswith("HC-"):
        iou_threshold = 0.34
        containment_threshold = 0.46
    if len(persons) <= 1:
        return persons

    def _area(p: _PersonPpe) -> float:
        x1, y1, x2, y2 = p.person_box
        return max(0.0, x2 - x1) * max(0.0, y2 - y1)

    ranked = sorted(persons, key=lambda p: (_area(p), p.person_conf), reverse=True)
    kept: list[_PersonPpe] = []
    for candidate in ranked:
        box = candidate.person_box
        if any(
            _iou(box, kept_person.person_box) >= iou_threshold
            or _bbox_containment(box, kept_person.person_box) >= containment_threshold
            for kept_person in kept
        ):
            continue
        kept.append(candidate)
    return kept


def _bbox_iou(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(ax2 - ax1, 0.0) * max(ay2 - ay1, 0.0)
    area_b = max(bx2 - bx1, 0.0) * max(by2 - by1, 0.0)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _machinery_bboxes(
    frame: np.ndarray,
    camera_id: str,
    *,
    source_pts_sec: float | None = None,
) -> list[tuple[float, float, float, float]]:
    try:
        from .crane_proximity_analyzer import _detect_machinery_units

        return [
            (float(u.bbox[0]), float(u.bbox[1]), float(u.bbox[2]), float(u.bbox[3]))
            for u in _detect_machinery_units(frame, camera_id, source_pts_sec=source_pts_sec)
        ]
    except Exception:  # noqa: BLE001
        return []


def _person_clear_of_machinery(
    box: tuple[float, float, float, float],
    machinery: list[tuple[float, float, float, float]],
    *,
    max_iou: float = 0.10,
) -> bool:
    if not machinery:
        return True
    cx = (box[0] + box[2]) / 2.0
    cy = (box[1] + box[3]) / 2.0
    for mb in machinery:
        if _bbox_iou(box, mb) > max_iou:
            return False
        if mb[0] <= cx <= mb[2] and mb[1] <= cy <= mb[3]:
            return False
    return True


def _person_upper_body_signal(
    frame: np.ndarray,
    box: tuple[float, float, float, float],
) -> bool:
    """Loại bbox trên kim loại/sơn xanh máy — cần tín hiệu da/áo ở nửa trên bbox."""
    x1, y1, x2, y2 = (int(v) for v in box)
    h, w = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 - x1 < 8 or y2 - y1 < 12:
        return False
    upper = frame[y1 : y1 + max(int((y2 - y1) * 0.55), 1), x1:x2]
    if upper.size == 0:
        return False
    hsv = cv2.cvtColor(upper, cv2.COLOR_BGR2HSV)
    green = cv2.inRange(hsv, np.array([35, 40, 40]), np.array([95, 255, 255]))
    gray = cv2.inRange(hsv, np.array([0, 0, 35]), np.array([180, 70, 200]))
    skin = cv2.inRange(hsv, np.array([0, 18, 50]), np.array([25, 170, 255]))
    hi_vis = cv2.inRange(hsv, np.array([18, 70, 70]), np.array([40, 255, 255]))
    total = max(upper.shape[0] * upper.shape[1], 1)
    green_ratio = cv2.countNonZero(green) / total
    personish_ratio = (cv2.countNonZero(skin) + cv2.countNonZero(hi_vis)) / total
    neutral_ratio = cv2.countNonZero(gray) / total
    if green_ratio > 0.58 and personish_ratio < 0.05:
        return False
    if neutral_ratio > 0.88 and personish_ratio < 0.03:
        return False
    return personish_ratio >= 0.025 or green_ratio < 0.45


def _clip_box_to_frame(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = box
    return (
        max(0.0, min(float(frame_w), x1)),
        max(0.0, min(float(frame_h), y1)),
        max(0.0, min(float(frame_w), x2)),
        max(0.0, min(float(frame_h), y2)),
    )


def _zone_visible_ratio(
    zone: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> float:
    """Tỷ lệ chiều cao vùng còn nằm trong khung hình (0–1)."""
    _zx1, zy1, _zx2, zy2 = zone
    raw_h = max(zy2 - zy1, 1.0)
    _cx1, cy1, _cx2, cy2 = _clip_box_to_frame(zone, frame_w, frame_h)
    if cy2 <= cy1:
        return 0.0
    return (cy2 - cy1) / raw_h


def _plausible_bodycam_close(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    frame: np.ndarray | None = None,
    strict: bool = False,
) -> bool:
    """Góc cận — bbox người lớn, chiếm phần lớn khung."""
    _x1, _y1, _x2, _y2 = box
    bw = max(_x2 - _x1, 1.0)
    bh = max(_y2 - _y1, 1.0)
    if bh < frame_h * 0.12 or bh > frame_h * 0.98:
        return False
    if bw < frame_w * 0.12 or bw > frame_w * 0.98:
        return False
    aspect = bh / bw
    if aspect < 0.45 or aspect > 5.5:
        return False
    if frame is not None and strict and not _person_upper_body_signal(frame, box):
        return False
    return True


def _plausible_patrol_wide(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    frame: np.ndarray | None = None,
    machinery: list[tuple[float, float, float, float]] | None = None,
    strict: bool = False,
    min_bh_frac: float = 0.07,
) -> bool:
    """Góc rộng / đám đông — người nhỏ trong khung (CCTV-style)."""
    x1, y1, x2, y2 = box
    bw = max(x2 - x1, 1.0)
    bh = max(y2 - y1, 1.0)
    if bh < frame_h * min_bh_frac or bh > frame_h * 0.68:
        return False
    if bw < frame_w * 0.028 or bw > frame_w * 0.44:
        return False
    aspect = bh / bw
    min_aspect = 1.35 if strict else 1.05
    if aspect < min_aspect or aspect > 4.8:
        return False
    cy = (y1 + y2) / 2
    if cy < frame_h * 0.12:
        return False
    if machinery and not _person_clear_of_machinery(box, machinery):
        return False
    if frame is not None and strict and not _person_upper_body_signal(frame, box):
        return False
    return True


def _head_assessable(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    head = (x1 + pw * 0.12, y1, x2 - pw * 0.12, y1 + ph * 0.24)
    return _zone_visible_ratio(head, frame_w, frame_h) >= 0.45


def _upper_body_third_with_head_visible(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    upper_frac: float = 0.50,
    head_frac: float = 0.24,
    min_visible: float = 0.33,
) -> bool:
    from .patrol_person_visibility import upper_body_third_with_head_visible

    return upper_body_third_with_head_visible(
        person_box,
        frame_w,
        frame_h,
        upper_frac=upper_frac,
        head_frac=head_frac,
        min_visible=min_visible,
    )


def _torso_assessable(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    camera_id: str = "",
) -> bool:
    """Chỉ đánh giá áo BHLD khi vùng ngực đủ rõ — không log nếu ROI rơi vào mặt."""
    if _face_dominant_person_box(person_box, frame_w, frame_h):
        return False

    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    bodycam = _is_helmet_bodycam(camera_id)
    chest = _chest_scan_region(person_box, camera_id=camera_id)

    if _zone_visible_ratio(chest, frame_w, frame_h) < 0.45:
        return False

    _cx1, cy1, _cx2, cy2 = _clip_box_to_frame(chest, frame_w, frame_h)
    min_chest_h = frame_h * 0.05
    if bodycam:
        min_chest_h = max(frame_h * 0.045, ph * 0.12)
    if (cy2 - cy1) < min_chest_h:
        return False

    display = _torso_violation_display_bbox(person_box, scan_region=chest)
    clipped = _clip_box_to_frame(display, frame_w, frame_h)
    if _vest_roi_overlaps_face(person_box, clipped, camera_id=camera_id):
        return False

    rcy = (clipped[1] + clipped[3]) / 2.0
    chest_top = y1 + ph * (0.42 if bodycam else 0.28)
    chest_bottom = y1 + ph * (0.72 if bodycam else 0.60)
    if rcy < chest_top or rcy > chest_bottom:
        return False

    if bodycam and rcy < y1 + ph * 0.45:
        return False

    return True


def _half_body_person(
    person_box: tuple[float, float, float, float],
    frame_h: int,
) -> bool:
    """Góc nửa thân — bbox YOLO thường kéo xuống đùi nhưng chân thật không có trong khung."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    bh_ratio = ph / max(float(frame_h), 1.0)
    feet = _feet_region(person_box, frame_h)
    foot_h = max(feet[3] - feet[1], 0.0)

    if y2 < frame_h * 0.86 and bh_ratio > 0.26:
        return True
    if foot_h < ph * 0.13 and bh_ratio > 0.30:
        return True
    if y2 < frame_h * 0.92 and foot_h < frame_h * 0.035:
        return True
    return False


def _feet_assessable(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    camera_id: str = "",
) -> bool:
    """Chỉ chấm PPE giày khi vùng chân thật sự nằm trong khung."""
    if _half_body_person(person_box, frame_h):
        return False

    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    bh_ratio = ph / max(float(frame_h), 1.0)

    feet = _feet_region(person_box, frame_h)
    if _zone_visible_ratio(feet, frame_w, frame_h) < 0.50:
        return False
    _fx1, fy1, fx2, fy2 = _clip_box_to_frame(feet, frame_w, frame_h)
    if (fy2 - fy1) < frame_h * 0.035:
        return False

    if fy2 < y2 - ph * 0.03:
        return False

    if _is_helmet_bodycam(camera_id) and y2 < frame_h * 0.90:
        return False

    # Bbox lớn nhưng cắt trên đùi/gối — không chấm giày (góc nửa thân trên).
    if bh_ratio > 0.34 and y2 < frame_h * 0.72:
        return False
    # Người cận chiếm khung — cần vùng chân chạm nửa dưới khung hình.
    if bh_ratio > 0.38 and fy2 < frame_h * 0.78:
        return False
    if bh_ratio > 0.30 and y2 < frame_h * 0.88:
        return False
    return True


def _visible_person_display_bbox(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> tuple[float, float, float, float]:
    """BBox person overlay — siết vào thân detect, không kéo xuống chân ảo."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    if _feet_assessable(person_box, frame_w, frame_h):
        base = person_box
    else:
        vis_y2 = min(y2, y1 + ph * 0.72, float(frame_h))
        base = (x1, y1, x2, vis_y2)
    bx1, by1, bx2, by2 = base
    bw = max(bx2 - bx1, 1.0)
    bh = max(by2 - by1, 1.0)
    tight = (
        bx1 + bw * 0.05,
        by1 + bh * 0.03,
        bx2 - bw * 0.05,
        by2 - bh * 0.02,
    )
    return _clip_box_to_frame(tight, frame_w, frame_h)


def _plausible_flycam_proximity(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Flycam tầm thấp — người lớn hơn aerial, góc rộng hơn bodycam cận cảnh."""
    x1, y1, x2, y2 = box
    bw = max(x2 - x1, 1.0)
    bh = max(y2 - y1, 1.0)
    if bh < frame_h * 0.022 or bh > frame_h * 0.88:
        return False
    if bw < frame_w * 0.012 or bw > frame_w * 0.52:
        return False
    aspect = bh / bw
    if aspect < 0.16 or aspect > 6.8:
        return False
    return True


def _plausible_flycam_aerial(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Góc drone cao — người rất nhỏ trong khung (1–2% chiều cao)."""
    x1, y1, x2, y2 = box
    bw = max(x2 - x1, 1.0)
    bh = max(y2 - y1, 1.0)
    if bh < frame_h * 0.010 or bh > frame_h * 0.55:
        return False
    if bw < frame_w * 0.006 or bw > frame_w * 0.38:
        return False
    aspect = bh / bw
    if aspect < 0.22 or aspect > 5.8:
        return False
    return True


def _plausible_person_box(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    frame: np.ndarray | None = None,
    machinery: list[tuple[float, float, float, float]] | None = None,
    strict: bool = False,
    bodycam: bool = False,
    flycam: bool = False,
    proximity_flycam: bool = False,
    for_display: bool = False,
) -> bool:
    """Loại bbox giả — HC patrol: chấp nhận cận cảnh HOẶC góc rộng.

    `for_display=True` là đường vẽ ROI: chỉ loại khung không thể là người. Đường
    ghi sự kiện vẫn siết lại bằng gate riêng trong `ppe_engine`, nên nới ở đây
    không kéo theo sự kiện rác.
    """
    if for_display and (bodycam or flycam or proximity_flycam):
        from .patrol_person_visibility import patrol_person_meets_display_gate

        return patrol_person_meets_display_gate(
            box,
            frame_w,
            frame_h,
            flycam=flycam and not proximity_flycam,
            proximity_flycam=proximity_flycam,
        )
    if proximity_flycam:
        close_ok = _plausible_flycam_proximity(box, frame_w, frame_h)
        wide_ok = _plausible_patrol_wide(
            box, frame_w, frame_h, frame=frame, machinery=None, strict=False,
            min_bh_frac=0.022,
        )
        return close_ok or wide_ok
    if flycam:
        return _plausible_flycam_aerial(box, frame_w, frame_h)
    if bodycam:
        close_ok = _plausible_bodycam_close(
            box, frame_w, frame_h, frame=frame, strict=strict,
        )
        wide_ok = _plausible_patrol_wide(
            box, frame_w, frame_h, frame=frame, machinery=None, strict=False,
            min_bh_frac=0.035,
        )
        if not (close_ok or wide_ok):
            return False
        from .patrol_person_visibility import patrol_person_meets_detection_gate

        if not patrol_person_meets_detection_gate(
            box,
            frame_w,
            frame_h,
            face_dominant=_face_dominant_person_box(box, frame_w, frame_h),
        ):
            return False
        if frame is not None and strict and not _person_upper_body_signal(frame, box):
            return False
        return True
    return _plausible_patrol_wide(
        box,
        frame_w,
        frame_h,
        frame=frame,
        machinery=machinery,
        strict=strict,
    )


def _filter_persons(
    frame: np.ndarray,
    camera_id: str,
    persons_raw,
    *,
    source_pts_sec: float | None = None,
    strict: bool = False,
    min_conf: float | None = None,
    for_display: bool = False,
) -> list[_PersonPpe]:
    h, w = frame.shape[:2]
    from .patrol_flight_mode import is_patrol_flycam_aerial, is_patrol_helmet_like

    helmet_like = is_patrol_helmet_like(camera_id)
    bodycam = helmet_like
    flycam = _is_patrol_flycam(camera_id) and not helmet_like
    aerial_flycam = flycam and is_patrol_flycam_aerial(camera_id)
    proximity_flycam = False
    identity_strict = (
        (strict or camera_id in ("A-04", "HC-01"))
        and not bodycam
        and not flycam
    )
    if helmet_like or bodycam:
        conf_floor = min_conf if min_conf is not None else _PERSON_CONF_BODYCAM
    elif flycam:
        conf_floor = min_conf if min_conf is not None else _PERSON_CONF_FLYCAM
    else:
        conf_floor = min_conf if min_conf is not None else (_PERSON_CONF_STRICT if identity_strict else _PERSON_CONF)
    machinery = _machinery_bboxes(frame, camera_id, source_pts_sec=source_pts_sec) if identity_strict else []
    out: list[_PersonPpe] = []
    for p in persons_raw:
        if p.confidence < conf_floor:
            continue
        box = (p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3])
        if not _plausible_person_box(
            box,
            w,
            h,
            frame=frame if (identity_strict or helmet_like) else None,
            machinery=machinery,
            strict=identity_strict,
            bodycam=helmet_like,
            flycam=aerial_flycam,
            proximity_flycam=False,
            for_display=for_display,
        ):
            continue
        # Patrol HC-* / DR-* — gate trong `_plausible_person_box(for_display=True)`.
        # Không thêm lớp corroborate da/thân trên kiểu PPE (làm mất người ngồi/quay lưng).
        if bodycam and frame is not None and not _is_helmet_bodycam(camera_id):
            from .patrol_person_visibility import (
                background_clutter_person_box,
                wide_crowd_rider_box,
            )

            conf = float(p.confidence)
            face_dom = _face_dominant_person_box(box, w, h)
            if background_clutter_person_box(box, w, h) and not _person_upper_body_signal(frame, box):
                continue
            corroborate_below = (
                _PERSON_CONF_DISPLAY_CORROBORATE if for_display else 0.62
            )
            if (
                conf < corroborate_below
                and not face_dom
                and not wide_crowd_rider_box(box, w, h)
                and not _person_upper_body_signal(frame, box)
            ):
                continue
        out.append(_PersonPpe(box, p.confidence))
    return out


def _build_person_only_result(
    frame: np.ndarray,
    camera_id: str,
    *,
    source_pts_sec: float | None = None,
) -> dict:
    """Person detections only — dùng khi suppress PPE trên reel demo Cam A-04."""
    from .worker_identity.detection_enrich import enrich_person_bbox

    detector = _get_person_detector()
    h, w = frame.shape[:2]
    persons = _filter_persons(
        frame,
        camera_id,
        detector.predict(frame),
        source_pts_sec=source_pts_sec,
        strict=True,
    )

    detections: list[PpeDetection] = []
    for person_index, person in enumerate(persons):
        pb = person.person_box
        person_det = PpeDetection(
            behavior="person",
            label=PPE_LABELS["person"],
            scenario_id=PPE_SCENARIO["person"],
            confidence=round(person.person_conf, 3),
            bbox=[float(v) for v in pb],
            subject_bbox=[float(v) for v in pb],
        )
        enrich_person_bbox(
            frame,
            person_det,
            camera_id=camera_id,
            person_index=person_index,
            source_pts_sec=source_pts_sec,
        )
        detections.append(person_det)

    return {
        "type": "result",
        "camera_id": camera_id,
        "width": w,
        "height": h,
        "metrics": {
            "person_count": len(persons),
            "ppe_violations": 0,
        },
        "detections": [d.model_dump() for d in detections],
        "events": [],
    }


def _build_patrol_bodycam_result(
    frame: np.ndarray,
    camera_id: str,
    *,
    source_pts_sec: float | None = None,
) -> dict:
    """Helmet bodycam path — person detection + patrol identity, zero PPE model inference.

    HC-* streams come from the mobile client at ~220–320ms intervals. Running 3 extra YOLO models
    (helmet/vest/shoes) doubles inference time per frame without UX value when PATROL_PPE_UI_HIDDEN.
    """
    detector = _get_person_detector()
    h, w = frame.shape[:2]
    raw_persons = _dedupe_person_boxes(
        _filter_persons(
            frame,
            camera_id,
            detector.predict(frame, conf=_PERSON_CONF_BODYCAM),
            source_pts_sec=source_pts_sec,
            strict=False,
            min_conf=_PERSON_CONF_BODYCAM,
            for_display=True,
        ),
        camera_id=camera_id,
    )
    from .patrol_face_anchor import anchor_patrol_person_boxes_to_faces

    anchored = anchor_patrol_person_boxes_to_faces(
        frame,
        [(p.person_box, p.person_conf) for p in raw_persons],
        camera_id=camera_id,
    )
    persons = [
        _PersonPpe(person_box=box, person_conf=conf)
        for box, conf in anchored
    ]

    detections = _build_patrol_person_detections(
        frame,
        camera_id,
        persons,
        w,
        h,
        source_pts_sec=source_pts_sec,
        raw_yolo_boxes=[p.person_box for p in raw_persons],
    )

    return {
        "type": "result",
        "camera_id": camera_id,
        "width": w,
        "height": h,
        "metrics": {
            "person_count": _patrol_countable_person_count(persons, w, h),
            "display_person_count": _patrol_display_person_count(
                persons, w, h, camera_id=camera_id,
            ),
            "ppe_violations": 0,
        },
        "detections": [d.model_dump() for d in detections],
        "events": [],
    }


def _patrol_countable_person_count(
    persons: list[_PersonPpe],
    frame_w: int,
    frame_h: int,
) -> int:
    """Số người tính vào KPI — giữ tiêu chí ghi sự kiện, không theo số ROI đã vẽ.

    Đường vẽ ROI cố ý khoanh cả người ngồi, bị che và quay lưng. Lấy thẳng số box
    đó làm KPI thì mỗi mảnh thân YOLO tách ra lại thành một nhân sự, nên chỉ số
    trên bảng điều khiển phải đếm bằng cùng thước đo với tab sự kiện.
    """
    from .patrol_person_visibility import patrol_person_meets_detection_gate

    return sum(
        1
        for p in persons
        if patrol_person_meets_detection_gate(
            p.person_box,
            frame_w,
            frame_h,
            face_dominant=_face_dominant_person_box(p.person_box, frame_w, frame_h),
        )
    )


def _patrol_display_person_count(
    persons: list[_PersonPpe],
    frame_w: int,
    frame_h: int,
    *,
    camera_id: str,
) -> int:
    """Số bbox ROI — mọi silhouette giống người trên khung (display gate)."""
    from .patrol_flight_mode import is_patrol_flycam_aerial, is_patrol_helmet_like
    from .patrol_person_visibility import patrol_person_meets_display_gate

    if is_patrol_helmet_like(camera_id):
        return sum(
            1
            for p in persons
            if patrol_person_meets_display_gate(p.person_box, frame_w, frame_h)
        )
    aerial = is_patrol_flycam_aerial(camera_id)
    return sum(
        1
        for p in persons
        if patrol_person_meets_display_gate(
            p.person_box,
            frame_w,
            frame_h,
            flycam=aerial,
        )
    )


def _match_raw_yolo_person_box(
    anchored_box: tuple[float, float, float, float],
    raw_boxes: list[tuple[float, float, float, float]],
) -> tuple[float, float, float, float] | None:
    """Khớp box sau face-anchor với YOLO gốc — ROI vẽ theo YOLO, không theo synth mặt."""
    from .patrol_face_anchor import _bbox_iou

    best: tuple[float, float, float, float] | None = None
    best_iou = 0.0
    for raw in raw_boxes:
        iou = _bbox_iou(anchored_box, raw)
        if iou > best_iou:
            best_iou = iou
            best = raw
    if best is not None and best_iou >= 0.12:
        return best
    return None


def _build_patrol_person_detections(
    frame: np.ndarray,
    camera_id: str,
    persons: list[_PersonPpe],
    frame_w: int,
    frame_h: int,
    *,
    source_pts_sec: float | None = None,
    raw_yolo_boxes: list[tuple[float, float, float, float]] | None = None,
) -> list[PpeDetection]:
    """Dựng detection người cho camera tuần tra — dùng chung bodycam và flycam.

    Track được gán **một lượt cho cả frame** trước khi vào vòng lặp, nên thứ tự
    YOLO trả về không còn ảnh hưởng tới việc ai giữ track nào.

    Face/embed chạy trên mọi người đủ gate **hiển thị** (ngồi, quay lưng, đám
    đông…) — sink tự dwell trước khi commit obj/pers. Gate hình học chặt chỉ
    dùng cho KPI legacy, không chặn đường ghi sự kiện chính nữa.
    """
    reset_hc_patrol_face_assignments(camera_id)
    track_ids = assign_patrol_track_ids(
        camera_id,
        [(p.person_box, p.person_conf) for p in persons],
        frame=frame,
    )

    detections: list[PpeDetection] = []
    raw_boxes = list(raw_yolo_boxes or [])
    for person_index, person in enumerate(persons):
        pb = person.person_box
        from .patrol_person_visibility import patrol_person_overlay_bbox

        raw_pb = _match_raw_yolo_person_box(pb, raw_boxes) or pb
        overlay_pb = patrol_person_overlay_bbox(raw_pb, frame_w, frame_h)
        person_det = PpeDetection(
            behavior="person",
            label=PPE_LABELS["person"],
            scenario_id=PPE_SCENARIO["person"],
            confidence=round(person.person_conf, 3),
            bbox=[float(v) for v in overlay_pb],
            subject_bbox=[float(v) for v in raw_pb],
        )
        track_id = track_ids[person_index] if person_index < len(track_ids) else None
        if _patrol_person_passes_display_gate(pb, frame_w, frame_h, camera_id=camera_id):
            _assign_patrol_person_identity(
                person_det,
                pb,
                frame=frame,
                camera_id=camera_id,
                frame_w=frame_w,
                frame_h=frame_h,
                track_id=track_id,
            )
        else:
            _assign_patrol_person_display_only(
                person_det,
                camera_id=camera_id,
                track_id=track_id,
                frame=frame,
                person_box=pb,
            )
        _attach_track_velocity(person_det, camera_id, track_id)
        detections.append(person_det)

    return detections


def _attach_track_velocity(
    person_det: PpeDetection,
    camera_id: str,
    track_id: str | None,
) -> None:
    """Gắn vận tốc Kalman để FE nội suy ROI giữa hai lần AI chạy.

    AI chạy vài FPS còn video render 25–30 FPS. Không có vận tốc thì FE chỉ còn
    cách hoặc để ROI đứng giật theo nhịp AI, hoặc tự đoán lại chuyển động — mà
    đoán lại chính là thứ vừa được dồn về backend.
    """
    if not track_id:
        return
    from .patrol_tracker import get_patrol_tracker

    track = get_patrol_tracker(camera_id).get(track_id)
    if track is None:
        return
    vx, vy = track.velocity()
    person_det.velocity = [round(vx, 2), round(vy, 2)]


def _flycam_prescan_for_flight_mode(frame: np.ndarray, camera_id: str) -> None:
    """YOLO nhanh trước khi chọn aerial/proximity — chỉ khi thiếu telemetry độ cao."""
    if not _is_patrol_flycam(camera_id):
        return
    from .patrol_flight_mode import note_patrol_flycam_visual_scale

    h, w = frame.shape[:2]
    if h <= 0:
        return
    detector = _get_person_detector()
    raw = detector.predict(frame, conf=_PERSON_CONF_FLYCAM)
    boxes = [
        (float(p.bbox[0]), float(p.bbox[1]), float(p.bbox[2]), float(p.bbox[3]))
        for p in raw
    ]
    note_patrol_flycam_visual_scale(camera_id, boxes, h)


def _build_patrol_flycam_aerial_result(
    frame: np.ndarray,
    camera_id: str,
    *,
    source_pts_sec: float | None = None,
) -> dict:
    """Flycam tầm cao — YOLO person + mật độ; không face-anchor / gallery."""
    detector = _get_person_detector()
    h, w = frame.shape[:2]
    persons = _dedupe_person_boxes(
        _filter_persons(
            frame,
            camera_id,
            detector.predict(frame, conf=_PERSON_CONF_FLYCAM),
            source_pts_sec=source_pts_sec,
            strict=False,
            min_conf=_PERSON_CONF_FLYCAM,
            for_display=True,
        ),
        camera_id=camera_id,
    )

    detections = _build_patrol_person_detections(
        frame, camera_id, persons, w, h, source_pts_sec=source_pts_sec,
    )
    person_dets = [d for d in detections if d.behavior == "person"]
    track_ids = {d.track_id for d in person_dets if d.track_id}
    display_count = _patrol_display_person_count(persons, w, h, camera_id=camera_id)
    frame_person_count = len(person_dets)
    track_count = len(track_ids) if track_ids else frame_person_count
    countable = _patrol_countable_person_count(persons, w, h)

    return {
        "type": "result",
        "camera_id": camera_id,
        "width": w,
        "height": h,
        "metrics": {
            # Khung hiện tại — chuẩn sự kiện (flycam góc cao thường = 0).
            "person_count": countable,
            # ROI đang khoanh — silhouette có thể là người.
            "display_person_count": max(display_count, track_count),
            "frame_person_count": frame_person_count,
            "track_count": track_count,
            "ppe_violations": 0,
        },
        "detections": [d.model_dump() for d in detections],
        "events": [],
    }


def _build_patrol_flycam_proximity_result(
    frame: np.ndarray,
    camera_id: str,
    *,
    source_pts_sec: float | None = None,
) -> dict:
    """Flycam tầm thấp — AI như mũ: face-anchor, identity, gate rộng hơn."""
    detector = _get_person_detector()
    h, w = frame.shape[:2]
    raw_persons = _dedupe_person_boxes(
        _filter_persons(
            frame,
            camera_id,
            detector.predict(frame, conf=_PERSON_CONF_BODYCAM),
            source_pts_sec=source_pts_sec,
            strict=False,
            min_conf=_PERSON_CONF_BODYCAM,
            for_display=True,
        ),
        camera_id=camera_id,
    )
    from .patrol_face_anchor import anchor_patrol_person_boxes_to_faces

    anchored = anchor_patrol_person_boxes_to_faces(
        frame,
        [(p.person_box, p.person_conf) for p in raw_persons],
        camera_id=camera_id,
    )
    persons = [
        _PersonPpe(person_box=box, person_conf=conf)
        for box, conf in anchored
    ]

    detections = _build_patrol_person_detections(
        frame,
        camera_id,
        persons,
        w,
        h,
        source_pts_sec=source_pts_sec,
        raw_yolo_boxes=[p.person_box for p in raw_persons],
    )

    return {
        "type": "result",
        "camera_id": camera_id,
        "width": w,
        "height": h,
        "metrics": {
            "person_count": _patrol_countable_person_count(persons, w, h),
            "display_person_count": _patrol_display_person_count(
                persons, w, h, camera_id=camera_id,
            ),
            "ppe_violations": 0,
        },
        "detections": [d.model_dump() for d in detections],
        "events": [],
    }


def _build_vest_only_result(
    frame: np.ndarray,
    camera_id: str,
    *,
    source_pts_sec: float | None = None,
) -> dict:
    """Segment WAH — log no_vest cho công nhân mép biên (áo phản quang)."""
    from .wah_analyzer import _wah_edge_violation_candidate
    from .worker_identity.detection_enrich import copy_worker_identity, enrich_person_bbox

    detector = _get_person_detector()
    h, w = frame.shape[:2]
    persons = [
        p
        for p in _filter_persons(
            frame,
            camera_id,
            detector.predict(frame),
            source_pts_sec=source_pts_sec,
            strict=True,
        )
        if _wah_edge_violation_candidate(p.person_box, h)
    ]

    vest_items = _model_items("ppe_vest", frame, "safety_vest")
    detections: list[PpeDetection] = []
    violations = 0

    for person_index, person in enumerate(persons):
        pb = person.person_box
        torso = _chest_scan_region(pb, camera_id=camera_id)
        person_det = PpeDetection(
            behavior="person",
            label=PPE_LABELS["person"],
            scenario_id=PPE_SCENARIO["person"],
            confidence=round(person.person_conf, 3),
            bbox=[float(v) for v in pb],
            subject_bbox=[float(v) for v in pb],
        )
        enrich_person_bbox(
            frame,
            person_det,
            camera_id=camera_id,
            person_index=person_index,
            source_pts_sec=source_pts_sec,
        )
        detections.append(person_det)

        if not _torso_assessable(pb, w, h, camera_id=camera_id):
            continue

        vest = _resolve_person_vest(frame, torso, vest_items, camera_id=camera_id)
        if vest:
            box, conf = vest
            detections.append(
                PpeDetection(
                    behavior="safety_vest",
                    label=PPE_LABELS["safety_vest"],
                    scenario_id=PPE_SCENARIO["safety_vest"],
                    confidence=round(conf, 3),
                    bbox=[float(v) for v in box],
                )
            )
        else:
            violations += 1
            viol = PpeDetection(
                behavior="no_vest",
                label=PPE_LABELS["no_vest"],
                scenario_id=PPE_SCENARIO["no_vest"],
                confidence=round(max(_VIOLATION_CONF, person.person_conf * 0.93), 3),
                bbox=[
                    float(v)
                    for v in ppe_violation_display_bbox(pb, "no_vest", h, scan_region=torso)
                ],
            )
            copy_worker_identity(person_det, viol)
            detections.append(viol)

    return {
        "type": "result",
        "camera_id": camera_id,
        "width": w,
        "height": h,
        "metrics": {
            "person_count": len(persons),
            "ppe_violations": violations,
            "ppe_mode": "vest_only",
        },
        "detections": [d.model_dump() for d in detections],
        "events": [],
    }


def analyze_ppe_frame(
    frame: np.ndarray,
    camera_id: str = "A-04",
    *,
    source_pts_sec: float | None = None,
) -> dict:
    from .cam04_ppe_demo import is_cam04_ppe_scene, resolve_cam04_ppe_demo

    if _is_helmet_bodycam(camera_id) or _is_patrol_flycam(camera_id):
        from .patrol_engine import analyze_patrol_frame

        return analyze_patrol_frame(frame, camera_id, source_pts_sec=source_pts_sec)

    demo_action = resolve_cam04_ppe_demo(camera_id, frame, source_pts_sec=source_pts_sec)
    if demo_action == "suppress":
        return _build_person_only_result(frame, camera_id, source_pts_sec=source_pts_sec)
    if demo_action == "vest_only":
        return _build_vest_only_result(frame, camera_id, source_pts_sec=source_pts_sec)

    ppe_demo_scene = is_cam04_ppe_scene(camera_id, frame, source_pts_sec=source_pts_sec)

    detector = _get_person_detector()
    h, w = frame.shape[:2]
    persons = _filter_persons(
        frame,
        camera_id,
        detector.predict(frame),
        source_pts_sec=source_pts_sec,
        strict=not ppe_demo_scene and not _is_helmet_bodycam(camera_id),
    )

    helmet_items = _model_items("ppe_helmet", frame, "hard_hat")
    vest_items = _model_items("ppe_vest", frame, "safety_vest")
    shoe_items = _model_items("ppe_shoes", frame, "safety_shoes")

    from .worker_identity.detection_enrich import copy_worker_identity, enrich_person_bbox

    detections: list[PpeDetection] = []
    violations = 0
    if _is_helmet_bodycam(camera_id):
        reset_hc_patrol_face_assignments(camera_id)
    patrol_track_ids = assign_patrol_track_ids(
        camera_id,
        [(p.person_box, p.person_conf) for p in persons],
    )

    for person_index, person in enumerate(persons):
        pb = person.person_box
        display_pb = _visible_person_display_bbox(pb, w, h)
        head_ok = _head_assessable(pb, w, h)
        torso_ok = _torso_assessable(pb, w, h, camera_id=camera_id)
        feet_ok = _feet_assessable(pb, w, h, camera_id=camera_id) and not _is_helmet_bodycam(
            camera_id,
        )
        head_scan = _cap_region_for_helmet(pb)
        torso = _chest_scan_region(pb, camera_id=camera_id)
        feet = _feet_region(pb, h)

        person_det = PpeDetection(
            behavior="person",
            label=PPE_LABELS["person"],
            scenario_id=PPE_SCENARIO["person"],
            confidence=round(person.person_conf, 3),
            bbox=[float(v) for v in display_pb],
            subject_bbox=[float(v) for v in pb],
        )
        enrich_person_bbox(
            frame,
            person_det,
            camera_id=camera_id,
            person_index=person_index,
            source_pts_sec=source_pts_sec,
        )
        _assign_patrol_person_identity(
            person_det,
            pb,
            frame=frame,
            camera_id=camera_id,
            frame_w=w,
            frame_h=h,
            track_id=patrol_track_ids[person_index]
            if person_index < len(patrol_track_ids)
            else None,
        )
        detections.append(person_det)

        def _append_violation(violation: PpeDetection) -> None:
            copy_worker_identity(person_det, violation)
            detections.append(violation)

        person_ppe_viol = False

        if head_ok:
            helmet = _resolve_person_helmet(frame, pb, head_scan, helmet_items, camera_id=camera_id)
            if helmet:
                box, conf = helmet
                detections.append(
                    PpeDetection(
                        behavior="hard_hat",
                        label=PPE_LABELS["hard_hat"],
                        scenario_id=PPE_SCENARIO["hard_hat"],
                        confidence=round(conf, 3),
                        bbox=[float(v) for v in box],
                    )
                )
            else:
                violations += 1
                person_ppe_viol = True
                display = ppe_violation_display_bbox(pb, "no_helmet", h, scan_region=head_scan)
                _append_violation(
                    PpeDetection(
                        behavior="no_helmet",
                        label=PPE_LABELS["no_helmet"],
                        scenario_id=PPE_SCENARIO["no_helmet"],
                        confidence=round(max(_VIOLATION_CONF, person.person_conf * 0.95), 3),
                        bbox=[float(v) for v in display],
                        subject_bbox=[float(v) for v in pb],
                    )
                )

        if torso_ok:
            vest = _resolve_person_vest(frame, torso, vest_items, camera_id=camera_id)
            if vest:
                box, conf = vest
                detections.append(
                    PpeDetection(
                        behavior="safety_vest",
                        label=PPE_LABELS["safety_vest"],
                        scenario_id=PPE_SCENARIO["safety_vest"],
                        confidence=round(conf, 3),
                        bbox=[float(v) for v in box],
                    )
                )
            else:
                violations += 1
                person_ppe_viol = True
                _append_violation(
                    PpeDetection(
                        behavior="no_vest",
                        label=PPE_LABELS["no_vest"],
                        scenario_id=PPE_SCENARIO["no_vest"],
                        confidence=round(
                            max(_VIOLATION_CONF, VIOLATION_MIN_CONFIDENCE, person.person_conf * 0.93),
                            3,
                        ),
                        bbox=[float(v) for v in ppe_violation_display_bbox(
                            pb, "no_vest", h, scan_region=torso,
                        )],
                        subject_bbox=[float(v) for v in pb],
                    )
                )

        shoe_items_det: list[tuple[str, tuple[float, float, float, float], float]] = []
        shoe_violation_logged = False
        if feet_ok:
            shoe_items_det = _shoe_detections_for_person(
                frame, feet, person.person_conf, shoe_items=shoe_items,
            )
            for behavior, box, conf in shoe_items_det:
                if behavior == "safety_shoes":
                    detections.append(
                        PpeDetection(
                            behavior="safety_shoes",
                            label=PPE_LABELS["safety_shoes"],
                            scenario_id=PPE_SCENARIO["safety_shoes"],
                            confidence=round(conf, 3),
                            bbox=[float(v) for v in box],
                        )
                    )
                    continue
                if not shoe_violation_logged:
                    violations += 1
                    shoe_violation_logged = True
                    person_ppe_viol = True
                _append_violation(
                    PpeDetection(
                        behavior="no_shoes",
                        label=PPE_LABELS["no_shoes"],
                        scenario_id=PPE_SCENARIO["no_shoes"],
                        confidence=round(
                            max(conf, _VIOLATION_CONF, VIOLATION_MIN_CONFIDENCE, person.person_conf * 0.90),
                            3,
                        ),
                        bbox=[float(v) for v in box],
                        subject_bbox=[float(v) for v in pb],
                    )
                )

        if (
            feet_ok
            and ppe_demo_scene
            and person_ppe_viol
            and not shoe_violation_logged
            and not shoe_items_det
            and _feet_view_obstructed(_feet_metrics(frame, feet))
        ):
            violations += 1
            _append_violation(
                PpeDetection(
                    behavior="no_shoes",
                    label=PPE_LABELS["no_shoes"],
                    scenario_id=PPE_SCENARIO["no_shoes"],
                    confidence=round(
                        max(_VIOLATION_CONF, VIOLATION_MIN_CONFIDENCE, person.person_conf * 0.88),
                        3,
                    ),
                    bbox=[float(v) for v in ppe_violation_display_bbox(
                        pb, "no_shoes", h, scan_region=feet,
                    )],
                    subject_bbox=[float(v) for v in pb],
                )
            )

    return {
        "type": "result",
        "camera_id": camera_id,
        "width": w,
        "height": h,
        "metrics": {
            "person_count": len(persons),
            "ppe_violations": violations,
        },
        "detections": [d.model_dump() for d in detections],
        "events": [],
    }
