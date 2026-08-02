from __future__ import annotations

import logging
import threading
import time

from .camera_stream import CameraStream
from .config import settings
from .detectors import FireDetector, SmokingDetector
from .detectors.flame_blob_detector import FlameBlobDetector
from .events import Debouncer, EventStore
from .schemas import Detection, ViolationEvent

logger = logging.getLogger("detection_engine")

# Bán kính (tính theo % kích thước bbox điếu thuốc) mở rộng quanh đầu điếu để
# đối chiếu khói lân cận — chỉ dùng để LOẠI TRỪ khói khỏi behavior "fire" khi
# nó đã được quy cho hành vi hút thuốc (tránh tính 2 sự kiện cho cùng 1 hành
# vi), KHÔNG dùng để bắt buộc phải có khói mới xác nhận "hút thuốc" (xem
# README mục "nhầm lẫn bật lửa/ống hút" — đã thử và bỏ vì model `smoke` không
# đủ nhạy bắt khói thuốc lá thật).
_SMOKE_PROXIMITY_MARGIN = 2.5


def _expand_bbox(bbox: list[float], margin_ratio: float) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = bbox
    w, h = x2 - x1, y2 - y1
    mx, my = max(w, 10) * margin_ratio, max(h, 10) * margin_ratio
    return (x1 - mx, y1 - my * 1.5, x2 + mx, y2 + my)


def _bboxes_overlap(a: tuple[float, float, float, float], b: list[float]) -> bool:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    return not (bx2 < ax1 or bx1 > ax2 or by2 < ay1 or by1 > ay2)


class DetectionEngine:
    def __init__(self, camera: CameraStream):
        self.camera = camera
        self.detectors = [
            SmokingDetector(
                settings.smoking_model_repo,
                settings.smoking_model_file,
                settings.smoking_conf_threshold,
            ),
            FireDetector(
                settings.fire_model_repo,
                settings.fire_model_file,
                settings.fire_conf_threshold,
            ),
            # Bổ sung cho FireDetector: bắt lửa nhỏ/cận cảnh (bật lửa, diêm) và
            # lửa xanh dương (bật lửa khò) mà model YOLO train trên D-Fire bỏ sót.
            FlameBlobDetector(settings.flame_heuristic_conf_threshold),
        ]
        # Nhiều detector có thể cùng chung 1 "behavior" (vd fire = YOLO +
        # heuristic) -> chỉ tạo 1 debouncer duy nhất cho mỗi behavior, không
        # phải mỗi detector, để không đếm trùng/gãy cửa sổ debounce.
        behaviors = {d.behavior for d in self.detectors}
        self.debouncers = {
            behavior: Debouncer(
                hits=settings.debounce_hits,
                window=settings.debounce_window,
                cooldown_seconds=settings.event_cooldown_seconds,
            )
            for behavior in behaviors
        }
        self.store = EventStore()

        self._latest_detections: list[Detection] = []
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None

    def load_models(self) -> None:
        for detector in self.detectors:
            detector.load()

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)

    def _run(self) -> None:
        interval = 1.0 / max(settings.detection_fps, 0.1)
        while self._running:
            cycle_start = time.time()
            frame = self.camera.get_frame()
            if frame is not None:
                all_detections: list[Detection] = []
                for detector in self.detectors:
                    if not detector.ready:
                        continue
                    all_detections.extend(detector.predict(frame))

                by_behavior: dict[str, list[Detection]] = {}
                for det in all_detections:
                    by_behavior.setdefault(det.behavior, []).append(det)

                # "hút thuốc" xác nhận trực tiếp theo model cigarette (như ban
                # đầu) — KHÔNG bắt buộc phải có khói mới tính, vì model `smoke`
                # không đủ nhạy bắt khói thuốc lá thật (đã kiểm chứng thực tế:
                # 0/38 lần đo trong 1 phiên hút thật). Yêu cầu smoke sẽ gây
                # false-negative, tệ hơn nhiều so với thỉnh thoảng báo nhầm ống
                # hút/bật lửa (đã có thể duyệt qua snapshot trước khi xử lý).
                raw_cigarette_dets = by_behavior.get("smoking", [])
                fire_dets = by_behavior.get("fire", [])

                # Khói THỰC SỰ xuất hiện gần đầu điếu thì KHÔNG được tính thêm là
                # "cháy nổ" độc lập nữa — về bản chất, khói đầu điếu thuốc là dấu
                # hiệu của hành vi hút thuốc, không phải sự cố cháy nổ. Nếu không
                # loại trừ, mỗi lần hút thuốc có khói sẽ tạo ĐỒNG THỜI 2 sự kiện
                # (hút thuốc + cháy nổ) cho cùng 1 hành vi, sai bản chất vi phạm.
                # Khói KHÔNG nằm gần vật giống điếu thuốc (đứng riêng, quy mô lớn
                # hơn...) vẫn được tính là dấu hiệu cháy nổ như bình thường.
                cigarette_zones = [_expand_bbox(d.bbox, _SMOKE_PROXIMITY_MARGIN) for d in raw_cigarette_dets]
                by_behavior["fire"] = [
                    d
                    for d in fire_dets
                    if not (
                        d.label.lower() == "smoke"
                        and any(_bboxes_overlap(zone, d.bbox) for zone in cigarette_zones)
                    )
                ]

                for behavior, debouncer in self.debouncers.items():
                    dets = by_behavior.get(behavior, [])
                    best = max((d.confidence for d in dets), default=0.0)
                    confirmed = debouncer.register(best > 0)
                    if confirmed:
                        top_detection = max(dets, key=lambda d: d.confidence)
                        self.store.add(top_detection, frame)

                with self._lock:
                    self._latest_detections = all_detections

            elapsed = time.time() - cycle_start
            time.sleep(max(interval - elapsed, 0))

    def get_latest_detections(self) -> list[Detection]:
        with self._lock:
            return list(self._latest_detections)

    def status(self) -> dict:
        return {
            "camera_connected": self.camera.connected,
            "detectors": {
                getattr(d, "name", d.behavior): {
                    "behavior": d.behavior,
                    "ready": d.ready,
                    "error": d.error,
                }
                for d in self.detectors
            },
        }
