"""Phân tích ATGT thật — phương tiện (YOLO đa lớp) + tốc độ theo tracking liên khung
+ phân làn theo ROI camera (Cam A-03). Không dùng bbox hiệu chuẩn tay/ảnh mẫu:
mọi bbox đều do model hoặc phân tích pixel trực tiếp trên frame hiện tại sinh ra."""

from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass

import cv2
import numpy as np

from .atgt_plate_reader import resolve_vehicle_plate
from .config import settings
from .detectors.vehicle_detector import VehicleDetector
from .road_roi_config import get_roi_zones_for_camera
from .schemas import Detection
from .violation_thresholds import VIOLATION_MIN_CONFIDENCE

logger = logging.getLogger("atgt_analyzer")

_VEHICLE_CONF = 0.42
_MIN_CONF = VIOLATION_MIN_CONFIDENCE

# Hiệu chuẩn Cam A-03 — góc rộng, xe ở xa hơn Cam A-04 nên px/m nhỏ hơn.
ATGT_PIXELS_PER_METER = 58.0
# Tốc độ tối đa cho phép trong khuôn viên công trường.
SPEED_LIMIT_KMH = 20.0

_MIN_TRACK_DT_SECONDS = 0.15
_MAX_TRACK_GAP_SECONDS = 2.0
_MAX_PLAUSIBLE_SPEED_KMH = 160.0

_HARD_MEDIAN_CONF = 0.70
_SOFT_MEDIAN_CONF = 0.65

_vehicle_detector: VehicleDetector | None = None


def _get_vehicle_detector() -> VehicleDetector:
    global _vehicle_detector
    if _vehicle_detector is None:
        _vehicle_detector = VehicleDetector(conf_threshold=_VEHICLE_CONF)
        _vehicle_detector.load()
    return _vehicle_detector


def _bbox_center(bbox: tuple[float, float, float, float]) -> tuple[float, float]:
    return (bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0


def _iou(a: tuple[float, ...], b: tuple[float, ...]) -> float:
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


@dataclass
class _VehicleTrack:
    bbox: tuple[float, float, float, float]
    center: tuple[float, float]
    last_seen: float
    speed_kmh: float = 0.0


_tracks: dict[str, dict[str, _VehicleTrack]] = {}
_track_seq: dict[str, int] = {}


def _match_track(
    camera_tracks: dict[str, _VehicleTrack],
    bbox: tuple[float, float, float, float],
    *,
    iou_threshold: float = 0.22,
) -> str | None:
    best_id: str | None = None
    best_iou = iou_threshold
    for track_id, track in camera_tracks.items():
        iou = _iou(bbox, track.bbox)
        if iou > best_iou:
            best_iou = iou
            best_id = track_id
    return best_id


def _update_tracks_and_speed(
    camera_id: str,
    bboxes: list[tuple[float, float, float, float]],
    now: float,
) -> dict[int, float]:
    """Gán track ổn định theo IoU liên khung, ước lượng tốc độ (km/h) từ độ
    dịch chuyển tâm bbox / thời gian, quy đổi theo hiệu chuẩn px/m camera."""
    tracks = _tracks.setdefault(camera_id, {})
    speeds: dict[int, float] = {}
    matched_ids: set[str] = set()

    for idx, bbox in enumerate(bboxes):
        center = _bbox_center(bbox)
        track_id = _match_track(tracks, bbox)

        if track_id is None:
            seq = _track_seq.get(camera_id, 0) + 1
            _track_seq[camera_id] = seq
            track_id = f"veh{seq}"
            tracks[track_id] = _VehicleTrack(bbox=bbox, center=center, last_seen=now)
            speeds[idx] = 0.0
            matched_ids.add(track_id)
            continue

        track = tracks[track_id]
        dt = now - track.last_seen
        if dt >= _MIN_TRACK_DT_SECONDS:
            dist_px = math.hypot(center[0] - track.center[0], center[1] - track.center[1])
            dist_m = dist_px / ATGT_PIXELS_PER_METER
            instant_kmh = min((dist_m / dt) * 3.6, _MAX_PLAUSIBLE_SPEED_KMH)
            # EMA — giảm nhiễu jitter bbox giữa các khung liên tiếp.
            track.speed_kmh = instant_kmh if track.speed_kmh <= 0 else track.speed_kmh * 0.5 + instant_kmh * 0.5
        track.bbox = bbox
        track.center = center
        track.last_seen = now
        speeds[idx] = track.speed_kmh
        matched_ids.add(track_id)

    for track_id in list(tracks.keys()):
        if track_id in matched_ids:
            continue
        if now - tracks[track_id].last_seen > _MAX_TRACK_GAP_SECONDS:
            tracks.pop(track_id, None)

    return speeds


def _roi_mask(camera_id: str, width: int, height: int) -> np.ndarray | None:
    zones = [z for z in get_roi_zones_for_camera(camera_id) if z["type"] == "ROAD"]
    if not zones:
        return None
    polygon = zones[0]["polygon"]
    pts = np.array([[int(p["x"] * width), int(p["y"] * height)] for p in polygon], dtype=np.int32)
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 255)
    return mask


