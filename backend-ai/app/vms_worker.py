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

logger = logging.getLogger("vms_worker")

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
    ):
        self.camera_id = camera_id
        self.source_path = source_path
        self._process_fns = process_frame_fns
        self._on_event = on_event
        self._ai_fps = ai_fps

        self._frame: Optional[np.ndarray] = None
        self._frame_lock = threading.Lock()
        self._running = False
        self._source_duration: float = 0.0

        # Ring buffer: deque[(wall_monotonic, source_pts_sec)]
        maxpts = int(PTS_HISTORY_SEC * 30)
        self._pts_history: deque[tuple[float, float]] = deque(maxlen=maxpts)
        self._pts_lock = threading.Lock()

        self._ingest_thread: Optional[threading.Thread] = None
        self._ai_thread: Optional[threading.Thread] = None
        self._hls_proc: Optional[subprocess.Popen] = None

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

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        logger.info("[VMS %s] Worker khởi động. Source: %s", self.camera_id, self.source_path)

        self._probe_source_duration()

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

        self._start_hls()

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
        return self.hls_index_path().exists()

    def get_latest_overlay(self) -> dict:
        """Snapshot detections/zones mới nhất — FE poll để vẽ ROI (Option 2)."""
        with self._overlay_lock:
            return {
                "camera_id": self.camera_id,
                "width": int(self._latest_overlay.get("width") or 0),
                "height": int(self._latest_overlay.get("height") or 0),
                "updated_at": float(self._latest_overlay.get("updated_at") or 0.0),
                "detections": list(self._latest_overlay.get("detections") or []),
                "roi_zones": list(self._latest_overlay.get("roi_zones") or []),
                "metrics": dict(self._latest_overlay.get("metrics") or {}),
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
            cap = cv2.VideoCapture(self.source_path)
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            fc = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            cap.release()
            self._source_duration = fc / fps if fc > 0 and fps > 0 else 0.0
            logger.info("[VMS %s] Duration: %.1fs", self.camera_id, self._source_duration)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[VMS %s] Không probe được duration: %s", self.camera_id, exc)

    def _ingest_loop(self) -> None:
        retry_delay = 3.0
        while self._running:
            cap = cv2.VideoCapture(self.source_path)
            if not cap.isOpened():
                logger.warning("[VMS %s] Không mở được source, retry %.1fs", self.camera_id, retry_delay)
                time.sleep(retry_delay)
                continue

            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            frame_sleep = 1.0 / fps

            logger.info("[VMS %s] Ingest bắt đầu @ %.1f FPS", self.camera_id, fps)

            while self._running:
                ok, frame = cap.read()
                if not ok or frame is None:
                    # EOF → loop lại từ đầu
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        logger.warning("[VMS %s] Không đọc được frame sau EOF reset.", self.camera_id)
                        break

                source_pts = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
                wall_now = time.monotonic()

                with self._frame_lock:
                    self._frame = frame
                with self._pts_lock:
                    self._pts_history.append((wall_now, source_pts))

                time.sleep(frame_sleep)

            cap.release()

        logger.info("[VMS %s] Ingest loop kết thúc.", self.camera_id)

    # ------------------------------------------------------------------
    # Internal — AI loop
    # ------------------------------------------------------------------

    def _ai_loop(self) -> None:
        interval = 1.0 / self._ai_fps
        logger.info("[VMS %s] AI loop @ %.1f FPS, %d engine(s)", self.camera_id, self._ai_fps, len(self._process_fns))

        while self._running:
            t0 = time.monotonic()

            frame = self.get_frame()
            if frame is not None:
                h, w = frame.shape[:2]
                frame_w, frame_h = w, h
                merged_detections: list[dict] = []
                merged_zones: list[dict] = []
                merged_metrics: dict = {}

                for engine_name, fn in self._process_fns.items():
                    try:
                        result, events = fn(frame, self.camera_id, capture_frame=frame)
                        if isinstance(result, dict):
                            merged_detections.extend(result.get("detections") or [])
                            zone_rows = result.get("roi_zones") or []
                            if zone_rows:
                                merged_zones = self._merge_roi_zones(merged_zones, zone_rows)
                            if result.get("metrics"):
                                merged_metrics[engine_name] = result["metrics"]
                            frame_w = int(result.get("width") or frame_w)
                            frame_h = int(result.get("height") or frame_h)

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
                    }

            elapsed = time.monotonic() - t0
            sleep_time = max(0.0, interval - elapsed)
            time.sleep(sleep_time)

        logger.info("[VMS %s] AI loop kết thúc.", self.camera_id)

    # ------------------------------------------------------------------
    # Internal — HLS
    # ------------------------------------------------------------------

    def _start_hls(self) -> None:
        if not shutil.which("ffmpeg"):
            logger.warning(
                "[VMS %s] ffmpeg không có trong PATH — HLS stream không khả dụng. "
                "Cài: apt-get install ffmpeg",
                self.camera_id,
            )
            return

        hls_out = str(self._hls_dir / "index.m3u8")
        segment_pattern = str(self._hls_dir / "seg_%04d.ts")

        cmd = [
            "ffmpeg",
            "-loglevel", "warning",
            "-stream_loop", "-1",     # loop vô hạn
            "-re",                    # real-time ingest
            "-i", self.source_path,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-b:v", "800k",
            "-maxrate", "900k",
            "-bufsize", "1600k",
            "-g", "25",               # keyframe every 1s @ 25fps
            "-sc_threshold", "0",
            "-an",                    # no audio
            "-hls_time", "2",
            "-hls_list_size", "6",
            "-hls_flags", "delete_segments+independent_segments",
            "-hls_segment_filename", segment_pattern,
            hls_out,
        ]

        try:
            self._hls_proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
            logger.info("[VMS %s] HLS ffmpeg PID %d khởi động.", self.camera_id, self._hls_proc.pid)
        except Exception as exc:  # noqa: BLE001
            logger.error("[VMS %s] Không khởi động được HLS ffmpeg: %s", self.camera_id, exc)
            self._hls_proc = None

    def _stop_hls(self) -> None:
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
