"""Kiểm tra bbox người trước khi chạy nhận diện mặt — tránh FP trên máy/cẩu."""

from __future__ import annotations


def person_eligible_for_face_identity(
    frame,
    person_bbox: list[float] | None,
    *,
    camera_id: str,
    source_pts_sec: float | None = None,
) -> bool:
    """Chỉ nhận diện gallery khi bbox giống người thật và không nằm trên máy."""
    if not person_bbox or len(person_bbox) < 4:
        return False

    from ..cam04_ppe_demo import is_cam04_ppe_scene, resolve_cam04_ppe_demo

    if camera_id == "A-04":
        demo_action = resolve_cam04_ppe_demo(camera_id, frame, source_pts_sec=source_pts_sec)
        if demo_action == "suppress":
            return False
        in_crane_segment = (
            source_pts_sec is not None
            and 0.0 <= float(source_pts_sec) <= 10.5
        )
        in_ppe_segment = (
            source_pts_sec is not None
            and 9.5 <= float(source_pts_sec) <= 15.0
        )
        in_pccc_segment = (
            source_pts_sec is not None
            and 15.0 <= float(source_pts_sec) <= 21.0
        )
        allowed = (
            in_crane_segment
            or (demo_action is None and in_ppe_segment)
            or demo_action == "vest_only"
            or is_cam04_ppe_scene(camera_id, frame, source_pts_sec=source_pts_sec)
        )
        if not allowed and not in_pccc_segment:
            return False

    from ..ppe_analyzer import (
        _machinery_bboxes,
        _person_clear_of_machinery,
        _person_upper_body_signal,
        _plausible_person_box,
    )

    from ..ppe_analyzer import _face_dominant_person_box, _is_helmet_bodycam

    h, w = frame.shape[:2]
    box = (float(person_bbox[0]), float(person_bbox[1]), float(person_bbox[2]), float(person_bbox[3]))
    machinery = _machinery_bboxes(frame, camera_id, source_pts_sec=source_pts_sec)
    in_crane_segment = (
        camera_id == "A-04"
        and source_pts_sec is not None
        and 0.0 <= float(source_pts_sec) <= 10.5
    )
    if machinery and not in_crane_segment and not _person_clear_of_machinery(box, machinery, max_iou=0.08):
        return False
    bodycam = _is_helmet_bodycam(camera_id)
    if not _plausible_person_box(
        box,
        w,
        h,
        frame=frame,
        machinery=machinery,
        strict=not bodycam,
        bodycam=bodycam,
    ):
        return False
    if bodycam and _face_dominant_person_box(box, w, h):
        return True
    if not _person_upper_body_signal(frame, box):
        return False
    return True
