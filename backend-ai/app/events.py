import json
import logging
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from .schemas import Detection, RoadDetection, ViolationEvent

logger = logging.getLogger("events")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SNAPSHOT_DIR = DATA_DIR / "snapshots"
EVENTS_DIR = DATA_DIR / "events"
LEGACY_EVENTS_FILE = DATA_DIR / "events.jsonl"


def _event_date(ts: Optional[float] = None) -> str:
    return datetime.fromtimestamp(ts or time.time()).strftime("%Y-%m-%d")


def _daily_events_file(date: str) -> Path:
    folder = EVENTS_DIR / date
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "events.jsonl"


def _daily_snapshot_dir(date: str) -> Path:
    folder = SNAPSHOT_DIR / date
    folder.mkdir(parents=True, exist_ok=True)
    return folder


class PersistenceDebouncer:
    """Xác nhận sự kiện khi hành vi detect liên tục đủ min_duration.

    one_event_per_episode=True: mỗi phiên (liên tục, gap <= max_gap) chỉ log 1 lần;
    phiên mới bắt đầu khi mất detect > max_gap (vd hút điếu mới).
    """

    def __init__(
        self,
        min_duration_seconds: float,
        cooldown_seconds: float,
        max_gap_seconds: float = 2.5,
        *,
        one_event_per_episode: bool = False,
    ):
        self.min_duration_seconds = min_duration_seconds
        self.cooldown_seconds = cooldown_seconds
        self.max_gap_seconds = max_gap_seconds
        self.one_event_per_episode = one_event_per_episode
        self._active_since: Optional[float] = None
        self._last_hit_at: Optional[float] = None
        self._last_confirmed_at: float = 0.0
        self._logged_this_episode: bool = False

    def _reset_episode(self) -> None:
        self._active_since = None
        self._last_hit_at = None
        self._logged_this_episode = False

    def register(self, hit: bool) -> bool:
        now = time.time()

        if hit:
            if self._active_since is None:
                self._active_since = now
            self._last_hit_at = now
        elif self._last_hit_at is not None and now - self._last_hit_at > self.max_gap_seconds:
            self._reset_episode()

        if not hit or self._active_since is None:
            return False

        if self.one_event_per_episode and self._logged_this_episode:
            return False

        if now - self._active_since < self.min_duration_seconds:
            return False

        if not self.one_event_per_episode and now - self._last_confirmed_at < self.cooldown_seconds:
            return False

        self._last_confirmed_at = now
        if self.one_event_per_episode:
            self._logged_this_episode = True
        return True

    def snapshot(self, now: Optional[float] = None) -> dict:
        """Trạng thái debounce — dùng khi test timing sự kiện."""
        ts = now if now is not None else time.time()
        active_for = (ts - self._active_since) if self._active_since is not None else 0.0
        since_last_hit = (ts - self._last_hit_at) if self._last_hit_at is not None else None
        since_confirm = ts - self._last_confirmed_at if self._last_confirmed_at else None
        return {
            "min_duration_seconds": self.min_duration_seconds,
            "max_gap_seconds": self.max_gap_seconds,
            "cooldown_seconds": self.cooldown_seconds,
            "one_event_per_episode": self.one_event_per_episode,
            "active": self._active_since is not None,
            "active_for_seconds": round(active_for, 2),
            "logged_this_episode": self._logged_this_episode,
            "seconds_since_last_hit": round(since_last_hit, 2) if since_last_hit is not None else None,
            "seconds_since_last_confirm": round(since_confirm, 2) if since_confirm is not None else None,
            "ready_to_confirm": (
                self._active_since is not None
                and active_for >= self.min_duration_seconds
                and not (self.one_event_per_episode and self._logged_this_episode)
                and (
                    self.one_event_per_episode
                    or since_confirm is None
                    or since_confirm >= self.cooldown_seconds
                )
            ),
        }


class Debouncer:
    """Legacy hit-window debouncer — giữ cho tương thích test."""

    def __init__(self, hits: int, window: int, cooldown_seconds: float):
        self.hits_required = hits
        self.window = deque(maxlen=window)
        self.cooldown_seconds = cooldown_seconds
        self._last_confirmed_at: float = 0.0

    def register(self, hit: bool) -> bool:
        self.window.append(hit)
        if sum(self.window) < self.hits_required:
            return False
        now = time.time()
        if now - self._last_confirmed_at < self.cooldown_seconds:
            return False
        self._last_confirmed_at = now
        return True


