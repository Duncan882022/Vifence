"""Phát hiện máy móc công trường bằng object-detection tổng quát, zero-shot
(open-vocabulary) — thay cho rule màu sắc + vị trí cố định trước đây.

Vì sao đổi cách này:
- Rule cũ giả định máy xúc luôn ở bên phải, máy khoan luôn bên trái, cẩu tháp
  luôn ở giữa — nếu máy thật ở vị trí khác hoặc màu khác, hệ thống vẽ sai
  bbox (vẽ theo vùng giả định) hoặc bỏ sót hoàn toàn.
- Model ở đây (OWLv2) nhận diện qua mô tả văn bản, quét toàn khung hình,
  không giả định vị trí. Muốn thêm loại máy mới chỉ cần thêm 1 dòng mô tả
  trong `MACHINERY_QUERIES` — không cần chụp ảnh mẫu, không cần train lại.

Đánh đổi: model tổng quát chạy chậm hơn nhiều so với rule màu (vài giây/khung
trên CPU) — backend chỉ có 1 luồng xử lý phân tích chung cho mọi camera/loại
vi phạm, nên KHÔNG được chạy model này trực tiếp trong luồng request (sẽ làm
nghẽn PPE/WAH/ATGT/road của các camera khác). Thay vào đó module này chạy
model trên một luồng nền riêng, chu kỳ `_REFRESH_SECONDS`; luồng request chỉ
gửi frame mới nhất vào rồi đọc kết quả cache gần nhất — không bao giờ chờ
model. Máy công trình gần như không xê dịch trong vài giây nên độ trễ này
chấp nhận được cho bài toán khoảng cách an toàn.
"""

from __future__ import annotations

import logging
import threading
import time

import cv2
import numpy as np

logger = logging.getLogger("machinery_detector")

_MODEL_ID = "google/owlv2-base-patch16-ensemble"
_REFRESH_SECONDS = 2.5
_SCORE_THRESHOLD = 0.34
_MAX_CACHE_AGE_SECONDS = 8.0
_MAX_FRAME_DRIFT = 24.0
_FRAME_SMALL = (48, 48)
_NMS_IOU = 0.5
_PERSON_SUPPRESS_KIND = "_person_suppress"

# (kind, mô tả text cho model, nhãn hiển thị tiếng Việt).
# Thêm loại máy mới ở công trường khác: chỉ cần thêm 1 dòng ở đây.
MACHINERY_QUERIES: list[tuple[str, str, str]] = [
    ("tower_crane", "a tower crane", "Máy cẩu tháp"),
    ("crane_green", "an excavator", "Máy xúc"),
    ("sany_drill", "a drilling rig", "Máy khoan"),
    ("road_roller", "a road roller", "Xe lăn đường"),
    ("dump_truck", "a dump truck", "Xe tải ben"),
    ("forklift", "a forklift", "Xe nâng"),
]

_MIN_MACHINERY_AREA_RATIO = 0.012

# Query phụ — chỉ dùng để "giành" vùng ảnh khỏi các nhãn máy khi vùng đó
# thực ra là người, không tính vào kết quả trả về.
_SUPPRESSOR_QUERIES: list[tuple[str, str]] = [
    (_PERSON_SUPPRESS_KIND, "a person"),
]

_ALL_QUERIES: list[tuple[str, str]] = [(k, q) for k, q, _ in MACHINERY_QUERIES] + _SUPPRESSOR_QUERIES
_QUERY_TEXTS: list[str] = [q for _, q in _ALL_QUERIES]
_KIND_BY_INDEX: dict[int, str] = {i: k for i, (k, _) in enumerate(_ALL_QUERIES)}

MACHINERY_LABELS: dict[str, str] = {k: label for k, _, label in MACHINERY_QUERIES}

_processor = None
_model = None
_load_failed = False
_load_lock = threading.Lock()

_state_lock = threading.Lock()
_latest_frame: dict[str, np.ndarray] = {}
_latest_result: dict[str, list[tuple[str, tuple[int, int, int, int], float]]] = {}
_analyzed_frame_small: dict[str, np.ndarray] = {}
_latest_result_at: dict[str, float] = {}
_worker_started = False


def _frame_small(frame: np.ndarray) -> np.ndarray:
    return cv2.resize(frame, _FRAME_SMALL, interpolation=cv2.INTER_AREA)


def _frame_drift(a: np.ndarray, b: np.ndarray) -> float:
    if a.shape != b.shape:
        b = cv2.resize(b, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_AREA)
    return float(np.mean(cv2.absdiff(a, b)))


def _load_model() -> bool:
    global _processor, _model, _load_failed
    if _model is not None:
        return True
    if _load_failed:
        return False
    with _load_lock:
        if _model is not None:
            return True
        if _load_failed:
            return False
        try:
            from transformers import Owlv2ForObjectDetection, Owlv2Processor

            processor = Owlv2Processor.from_pretrained(_MODEL_ID)
            model = Owlv2ForObjectDetection.from_pretrained(_MODEL_ID)
            model.eval()
            _processor, _model = processor, model
            logger.info("machinery_detector: đã tải model %s", _MODEL_ID)
            return True
        except Exception:  # noqa: BLE001
            logger.exception(
                "machinery_detector: tải model lỗi — tạm không phát hiện máy móc"
            )
            _load_failed = True
            return False


