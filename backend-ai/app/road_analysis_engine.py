"""Debounced road-analysis events — bùn / nước / vật thể (Cam A-03)."""

from __future__ import annotations

import logging
import time
from typing import Optional

import numpy as np

from .events import EventStore, PersistenceDebouncer
from .road_analyzer import analyze_road_frame
from .schemas import RoadDetection, ViolationEvent

logger = logging.getLogger("road_analysis_engine")

# Xác nhận detect liên tục trước khi log lần đầu
_ROAD_DEBOUNCE_SECONDS = 2.5
_ROAD_MAX_GAP_SECONDS = 3.0
# Chỉ log lại cùng loại (mud/water/object) sau 30 phút — khớp dwell Module 04
_ROAD_EVENT_COOLDOWN_SECONDS = 30 * 60


class RoadAnalysisEngine:
    """Phân tích lòng đường + debounce sự kiện theo camera."""

    def __init__(self, store: EventStore):
        self.store = store
        self._debouncers: dict[str, dict[str, PersistenceDebouncer]] = {}
        self._episode_best: dict[str, dict] = {}
        self._last_event_at: dict[str, float] = {}

    def _debouncers_for(self, camera_id: str) -> dict[str, PersistenceDebouncer]:
        if camera_id not in self._debouncers:
            self._debouncers[camera_id] = {
                behavior: PersistenceDebouncer(
                    min_duration_seconds=_ROAD_DEBOUNCE_SECONDS,
                    cooldown_seconds=_ROAD_EVENT_COOLDOWN_SECONDS,
                    max_gap_seconds=_ROAD_MAX_GAP_SECONDS,
                    one_event_per_episode=True,
                )
                for behavior in (
                    "mud", "water", "object",
                    "mesh_missing", "mesh_torn", "mesh_dirty",
                )
            }
        return self._debouncers[camera_id]

    def _should_skip_repeat(self, camera_id: str, behavior: str) -> bool:
        key = f"{camera_id}:{behavior}"
        last_at = self._last_event_at.get(key)
        if last_at is None:
            return False
        return time.time() - last_at < _ROAD_EVENT_COOLDOWN_SECONDS

    def process_frame(self, frame: np.ndarray, camera_id: str) -> tuple[dict, list[ViolationEvent]]:
        result = analyze_road_frame(frame, camera_id)
        detections_raw = result.get("detections", [])
        debouncers = self._debouncers_for(camera_id)

        by_behavior: dict[str, list[RoadDetection]] = {}
        for row in detections_raw:
            det = RoadDetection.model_validate(row)
            by_behavior.setdefault(det.behavior, []).append(det)

        new_events: list[ViolationEvent] = []
        for behavior, debouncer in debouncers.items():
            dets = by_behavior.get(behavior, [])
            best_conf = max((d.confidence for d in dets), default=0.0)
            episode_key = f"{camera_id}:{behavior}"
            was_active = debouncer.snapshot()["active"]
            confirmed = debouncer.register(best_conf >= 0.55)

            if best_conf >= 0.55:
                top = max(dets, key=lambda d: d.confidence)
                pending = self._episode_best.get(episode_key)
                if pending is None or top.confidence > pending["confidence"]:
                    self._episode_best[episode_key] = {
                        "confidence": top.confidence,
                        "detection": top,
                        "frame": frame.copy(),
                    }

            if confirmed:
                if self._should_skip_repeat(camera_id, behavior):
                    continue
                pending = self._episode_best.pop(episode_key, None)
                if pending:
                    top_det = pending["detection"]
                    snap_frame = pending["frame"]
                elif dets:
                    top_det = max(dets, key=lambda d: d.confidence)
                    snap_frame = frame
                else:
                    continue

                event = self.store.add_road(top_det, snap_frame, camera_id=camera_id)
                new_events.append(event)
                self._last_event_at[f"{camera_id}:{behavior}"] = time.time()
                logger.info(
                    "Road event [%s] %s conf=%.2f cam=%s",
                    event.scenario_id,
                    event.scenario_name,
                    event.confidence,
                    camera_id,
                )
            elif was_active and not debouncer.snapshot()["active"]:
                self._episode_best.pop(episode_key, None)

        result["events"] = [e.model_dump() for e in new_events]
        return result, new_events