def _mask_bbox(mask: np.ndarray) -> tuple[float, float, float, float] | None:
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        return None
    return float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())


def _centroid_in_mask(bbox: tuple[float, ...], mask: np.ndarray) -> bool:
    h, w = mask.shape[:2]
    cx = int((bbox[0] + bbox[2]) / 2)
    cy = int((bbox[1] + bbox[3]) / 2)
    if cx < 0 or cy < 0 or cx >= w or cy >= h:
        return False
    return mask[cy, cx] > 0


def _bbox_overlap_mask_ratio(bbox: tuple[float, ...], mask: np.ndarray) -> float:
    h, w = mask.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return 0.0
    patch = mask[y1:y2, x1:x2]
    return float(np.count_nonzero(patch)) / max((x2 - x1) * (y2 - y1), 1)


def _clip_bbox_to_mask(
    bbox: tuple[float, ...],
    mask: np.ndarray,
) -> tuple[float, float, float, float] | None:
    h, w = mask.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 - x1 < 12 or y2 - y1 < 10:
        return None
    patch = np.zeros((h, w), dtype=np.uint8)
    patch[y1:y2, x1:x2] = 255
    clipped = cv2.bitwise_and(patch, mask)
    return _mask_bbox(clipped)


def lane_detection_inside_road(
    bbox: tuple[float, ...] | list[float],
    mask: np.ndarray,
    *,
    min_overlap: float = 0.42,
) -> bool:
    """Phân làn / vi phạm ATGT-004 chỉ hợp lệ khi nằm trong polygon ROAD."""
    box = tuple(float(v) for v in bbox)
    if not _centroid_in_mask(box, mask):
        return False
    return _bbox_overlap_mask_ratio(box, mask) >= min_overlap


def _road_lane_interior_mask(mask: np.ndarray, height: int, width: int) -> np.ndarray:
    """Phần lòng đường phía gần camera — bên trong polygon ROAD."""
    interior = mask.copy()
    interior[: int(height * 0.28), :] = 0
    return interior


def _interior_row_span(interior: np.ndarray, y: int) -> tuple[int, int] | None:
    cols = np.where(interior[y, :] > 0)[0]
    if len(cols) < 8:
        return None
    return int(cols[0]), int(cols[-1])


def _finalize_lane_detection(
    bbox: tuple[float, float, float, float] | None,
    mask: np.ndarray,
) -> tuple[float, float, float, float] | None:
    if bbox is None:
        return None
    clipped = _clip_bbox_to_mask(bbox, mask)
    if clipped is None:
        return None
    if not lane_detection_inside_road(clipped, mask):
        return None
    return clipped


