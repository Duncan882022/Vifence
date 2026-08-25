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

logger = logging.getLogger("vms_worker")

def _is_live_stream_source(source_path: str) -> bool:
    p = source_path.lower()
    return p.startswith("rtsp://") or p.startswith("rtmp://") or p.startswith("http://") or p.startswith("https://")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HLS_DIR = DATA_DIR / "hls"
CLIPS_DIR = DATA_DIR / "clips"

# FPS AI mặc định cho VMS — tiết kiệm CPU, đủ ATLĐ
VMS_AI_FPS = 6.0
# Pre/post window cho clip (giây)
CLIP_PRE_SEC = 1.0
CLIP_POST_SEC = 4.0
# Ring buffer pts history (giây) — tìm source_pts khi clip
PTS_HISTORY_SEC = 60.0
# Live RTSP: không chạy AI trên frame đóng băng khi mất tín hiệu.
LIVE_FRAME_STALE_SEC = 4.0


class CameraVmsWorker:
    """Worker VMS cho một camera.

    Params:
        camera_id: ID camera (vd "A-03", "A-04")
        source_path: đường dẫn file MP4 hoặc RTSP URL
        process_frame_fn: dict[str, Callable[[frame, camera_id], tuple[list, list]]]
            map tên engine → hàm process_frame trả (detections, events)
        on_event: callback khi có ViolationEvent confirmed
        ai_fps: tần suất AI (khung/giây)
    """

    def __init__(
        self,
        camera_id: str,
        source_path: str,
        process_frame_fns: dict[str, Callable],
        on_event: Optional[Callable] = None,
        ai_fps: float = VMS_AI_FPS,
        fallback_source: Optional[str] = None,
    ):
        self.camera_id = camera_id
        self.source_path = source_path
        self._fallback_source = (fallback_source or "").strip() or None
        self._active_source = source_path
        self._using_fallback = False
        self._process_fns = process_frame_fns
        self._on_event = on_event
        self._ai_fps = ai_fps

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
        self._hls_restart_cooldown_until: float = 0.0
        self._hls_pipe_stdin = None
        self._hls_pipe_size: Optional[tuple[int, int]] = None
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

        self._hls_dir = HLS_DIR / camera_id
        self._clips_dir = CLIPS_DIR / camera_id
        self._hls_dir.mkdir(parents=True, exist_ok=True)
        self._clips_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def _refresh_source_mode(self) -> None:
        live = _is_live_stream_source(self._active_source)
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
            if not self._live_hls_from_pipe:
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

        if not self._live_hls_from_pipe:
            self._start_hls(fresh_output=True)

        if _is_live_stream_source(self.source_path):
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

    def hls_ready(self) -> bool:
        if not self.hls_index_path().is_file():
            return False
        if not _is_live_stream_source(self._active_source):
            return True
        # Live: phát miễn ffmpeg còn chạy — tránh 503 giữa chừng gây reload FE.
        return self._hls_proc is not None and self._hls_proc.poll() is None

    def get_latest_overlay(self) -> dict:
        """Snapshot detections/zones mới nhất — FE poll để vẽ ROI (Option 2)."""
        stream_online = self.is_stream_live()
        frame_age_sec = self._frame_age_sec()
        with self._overlay_lock:
            base = {
                "camera_id": self.camera_id,
                "width": int(self._latest_overlay.get("width") or 0),
                "height": int(self._latest_overlay.get("height") or 0),
                "updated_at": float(self._latest_overlay.get("updated_at") or 0.0),
                "source_pts_sec": float(self._latest_overlay.get("source_pts_sec") or 0.0),
                "frame_wallclock_ms": float(self._latest_overlay.get("frame_wallclock_ms") or 0.0),
                "stream_online": stream_online,
                "frame_age_sec": round(frame_age_sec, 2) if frame_age_sec >= 0 else None,
                "detections": list(self._latest_overlay.get("detections") or []),
                "roi_zones": list(self._latest_overlay.get("roi_zones") or []),
                "metrics": dict(self._latest_overlay.get("metrics") or {}),
            }
        if not stream_online:
            base["detections"] = []
            base["metrics"] = {}
        return base

    def is_stream_live(self) -> bool:
        if self._using_fallback:
            return False
        if not _is_live_stream_source(self._active_source):
            return True
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
        try:
            cap = cv2.VideoCapture(self._active_source)
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            fc = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            cap.release()
            self._source_duration = fc / fps if fc > 0 and fps > 0 else 0.0
            logger.info("[VMS %s] Duration: %.1fs", self.camera_id, self._source_duration)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[VMS %s] Không probe được duration: %s", self.camera_id, exc)

    def _ingest_loop(self) -> None:
        retry_delay = 3.0
        open_failures = 0
        while self._running:
            cap = cv2.VideoCapture(self._active_source)
            if not cap.isOpened():
                open_failures += 1
                logger.warning(
                    "[VMS %s] Không mở được source (%s), retry %.1fs (#%d)",
                    self.camera_id,
                    self._active_source,
                    retry_delay,
                    open_failures,
                )
                if (
                    _is_live_stream_source(self._active_source)
                    and open_failures >= 3
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

            while self._running:
                with self._seek_lock:
                    if self._seek_to_zero and not live:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        self._seek_to_zero = False

                if not self._ingest_gate.is_set():
                    if not live:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        time.sleep(0.05)
                        continue
                    source_pts = 0.0
                    with self._frame_lock:
                        self._frame = frame
                        self._source_pts_sec = source_pts
                        self._frame_received_at = time.time()
                    time.sleep(0.02)
                    continue

                ok, frame = cap.read()
                if not ok or frame is None:
                    if _is_live_stream_source(self._active_source):
                        logger.warning("[VMS %s] Mất tín hiệu live — reconnect.", self.camera_id)
                        self._clear_frame_buffer()
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

                self._write_hls_pipe_frame(frame)

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

    def _ai_loop(self) -> None:
        interval = 1.0 / self._ai_fps
        logger.info("[VMS %s] AI loop @ %.1f FPS, %d engine(s)", self.camera_id, self._ai_fps, len(self._process_fns))

        while self._running and self.get_frame() is None:
            time.sleep(0.05)

        warmup_frame = self.get_frame()
        if warmup_frame is not None:
            self._warmup_engines(warmup_frame)
            if self._live_hls_from_pipe:
                hh, ww = warmup_frame.shape[:2]
                self._start_hls(fresh_output=True, pipe_size=(ww, hh))
            logger.info("[VMS %s] AI warmup xong — mở ingest @ pts 0", self.camera_id)
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
            if frame is not None:
                h, w = frame.shape[:2]
                frame_w, frame_h = w, h
                merged_detections: list[dict] = []
                merged_zones: list[dict] = []
                merged_metrics: dict = {}

                for engine_name, fn in self._process_fns.items():
                    try:
                        engine_kwargs: dict = {"capture_frame": frame}
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

                with self._overlay_lock:
                    self._latest_overlay = {
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
        return [
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-b:v", "800k",
            "-maxrate", "900k",
            "-bufsize", "900k",
            "-g", "12",
            "-sc_threshold", "0",
            "-an",
            "-muxdelay", "0",
            "-muxpreload", "0",
            "-hls_time", "1",
            "-hls_list_size", "3",
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
            if self._live_hls_from_pipe and self._hls_pipe_size:
                self._start_hls(fresh_output=True, pipe_size=self._hls_pipe_size)
            else:
                self._start_hls(fresh_output=True)

    def _hls_watchdog_loop(self) -> None:
        """Giữ ffmpeg HLS sống cho nguồn live RTSP — restart chậm, tránh downtime liên tục."""
        while self._running:
            proc = self._hls_proc
            dead = proc is None or proc.poll() is not None
            startup_grace = time.monotonic() - self._hls_started_at < 25.0

            if not dead and not startup_grace:
                idle_sec = time.time() - self._latest_hls_activity()
                if idle_sec > 40.0:
                    self._restart_hls(f"không segment mới {idle_sec:.0f}s")
            elif dead and not startup_grace:
                code = proc.returncode if proc is not None else "none"
                self._restart_hls(f"ffmpeg thoát (code={code})")

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
