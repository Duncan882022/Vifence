"""Patrol person detection & identity — Module 05 (HC-* / DR-*). Không PPE."""

from __future__ import annotations

import logging
import time

import numpy as np

from ..detectors.person_detector import PersonDetector
from ..schemas import PpeDetection

from ..patrol.camera_scope import is_patrol_flycam, is_patrol_helmet_bodycam

logger = logging.getLogger("patrol.person_analyzer")

from ..patrol_person_visibility import _face_dominant_person_box
from ..ppe_analyzer import (
    PPE_LABELS,
    PPE_SCENARIO,
    _PERSON_CONF,
    _PERSON_CONF_BODYCAM,
    _PERSON_CONF_FLYCAM,
    _PersonPpe,
    _dedupe_person_boxes,
    _filter_persons,
    _plausible_flycam_aerial,
)

_person_detector: PersonDetector | None = None


def _get_person_detector() -> PersonDetector:
    """YOLO person — singleton riêng Module 05, không phụ thuộc state ppe_analyzer."""
    global _person_detector
    if _person_detector is None:
        _person_detector = PersonDetector(conf_threshold=_PERSON_CONF)
        _person_detector.load()
    return _person_detector

def _is_helmet_bodycam(camera_id: str) -> bool:
    return is_patrol_helmet_bodycam(camera_id)


def _is_patrol_flycam(camera_id: str) -> bool:
    return is_patrol_flycam(camera_id)


_hc_frame_face_assignments: dict[str, dict[str, list[float]]] = {}


def reset_hc_patrol_face_assignments(camera_id: str) -> None:
    """Đầu frame HC-* — reset map mặt trong khung để tránh gộp 2 người."""
    _hc_frame_face_assignments[camera_id] = {}


def reset_all_hc_patrol_state() -> int:
    """Xóa toàn bộ patrol person tracks và face assignments — dùng khi reset test data."""
    from ..patrol_identity_lifecycle import reset as reset_identity_lifecycle
    from ..patrol_stream_lifecycle import reset_patrol_stream_lifecycle
    from ..patrol_tracker import reset_patrol_trackers

    count = reset_patrol_trackers()
    reset_identity_lifecycle()
    reset_patrol_stream_lifecycle()
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
    from ..patrol_tracker import get_patrol_tracker

    shift = (0.0, 0.0)
    if frame is not None:
        from .egomotion import estimate_shift

        shift = estimate_shift(camera_id, frame)

    tracker = get_patrol_tracker(camera_id)
    return tracker.update(
        [(tuple(float(v) for v in box), float(conf)) for box, conf in person_boxes],
        now=now if now is not None else time.time(),
        camera_shift=shift,
    )


def _sink_overlay_bbox(
    overlay_box: tuple[float, float, float, float] | None,
    person_box: tuple[float, float, float, float] | None,
) -> list[float] | None:
    """BBox ghi sink/snapshot — trùng overlay live (patrol_person_overlay_bbox)."""
    target = overlay_box if overlay_box is not None else person_box
    if target is None:
        return None
    return [float(v) for v in target]


def _record_patrol_density_encounter(
    person_det: PpeDetection,
    *,
    camera_id: str,
    track_id: str,
    frame: np.ndarray,
    person_bbox: list[float],
    confidence: float,
) -> None:
    """Chỉ lượt gặp obj-* — flycam aerial hoặc peak time (chưa đủ mặt)."""
    from ..patrol_identity_lifecycle import observe as observe_track_identity

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
        from .sink import record_observation

        record_observation(
            camera_id=camera_id,
            track_id=track_id,
            face_embedding=None,
            face_quality=0.0,
            confidence=float(confidence),
            frame=frame,
            person_bbox=person_bbox,
            density_only=True,
        )
    except Exception:  # noqa: BLE001
        logger.exception("[patrol] density encounter — không ghi được quan sát")