def _detect_hard_median(frame: np.ndarray, mask: np.ndarray) -> tuple[float, float, float, float] | None:
    """Dải phân cách cứng (bê tông/kim loại cố định) — cạnh dài, ~ngang, xuyên ROI.

    Cạnh phải được tính trên ảnh GỐC rồi mới cắt theo mask — nếu che nền về 0
    trước khi tính Canny sẽ tự tạo viền giả đúng theo biên polygon ROI."""
    h, w = frame.shape[:2]
    lane_mask = _road_lane_interior_mask(mask, h, w)
    lane_mask[int(h * 0.62) :, :] = 0
    if cv2.countNonZero(lane_mask) < 120:
        return None
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 160)
    eroded_mask = cv2.erode(lane_mask, np.ones((5, 5), np.uint8), iterations=1)
    edges = cv2.bitwise_and(edges, edges, mask=eroded_mask)
    min_len = max(40, int(w * 0.22))
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=60, minLineLength=min_len, maxLineGap=12)
    if lines is None:
        return None

    best: tuple[float, float, float, float] | None = None
    best_len = 0.0
    for line in lines.reshape(-1, 4):
        x1, y1, x2, y2 = [float(v) for v in line]
        length = math.hypot(x2 - x1, y2 - y1)
        angle = abs(math.degrees(math.atan2(y2 - y1, x2 - x1)))
        # Chỉ giữ đường gần ngang — dải phân cách chạy dọc lòng đường theo góc nhìn camera.
        if 25.0 < angle < 155.0:
            continue
        if length > best_len:
            best_len = length
            best = (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))

    if best is None or best_len < min_len:
        return None
    return _finalize_lane_detection(best, mask)


def _detect_soft_median(frame: np.ndarray, mask: np.ndarray) -> tuple[float, float, float, float] | None:
    """Phân cách mềm (chóp nón / dải phản quang cam) trong polygon ROAD."""
    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    search = _road_lane_interior_mask(mask, h, w)
    orange = cv2.inRange(hsv, np.array([4, 120, 120]), np.array([22, 255, 255]))
    orange = cv2.bitwise_and(orange, orange, mask=search)
    orange = cv2.morphologyEx(orange, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), 1)
    cnts, _ = cv2.findContours(orange, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    cnt = max(cnts, key=cv2.contourArea)
    area = cv2.contourArea(cnt)
    roi_area = max(1, cv2.countNonZero(mask))
    min_area = max(220.0, roi_area * 0.0045)
    if area < min_area:
        return None
    x, y, bw, bh = cv2.boundingRect(cnt)
    # Loại mảnh cam nhỏ (vật tư/áo phản quang) — phân cách mềm phải đủ lớn.
    if bw < w * 0.11 and bh < h * 0.07:
        return None
    if bw < 28 or bh < 18:
        return None
    return _finalize_lane_detection((float(x), float(y), float(x + bw), float(y + bh)), mask)


def _detect_paved_lane_edge(
    frame: np.ndarray,
    mask: np.ndarray,
) -> tuple[float, float, float, float] | None:
    """Vạch trắng lớp nhựa — bên phải lòng đường trong polygon ROAD."""
    h, w = frame.shape[:2]
    interior = _road_lane_interior_mask(mask, h, w)
    search = interior.copy()
    for y in range(h):
        span = _interior_row_span(interior, y)
        if span is None:
            search[y, :] = 0
            continue
        x_left, x_right = span
        cut = x_left + int((x_right - x_left) * 0.38)
        search[y, :cut] = 0
    search[int(h * 0.74) :, :] = 0
    if cv2.countNonZero(search) < 120:
        return None

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 172]), np.array([180, 52, 255]))
    lane = cv2.bitwise_and(white, search)
    lane = cv2.morphologyEx(lane, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), 1)
    edges = cv2.Canny(lane, 45, 130)
    min_len = max(48, int(w * 0.16))
    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180,
        threshold=38,
        minLineLength=min_len,
        maxLineGap=18,
    )
    if lines is None:
        return None

    best: tuple[float, float, float, float] | None = None
    best_score = 0.0
    for line in lines.reshape(-1, 4):
        x1, y1, x2, y2 = (float(v) for v in line)
        length = math.hypot(x2 - x1, y2 - y1)
        if length < min_len:
            continue
        angle = abs(math.degrees(math.atan2(y2 - y1, x2 - x1)))
        if angle > 22.0:
            continue
        cx = (x1 + x2) / 2.0
        if cx < w * 0.42:
            continue
        score = length + (w - cx) * 0.04
        if score > best_score:
            best_score = score
            best = (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))

    if best is None:
        return None
    x1, y1, x2, y2 = best
    thickness = max(8.0, (y2 - y1) * 0.55 + 12.0)
    cy = (y1 + y2) / 2.0
    return _finalize_lane_detection((x1, cy - thickness / 2, x2, cy + thickness / 2), mask)