class EventStore:
    """Lưu event RAM + JSONL theo ngày + snapshot ảnh theo ngày."""

    def __init__(self, max_in_memory: int = 200):
        self._events: deque[ViolationEvent] = deque(maxlen=max_in_memory)
        self._lock = threading.Lock()
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        EVENTS_DIR.mkdir(parents=True, exist_ok=True)
        self._load_today_from_disk()

    def _load_today_from_disk(self) -> None:
        today = _event_date()
        for event in self._read_events_file(_daily_events_file(today)):
            with self._lock:
                if not any(e.id == event.id for e in self._events):
                    self._events.appendleft(event)

    @staticmethod
    def _read_events_file(path: Path) -> list[ViolationEvent]:
        if not path.exists():
            return []
        rows: list[ViolationEvent] = []
        try:
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rows.append(ViolationEvent.model_validate_json(line))
                    except Exception:  # noqa: BLE001
                        continue
        except OSError as exc:
            logger.warning("Không đọc được %s: %s", path, exc)
        return rows

    def add(
        self,
        detection: Detection,
        frame: np.ndarray,
        *,
        camera_id: str = "LOCAL-CAM",
    ) -> ViolationEvent:
        event_date = _event_date()
        event = ViolationEvent.from_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        snapshot_name = f"{event_date}/{event.id}.jpg"
        snapshot_path = _daily_snapshot_dir(event_date) / f"{event.id}.jpg"
        annotated = self._draw_bbox(frame, detection)
        cv2.imwrite(str(snapshot_path), annotated)
        event.snapshot_file = snapshot_name

        with self._lock:
            self._events.appendleft(event)
        self._append_to_disk(event)
        logger.info(
            "Sự kiện mới [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
        )
        return event

    def add_road(
        self,
        detection: RoadDetection,
        frame: np.ndarray,
        *,
        camera_id: str = "A-03",
    ) -> ViolationEvent:
        event_date = _event_date()
        event = ViolationEvent.from_road_detection(
            detection,
            snapshot_file=None,
            event_date=event_date,
            camera_id=camera_id,
        )
        snapshot_name = f"{event_date}/{event.id}.jpg"
        snapshot_path = _daily_snapshot_dir(event_date) / f"{event.id}.jpg"
        annotated = self._draw_road_bbox(frame, detection)
        cv2.imwrite(str(snapshot_path), annotated)
        event.snapshot_file = snapshot_name

        with self._lock:
            self._events.appendleft(event)
        self._append_to_disk(event)
        logger.info(
            "Sự kiện road [%s]: %s (%s) conf=%.2f",
            event_date,
            event.scenario_name,
            event.id,
            event.confidence,
        )
        return event

    @staticmethod
    def _draw_road_bbox(frame: np.ndarray, detection: RoadDetection) -> np.ndarray:
        annotated = frame.copy()
        x1, y1, x2, y2 = [int(v) for v in detection.bbox]
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        colors = {
            "mud": (0, 180, 255),
            "water": (255, 160, 0),
            "object": (0, 140, 255),
            "mesh_missing": (0, 220, 120),
            "mesh_torn": (0, 180, 80),
            "mesh_dirty": (40, 180, 40),
        }
        color = colors.get(detection.behavior, (0, 255, 0))
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{detection.label} {detection.confidence:.2f}"
        cv2.putText(
            annotated, label, (x1, max(y1 - 8, 12)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2,
        )
        return annotated

    @staticmethod
    def _draw_bbox(frame: np.ndarray, detection: Detection) -> np.ndarray:
        annotated = frame.copy()
        x1, y1, x2, y2 = [int(v) for v in detection.bbox]
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        color = (0, 140, 255) if detection.behavior == "smoking" else (0, 0, 255)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{detection.label} {detection.confidence:.2f}"
        cv2.putText(
            annotated, label, (x1, max(y1 - 8, 12)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
        )
        return annotated

    def _append_to_disk(self, event: ViolationEvent) -> None:
        day = event.event_date or _event_date(event.created_at)
        path = _daily_events_file(day)
        try:
            with open(path, "a", encoding="utf-8") as f:
                f.write(event.model_dump_json() + "\n")
        except OSError as exc:
            logger.warning("Không ghi được events theo ngày (%s): %s", day, exc)

    def list_events(self, limit: int = 50, date: Optional[str] = None) -> list[ViolationEvent]:
        if date:
            return self._read_events_file(_daily_events_file(date))[:limit]
        with self._lock:
            return list(self._events)[:limit]

    def list_event_dates(self) -> list[str]:
        dates: set[str] = set()
        if EVENTS_DIR.exists():
            for child in EVENTS_DIR.iterdir():
                if child.is_dir() and (child / "events.jsonl").exists():
                    dates.add(child.name)
        with self._lock:
            for event in self._events:
                if event.event_date:
                    dates.add(event.event_date)
        return sorted(dates, reverse=True)

    def newest_id(self) -> Optional[str]:
        with self._lock:
            return self._events[0].id if self._events else None

    def resolve_snapshot_path(self, event_id: str, snapshot_file: Optional[str] = None) -> Optional[Path]:
        if snapshot_file:
            dated = SNAPSHOT_DIR / snapshot_file
            if dated.exists():
                return dated
        legacy = SNAPSHOT_DIR / f"{event_id}.jpg"
        if legacy.exists():
            return legacy
        matches = list(SNAPSHOT_DIR.rglob(f"{event_id}.jpg"))
        return matches[0] if matches else None
