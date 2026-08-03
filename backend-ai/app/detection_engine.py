from __future__ import annotations

import logging
import threading
import time

from .camera_stream import CameraStream
from .config import settings
from .detectors import FireDetector, SmokingDetector
from .detectors.flame_blob_detector import FlameBlobDetector
from .events import EventStore, PersistenceDebouncer
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


def _bbox_iou(a: list[float], b: list[float]) -> float:
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


# Tránh spam sự kiện cùng vùng / cùng camera (FP lặp mỗi cooldown).
_FIRE_SIMILAR_IOU = 0.35
_FIRE_SIMILAR_CENTER_PX = 48.0


# Mobile gửi frame qua ngrok — bỏ YOLO fire (chậm + hay FP đèn trần), giữ
# heuristic lửa + smoking YOLO (đã có lọc vùng miệng).
_MOBILE_DETECTOR_NAMES = frozenset({"smoking-yolo", "fire-heuristic"})

_BEHAVIOR_DEBOUNCE: dict[str, dict] = {
    "smoking": {
        "min_duration": lambda: settings.smoking_event_min_duration_seconds,
        "max_gap": lambda: settings.smoking_event_max_gap_seconds,
        "cooldown": lambda: settings.event_cooldown_seconds,
        "one_event_per_episode": True,
    },
    "fire": {
        "min_duration": lambda: settings.fire_event_min_duration_seconds,
        "max_gap": lambda: settings.fire_event_max_gap_seconds,
        "cooldown": lambda: settings.fire_event_cooldown_seconds,
        "one_event_per_episode": True,
    },
}


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
        self.debouncers = self._make_debouncers()
        self._remote_debouncers: dict[str, dict[str, PersistenceDebouncer]] = {}
        self.store = EventStore()
        # Frame + detection tốt nhất trong phiên debounce (snapshot đúng lúc lửa rõ nhất).
        self._episode_best: dict[str, dict] = {}
        # Thời điểm log gần nhất theo camera + behavior (chống lặp 3 phút).
        self._last_event_at: dict[str, float] = {}
        # Fire: bbox lần log gần nhất — so khớp vùng tương tự (IoU / khoảng cách tâm).
        self._last_fire_by_camera: dict[str, tuple[list[float], float]] = {}

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

    def _make_debouncers(
        self,
        *,
        min_duration_seconds: float | None = None,
        cooldown_seconds: float | None = None,
    ) -> dict[str, PersistenceDebouncer]:
        behaviors = {d.behavior for d in self.detectors}
        duration = (
            min_duration_seconds
            if min_duration_seconds is not None
            else settings.event_min_duration_seconds
        )
        cooldown = (
            cooldown_seconds
            if cooldown_seconds is not None
            else settings.event_cooldown_seconds
        )
        debouncers: dict[str, PersistenceDebouncer] = {}
        for behavior in behaviors:
            cfg = _BEHAVIOR_DEBOUNCE.get(behavior, {})
            debouncers[behavior] = PersistenceDebouncer(
                min_duration_seconds=(
                    cfg["min_duration"]()
                    if "min_duration" in cfg
                    else duration
                ),
                cooldown_seconds=(
                    cfg["cooldown"]()
                    if "cooldown" in cfg
                    else cooldown
                ),
                max_gap_seconds=(
                    cfg["max_gap"]()
                    if "max_gap" in cfg
                    else 2.5
                ),
                one_event_per_episode=cfg.get("one_event_per_episode", False),
            )
        return debouncers

    def _analyze_frame(
        self,
        frame,
        debouncers: dict[str, PersistenceDebouncer],
        *,
        persist_events: bool = True,
        detector_names: frozenset[str] | None = None,
        camera_id: str | None = None,
    ) -> tuple[list[Detection], list[ViolationEvent]]:
        """Chạy detector trên 1 frame, trả về detections + events mới."""
        all_detections: list[Detection] = []
        for detector in self.detectors:
            if not detector.ready:
                continue
            name = getattr(detector, "name", detector.behavior)
            if detector_names is not None and name not in detector_names:
                continue
            all_detections.extend(detector.predict(frame))

        by_behavior: dict[str, list[Detection]] = {}
        for det in all_detections:
            by_behavior.setdefault(det.behavior, []).append(det)

        raw_cigarette_dets = by_behavior.get("smoking", [])
        fire_dets = by_behavior.get("fire", [])

        cigarette_zones = [_expand_bbox(d.bbox, _SMOKE_PROXIMITY_MARGIN) for d in raw_cigarette_dets]
        # Chỉ loại khói gần điếu — KHÔNG loại flame-blue/flame-orange (bật lửa
        # khi hút thuốc phải log cả smoking lẫn fire).
        by_behavior["fire"] = [
            d
            for d in fire_dets
            if not (
                d.label.lower() == "smoke"
                and any(_bboxes_overlap(zone, d.bbox) for zone in cigarette_zones)
            )
        ]

        filtered: list[Detection] = []
        for dets in by_behavior.values():
            filtered.extend(dets)

        new_events: list[ViolationEvent] = []
        cam_key = camera_id or "LOCAL-CAM"
        for behavior, debouncer in debouncers.items():
            dets = by_behavior.get(behavior, [])
            best = max((d.confidence for d in dets), default=0.0)
            episode_key = f"{cam_key}:{behavior}"
            was_active = debouncer.snapshot()["active"]
            confirmed = debouncer.register(best > 0)

            if best > 0:
                top_det = max(dets, key=lambda d: d.confidence)
                pending = self._episode_best.get(episode_key)
                if pending is None or top_det.confidence > pending["confidence"]:
                    self._episode_best[episode_key] = {
                        "confidence": top_det.confidence,
                        "detection": top_det,
                        "frame": frame.copy(),
                    }

            if confirmed:
                pending = self._episode_best.pop(episode_key, None)
                if pending:
                    top_detection = pending["detection"]
                    snap_frame = pending["frame"]
                elif dets:
                    top_detection = max(dets, key=lambda d: d.confidence)
                    snap_frame = frame
                else:
                    continue

                if self._should_skip_repeat_event(cam_key, behavior, top_detection):
                    logger.info(
                        "Bỏ qua %s trùng/lặp [%s] conf=%.2f label=%s",
                        behavior,
                        cam_key,
                        top_detection.confidence,
                        top_detection.label,
                    )
                    continue

                if persist_events:
                    event = self.store.add(
                        top_detection, snap_frame, camera_id=cam_key,
                    )
                    new_events.append(event)
                    self._mark_event_logged(cam_key, behavior, top_detection)
            elif was_active and not debouncer.snapshot()["active"]:
                self._episode_best.pop(episode_key, None)

        return filtered, new_events

    @staticmethod
    def _bbox_similar(a: list[float], b: list[float]) -> bool:
        if _bbox_iou(a, b) >= _FIRE_SIMILAR_IOU:
            return True
        acx = (a[0] + a[2]) / 2
        acy = (a[1] + a[3]) / 2
        bcx = (b[0] + b[2]) / 2
        bcy = (b[1] + b[3]) / 2
        dist = ((acx - bcx) ** 2 + (acy - bcy) ** 2) ** 0.5
        ref = max(a[2] - a[0], a[3] - a[1], b[2] - b[0], b[3] - b[1], 20.0)
        return dist <= max(_FIRE_SIMILAR_CENTER_PX, ref * 1.2)

    def _should_skip_repeat_event(
        self,
        camera_id: str,
        behavior: str,
        detection: Detection,
    ) -> bool:
        now = time.time()
        min_gap = settings.event_repeat_min_seconds
        key = f"{camera_id}:{behavior}"
        last_at = self._last_event_at.get(key)
        if last_at is not None and now - last_at < min_gap:
            return True
        if behavior == "fire":
            last_fire = self._last_fire_by_camera.get(camera_id)
            if last_fire is not None:
                last_bbox, fire_at = last_fire
                if now - fire_at < min_gap and self._bbox_similar(last_bbox, detection.bbox):
                    return True
        return False

    def _mark_event_logged(
        self,
        camera_id: str,
        behavior: str,
        detection: Detection,
    ) -> None:
        self._last_event_at[f"{camera_id}:{behavior}"] = time.time()
        if behavior == "fire":
            self._last_fire_by_camera[camera_id] = (list(detection.bbox), time.time())

    def process_remote_frame(
        self, frame, camera_id: str
    ) -> tuple[list[Detection], list[ViolationEvent]]:
        """Frame gửi từ mobile qua WebSocket — debounce riêng theo camera_id."""
        if not hasattr(self, "_remote_debouncers"):
            self._remote_debouncers = {}
        if camera_id not in self._remote_debouncers:
            self._remote_debouncers[camera_id] = self._make_debouncers()
        return self._analyze_frame(
            frame,
            self._remote_debouncers[camera_id],
            detector_names=_MOBILE_DETECTOR_NAMES,
            camera_id=camera_id,
        )

    def _run(self) -> None:
        interval = 1.0 / max(settings.detection_fps, 0.1)
        while self._running:
            cycle_start = time.time()
            frame = self.camera.get_frame()
            if frame is not None:
                all_detections, _ = self._analyze_frame(frame, self.debouncers)
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
            "debounce": self.debouncer_config(),
        }

    def debouncer_config(self) -> dict:
        from .config import settings

        return {
            "smoking": {
                "min_duration_seconds": settings.smoking_event_min_duration_seconds,
                "max_gap_seconds": settings.smoking_event_max_gap_seconds,
                "one_event_per_episode": True,
                "repeat_min_seconds": settings.event_repeat_min_seconds,
            },
            "fire": {
                "min_duration_seconds": settings.fire_event_min_duration_seconds,
                "max_gap_seconds": settings.fire_event_max_gap_seconds,
                "cooldown_seconds": settings.fire_event_cooldown_seconds,
                "one_event_per_episode": True,
                "repeat_min_seconds": settings.event_repeat_min_seconds,
            },
        }

    def debouncer_snapshots(self) -> dict:
        local = {b: d.snapshot() for b, d in self.debouncers.items()}
        remote: dict[str, dict] = {}
        for camera_id, debouncers in self._remote_debouncers.items():
            remote[camera_id] = {b: d.snapshot() for b, d in debouncers.items()}
        return {"local": local, "remote": remote}