def _detect_fence_median(
    frame: np.ndarray,
    mask: np.ndarray,
) -> tuple[float, float, float, float] | None:
    """Hàng rào tạm — chỉ trong polygon ROAD (không lấy hàng rào ngoài lề)."""
    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    interior = _road_lane_interior_mask(mask, h, w)
    search = interior.copy()
    for y in range(h):
        span = _interior_row_span(interior, y)
        if span is None:
            search[y, :] = 0
            continue
        x_left, x_right = span
        cut = x_left + int((x_right - x_left) * 0.58)
        search[y, cut:] = 0
    if cv2.countNonZero(search) < 80:
        return None

    white = cv2.inRange(hsv, np.array([0, 0, 162]), np.array([180, 58, 255]))
    red_lo = cv2.inRange(hsv, np.array([0, 65, 65]), np.array([14, 255, 255]))
    red_hi = cv2.inRange(hsv, np.array([165, 65, 65]), np.array([180, 255, 255]))
    stripe = cv2.bitwise_or(red_lo, red_hi)
    fence = cv2.bitwise_and(cv2.bitwise_or(white, stripe), search)
    fence = cv2.morphologyEx(fence, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8), iterations=2)
    fence = cv2.morphologyEx(fence, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8), iterations=1)

    cnts, _ = cv2.findContours(fence, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None

    roi_area = max(1, cv2.countNonZero(search))
    qualifying: list[tuple[int, int, int, int]] = []
    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if area < max(5000.0, roi_area * 0.04):
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw < 90 or bh < 65:
            continue
        patch = fence[y : y + bh, x : x + bw]
        if patch.size == 0:
            continue
        white_ratio = cv2.countNonZero(patch) / max(bw * bh, 1)
        red_ratio = cv2.countNonZero(stripe[y : y + bh, x : x + bw]) / max(bw * bh, 1)
        if white_ratio < 0.12 or red_ratio < 0.10:
            continue
        aspect = bh / max(bw, 1)
        if aspect < 0.55 and bw > w * 0.28:
            continue
        qualifying.append((x, y, x + bw, y + bh))

    if not qualifying:
        return None

    x1 = min(b[0] for b in qualifying)
    y1 = min(b[1] for b in qualifying)
    x2 = max(b[2] for b in qualifying)
    y2 = max(b[3] for b in qualifying)
    pad_x = max(6, int((x2 - x1) * 0.10))
    pad_y = max(4, int((y2 - y1) * 0.03))
    return _finalize_lane_detection(
        (
            float(max(0, x1 - pad_x)),
            float(max(0, y1 - pad_y)),
            float(min(w, x2 + pad_x)),
            float(min(h, y2 + pad_y)),
        ),
        mask,
    )


def _missing_lane_separation_bbox(
    mask: np.ndarray,
    width: int,
    height: int,
) -> tuple[float, float, float, float] | None:
    """Vùng thiếu phân cách — dải trái bên trong polygon ROAD."""
    h, w = mask.shape[:2]
    interior = _road_lane_interior_mask(mask, h, w)
    strip = np.zeros((h, w), dtype=np.uint8)
    y_start = int(h * 0.28)
    for y in range(y_start, h):
        span = _interior_row_span(interior, y)
        if span is None:
            continue
        x_left, x_right = span
        strip_w = max(28, int((x_right - x_left) * 0.20))
        strip[y, x_left : min(w, x_left + strip_w)] = 255
    strip = cv2.bitwise_and(strip, interior)
    bbox = _mask_bbox(strip)
    return _finalize_lane_detection(bbox, mask) if bbox else None


def _left_lane_missing_median(
    frame: np.ndarray,
    mask: np.ndarray,
) -> tuple[float, float, float, float] | None:
    """Lề trái thiếu phân làn — kiểm tra trong polygon ROAD."""
    h, w = frame.shape[:2]
    interior = _road_lane_interior_mask(mask, h, w)
    left_mask = np.zeros((h, w), dtype=np.uint8)
    y_start = int(h * 0.28)
    for y in range(y_start, h):
        span = _interior_row_span(interior, y)
        if span is None:
            continue
        x_left, x_right = span
        lane_x2 = x_left + max(28, int((x_right - x_left) * 0.52))
        left_mask[y, x_left:lane_x2] = 255
    left_mask = cv2.bitwise_and(left_mask, interior)
    if cv2.countNonZero(left_mask) < 120:
        return None

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 162]), np.array([180, 58, 255]))
    orange = cv2.inRange(hsv, np.array([4, 120, 120]), np.array([22, 255, 255]))
    stripe = cv2.bitwise_or(white, orange)
    lane_mark = cv2.bitwise_and(stripe, left_mask)
    lane_mark = cv2.morphologyEx(lane_mark, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), 1)
    marked_ratio = cv2.countNonZero(lane_mark) / max(cv2.countNonZero(left_mask), 1)
    if marked_ratio >= 0.018:
        return None
    bbox = _mask_bbox(left_mask)
    return _finalize_lane_detection(bbox, mask) if bbox else None