def _assign_patrol_person_identity(
    person_det: PpeDetection,
    person_box: tuple[float, float, float, float],
    *,
    frame: np.ndarray,
    camera_id: str,
    frame_w: int,
    frame_h: int,
    track_id: str | None,
    crowd_members: list | None = None,
    overlay_box: tuple[float, float, float, float] | None = None,
) -> None:
    """HC-* / DR-* — gán sgc hoặc để trống (Đối tượng) lên detection trả về FE."""
    if not _is_helmet_bodycam(camera_id) and not _is_patrol_flycam(camera_id):
        return
    if not track_id:
        return

    person_bbox = [float(v) for v in person_box]
    sink_bbox = _sink_overlay_bbox(overlay_box, person_box)

    if _is_patrol_flycam(camera_id):
        from ..patrol_flight_mode import is_patrol_flycam_aerial

        if is_patrol_flycam_aerial(camera_id):
            _record_patrol_density_encounter(
                person_det,
                camera_id=camera_id,
                track_id=track_id,
                frame=frame,
                person_bbox=sink_bbox or person_bbox,
                confidence=float(person_det.confidence or 0.0),
            )
            return
        # proximity flycam — rơi xuống nhánh bodycam bên dưới.

    from ..patrol_identity_lifecycle import observe as observe_track_identity, peek as peek_track_lifecycle
    from ..person_identity_registry import (
        peek_patrol_track_identity,
        resolve_patrol_person_identity,
    )
    from ..worker_identity.recognizer import assess_patrol_face

    # Cùng thước đo "thấy mặt" với đường ghi sự kiện — nếu không, nhãn ROI và
    # tab sự kiện sẽ nói hai điều khác nhau về cùng một người.
    face_vec, _face_score, face_eligible = assess_patrol_face(
        frame, person_bbox, camera_id=camera_id,
    )
    face_emb = face_vec.tolist() if face_vec is not None else None

    # JPEG nhỏ / góc drone — assess fail trong khi recover selfie vẫn lấy được embedding.
    from ..patrol_flight_mode import is_patrol_helmet_like

    if not face_eligible and is_patrol_helmet_like(camera_id):
        from ..worker_identity.recognizer import recover_patrol_face_embedding

        recovered = recover_patrol_face_embedding(frame, person_bbox, camera_id=camera_id)
        if recovered is not None:
            face_emb, _face_score = recovered
            face_eligible = True

    from .peak_time import PeakCrowdMember, is_peak_time, peak_identity_allowed

    if is_peak_time(camera_id) and not peak_identity_allowed(
        face_eligible=bool(face_eligible),
        face_quality=float(_face_score or 0.0),
        confidence=float(person_det.confidence or 0.0),
    ):
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
        if crowd_members is not None:
            crowd_members.append(
                PeakCrowdMember(
                    track_id=str(track_id),
                    person_bbox=person_bbox,
                    confidence=float(person_det.confidence or 0.0),
                ),
            )
        _record_patrol_density_encounter(
            person_det,
            camera_id=camera_id,
            track_id=track_id,
            frame=frame,
            person_bbox=sink_bbox or person_bbox,
            confidence=float(person_det.confidence or 0.0),
        )
        return

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
        cached = peek_track_lifecycle(camera_id, track_id)
        worker_id = peek_patrol_track_identity(camera_id, track_id)
        if cached and cached.worker_id:
            worker_id = cached.worker_id or worker_id
            worker_name = cached.worker_name
        else:
            worker_name = ""
        if worker_id and not worker_name:
            from ..patrol_entity import resolve_patrol_worker_display_name

            worker_name = resolve_patrol_worker_display_name(worker_id, "")

    # Tầng lấy từ state machine chứ không suy lại mỗi frame: track đã lên Người /
    # Định danh thì giữ nguyên nhãn kể cả khung hình này quay lưng.
    resolved = observe_track_identity(
        camera_id,
        track_id,
        worker_id=worker_id,
        worker_name=worker_name,
    )

    from ..patrol_identity_lifecycle import tier_for_worker_id

    display_tier = resolved.tier
    tier_rank = {"object": 0, "person": 1, "identity": 2}
    inferred = tier_for_worker_id(resolved.worker_id or worker_id)
    if tier_rank.get(inferred, 0) > tier_rank.get(display_tier, 0):
        display_tier = inferred

    person_det.worker_id = resolved.worker_id
    person_det.worker_name = resolved.worker_name
    person_det.track_id = track_id
    person_det.tier = display_tier
    person_det.face_eligible = face_eligible and face_emb is not None

    # Ghi vào kho tuần tra (SQLite). Vector khuôn mặt chỉ tồn tại ở đúng chỗ
    # này trong cả vòng phân tích — không đẩy qua PpeDetection vì nó được
    # serialize thẳng xuống trình duyệt.
    try:
        from .sink import record_observation

        record_observation(
            camera_id=camera_id,
            track_id=track_id,
            face_embedding=face_emb if person_det.face_eligible else None,
            face_quality=float(_face_score or 0.0),
            face_eligible=bool(person_det.face_eligible),
            confidence=float(person_det.confidence or 0.0),
            frame=frame,
            person_bbox=sink_bbox,
            lifecycle_tier=display_tier,
            lifecycle_worker_id=resolved.worker_id,
            worker_name=resolved.worker_name,
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
    from ..patrol_person_visibility import patrol_person_meets_detection_gate

    return patrol_person_meets_detection_gate(
        person_box,
        frame_w,
        frame_h,
        face_dominant=_face_dominant_person_box(person_box, frame_w, frame_h),
        face_eligible=face_eligible,
        has_stable_id=has_stable_id,
    )


def _patrol_person_should_run_identity(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    camera_id: str,
    frame: np.ndarray | None = None,
) -> bool:
    """Chạy nhận diện đầy đủ khi gate hình học pass hoặc vẫn thấy mặt."""
    from ..patrol_person_visibility import legs_only_person_box, limb_fragment_person_box

    if legs_only_person_box(person_box, frame_w, frame_h):
        return False
    if limb_fragment_person_box(person_box, frame_w, frame_h):
        return False
    if _patrol_person_passes_display_gate(person_box, frame_w, frame_h, camera_id=camera_id):
        return True
    if frame is None:
        return False
    from ..patrol_flight_mode import is_patrol_helmet_like

    if not is_patrol_helmet_like(camera_id) and not _is_patrol_flycam(camera_id):
        return False
    from ..worker_identity.recognizer import assess_patrol_face, recover_patrol_face_embedding

    bbox = [float(v) for v in person_box]
    _vec, _score, face_eligible = assess_patrol_face(frame, bbox, camera_id=camera_id)
    if face_eligible:
        return True
    if is_patrol_helmet_like(camera_id):
        return recover_patrol_face_embedding(frame, bbox, camera_id=camera_id) is not None
    return False


def _patrol_person_passes_display_gate(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    camera_id: str,
) -> bool:
    from ..patrol_flight_mode import is_patrol_flycam_aerial, is_patrol_helmet_like
    from ..patrol_person_visibility import patrol_person_meets_display_gate

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
    overlay_box: tuple[float, float, float, float] | None = None,
) -> None:
    """ROI-only — giữ nhãn cache; touch sink (min-commit ngắn, 2s = frame đẹp)."""
    if not track_id:
        return
    from ..patrol_identity_lifecycle import peek as peek_track_identity, tier_for_worker_id

    person_det.track_id = track_id
    cached = peek_track_identity(camera_id, track_id)
    if cached is not None:
        person_det.worker_id = cached.worker_id
        person_det.worker_name = cached.worker_name
        person_det.tier = cached.tier
    else:
        from ..patrol_entity import resolve_patrol_worker_display_name
        from ..person_identity_registry import peek_patrol_track_identity

        worker_id = peek_patrol_track_identity(camera_id, track_id) or ""
        worker_name = ""
        if worker_id:
            worker_name = resolve_patrol_worker_display_name(worker_id, "")
        if worker_id:
            from ..patrol_identity_lifecycle import observe as observe_track_identity

            resolved = observe_track_identity(
                camera_id,
                track_id,
                worker_id=worker_id,
                worker_name=worker_name,
            )
            person_det.worker_id = resolved.worker_id
            person_det.worker_name = resolved.worker_name
            person_det.tier = resolved.tier
        else:
            person_det.tier = "object"

    display_tier = person_det.tier or "object"
    tier_rank = {"object": 0, "person": 1, "identity": 2}
    inferred = tier_for_worker_id(person_det.worker_id)
    if tier_rank.get(inferred, 0) > tier_rank.get(display_tier, 0):
        display_tier = inferred
    person_det.tier = display_tier

    try:
        from .sink import record_observation

        record_observation(
            camera_id=camera_id,
            track_id=track_id,
            confidence=float(person_det.confidence or 0.0),
            frame=frame,
            person_bbox=_sink_overlay_bbox(overlay_box, person_box),
            lifecycle_tier=display_tier,
            lifecycle_worker_id=person_det.worker_id or None,
            worker_name=person_det.worker_name,
        )
    except Exception:  # noqa: BLE001
        logger.exception("[patrol] Không touch sink cho track display-only")

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
    from ..patrol_face_anchor import anchor_patrol_person_boxes_to_faces

    anchored = anchor_patrol_person_boxes_to_faces(
        frame,
        [(p.person_box, p.person_conf) for p in raw_persons],
        camera_id=camera_id,
    )
    persons = _dedupe_person_boxes(
        [_PersonPpe(person_box=box, person_conf=conf) for box, conf in anchored],
        camera_id=camera_id,
        frame_w=w,
        frame_h=h,
    )

    detections = _build_patrol_person_detections(
        frame,
        camera_id,
        persons,
        w,
        h,
        source_pts_sec=source_pts_sec,
        raw_yolo_boxes=[p.person_box for p in raw_persons],
    )

    from .peak_time import is_peak_time

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
            "peak_time_active": is_peak_time(camera_id),
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
    from ..patrol_person_visibility import patrol_person_meets_detection_gate

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
    from ..patrol_flight_mode import is_patrol_flycam_aerial, is_patrol_helmet_like
    from ..patrol_person_visibility import patrol_person_meets_display_gate

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
    from ..patrol_face_anchor import _bbox_iou

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
    đông…) — sink ghi thẻ sau min-commit ngắn; 2s là cửa sổ chọn frame đẹp /
    thăng tier, không chặn xe chạy qua. Gate hình học chặt chỉ dùng cho KPI legacy.
    """
    reset_hc_patrol_face_assignments(camera_id)
    from .peak_time import (
        PeakCrowdMember,
        assign_peak_crowd_detection_fields,
        is_peak_time,
        record_peak_crowd_frame,
        update_peak_time_density,
    )

    peak_active = update_peak_time_density(camera_id, len(persons))
    crowd_members: list[PeakCrowdMember] = [] if peak_active else []
    track_ids = assign_patrol_track_ids(
        camera_id,
        [(p.person_box, p.person_conf) for p in persons],
        frame=frame,
    )

    detections: list[PpeDetection] = []
    raw_boxes = list(raw_yolo_boxes or [])
    for person_index, person in enumerate(persons):
        pb = person.person_box
        from ..patrol_person_visibility import patrol_person_overlay_bbox

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
        if _patrol_person_should_run_identity(
            pb, frame_w, frame_h, camera_id=camera_id, frame=frame,
        ):
            _assign_patrol_person_identity(
                person_det,
                pb,
                frame=frame,
                camera_id=camera_id,
                frame_w=frame_w,
                frame_h=frame_h,
                track_id=track_id,
                crowd_members=crowd_members if peak_active else None,
                overlay_box=overlay_pb,
            )
        else:
            _assign_patrol_person_display_only(
                person_det,
                camera_id=camera_id,
                track_id=track_id,
                frame=frame,
                person_box=pb,
                overlay_box=overlay_pb,
            )
        _attach_track_velocity(person_det, camera_id, track_id)
        detections.append(person_det)

    if crowd_members:
        obj_id = record_peak_crowd_frame(
            camera_id,
            crowd_members,
            frame,
        )
        if obj_id:
            assign_peak_crowd_detection_fields(detections, crowd_members, obj_id)

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
    from ..patrol_tracker import get_patrol_tracker

    track = get_patrol_tracker(camera_id).get(track_id)
    if track is None:
        return
    vx, vy = track.velocity()
    person_det.velocity = [round(vx, 2), round(vy, 2)]


def _flycam_prescan_for_flight_mode(frame: np.ndarray, camera_id: str) -> None:
    """YOLO nhanh trước khi chọn aerial/proximity — chỉ khi thiếu telemetry độ cao."""
    if not _is_patrol_flycam(camera_id):
        return
    from ..patrol_flight_mode import note_patrol_flycam_visual_scale

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
    from ..patrol_face_anchor import anchor_patrol_person_boxes_to_faces

    anchored = anchor_patrol_person_boxes_to_faces(
        frame,
        [(p.person_box, p.person_conf) for p in raw_persons],
        camera_id=camera_id,
    )
    persons = _dedupe_person_boxes(
        [_PersonPpe(person_box=box, person_conf=conf) for box, conf in anchored],
        camera_id=camera_id,
        frame_w=w,
        frame_h=h,
    )

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

__all__ = [
    "assign_patrol_track_ids",
    "reset_all_hc_patrol_state",
    "reset_hc_patrol_face_assignments",
    "_assign_patrol_person_identity",
    "_build_patrol_bodycam_result",
    "_build_patrol_flycam_aerial_result",
    "_build_patrol_flycam_proximity_result",
    "_flycam_prescan_for_flight_mode",
    "_is_helmet_bodycam",
    "_is_patrol_flycam",
    "_plausible_flycam_aerial",
]
