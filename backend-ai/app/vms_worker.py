"""VMS camera worker — ingest MP4 loop + HLS output + server-side AI + clip on confirm.

Một worker per camera. Thay thế cơ chế "FE chụp frame → POST analyze" bằng
pipeline hoàn toàn trên backend theo kiến trúc VMS (Vifence_VMS-Spec-v1.md §3).

Pipeline mỗi camera:
  Ingest thread  → đọc file MP4 lặp vô hạn (reset EOF), giữ latest frame + pts history
  HLS process    → ffmpeg subprocess: file loop → HLS segments (/data/hls/{camera_id}/)
  AI thread      → lấy frame @ AI_FPS, chạy engines đã đăng ký, debounce + confirm
  Clip on event  → ffmpeg trim từ file nguồn quanh confirmed_at, burn-in bbox
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import threading
import time
from collections import deque
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

from . import overlay_bus
from .auto_train.frame_collectors import collect_vms_engine_sample
from .snapshot_sync import frame_scale, scale_overlay_detection_dicts

logger = logging.getLogger("vms_worker")

def _is_live_stream_source(source_path: str) -> bool:
    p = source_path.lower()
    return p.startswith("rtsp://") or p.startswith("rtmp://") or p.startswith("http://") or p.startswith("https://")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HLS_DIR = DATA_DIR / "hls"
CLIPS_DIR = DATA_DIR / "clips"

# FPS AI mặc định cho VMS — 10 FPS khi chạy 1 luồng; user không bật 3 cam cùng lúc.
VMS_AI_FPS = 10.0
# Pre/post window cho clip (giây)
CLIP_PRE_SEC = 1.0
CLIP_POST_SEC = 4.0
# Ring buffer pts history (giây) — tìm source_pts khi clip
PTS_HISTORY_SEC = 60.0
# Lịch sử overlay (giây) — FE hỏi bbox của đúng khung hình nó đang chiếu.
#
# HLS đưa hình tới người xem chậm vài giây so với lúc AI chạy. Giữ lại một quãng
# overlay đủ dài để trả về bbox của khung hình đó thay vì bbox mới nhất (vốn
# chạy trước video). 12s phủ được cả buffer 5s lẫn mạng xấu mà vẫn nhẹ RAM.
OVERLAY_HISTORY_SEC = 12.0
# Live RTSP: không chạy AI trên frame đóng băng khi mất tín hiệu.
LIVE_FRAME_STALE_SEC = 4.0
# RTSP không timeout thì cap.read() treo vĩnh viễn khi mũ tắt sóng giữa chừng:
# luồng ingest đứng im, AI ngừng chạy và không bao giờ tự nối lại.
# probesize/analyzeduration mặc định của FFmpeg là vài giây — với mũ thì đó là
# vài giây màn hình trống trước khi AI có khung hình đầu tiên.
RTSP_CAPTURE_OPTIONS = (
    "rtsp_transport;tcp|timeout;5000000"
    "|probesize;100000|analyzeduration;200000|fflags;nobuffer|flags;low_delay"
)
RTSP_TIMEOUT_MS = 5000.0
# MediaMTX chạy cùng máy: thử lại dày để mũ vừa lên sóng là bắt được ngay.
# Nguồn ở xa (bodycam qua internet) giữ nhịp thưa, tránh nện liên tục.
LOCAL_SOURCE_RETRY_SEC = 0.4
REMOTE_SOURCE_RETRY_SEC = 3.0
# Mũ tắt cả buổi thì nhịp 0.4s thành hàng nghìn lần bắt tay RTSP mỗi phút, đủ
# chiếm một lõi CPU và ngập log MediaMTX. Giãn dần tới trần này rồi giữ nguyên.
SOURCE_RETRY_MAX_SEC = 5.0
# Số lần thử giữ nhịp dày trước khi giãn — đủ để mũ vừa bật là bắt được ngay.
SOURCE_RETRY_FAST_ATTEMPTS = 12
# Số lần đọc rỗng liên tiếp trước khi mở lại nguồn live (mỗi lần cách 50ms).
PREGATE_IDLE_READS = 40


def _is_local_source(source_path: str) -> bool:
    p = source_path.lower()
    return "://127.0.0.1" in p or "://localhost" in p or "://[::1]" in p


def _source_retry_delay(source_path: str, attempt: int = 0) -> float:
    """Nhịp thử lại — dày lúc đầu rồi giãn gấp đôi dần tới trần.

    `attempt` là số lần mở hỏng liên tiếp; về 0 ngay khi nguồn lên lại.
    """
    base = LOCAL_SOURCE_RETRY_SEC if _is_local_source(source_path) else REMOTE_SOURCE_RETRY_SEC
    if attempt <= SOURCE_RETRY_FAST_ATTEMPTS:
        return base
    backoff = base * (2 ** min(attempt - SOURCE_RETRY_FAST_ATTEMPTS, 6))
    return min(SOURCE_RETRY_MAX_SEC, backoff)


def _open_capture(source: str) -> cv2.VideoCapture:
    """Mở nguồn cho OpenCV; nguồn live thêm timeout đọc/mở."""
    if not _is_live_stream_source(source):
        return cv2.VideoCapture(source)

    previous = os.environ.get("OPENCV_FFMPEG_CAPTURE_OPTIONS")
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = RTSP_CAPTURE_OPTIONS
    try:
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
    finally:
        if previous is None:
            os.environ.pop("OPENCV_FFMPEG_CAPTURE_OPTIONS", None)
        else:
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = previous

    # Bản OpenCV/FFmpeg cũ có thể không nhận option — mở lại kiểu mặc định còn
    # hơn để camera câm hẳn.
    if not cap.isOpened():
        cap.release()
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)

    for prop in (cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, cv2.CAP_PROP_READ_TIMEOUT_MSEC):
        try:
            cap.set(prop, RTSP_TIMEOUT_MS)
        except (AttributeError, cv2.error):
            pass
    try:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except (AttributeError, cv2.error):
        pass
    return cap


def _read_latest_live_frame(
    cap: cv2.VideoCapture,
    *,
    max_grab: int = 8,
) -> tuple[bool, np.ndarray | None]:
    """Đọc và vứt buffer cũ — chỉ giữ khung mới nhất (giảm trễ RTSP 2–3s)."""
    ok = False
    frame: np.ndarray | None = None
    for _ in range(max(1, max_grab)):
        ok, grabbed = cap.read()
        if not ok or grabbed is None:
            break
        frame = grabbed
    return ok, frame


class CameraVmsWorker:
    """Worker VMS cho một camera.

    Params:
        camera_id: ID camera (vd "A-03", "A-04")
        source_path: đường dẫn file MP4 hoặc RTSP URL
        process_frame_fn: dict[str, Callable[[frame, camera_id], tuple[list, list]]]
            map tên engine → hàm process_frame trả (detections, events)
        on_event: callback khi có ViolationEvent confirmed
        ai_fps: tần suất AI (khung/giây)
        hls_relay: có encode HLS phục vụ CMS không. False khi CMS xem thẳng
            MediaMTX (WHEP/LL-HLS) — worker chỉ decode cho AI.
        ai_max_width: cạnh dài tối đa của frame đưa vào AI (0 = giữ nguyên).
    """

    def __init__(
        self,
        camera_id: str,
        source_path: str,
        process_frame_fns: dict[str, Callable],
        on_event: Optional[Callable] = None,
        ai_fps: float = VMS_AI_FPS,
        fallback_source: Optional[str] = None,
        hls_relay: bool = True,
        ai_max_width: int = 0,
    ):
        self.camera_id = camera_id
        self.source_path = source_path
        self._fallback_source = (fallback_source or "").strip() or None
        self._active_source = source_path
        self._using_fallback = False
        self._process_fns = process_frame_fns
        self._on_event = on_event
        self._ai_fps = ai_fps
        self._hls_relay = hls_relay
        self._ai_max_width = max(0, int(ai_max_width))

        self._frame: Optional[np.ndarray] = None
        self._source_pts_sec: float = 0.0
        self._frame_received_at: float = 0.0
        self._frame_lock = threading.Lock()
        self._running = False
        self._source_duration: float = 0.0

        # Ring buffer: deque[(wall_monotonic, source_pts_sec)]
        maxpts = int(PTS_HISTORY_SEC * 30)
        self._pts_history: deque[tuple[float, float]] = deque(maxlen=maxpts)
        self._pts_lock = threading.Lock()

        self._ingest_gate = threading.Event()
        self._seek_lock = threading.Lock()
        self._seek_to_zero = False

        self._ingest_thread: Optional[threading.Thread] = None
        self._ai_thread: Optional[threading.Thread] = None
        self._hls_watchdog_thread: Optional[threading.Thread] = None
        self._hls_proc: Optional[subprocess.Popen] = None
        self._hls_lock = threading.Lock()
        self._hls_started_at: float = 0.0
        self._hls_started_wall: float = 0.0
        self._hls_restart_cooldown_until: float = 0.0
        self._pipe_hls_retry_after: float = 0.0
        self._hls_pipe_stdin = None
        self._hls_pipe_size: Optional[tuple[int, int]] = None
        self._patrol_offline_finalized = False
        self._refresh_source_mode()

        self._overlay_lock = threading.Lock()
        self._latest_overlay: dict = {
            "width": 0,
            "height": 0,
            "detections": [],
            "roi_zones": [],
            "metrics": {},
            "updated_at": 0.0,
        }
        self._overlay_history: deque[dict] = deque(
            maxlen=max(32, int(OVERLAY_HISTORY_SEC * max(1.0, ai_fps))),
        )

        self._hls_dir = HLS_DIR / camera_id
        self._clips_dir = CLIPS_DIR / camera_id
        self._hls_dir.mkdir(parents=True, exist_ok=True)
        self._clips_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def _refresh_source_mode(self) -> None:
        live = _is_live_stream_source(self._active_source)
        if not self._hls_relay:
            # CMS xem thẳng MediaMTX: encode lại ở đây vừa tốn CPU vừa không ai
            # xem. Giữ ingest để AI vẫn có frame.
            self._live_hls_only = False
            self._live_hls_from_pipe = False
            return
        self._live_hls_only = live and not self._process_fns
        self._live_hls_from_pipe = live and bool(self._process_fns)

    def _switch_to_fallback_source(self) -> bool:
        if self._using_fallback or not self._fallback_source:
            return False
        fb = self._fallback_source
        if not Path(fb).is_file():
            logger.warning(
                "[VMS %s] Fallback MP4 không tồn tại: %s",
                self.camera_id,
                fb,
            )
            return False
        logger.warning(
            "[VMS %s] RTSP/live lỗi — chuyển fallback MP4: %s (primary: %s)",
            self.camera_id,
            fb,
            self.source_path,
        )
        self._using_fallback = True
        self._active_source = fb
        self._refresh_source_mode()
        self._clear_frame_buffer()
        with self._hls_lock:
            self._stop_hls_unlocked()
            if self._hls_relay and not self._live_hls_from_pipe:
                self._start_hls(fresh_output=True)
        self._probe_source_duration()
        return True

    def seek_to_start(self) -> None:
        """Rewind MP4 về frame 0 — dùng khi arm grace / DELETE /events."""
        with self._seek_lock:
            self._seek_to_zero = True

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._ingest_gate.clear()
        logger.info("[VMS %s] Worker khởi động. Source: %s", self.camera_id, self.source_path)

        self._probe_source_duration()

        if not self._live_hls_only:
            if self._live_hls_from_pipe:
                logger.info(
                    "[VMS %s] Live ingest + AI — HLS qua pipe (1 kết nối RTSP).",
                    self.camera_id,
                )
            self._ingest_thread = threading.Thread(
                target=self._ingest_loop,
                name=f"vms-ingest-{self.camera_id}",
                daemon=True,
            )
            self._ingest_thread.start()

            self._ai_thread = threading.Thread(
                target=self._ai_loop,
                name=f"vms-ai-{self.camera_id}",
                daemon=True,
            )
            self._ai_thread.start()
        else:
            logger.info(
                "[VMS %s] Live HLS-only — bỏ OpenCV ingest (tránh 2 kết nối RTSP).",
                self.camera_id,
            )

        if self._hls_relay and not self._live_hls_from_pipe:
            self._start_hls(fresh_output=True)

        if self._hls_relay and _is_live_stream_source(self.source_path):
            self._hls_watchdog_thread = threading.Thread(
                target=self._hls_watchdog_loop,
                name=f"vms-hls-watch-{self.camera_id}",
                daemon=True,
            )
            self._hls_watchdog_thread.start()

    def stop(self) -> None:
        self._running = False
        self._stop_hls()
        if self._ingest_thread:
            self._ingest_thread.join(timeout=3)
        if self._ai_thread:
            self._ai_thread.join(timeout=3)
        logger.info("[VMS %s] Worker dừng.", self.camera_id)

    def get_frame(self) -> Optional[np.ndarray]:
        with self._frame_lock:
            return None if self._frame is None else self._frame.copy()

    def hls_index_path(self) -> Path:
        return self._hls_dir / "index.m3u8"

    def hls_relay_enabled(self) -> bool:
        """False khi CMS xem thẳng MediaMTX — `/stream/<cam>/index.m3u8` không phục vụ."""
        return self._hls_relay

    def hls_ready(self) -> bool:
        if not self._hls_relay:
            return False
        if not self.hls_index_path().is_file():
            return False
        if not _is_live_stream_source(self._active_source):
            return True
        # Live: phát miễn ffmpeg còn chạy — tránh 503 giữa chừng gây reload FE.
        return self._hls_proc is not None and self._hls_proc.poll() is None

    def get_latest_overlay(self) -> dict:
        """Snapshot detections/zones mới nhất — FE poll để vẽ ROI (Option 2)."""
        return self.get_overlay_at(None)

    def get_overlay_at(self, at_ms: Optional[float]) -> dict:
        """Overlay khớp khung hình FE đang chiếu tại ``at_ms`` (wallclock ms).

        FE phát HLS chậm hơn AI vài giây. Trả bbox mới nhất thì hộp chạy trước
        người trong hình; đây là chỗ backend tự chọn lại đúng khung hình FE đang
        xem rồi gửi về, thay vì bắt FE tự đoán độ trễ.

        ``at_ms=None`` (hoặc ngoài quãng lịch sử) → overlay mới nhất, và
        ``overlay_sync`` báo rõ là chưa khớp được để FE biết đường hiển thị.
        """
        stream_online = self.is_stream_live()
        frame_age_sec = self._frame_age_sec()

        with self._overlay_lock:
            latest = dict(self._latest_overlay)
            history = list(self._overlay_history)

        chosen, sync_mode, drift_ms = self._select_overlay_entry(latest, history, at_ms)
        span_ms = self._overlay_history_span_ms(history)

        base = {
            "camera_id": self.camera_id,
            "width": int(chosen.get("width") or 0),
            "height": int(chosen.get("height") or 0),
            "updated_at": float(chosen.get("updated_at") or 0.0),
            "source_pts_sec": float(chosen.get("source_pts_sec") or 0.0),
            "frame_wallclock_ms": float(chosen.get("frame_wallclock_ms") or 0.0),
            "stream_online": stream_online,
            "frame_age_sec": round(frame_age_sec, 2) if frame_age_sec >= 0 else None,
            "detections": list(chosen.get("detections") or []),
            "roi_zones": list(chosen.get("roi_zones") or []),
            "metrics": dict(chosen.get("metrics") or {}),
            "overlay_sync": sync_mode,
            "overlay_history_span_ms": span_ms,
        }
        if at_ms is not None:
            base["requested_at_ms"] = float(at_ms)
            base["overlay_drift_ms"] = drift_ms
        if not stream_online:
            # Camera mất tín hiệu: giữ lại polygon ROI cũ là vẽ vùng của cảnh đã
            # trôi qua lên khung hình đen — xoá cùng detections.
            base["detections"] = []
            base["roi_zones"] = []
            base["metrics"] = {}
        return base

    @staticmethod
    def _overlay_history_span_ms(history: list[dict]) -> int:
        stamps = [
            float(entry.get("frame_wallclock_ms") or 0.0)
            for entry in history
            if float(entry.get("frame_wallclock_ms") or 0.0) > 0
        ]
        if len(stamps) < 2:
            return 0
        return int(round(max(stamps) - min(stamps)))

    @staticmethod
    def _select_overlay_entry(
        latest: dict,
        history: list[dict],
        at_ms: Optional[float],
    ) -> tuple[dict, str, Optional[int]]:
        """Chọn bản overlay gần nhất **không muộn hơn** khung hình đang chiếu.

        Lấy bản muộn hơn tức là vẽ tương lai lên khung hình quá khứ — đúng lỗi
        "hộp chạy trước người". Nên khi không có bản nào đủ cũ thì thà báo chưa
        khớp còn hơn gửi bừa.
        """
        if at_ms is None or not history:
            return latest, "latest", None

        best: Optional[dict] = None
        best_stamp = 0.0
        for entry in history:
            stamp = float(entry.get("frame_wallclock_ms") or 0.0)
            # Chặn cứng, không nới biên: một bản overlay muộn hơn khung hình dù
            # chỉ một nhịp AI cũng đủ để hộp nhảy trước người đang đi.
            if stamp <= 0 or stamp > at_ms:
                continue
            if stamp >= best_stamp:
                best_stamp = stamp
                best = entry

        if best is None:
            return latest, "latest", None
        return best, "aligned", int(round(abs(at_ms - best_stamp)))

    def is_stream_live(self) -> bool:
        if self._using_fallback:
            return False
        if not _is_live_stream_source(self._active_source):
            return True
        # Live HLS-only (0 engine): không có ingest → dùng ffmpeg còn chạy.
        if self._live_hls_only:
            return self.hls_ready()
        with self._frame_lock:
            if self._frame is None or self._frame_received_at <= 0:
                return False
            return (time.time() - self._frame_received_at) <= LIVE_FRAME_STALE_SEC

    def _frame_age_sec(self) -> float:
        with self._frame_lock:
            if self._frame_received_at <= 0:
                return -1.0
            return time.time() - self._frame_received_at

    def _clear_frame_buffer(self) -> None:
        with self._frame_lock:
            self._frame = None
            self._source_pts_sec = 0.0
            self._frame_received_at = 0.0
        with self._overlay_lock:
            self._latest_overlay = {
                "width": 0,
                "height": 0,
                "detections": [],
                "roi_zones": [],
                "metrics": {},
                "updated_at": 0.0,
            }
            self._overlay_history.clear()

    @staticmethod
    def _merge_roi_zones(existing: list[dict], incoming: list[dict]) -> list[dict]:
        if not incoming:
            return existing
        by_id = {str(z.get("id", i)): z for i, z in enumerate(existing)}
        for zone in incoming:
            key = str(zone.get("id", len(by_id)))
            by_id[key] = zone
        return list(by_id.values())

    # ------------------------------------------------------------------
    # Internal — ingest loop
    # ------------------------------------------------------------------

    def _probe_source_duration(self) -> None:
        # Luồng trực tiếp không có độ dài. Mở thử lúc mũ chưa phát chỉ tổ chặn
        # worker vài giây trước khi kịp chạy luồng ingest.
        if _is_live_stream_source(self._active_source):
            self._source_duration = 0.0
            return
        try:
            cap = _open_capture(self._active_source)
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            fc = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            cap.release()
            self._source_duration = fc / fps if fc > 0 and fps > 0 else 0.0
            logger.info("[VMS %s] Duration: %.1fs", self.camera_id, self._source_duration)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[VMS %s] Không probe được duration: %s", self.camera_id, exc)

    def _ingest_loop(self) -> None:
        open_failures = 0
        last_fail_log = 0.0
        while self._running:
            retry_delay = _source_retry_delay(self._active_source, open_failures)
            # Nhịp thử dày thì đếm lần không còn nói lên thời gian — quy về giây.
            fallback_after = max(3, int(6.0 / _source_retry_delay(self._active_source)))
            cap = _open_capture(self._active_source)
            if not cap.isOpened():
                open_failures += 1
                now = time.monotonic()
                if open_failures == 1 or now - last_fail_log >= 15.0:
                    last_fail_log = now
                    logger.warning(
                        "[VMS %s] Không mở được source (%s), retry %.1fs (#%d)",
                        self.camera_id,
                        self._active_source,
                        retry_delay,
                        open_failures,
                    )
                if (
                    _is_live_stream_source(self._active_source)
                    and open_failures >= fallback_after
                    and self._switch_to_fallback_source()
                ):
                    open_failures = 0
                    continue
                if _is_live_stream_source(self._active_source):
                    self._clear_frame_buffer()
                time.sleep(retry_delay)
                continue

            open_failures = 0
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            if fps <= 0 or fps > 120:
                fps = 25.0
            frame_sleep = 1.0 / fps
            live = _is_live_stream_source(self._active_source)

            logger.info("[VMS %s] Ingest bắt đầu @ %.1f FPS", self.camera_id, fps)
            idle_reads = 0

            while self._running:
                with self._seek_lock:
                    if self._seek_to_zero and not live:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        self._seek_to_zero = False

                if not self._ingest_gate.is_set():
                    if not live:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    if live:
                        ok, frame = _read_latest_live_frame(cap, max_grab=4)
                    else:
                        ok, frame = cap.read()
                    if not ok or frame is None:
                        # RTSP mở được nhưng chưa có khung hình là chuyện thường
                        # khi mũ chưa bật camera. Nằm chờ mãi trên một capture
                        # câm thì mũ có phát lại cũng không nhận được gì — phải
                        # mở lại kết nối.
                        idle_reads += 1
                        if live and idle_reads >= PREGATE_IDLE_READS:
                            logger.warning(
                                "[VMS %s] Nguồn mở được nhưng không có khung hình — mở lại.",
                                self.camera_id,
                            )
                            self._clear_frame_buffer()
                            break
                        time.sleep(0.05)
                        continue
                    idle_reads = 0
                    source_pts = 0.0
                    with self._frame_lock:
                        self._frame = frame
                        self._source_pts_sec = source_pts
                        self._frame_received_at = time.time()
                    time.sleep(0.02)
                    continue

                if live:
                    ok, frame = _read_latest_live_frame(cap)
                else:
                    ok, frame = cap.read()
                if not ok or frame is None:
                    if _is_live_stream_source(self._active_source):
                        logger.warning("[VMS %s] Mất tín hiệu live — reconnect.", self.camera_id)
                        self._clear_frame_buffer()
                        # Đóng luôn ffmpeg: để nó sống chỉ tổ giữ playlist đứng
                        # hình, người xem tưởng còn LIVE. _ensure_pipe_hls mở
                        # lại ngay khi mũ phát tiếp.
                        if self._live_hls_from_pipe:
                            self._stop_hls()
                        break
                    from .vms_loop_state import register_video_loop

                    register_video_loop(self.camera_id)
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        logger.warning("[VMS %s] Không đọc được frame sau EOF reset.", self.camera_id)
                        break

                source_pts = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
                wall_now = time.monotonic()

                with self._frame_lock:
                    self._frame = frame
                    self._source_pts_sec = source_pts
                    self._frame_received_at = time.time()
                with self._pts_lock:
                    self._pts_history.append((wall_now, source_pts))

                self._ensure_pipe_hls(frame)
                self._write_hls_pipe_frame(frame)

                if not live:
                    time.sleep(frame_sleep)

            cap.release()

        logger.info("[VMS %s] Ingest loop kết thúc.", self.camera_id)

    # ------------------------------------------------------------------
    # Internal — AI loop
    # ------------------------------------------------------------------

    def _warmup_engines(self, frame: np.ndarray) -> None:
        """Load model YOLO/tesseract trước khi mở ingest — tránh bỏ lỡ segment đầu reel."""
        source_pts_sec = 0.0
        for engine_name, fn in self._process_fns.items():
            try:
                engine_kwargs: dict = {"capture_frame": frame}
                if engine_name == "road":
                    engine_kwargs["stabilize"] = False
                if engine_name in ("atgt", "mesh", "ppe", "pccc", "crane", "wah"):
                    engine_kwargs["source_pts_sec"] = source_pts_sec
                fn(frame, self.camera_id, **engine_kwargs)
            except Exception as exc:  # noqa: BLE001
                logger.debug("[VMS %s] Warmup engine %s: %s", self.camera_id, engine_name, exc)

    def _downscale_for_ai(self, frame: np.ndarray) -> np.ndarray:
        """Thu nhỏ frame trước inference — YOLO vẫn nhận đủ chi tiết ở 960px."""
        limit = self._ai_max_width
        if limit <= 0:
            return frame
        h, w = frame.shape[:2]
        if w <= limit:
            return frame
        scale = limit / float(w)
        return cv2.resize(
            frame,
            (limit, max(1, int(round(h * scale)))),
            interpolation=cv2.INTER_AREA,
        )

    def _ai_loop(self) -> None:
        interval = 1.0 / self._ai_fps
        logger.info("[VMS %s] AI loop @ %.1f FPS, %d engine(s)", self.camera_id, self._ai_fps, len(self._process_fns))

        while self._running and self.get_frame() is None:
            time.sleep(0.05)

        warmup_frame = self.get_frame()
        if warmup_frame is not None:
            warmup_frame = self._downscale_for_ai(warmup_frame)
            if self._live_hls_from_pipe:
                hh, ww = warmup_frame.shape[:2]
                self._start_hls(fresh_output=True, pipe_size=(ww, hh))

            # Nguồn live không tua lại được: chặn ingest chờ nạp model chỉ làm
            # dồn buffer RTSP rồi vứt. Chỉ reel MP4 mới cần warmup đồng bộ để
            # sự kiện bắt đúng từ pts 0.
            if self._live_hls_from_pipe or _is_live_stream_source(self._active_source):
                self._ingest_gate.set()
                threading.Thread(
                    target=self._warmup_engines,
                    args=(warmup_frame,),
                    name=f"vms-warmup-{self.camera_id}",
                    daemon=True,
                ).start()
                logger.info("[VMS %s] Ingest mở ngay — warmup AI chạy nền.", self.camera_id)
            else:
                self._warmup_engines(warmup_frame)
                logger.info("[VMS %s] AI warmup xong — mở ingest @ pts 0", self.camera_id)
                self._ingest_gate.set()
        else:
            self._ingest_gate.set()

        while self._running:
            t0 = time.monotonic()

            with self._frame_lock:
                frame = None if self._frame is None else self._frame.copy()
                source_pts_sec = float(self._source_pts_sec)
                frame_received_at = float(self._frame_received_at)
            if frame is not None and _is_live_stream_source(self._active_source):
                frame_age = time.time() - frame_received_at
                if frame_received_at <= 0 or frame_age > LIVE_FRAME_STALE_SEC:
                    frame = None

            is_patrol_cam = self.camera_id.startswith("HC-") or self.camera_id.startswith(
                "DR-",
            )
            if frame is None and is_patrol_cam and frame_received_at > 0:
                if not self._patrol_offline_finalized:
                    try:
                        from .patrol_stream_lifecycle import on_patrol_stream_offline

                        on_patrol_stream_offline(
                            self.camera_id,
                            at_ts=frame_received_at,
                        )
                    except Exception as exc:  # noqa: BLE001
                        logger.debug(
                            "[VMS %s] patrol offline finalize: %s",
                            self.camera_id,
                            exc,
                        )
                    self._patrol_offline_finalized = True
            elif frame is not None and is_patrol_cam:
                if self._patrol_offline_finalized:
                    try:
                        from .patrol_stream_lifecycle import mark_patrol_stream_online

                        mark_patrol_stream_online(self.camera_id)
                    except Exception:  # noqa: BLE001
                        pass
                self._patrol_offline_finalized = False

            if frame is not None:
                # Frame gốc vẫn là nguồn cắt snapshot/clip; AI chạy trên bản thu
                # nhỏ nên engine tự scale bbox về ảnh gốc qua `capture_frame`.
                capture_frame = frame
                frame = self._downscale_for_ai(frame)
                h, w = frame.shape[:2]
                frame_w, frame_h = w, h
                merged_detections: list[dict] = []
                merged_zones: list[dict] = []
                merged_metrics: dict = {}

                for engine_name, fn in self._process_fns.items():
                    try:
                        engine_kwargs: dict = {"capture_frame": capture_frame}
                        if engine_name == "road":
                            engine_kwargs["stabilize"] = False
                        if engine_name in ("atgt", "mesh", "ppe", "pccc", "crane", "wah"):
                            engine_kwargs["source_pts_sec"] = source_pts_sec
                        result, events = fn(frame, self.camera_id, **engine_kwargs)
                        if isinstance(result, dict):
                            merged_detections.extend(result.get("detections") or [])
                            zone_rows = result.get("roi_zones") or []
                            if zone_rows:
                                merged_zones = self._merge_roi_zones(merged_zones, zone_rows)
                            if result.get("metrics"):
                                merged_metrics[engine_name] = result["metrics"]
                            frame_w = int(result.get("width") or frame_w)
                            frame_h = int(result.get("height") or frame_h)
                            try:
                                collect_vms_engine_sample(engine_name, frame, result)
                            except Exception as exc:  # noqa: BLE001
                                logger.debug("[VMS %s] Auto-train collect: %s", self.camera_id, exc)

                        if events and self._on_event:
                            for ev in events:
                                ev.confirmed_at = ev.confirmed_at or time.time()
                                try:
                                    self._cut_clip_for_event(ev)
                                except Exception as exc:  # noqa: BLE001
                                    logger.warning(
                                        "[VMS %s] Clip cut lỗi (%s): %s",
                                        self.camera_id, engine_name, exc,
                                    )
                                self._on_event(ev)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("[VMS %s] Engine %s lỗi: %s", self.camera_id, engine_name, exc)

                # Engine trả bbox theo khung analyze (≤960px). FE vẽ trên luồng
                # WHEP/HLS full-res — scale về capture_frame giống `/analyze/frame`.
                sx, sy = frame_scale(frame, capture_frame)
                if sx != 1.0 or sy != 1.0:
                    merged_detections = scale_overlay_detection_dicts(merged_detections, sx, sy)
                    frame_w = int(capture_frame.shape[1])
                    frame_h = int(capture_frame.shape[0])

                overlay_entry = {
                    "width": frame_w,
                    "height": frame_h,
                    "detections": merged_detections,
                    "roi_zones": merged_zones,
                    "metrics": merged_metrics,
                    "updated_at": time.time(),
                    "source_pts_sec": round(source_pts_sec, 3),
                    # Wallclock lúc nhận frame từ camera — khớp với
                    # EXT-X-PROGRAM-DATE-TIME của HLS để FE đồng bộ bbox.
                    "frame_wallclock_ms": round(frame_received_at * 1000.0),
                }
                with self._overlay_lock:
                    self._latest_overlay = overlay_entry
                    self._overlay_history.append(overlay_entry)

                # Đánh thức WebSocket subscribers — FE nhận bbox ngay, không chờ nhịp poll.
                overlay_bus.notify(self.camera_id)

            elapsed = time.monotonic() - t0
            sleep_time = max(0.0, interval - elapsed)
            time.sleep(sleep_time)

        logger.info("[VMS %s] AI loop kết thúc.", self.camera_id)

    # ------------------------------------------------------------------
    # Internal — HLS
    # ------------------------------------------------------------------

    def _clear_hls_output(self) -> None:
        for seg in self._hls_dir.glob("seg_*.ts"):
            try:
                seg.unlink()
            except OSError:
                pass
        index = self.hls_index_path()
        if index.is_file():
            try:
                index.unlink()
            except OSError:
                pass

    def _latest_hls_activity(self) -> float:
        latest = 0.0
        index = self.hls_index_path()
        if index.is_file():
            try:
                latest = index.stat().st_mtime
            except OSError:
                pass
        for seg in self._hls_dir.glob("seg_*.ts"):
            try:
                latest = max(latest, seg.stat().st_mtime)
            except OSError:
                pass
        return latest

    def _live_hls_encode_args(self, segment_pattern: str, hls_out: str) -> list[str]:
        # Flycam DR-* — nguồn 720p từ DJI; 800k ultrafast gây mờ/giật rõ trên CMS.
        is_flycam = self.camera_id.startswith("DR-")
        bitrate = "2500k" if is_flycam else "1200k"
        maxrate = "2800k" if is_flycam else "1400k"
        bufsize = "3500k" if is_flycam else "1800k"
        preset = "veryfast" if is_flycam else "ultrafast"
        return [
            "-c:v", "libx264",
            "-preset", preset,
            "-tune", "zerolatency",
            "-b:v", bitrate,
            "-maxrate", maxrate,
            "-bufsize", bufsize,
            # GOP ngắn quá thì I-frame nuốt hết bitrate và P-frame vỡ nhoè;
            # playlist quá ngắn thì chỉ cần encoder trễ một nhịp là player đói
            # dữ liệu. 1s/segment × 4 là điểm cân bằng cho nguồn 4G.
            "-g", "25",
            "-sc_threshold", "0",
            "-an",
            "-muxdelay", "0",
            "-muxpreload", "0",
            "-hls_time", "1",
            "-hls_list_size", "4",
            # program_date_time: gắn EXT-X-PROGRAM-DATE-TIME vào playlist để FE biết
            # wallclock của frame đang phát, nhờ đó khớp bbox đúng thời điểm thay vì
            # vẽ detections mới nhất lên hình ảnh đã trễ vài giây.
            "-hls_flags", (
                "split_by_time+delete_segments+append_list+omit_endlist"
                "+independent_segments+program_date_time"
            ),
            "-hls_segment_filename", segment_pattern,
            hls_out,
        ]

    def _ensure_pipe_hls(self, frame: np.ndarray) -> None:
        """Mở lại HLS pipe mỗi khi có frame mà ffmpeg không còn sống.

        Mũ tắt sóng rồi phát lại là chuyện thường ngày. Không mở lại ở đây thì
        chỉ lần phát đầu tiên sau khi khởi động service mới có hình.
        """
        if not self._live_hls_from_pipe:
            return
        proc = self._hls_proc
        if self._hls_pipe_stdin is not None and proc is not None and proc.poll() is None:
            return

        # ffmpeg chết ngay khi vừa mở thì đừng mở lại mỗi frame.
        now = time.monotonic()
        if now < self._pipe_hls_retry_after:
            return
        self._pipe_hls_retry_after = now + 2.0

        height, width = frame.shape[:2]
        with self._hls_lock:
            self._stop_hls_unlocked()
            self._start_hls(fresh_output=True, pipe_size=(width, height))

    def _write_hls_pipe_frame(self, frame: np.ndarray) -> None:
        stdin = self._hls_pipe_stdin
        if stdin is None:
            return
        try:
            out = frame
            if self._hls_pipe_size is not None:
                pw, ph = self._hls_pipe_size
                fh, fw = frame.shape[:2]
                if (fw, fh) != (pw, ph):
                    out = cv2.resize(frame, (pw, ph))
            stdin.write(out.tobytes())
        except (BrokenPipeError, OSError, ValueError):
            self._hls_pipe_stdin = None

    def _start_hls(self, *, fresh_output: bool = False, pipe_size: tuple[int, int] | None = None) -> None:
        if not shutil.which("ffmpeg"):
            logger.warning(
                "[VMS %s] ffmpeg không có trong PATH — HLS stream không khả dụng. "
                "Cài: apt-get install ffmpeg",
                self.camera_id,
            )
            return

        # Không bỏ rơi tiến trình cũ: hai ffmpeg cùng ghi một thư mục HLS sẽ
        # tranh nhau đánh số segment và playlist nhảy loạn.
        self._stop_hls_unlocked()

        hls_out = str(self._hls_dir / "index.m3u8")
        segment_pattern = str(self._hls_dir / "seg_%04d.ts")

        if fresh_output or (
            _is_live_stream_source(self._active_source) and not self.hls_index_path().is_file()
        ):
            self._clear_hls_output()

        cmd = [
            "ffmpeg",
            "-loglevel", "warning",
        ]
        stdin_mode = False
        if self._live_hls_from_pipe and pipe_size is not None:
            w, h = pipe_size
            self._hls_pipe_size = (w, h)
            cmd.extend([
                "-f", "rawvideo",
                "-pix_fmt", "bgr24",
                "-s", f"{w}x{h}",
                "-r", "25",
                "-i", "pipe:0",
            ])
            cmd.extend(self._live_hls_encode_args(segment_pattern, hls_out))
            stdin_mode = True
        elif _is_live_stream_source(self._active_source):
            cmd.extend([
                "-fflags", "nobuffer",
                "-flags", "low_delay",
                "-probesize", "500000",
                "-analyzeduration", "500000",
                "-rtsp_transport", "tcp",
                "-i", self._active_source,
                "-r", "25",
            ])
            cmd.extend(self._live_hls_encode_args(segment_pattern, hls_out))
        else:
            cmd.extend(["-stream_loop", "-1", "-re", "-i", self._active_source])
            cmd.extend([
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                "-b:v", "800k",
                "-maxrate", "900k",
                "-bufsize", "1600k",
                "-g", "25",
                "-sc_threshold", "0",
                "-an",
                "-hls_time", "2",
                "-hls_list_size", "6",
                "-hls_flags", "delete_segments+independent_segments+program_date_time",
                "-hls_segment_filename", segment_pattern,
                hls_out,
            ])

        try:
            popen_kwargs: dict = {
                "stdout": subprocess.DEVNULL,
                "stderr": subprocess.DEVNULL,
            }
            if stdin_mode:
                popen_kwargs["stdin"] = subprocess.PIPE
            self._hls_proc = subprocess.Popen(cmd, **popen_kwargs)
            self._hls_pipe_stdin = self._hls_proc.stdin if stdin_mode else None
            self._hls_started_at = time.monotonic()
            self._hls_started_wall = time.time()
            mode = "pipe" if stdin_mode else "direct"
            logger.info(
                "[VMS %s] HLS ffmpeg PID %d khởi động (%s).",
                self.camera_id,
                self._hls_proc.pid,
                mode,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("[VMS %s] Không khởi động được HLS ffmpeg: %s", self.camera_id, exc)
            self._hls_proc = None
            self._hls_pipe_stdin = None

    def _restart_hls(self, reason: str) -> None:
        now = time.monotonic()
        if now < self._hls_restart_cooldown_until:
            return
        self._hls_restart_cooldown_until = now + 20.0
        logger.warning("[VMS %s] HLS restart: %s", self.camera_id, reason)
        with self._hls_lock:
            self._stop_hls_unlocked()
            if self._live_hls_from_pipe:
                # Chưa biết kích thước frame thì chờ ingest mở lại qua
                # _ensure_pipe_hls. Hạ xuống direct ở đây sẽ cắt đường AI:
                # ffmpeg tự kéo RTSP, worker hết cửa đọc frame để detect.
                if self._hls_pipe_size:
                    self._start_hls(fresh_output=True, pipe_size=self._hls_pipe_size)
            else:
                self._start_hls(fresh_output=True)

    def _hls_watchdog_loop(self) -> None:
        """Giữ ffmpeg HLS sống cho nguồn live RTSP — restart chậm, tránh downtime liên tục."""
        while self._running:
            proc = self._hls_proc
            dead = proc is None or proc.poll() is not None
            startup_grace = time.monotonic() - self._hls_started_at < 25.0

            # Pipe mode: ffmpeg do luồng ingest sở hữu và chỉ mở khi có frame.
            # Nguồn chưa phát thì "chưa có ffmpeg" là đang chờ, không phải chết.
            if self._live_hls_from_pipe and not self.is_stream_live():
                time.sleep(6.0)
                continue

            if dead and not startup_grace:
                code = proc.returncode if proc is not None else "none"
                self._restart_hls(f"ffmpeg thoát (code={code})")
            elif not dead and not startup_grace and self.is_stream_live():
                # Chỉ coi là treo khi nguồn vẫn đang gửi frame. Mũ tắt sóng thì
                # không có segment là đúng — restart lúc đó chỉ làm nhiễu log.
                last_activity = self._latest_hls_activity()
                baseline = last_activity if last_activity > 0 else self._hls_started_wall
                idle_sec = time.time() - baseline if baseline > 0 else 0.0
                if idle_sec > 40.0:
                    self._restart_hls(f"không segment mới {idle_sec:.0f}s")

            time.sleep(6.0)

    def _stop_hls(self) -> None:
        with self._hls_lock:
            self._stop_hls_unlocked()

    def _stop_hls_unlocked(self) -> None:
        if self._hls_pipe_stdin:
            try:
                self._hls_pipe_stdin.close()
            except OSError:
                pass
            self._hls_pipe_stdin = None
        if self._hls_proc and self._hls_proc.poll() is None:
            self._hls_proc.terminate()
            try:
                self._hls_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._hls_proc.kill()
            logger.info("[VMS %s] HLS ffmpeg đã dừng.", self.camera_id)
        self._hls_proc = None

    # ------------------------------------------------------------------
    # Internal — Clip cutting
    # ------------------------------------------------------------------

    def _source_pts_at(self, wall_time: float) -> float:
        """Tìm source_pts tương ứng với wall_time từ ring buffer.

        Nếu không tìm thấy → trả về source_pts gần nhất.
        """
        with self._pts_lock:
            hist = list(self._pts_history)

        if not hist:
            return 0.0

        # Tìm entry gần wall_time nhất
        best = min(hist, key=lambda x: abs(x[0] - wall_time))
        return best[1]

    def _cut_clip_for_event(self, event) -> None:
        """Cắt clip MP4 xung quanh confirmed_at, burn-in bbox, lưu vào clips dir."""
        if not shutil.which("ffmpeg"):
            return

        confirmed_at = event.confirmed_at or time.time()
        source_pts = self._source_pts_at(time.monotonic() - (time.time() - confirmed_at))
        duration = self._source_duration

        # Tính start/end trong source file
        pre = CLIP_PRE_SEC
        post = CLIP_POST_SEC
        clip_start = max(0.0, source_pts - pre)
        clip_duration_target = pre + post  # 5s

        # Nếu gần EOF, điều chỉnh
        if duration > 0:
            clip_end = clip_start + clip_duration_target
            if clip_end > duration:
                clip_start = max(0.0, duration - clip_duration_target)
            clip_duration_target = min(clip_duration_target, duration - clip_start)

        event_date = event.event_date or time.strftime("%Y-%m-%d")
        clip_filename = f"{event_date}/{event.id}.mp4"
        clip_path = self._clips_dir.parent / clip_filename
        clip_path.parent.mkdir(parents=True, exist_ok=True)

        # Tạo drawbox filter nếu có bbox
        vf_parts: list[str] = []
        if event.bbox and len(event.bbox) >= 4:
            x1, y1, x2, y2 = (int(v) for v in event.bbox[:4])
            w = max(1, x2 - x1)
            h = max(1, y2 - y1)
            vf_parts.append(
                f"drawbox=x={x1}:y={y1}:w={w}:h={h}:color=red@0.7:t=3"
            )
        # Burn-in text label
        label = f"{event.scenario_id} {event.confidence:.0%}"
        safe_label = label.replace("'", "").replace(":", " ")
        if vf_parts:
            vf_parts.append(
                f"drawtext=text='{safe_label}':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=4"
            )
        vf = ",".join(vf_parts) if vf_parts else None

        cmd = [
            "ffmpeg",
            "-loglevel", "warning",
            "-ss", str(clip_start),
            "-t", str(clip_duration_target),
            "-i", self.source_path,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-an",
        ]
        if vf:
            cmd += ["-vf", vf]
        cmd += [str(clip_path), "-y"]

        try:
            result = subprocess.run(cmd, capture_output=True, timeout=30)
            if result.returncode == 0 and clip_path.exists():
                event.clip_file = clip_filename
                event.clip_duration_sec = round(clip_duration_target, 1)
                logger.info(
                    "[VMS %s] Clip %s: %.1fs @ src_pts=%.1fs",
                    self.camera_id, event.id, clip_duration_target, clip_start,
                )
            else:
                logger.warning(
                    "[VMS %s] ffmpeg clip failed (rc=%d): %s",
                    self.camera_id, result.returncode,
                    result.stderr.decode("utf-8", errors="replace")[:200],
                )
        except subprocess.TimeoutExpired:
            logger.warning("[VMS %s] Clip cut timeout for event %s", self.camera_id, event.id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[VMS %s] Clip cut exception: %s", self.camera_id, exc)