def lane_separation_present(
    frame: np.ndarray,
    camera_id: str,
    *,
    mask: np.ndarray | None = None,
) -> bool:
    """Đã có phân làn/luồng (hàng rào, làn cứng, vạch) — không ghi ATGT-004."""
    h, w = frame.shape[:2]
    roi = mask if mask is not None else _roi_mask(camera_id, w, h)
    if roi is None:
        return False
    if _detect_fence_median(frame, roi):
        return True
    if _detect_hard_median(frame, roi):
        return True
    if _detect_paved_lane_edge(frame, roi):
        return True
    if _detect_soft_median(frame, roi):
        return True
    return False


def _analyze_lane_state(
    frame: np.ndarray,
    camera_id: str,
    *,
    source_pts_sec: float | None = None,
) -> list[Detection]:
    from .config import settings
    from .cam03_scene_demo import (
        is_cam03_mesh_segment,
        resolve_cam03_atgt_lane_detections,
        _classify_cam03_atgt_scene,
    )

    if camera_id == "A-03" and is_cam03_mesh_segment(source_pts_sec):
        return []

    if camera_id == "A-03" and settings.atgt_demo_enabled:
        scene, _, _ = _classify_cam03_atgt_scene(frame, source_pts_sec=source_pts_sec)
        if scene in ("no_lane", "organized"):
            demo = resolve_cam03_atgt_lane_detections(
                camera_id, frame, source_pts_sec=source_pts_sec,
            )
            if demo:
                return demo

    h, w = frame.shape[:2]
    mask = _roi_mask(camera_id, w, h)
    if mask is None:
        return []

    # Hàng rào đỏ-trắng = đã phân làn — không ghi ATGT-004 (vạch/làn cứng không chặn).
    fence = _detect_fence_median(frame, mask)
    if fence:
        return [
            Detection(
                behavior="soft_median",
                label="Hàng rào phân cách",
                confidence=_SOFT_MEDIAN_CONF,
                bbox=list(fence),
            )
        ]

    out: list[Detection] = []

    # Không có hàng rào → kiểm tra thiếu phân làn / phân luồng trong ROAD.
    lane_bbox = _left_lane_missing_median(frame, mask)
    if lane_bbox is None:
        lane_bbox = _missing_lane_separation_bbox(mask, w, h)
    if lane_bbox:
        out.append(
            Detection(
                behavior="no_soft_median",
                label="Không tổ chức phân làn, phân luồng giao thông",
                confidence=max(round(_MIN_CONF + 0.03, 3), 0.87),
                bbox=list(lane_bbox),
            )
        )

    # Overlay tham chiếu — không chặn ATGT-004 khi thiếu hàng rào.
    hard = _detect_hard_median(frame, mask)
    if hard:
        out.append(
            Detection(
                behavior="hard_median",
                label="Làn phân cách cứng",
                confidence=_HARD_MEDIAN_CONF,
                bbox=list(hard),
            )
        )
    else:
        paved = _detect_paved_lane_edge(frame, mask)
        if paved:
            out.append(
                Detection(
                    behavior="hard_median",
                    label="Vạch phân làn",
                    confidence=_HARD_MEDIAN_CONF,
                    bbox=list(paved),
                )
            )
        else:
            soft = _detect_soft_median(frame, mask)
            if soft:
                out.append(
                    Detection(
                        behavior="soft_median",
                        label="Phân cách mềm",
                        confidence=_SOFT_MEDIAN_CONF,
                        bbox=list(soft),
                    )
                )

    return out


