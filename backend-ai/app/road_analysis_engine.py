"""Debounced road-analysis events — bùn / nước / vật thể (Cam A-03)."""

from __future__ import annotations

import logging
import time

import numpy as np

from .events import EventStore, PersistenceDebouncer
from .road_analyzer import analyze_road_frame
from .schemas import RoadDetection, ViolationEvent

logger = logging.getLogger("road_analysis_engine")

# Detect liên tục 2s → snapshot + ghi sự kiện; còn detect thì ghi lại sau 10s
_ROAD_CONFIRM_SECONDS = 2.0
_ROAD_REPEAT_SECONDS = 10.0
_ROAD_MAX_GAP_SECONDS = 2.5
_ROAD_MIN_CONFIDENCE = 0.55

_ROAD_BEHAVIORS = ("mud", "water", "object")


class RoadAnalysisEngine:
    """Phân tích lòng đường + debounce sự kiện theo camera."""

    def __init__(self, store: EventStore):
        self.store = store
        self._debouncers: dict[str, dict[str, PersistenceDebouncer]] = {}

    def _debouncers_for(self, camera_id: str) -> dict[str, PersistenceDebouncer]:
        if camera_id not in self._debouncers:
            self._debouncers[camera_id] = {
                behavior: PersistenceDebouncer(
                    min_duration_seconds=_ROAD_CONFIRM_SECONDS,
                    cooldown_seconds=_ROAD_REPEAT_SECONDS,
                    max_gap_seconds=_ROAD_MAX_GAP_SECONDS,
                    one_event_per_episode=False,
                )
                for behavior in _ROAD_BEHAVIORS
            }
        return self._debouncers[camera_id]

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
            was_active = debouncer.snapshot()["active"]
            confirmed = debouncer.register(best_conf >= _ROAD_MIN_CONFIDENCE)

            if confirmed:
                if not dets:
                    continue
                # Snapshot = đúng frame + bbox tại thời điểm xác nhận (không dùng frame cũ)
                top_det = max(dets, key=lambda d: d.confidence)
                snap_frame = frame.copy()
                event = self.store.add_road(top_det, snap_frame, camera_id=camera_id)
                new_events.append(event)
                logger.info(
                    "Road event [%s] %s conf=%.2f cam=%s",
                    event.scenario_id,
                    event.scenario_name,
                    event.confidence,
                    camera_id,
                )
            elif was_active and not debouncer.snapshot()["active"]:
                pass

        result["events"] = [e.model_dump() for e in new_events]
        return result, new_events
