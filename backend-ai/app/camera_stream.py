from __future__ import annotations

import logging
import threading
import time
from typing import Union

import cv2
import numpy as np

logger = logging.getLogger("camera_stream")


class CameraStream:
    """Đọc frame liên tục trong 1 thread nền, luôn giữ frame mới nhất.

    Tránh hiện tượng trễ hình do buffer nội bộ của OpenCV khi consumer đọc
    chậm hơn tốc độ webcam.
    """

    def __init__(self, source: Union[int, str], retry_interval: float = 3.0):
        self._source = source
        self._retry_interval = retry_interval
        self._cap: cv2.VideoCapture | None = None
        self._frame: np.ndarray | None = None
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._connected = False

    @property
    def connected(self) -> bool:
        return self._connected

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
        if self._cap:
            self._cap.release()

    def _open(self) -> bool:
        cap = cv2.VideoCapture(self._source)
        if not cap.isOpened():
            cap.release()
            return False
        self._cap = cap
        self._connected = True
        logger.info("Camera source '%s' đã kết nối.", self._source)
        return True

    def _run(self) -> None:
        while self._running:
            if self._cap is None or not self._connected:
                if not self._open():
                    logger.warning(
                        "Không mở được camera source '%s', thử lại sau %.1fs",
                        self._source,
                        self._retry_interval,
                    )
                    time.sleep(self._retry_interval)
                    continue

            ok, frame = self._cap.read()
            if not ok or frame is None:
                logger.warning("Mất kết nối camera source '%s'", self._source)
                self._connected = False
                self._cap.release()
                self._cap = None
                time.sleep(self._retry_interval)
                continue

            with self._lock:
                self._frame = frame

    def get_frame(self) -> np.ndarray | None:
        with self._lock:
            return None if self._frame is None else self._frame.copy()
