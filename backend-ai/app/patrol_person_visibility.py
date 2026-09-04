"""Tiêu chí hiển thị / đếm patrol person — thân trên + đầu trong khung."""

from __future__ import annotations


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


def zone_visible_ratio(
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


def legs_only_person_box(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """YOLO hay gán bbox chân/thân dưới — vùng 'đầu' giả ở đầu bbox thực ra là đùi/gối."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    cy = (y1 + y2) / 2.0
    head_cy = y1 + ph * 0.12
    y1_ratio = y1 / max(float(frame_h), 1.0)
    y2_ratio = y2 / max(float(frame_h), 1.0)
    aspect = ph / max(pw, 1.0)

    if head_cy > frame_h * 0.54:
        return True
    if cy > frame_h * 0.72:
        return True
    if y2_ratio > 0.86 and y1_ratio > 0.46 and aspect < 2.6:
        return True
    if y1_ratio > 0.50 and y2_ratio > 0.88:
        return True
    return False


def mid_frame_torso_sliver(
    person_box: tuple[float, float, float, float],
    frame_h: int,
) -> bool:
    """Mảnh thân giữa khung, rộng hơn cao — bụng/đùi, không phải đầu + thân trên."""
    x1, y1, x2, y2 = person_box
    pw = max(x2 - x1, 1.0)
    ph = max(y2 - y1, 1.0)
    return y1 / max(float(frame_h), 1.0) > 0.35 and ph / pw < 1.0


def upper_body_third_with_head_visible(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    upper_frac: float = 0.30,
    head_frac: float = 0.24,
    min_visible: float = 0.33,
    min_upper_px_frac: float = 0.06,
    min_head_px_frac: float = 0.04,
) -> bool:
    """Đối tượng patrol — ≥30% thân trên + vùng đầu còn trong khung (không chân/tay)."""
    if legs_only_person_box(person_box, frame_w, frame_h):
        return False
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    head = (x1 + pw * 0.10, y1, x2 - pw * 0.10, y1 + ph * head_frac)
    upper = (x1 + pw * 0.05, y1, x2 - pw * 0.05, y1 + ph * upper_frac)

    head_vis = zone_visible_ratio(head, frame_w, frame_h)
    upper_vis = zone_visible_ratio(upper, frame_w, frame_h)
    if head_vis < min_visible or upper_vis < min_visible:
        return False

    head_cy = y1 + ph * head_frac * 0.5
    if head_cy > frame_h * 0.58:
        return False
    if y1 > frame_h * 0.52:
        return False

    # Loại bbox thân dưới/chân
    visible_upper_h = upper_vis * ph * upper_frac
    visible_head_h = head_vis * ph * head_frac
    if visible_upper_h < frame_h * min_upper_px_frac:
        return False
    if visible_head_h < frame_h * min_head_px_frac:
        return False

    y1_ratio = y1 / max(float(frame_h), 1.0)
    bh_ratio = ph / max(float(frame_h), 1.0)
    if y1_ratio > 0.62 and bh_ratio < 0.18:
        return False

    if mid_frame_torso_sliver(person_box, frame_h):
        return False

    return True


def signboard_like_fp_box(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Biển hiệu/bảng quảng cáo — YOLO hay gán person trên tấm phẳng ngang phía trên."""
    x1, y1, x2, y2 = person_box
    pw = max(x2 - x1, 1.0)
    ph = max(y2 - y1, 1.0)
    aspect = ph / pw
    bw_ratio = pw / max(float(frame_w), 1.0)
    bh_ratio = ph / max(float(frame_h), 1.0)
    area_ratio = (pw * ph) / max(float(frame_w * frame_h), 1.0)
    cy = (y1 + y2) / 2.0
    y1_ratio = y1 / max(float(frame_h), 1.0)
    y2_ratio = y2 / max(float(frame_h), 1.0)

    if aspect < 0.78 and y1_ratio < 0.38 and bh_ratio < 0.42:
        if bw_ratio >= 0.14 and area_ratio >= 0.035:
            return True
        if bw_ratio >= 0.20 and bh_ratio >= 0.05:
            return True
    if aspect < 0.52 and cy < frame_h * 0.36 and bw_ratio >= 0.22:
        return True
    if (
        aspect < 0.95
        and y2_ratio < 0.42
        and bw_ratio >= 0.18
        and area_ratio >= 0.05
        and cy < frame_h * 0.28
    ):
        return True
    return False


SPECK_BOX_MAX_HEIGHT_RATIO = 0.07
SPECK_BOX_MAX_ASPECT = 1.35


def speck_person_box(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Vệt nhỏ hình vuông — không đủ để là bằng chứng về một con người.

    Người đứng, kể cả ở xa, vẫn cao gấp đôi bề rộng. Một hộp chỉ cao 3–5% khung
    mà lại gần vuông thì không mang hình dáng người: đo trên HC-01 thật, 9/11
    hộp lọt cổng ghi thẻ Đối tượng là loại này (~20×25 px, tỉ lệ 0.95–1.11, nằm
    ở nửa trên khung tức là bên kia đường), và cắt ra xem thì chỉ là vệt mờ
    không nhận ra được gì. Chúng đẻ ra thẻ Đối tượng nhiều gấp bốn thẻ Người.

    Ngưỡng đặt thấp có chủ ý: người thật ở xa trên ảnh công trường mẫu cao 12%
    khung, còn người đứng gần cao 56% — cách ngưỡng rất xa.

    Chỉ dùng cho góc mặt đất. Nhìn từ drone thì người thật vốn nhỏ và có thể
    rộng hơn cao (nhìn thẳng xuống đỉnh đầu), nên gate này sẽ xoá sạch ROI hợp
    lệ của luồng bay.
    """
    x1, y1, x2, y2 = person_box
    pw = max(float(x2) - float(x1), 1.0)
    ph = max(float(y2) - float(y1), 1.0)
    if ph / max(float(frame_h), 1.0) >= SPECK_BOX_MAX_HEIGHT_RATIO:
        return False
    return (ph / pw) < SPECK_BOX_MAX_ASPECT


def patrol_bbox_rejects_static_fp(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """True khi bbox giống vật tĩnh hay bị YOLO nhầm person (giàn, kệ, biển)."""
    if vertical_structure_fp_box(person_box, frame_w, frame_h):
        return True
    if signboard_like_fp_box(person_box, frame_w, frame_h):
        return True
    if background_clutter_person_box(person_box, frame_w, frame_h):
        pw = max(float(person_box[2]) - float(person_box[0]), 1.0)
        ph = max(float(person_box[3]) - float(person_box[1]), 1.0)
        # Người đứng aspect ~1.0 — chỉ loại khối ngang/nền phía sau.
        if ph / pw < 0.85:
            return True
    return False


def patrol_object_commit_allowed(
    person_box: tuple[float, float, float, float] | None,
    frame_w: int,
    frame_h: int,
    *,
    face_eligible: bool = False,
    flycam: bool = False,
    proximity_flycam: bool = False,
) -> bool:
    """Gate ghi thẻ Đối tượng — chặn biển hiệu/vật tĩnh; cho phép silhouette hợp lệ."""
    if person_box is None or frame_w <= 0 or frame_h <= 0:
        return False
    if patrol_bbox_rejects_static_fp(person_box, frame_w, frame_h):
        return False
    if (
        not flycam
        and not proximity_flycam
        and speck_person_box(person_box, frame_w, frame_h)
    ):
        return False
    if face_eligible:
        return True
    if patrol_person_meets_detection_gate(person_box, frame_w, frame_h):
        return True
    return patrol_person_meets_display_gate(
        person_box,
        frame_w,
        frame_h,
        flycam=flycam,
        proximity_flycam=proximity_flycam,
    )


def vertical_structure_fp_box(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Than giàn giáo/cột dọc — YOLO hay gán person với conf cao trên vật tĩnh."""
    x1, y1, x2, y2 = person_box
    pw = max(x2 - x1, 1.0)
    ph = max(y2 - y1, 1.0)
    aspect = ph / pw
    bw_ratio = pw / max(float(frame_w), 1.0)
    bh_ratio = ph / max(float(frame_h), 1.0)
    if aspect > 2.6 and bw_ratio < 0.075 and bh_ratio > 0.10:
        return True
    if aspect < 0.30 and bh_ratio < 0.055 and bw_ratio > 0.20:
        return True
    return False


def plausible_person_silhouette(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    flycam: bool = False,
    patrol_display: bool = False,
) -> bool:
    """Loại dải dọc/ngang quá hẹp — YOLO FP mép khung."""
    x1, y1, x2, y2 = person_box
    pw = max(x2 - x1, 1.0)
    ph = max(y2 - y1, 1.0)
    aspect = ph / pw
    if flycam:
        # Nhìn từ trên xuống, người ngồi hoặc cúi co lại thành khối rộng hơn cao.
        # Giữ sàn 0.28 của góc ngang là loại đúng những trường hợp đó.
        if aspect > 6.5 or aspect < 0.12:
            return False
        if pw < max(6.0, frame_w * 0.006):
            return False
        if ph < max(8.0, frame_h * 0.010):
            return False
        return True
    min_pw_frac = 0.012 if patrol_display else 0.035
    min_ph_frac = 0.018 if patrol_display else 0.04
    if aspect > 4.2 or aspect < 0.28:
        return False
    if pw < max(8.0 if patrol_display else 12.0, frame_w * min_pw_frac):
        return False
    if ph < max(10.0 if patrol_display else 14.0, frame_h * min_ph_frac):
        return False
    return True


def limb_fragment_person_box(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Bbox chỉ là mảnh chi thể — mảnh vỡ của người đã được khoanh ở box khác.

    Hẹp hơn hẳn `legs_only_person_box`. Hàm kia coi mọi bbox có vùng đầu nằm dưới
    54% chiều cao khung là chân, nên người **ngồi** nhìn từ camera đội đầu — vốn
    luôn rơi xuống nửa dưới khung — cũng bị loại. Với đường ghi sự kiện thì chặt
    như vậy là đúng, nhưng với đường vẽ ROI thì mất đúng nhóm cần thấy nhất.

    Ở đây chỉ loại khối thật sự có dáng chi thể: dài và hẹp nằm hẳn phía dưới, hoặc
    dính sát đáy khung (thường là chân của chính người đeo camera).
    """
    x1, y1, x2, y2 = person_box
    pw = max(x2 - x1, 1.0)
    ph = max(y2 - y1, 1.0)
    aspect = ph / pw
    y1_ratio = y1 / max(float(frame_h), 1.0)
    y2_ratio = y2 / max(float(frame_h), 1.0)

    if aspect >= 2.2 and y1_ratio > 0.52 and y2_ratio > 0.80:
        return True
    if y1_ratio > 0.62 and y2_ratio > 0.97:
        return True
    return False


def patrol_person_overlay_bbox(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> tuple[float, float, float, float]:
    """BBox vẽ ROI patrol — đúng box đã dò được, chỉ clip khung.

    Từng có một nhánh "mở xuống chân ước lượng": bbox nào aspect < 2.05 thì nhân
    chiều cao 2.6 lần. Đo trên HC-01 thật thì nhánh đó chạm **100%** số box với
    hệ số trung bình 2.27×, và phần nới ra rơi xuống vỉa hè / dàn xe máy phía
    dưới người. Nó còn nhân thêm sai số của box synth theo mặt — mặt 14 px sinh
    box 173×130 rồi thành 173×338.

    Tiền đề của nhánh đó ("YOLO quay lưng trả bbox cắt ngang lưng–bụng") đo trên
    chính các box synth chứ không phải box YOLO: box YOLO thật trên bodycam có
    aspect ~2.0–2.4, đúng dáng người đứng. Nên ROI chỉ vẽ bằng chứng đã có.
    """
    return _clip_box_to_frame(person_box, frame_w, frame_h)


def patrol_snapshot_bbox_needs_shrink(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    max_area_ratio: float = 0.38,
    max_height_ratio: float = 0.55,
) -> bool:
    """True khi bbox quá lớn nên `patrol_snapshot_draw_bbox` sẽ phải thu nhỏ.

    Tách riêng để đường ghi snapshot chỉ chạy dò mặt (tốn ~50ms) đúng lúc cần
    bằng chứng vị trí đối tượng, không chạy cho mọi thẻ.
    """
    if frame_w <= 0 or frame_h <= 0:
        return False
    x1, y1, x2, y2 = patrol_person_overlay_bbox(person_box, frame_w, frame_h)
    fw, fh = max(float(frame_w), 1.0), max(float(frame_h), 1.0)
    pw, ph = max(x2 - x1, 1.0), max(y2 - y1, 1.0)
    return (pw * ph) / (fw * fh) > max_area_ratio or ph / fh > max_height_ratio


def _face_anchored_draw_box(
    face_box: tuple[float, float, float, float],
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> tuple[float, float, float, float] | None:
    """Thu bbox quanh khuôn mặt đã dò được — đầu + thân trên, kẹp trong bbox người."""
    fx1, fy1, fx2, fy2 = (float(v) for v in face_box)
    px1, py1, px2, py2 = (float(v) for v in person_box)
    face_w = fx2 - fx1
    face_h = fy2 - fy1
    if face_w < 8.0 or face_h < 8.0:
        return None
    # Mặt phải nằm trong bbox người, nếu không thì đó là mặt của người khác.
    if min(fx2, px2) - max(fx1, px1) <= 0 or min(fy2, py2) - max(fy1, py1) <= 0:
        return None

    cx = (fx1 + fx2) / 2.0
    half_w = face_w * 1.30
    nx1 = max(px1, cx - half_w)
    nx2 = min(px2, cx + half_w)
    top = max(py1, fy1 - face_h * 0.35)
    bottom = min(py2, top + face_h * 3.20)
    if bottom - top < face_h * 1.60:
        bottom = min(py2, top + face_h * 1.60)
    if nx2 - nx1 < face_w * 0.80 or bottom - top < face_h:
        return None
    return _clip_box_to_frame((nx1, top, nx2, bottom), frame_w, frame_h)


def patrol_snapshot_draw_bbox(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    face_box: tuple[float, float, float, float] | None = None,
    max_area_ratio: float = 0.38,
    max_height_ratio: float = 0.55,
) -> tuple[float, float, float, float]:
    """BBox vẽ lên JPG snapshot — không để YOLO crowd phủ 60–80% khung."""
    box = patrol_person_overlay_bbox(person_box, frame_w, frame_h)
    x1, y1, x2, y2 = box
    fw, fh = max(float(frame_w), 1.0), max(float(frame_h), 1.0)
    pw, ph = max(x2 - x1, 1.0), max(y2 - y1, 1.0)
    area_ratio = (pw * ph) / (fw * fh)
    bh_ratio = ph / fh

    if area_ratio <= max_area_ratio and bh_ratio <= max_height_ratio:
        return box

    # Có khuôn mặt thì thu quanh mặt — đó là bằng chứng duy nhất nói đối tượng
    # đứng ở đâu trong bbox. Thu theo hình học chỉ là phỏng đoán: bbox bodycam
    # cận cảnh thường mở lên quá đầu, nên cửa sổ neo mép trên rơi vào trần/nền
    # và khung ROI không chồng lên người nào.
    if face_box is not None:
        anchored = _face_anchored_draw_box(face_box, box, frame_w, frame_h)
        if anchored is not None:
            return anchored

    cx = (x1 + x2) / 2.0
    target_h = min(ph, fh * max_height_ratio)
    target_w = min(pw, fw * 0.42)
    if area_ratio > max_area_ratio:
        side = (max_area_ratio * fw * fh) ** 0.5
        target_h = min(target_h, side)
        target_w = min(target_w, side * 0.75)

    # Không dò được mặt — cắt bớt từ chân lên, giữ nguyên mép trên.
    #
    # Thu quanh tâm sẽ cắt đầu: người đứng gần bodycam luôn cao hơn 55% khung,
    # nên mọi thẻ đều mất phần đầu — đúng cái phần chứng minh đây là người và
    # là căn cứ để thăng tầng Người. Chân thì không mang thông tin ấy.
    nx1 = cx - target_w / 2.0
    nx2 = cx + target_w / 2.0
    return _clip_box_to_frame((nx1, y1, nx2, y1 + target_h), frame_w, frame_h)


def patrol_person_meets_display_gate(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    flycam: bool = False,
    proximity_flycam: bool = False,
) -> bool:
    """Gate vẽ ROI — rộng hơn hẳn gate ghi sự kiện.

    Yêu cầu nghiệp vụ: khoanh mọi thứ có dấu hiệu là người trên khung hình, kể cả
    người ngồi, bị che một phần hay quay lưng. Ràng buộc "đầu + 1/3 thân trên" chỉ
    dùng để quyết định có ghi sự kiện hay không, không được dùng ở đây — nó chính
    là thứ làm biến mất ROI của người ngồi và người bị khuất trong đám đông.

    Mirror `patrolPersonMeetsDisplayGate` bên FE để overlay của luồng VMS và luồng
    mobile không nói hai điều khác nhau về cùng một khung hình.
    """
    if frame_w <= 0 or frame_h <= 0:
        return False
    if vertical_structure_fp_box(person_box, frame_w, frame_h):
        return False
    if signboard_like_fp_box(person_box, frame_w, frame_h):
        return False
    if flycam:
        if not plausible_person_silhouette(person_box, frame_w, frame_h, flycam=True):
            return False
        return True
    if proximity_flycam:
        if wide_crowd_rider_box(person_box, frame_w, frame_h):
            return True
        if not plausible_person_silhouette(
            person_box, frame_w, frame_h, patrol_display=True,
        ):
            return False
        return not limb_fragment_person_box(person_box, frame_w, frame_h)
    # Chỉ góc mặt đất: vệt vuông vài chục pixel bên kia đường không phải người.
    if speck_person_box(person_box, frame_w, frame_h):
        return False
    if wide_crowd_rider_box(person_box, frame_w, frame_h):
        return True
    if not plausible_person_silhouette(
        person_box, frame_w, frame_h, patrol_display=True,
    ):
        return False
    return not limb_fragment_person_box(person_box, frame_w, frame_h)


def background_clutter_person_box(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Kệ/cây/vách nền — YOLO hay gán person trên vật tĩnh phía sau."""
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    area_ratio = (pw * ph) / max(float(frame_w * frame_h), 1.0)
    cy = (y1 + y2) / 2.0
    aspect = ph / pw
    if cy < frame_h * 0.44 and area_ratio < 0.11 and aspect < 1.20:
        return True
    if y1 < frame_h * 0.10 and area_ratio < 0.07:
        return True
    return False


def wide_crowd_rider_box(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Người nhỏ/xa trên đường (quay lưng, xe máy) — không cần tín hiệu da."""
    if legs_only_person_box(person_box, frame_w, frame_h):
        return False
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    bh_ratio = ph / max(float(frame_h), 1.0)
    bw_ratio = pw / max(float(frame_w), 1.0)
    aspect = ph / pw
    if bh_ratio < 0.035 or bh_ratio > 0.65:
        return False
    if bw_ratio < 0.018 or bw_ratio > 0.42:
        return False
    if aspect < 0.65 or aspect > 4.8:
        return False
    cy = (y1 + y2) / 2.0
    if cy < frame_h * 0.06 or cy > frame_h * 0.82:
        return False
    return True


def patrol_person_meets_detection_gate(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    face_dominant: bool = False,
    has_stable_id: bool = False,
    face_eligible: bool = False,
) -> bool:
    """Gate ghi sự kiện — cần đầu + thân (≥30%) hoặc mặt rõ; loại chân/tay."""
    if legs_only_person_box(person_box, frame_w, frame_h):
        return False
    if signboard_like_fp_box(person_box, frame_w, frame_h):
        return False
    if not plausible_person_silhouette(person_box, frame_w, frame_h):
        return False
    if has_stable_id:
        return True
    if face_eligible:
        return True
    # Chỉ mặt thật hoặc mã đã biết mới được bỏ qua hình học — suy đoán "cận mặt"
    # theo tỉ lệ khung không đủ căn cứ, bụng/đùi giữa khung cũng lọt.
    if mid_frame_torso_sliver(person_box, frame_h):
        return False
    if face_dominant:
        return True
    return upper_body_third_with_head_visible(person_box, frame_w, frame_h)


def _is_edge_sliver_person_box(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Loại bbox nhỏ dính mép — YOLO hay nhầm tay/cánh tay góc khung."""
    x1, y1, x2, y2 = person_box
    pw = max(x2 - x1, 1.0)
    ph = max(y2 - y1, 1.0)
    area_ratio = (pw * ph) / max(float(frame_w * frame_h), 1.0)
    at_right = x1 >= frame_w * 0.72
    at_left = x2 <= frame_w * 0.28
    at_top = y1 <= frame_h * 0.04 and y2 <= frame_h * 0.42
    if area_ratio < 0.14 and (at_right or at_left or at_top):
        return True
    if area_ratio < 0.08:
        return True
    return False


def _face_dominant_person_box(
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)
    aspect = pw / ph
    bh_ratio = ph / max(float(frame_h), 1.0)
    if bh_ratio >= 0.38 and 0.42 <= aspect <= 1.35:
        return True
    if aspect >= 0.72 and bh_ratio < 0.62:
        return True
    if y1 < frame_h * 0.12 and y2 < frame_h * 0.62 and bh_ratio < 0.55:
        return True
    if aspect >= 0.55 and bh_ratio < 0.42:
        return True
    return False


def resolve_patrol_person_snapshot_bbox(
    frame: object,
    person_box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
    *,
    camera_id: str = "",
) -> tuple[float, float, float, float] | None:
    """ROI snapshot PERS — ưu tiên mặt, không crop tay/mép góc/chân."""
    if _is_edge_sliver_person_box(person_box, frame_w, frame_h):
        return None
    if legs_only_person_box(person_box, frame_w, frame_h):
        return None

    import numpy as np

    from .worker_identity.recognizer import patrol_face_bbox_in_frame

    if frame is None or not isinstance(frame, np.ndarray):
        return None

    _ = camera_id
    face_box = patrol_face_bbox_in_frame(frame, [float(v) for v in person_box])
    if face_box is not None:
        fx1, fy1, fx2, fy2 = face_box
        fw = max(fx2 - fx1, 1.0)
        fh = max(fy2 - fy1, 1.0)
        expanded = (
            fx1 - fw * 0.40,
            fy1 - fh * 0.50,
            fx2 + fw * 0.40,
            fy2 + fh * 0.65,
        )
        clipped = _clip_box_to_frame(expanded, frame_w, frame_h)
        if (clipped[3] - clipped[1]) >= frame_h * 0.10:
            return clipped

    x1, y1, x2, y2 = person_box
    ph = max(y2 - y1, 1.0)
    pw = max(x2 - x1, 1.0)

    if upper_body_third_with_head_visible(person_box, frame_w, frame_h):
        upper = (x1 + pw * 0.05, y1, x2 - pw * 0.05, y1 + ph * 0.30)
        clipped = _clip_box_to_frame(upper, frame_w, frame_h)
        if (clipped[3] - clipped[1]) >= frame_h * 0.10:
            return clipped

    if _face_dominant_person_box(person_box, frame_w, frame_h):
        head_shoulder = (
            x1 + pw * 0.06,
            y1,
            x2 - pw * 0.06,
            y1 + ph * 0.50,
        )
        clipped = _clip_box_to_frame(head_shoulder, frame_w, frame_h)
        if (clipped[3] - clipped[1]) >= frame_h * 0.14:
            return clipped

    return None