def _iou(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    aa = max((ax2 - ax1) * (ay2 - ay1), 1.0)
    bb = max((bx2 - bx1) * (by2 - by1), 1.0)
    return inter / (aa + bb - inter)


def _cross_label_nms(
    boxes: list[tuple[str, tuple[float, float, float, float], float]],
) -> list[tuple[str, tuple[float, float, float, float], float]]:
    """Cùng 1 vùng ảnh có thể khớp nhiều mô tả (VD "máy xúc" và "máy thi
    công" cho cùng 1 vật) — chỉ giữ nhãn có độ tin cậy cao nhất mỗi vùng.
    Nhãn suppressor ("person") vẫn tham gia giành vùng ở bước này."""
    ordered = sorted(boxes, key=lambda item: item[2], reverse=True)
    kept: list[tuple[str, tuple[float, float, float, float], float]] = []
    for kind, box, score in ordered:
        if any(_iou(box, k[1]) > _NMS_IOU for k in kept):
            continue
        kept.append((kind, box, score))
    return kept


def _run_detect(
    frame: np.ndarray,
) -> list[tuple[str, tuple[int, int, int, int], float]] | None:
    """Trả None nếu model chưa sẵn sàng/lỗi tải. Trả [] nếu chạy được nhưng
    không thấy máy nào — caller coi là "hiện không có máy", không suy đoán."""
    if not _load_model():
        return None
    import torch

    h, w = frame.shape[:2]
    # cv2.cvtColor (không dùng slicing đảo channel [::-1]) — mảng kết quả cần
    # liên tục trong bộ nhớ, một số phiên bản transformers gọi torch.from_numpy
    # trực tiếp và lỗi với stride âm.
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    inputs = _processor(text=[_QUERY_TEXTS], images=frame_rgb, return_tensors="pt")
    with torch.no_grad():
        outputs = _model(**inputs)
    target_sizes = torch.tensor([[h, w]])
    results = _processor.post_process_grounded_object_detection(
        outputs, threshold=_SCORE_THRESHOLD, target_sizes=target_sizes,
    )[0]

    raw: list[tuple[str, tuple[float, float, float, float], float]] = []
    for score, label_idx, box in zip(results["scores"], results["labels"], results["boxes"]):
        kind = _KIND_BY_INDEX.get(int(label_idx))
        if kind is None:
            continue
        x1, y1, x2, y2 = (float(v) for v in box.tolist())
        raw.append((kind, (x1, y1, x2, y2), float(score)))

    deduped = _cross_label_nms(raw)
    out: list[tuple[str, tuple[int, int, int, int], float]] = []
    for kind, (x1, y1, x2, y2), score in deduped:
        if kind == _PERSON_SUPPRESS_KIND:
            continue
        bbox = (
            int(max(0, x1)), int(max(0, y1)),
            int(min(w, x2)), int(min(h, y2)),
        )
        area_ratio = ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])) / max(w * h, 1)
        if area_ratio < _MIN_MACHINERY_AREA_RATIO:
            continue
        out.append((kind, bbox, round(score, 3)))
    return out[:3]


def _worker_loop() -> None:
    last_run: dict[str, float] = {}
    while True:
        time.sleep(1.0)
        with _state_lock:
            items = list(_latest_frame.items())
        now = time.time()
        for camera_id, frame in items:
            if now - last_run.get(camera_id, 0.0) < _REFRESH_SECONDS:
                continue
            last_run[camera_id] = now
            try:
                result = _run_detect(frame)
            except Exception:  # noqa: BLE001
                logger.exception(
                    "machinery_detector: lỗi phân tích camera %s", camera_id
                )
                continue
            if result is None:
                continue
            with _state_lock:
                _latest_result[camera_id] = result
                _analyzed_frame_small[camera_id] = _frame_small(frame)
                _latest_result_at[camera_id] = time.time()


def _ensure_worker() -> None:
    global _worker_started
    with _state_lock:
        if _worker_started:
            return
        _worker_started = True
    thread = threading.Thread(target=_worker_loop, name="machinery-detector", daemon=True)
    thread.start()


def preload() -> None:
    """Tải OWLv2 sớm — tránh cold-start 60–120s ở request crane đầu tiên."""
    _ensure_worker()
    _load_model()


def submit_frame(camera_id: str, frame: np.ndarray) -> None:
    """Gọi từ luồng request (không chặn) — chỉ ghi tham chiếu frame mới nhất
    để luồng nền tự lấy khi tới chu kỳ; KHÔNG chạy model ở đây."""
    with _state_lock:
        _latest_frame[camera_id] = frame
    _ensure_worker()


def get_cached(
    camera_id: str,
    frame: np.ndarray | None = None,
) -> list[tuple[str, tuple[int, int, int, int], float]]:
    """Kết quả máy móc gần nhất — chỉ trả về khi khung hiện tại còn khớp
    khung đã phân tích (tránh bbox trôi khi video chạy liên tục)."""
    with _state_lock:
        result = _latest_result.get(camera_id)
        if not result:
            return []
        age = time.time() - _latest_result_at.get(camera_id, 0.0)
        if age > _MAX_CACHE_AGE_SECONDS:
            return []
        if frame is None:
            return list(result)
        analyzed = _analyzed_frame_small.get(camera_id)
        if analyzed is None:
            return []
        drift = _frame_drift(_frame_small(frame), analyzed)
        if drift > _MAX_FRAME_DRIFT:
            return []
        return list(result)


def detect_for_frame(
    camera_id: str,
    frame: np.ndarray,
) -> list[tuple[str, tuple[int, int, int, int], float]]:
    """Đọc cache OWLv2 — worker nền cập nhật, không chặn request."""
    submit_frame(camera_id, frame)

    cached = get_cached(camera_id, frame)
    if cached:
        return cached

    with _state_lock:
        result = _latest_result.get(camera_id)
        if not result:
            return []
        age = time.time() - _latest_result_at.get(camera_id, 0.0)
        if age > _MAX_CACHE_AGE_SECONDS:
            return []
        return list(result)