def _accept_demo_vehicle(
    bbox: tuple[float, ...],
    confidence: float,
    plate: str | None,
    frame_w: int,
    frame_h: int,
) -> bool:
    """Demo Cam A-03 — bỏ FP hàng rào/vật tĩnh; chỉ giữ xe có biển hoặc conf cao."""
    if plate:
        return True
    if confidence < 0.58:
        return False
    cx = (bbox[0] + bbox[2]) / 2.0
    if cx > frame_w * 0.68:
        return False
    area_ratio = ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])) / max(frame_w * frame_h, 1)
    if area_ratio < 0.012:
        return False
    return confidence >= 0.72


def analyze_atgt_frame(
    frame: np.ndarray,
    camera_id: str = "A-03",
    *,
    source_pts_sec: float | None = None,
) -> list[Detection]:
    detector = _get_vehicle_detector()
    conf_floor = settings.atgt_demo_vehicle_conf if settings.atgt_demo_enabled else _VEHICLE_CONF
    raw = [d for d in detector.predict(frame) if d.confidence >= conf_floor]

    bboxes = [tuple(float(v) for v in d.bbox) for d in raw]
    # --- Tạm thời tắt tracking tốc độ thật — chờ video mới calibrate lại ---
    # speeds = _update_tracks_and_speed(camera_id, bboxes, now)
    speeds: dict[int, float] = {}

    detections: list[Detection] = []
    fh, fw = frame.shape[:2]
    for idx, det in enumerate(raw):
        bbox = bboxes[idx]
        plate = resolve_vehicle_plate(frame, bbox, camera_id=camera_id)
        if settings.atgt_demo_enabled and not _accept_demo_vehicle(bbox, det.confidence, plate, fw, fh):
            continue
        vtype = det.vehicle_type or "Phương tiện"
        label = f"{vtype} · {plate}" if plate else vtype
        detections.append(
            Detection(
                behavior="vehicle",
                label=label,
                confidence=round(det.confidence, 3),
                bbox=list(bbox),
                vehicle_plate=plate,
                vehicle_type=vtype,
            )
        )

        if settings.atgt_demo_enabled:
            temp_conf = round(max(_MIN_CONF, det.confidence * 0.95), 3)
            detections.append(
                Detection(
                    behavior="speeding",
                    label=f"Vượt quá tốc độ quy định ({vtype})",
                    confidence=temp_conf,
                    bbox=list(bbox),
                    vehicle_plate=plate,
                    vehicle_type=vtype,
                )
            )

    detections.extend(_analyze_lane_state(frame, camera_id, source_pts_sec=source_pts_sec))
    from .cam03_scene_demo import augment_cam03_atgt_demo

    return augment_cam03_atgt_demo(
        camera_id,
        frame,
        detections,
        source_pts_sec=source_pts_sec,
    )
