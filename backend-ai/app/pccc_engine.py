"""Debounced PCCC events — hút thuốc / cháy nổ (Cam A-04), log ngay khi detect."""

from __future__ import annotations

import logging
import time

from .config import settings
from .events import EventStore, PersistenceDebouncer
from .pccc_demo import match_demo_detections
from .schemas import Detection, ViolationEvent
from .violation_thresholds import VIOLATION_MIN_CONFIDENCE

logger = logging.getLogger("pccc_engine")

_CONFIRM_SECONDS = 0.0
_REPEAT_SECONDS = settings.pccc_event_repeat_seconds
_MAX_GAP_SECONDS = 3.0
_EVENT_BEHAVIORS = frozenset({"smoking", "fire"})
_MIN_CONF = VIOLATION_MIN_CONFIDENCE


class PcccEngine:
    def __init__(self, store: EventStore):
        self.store = store
        self._gates: dict[str, dict[str, PersistenceDebouncer]] = {}
        self._episode_best: dict[str, dict] = {}

    def _gate_for(self, camera_id: str, behavior: str) -> PersistenceDebouncer:
        if camera_id not in self._gates:
            self._gates[camera_id] = {}
        if behavior not in self._gates[camera_id]:
            self._gates[camera_id][behavior] = PersistenceDebouncer(
                min_duration_seconds=_CONFIRM_SECONDS,
                cooldown_seconds=_REPEAT_SECONDS,
                max_gap_seconds=_MAX_GAP_SECONDS,
                one_event_per_episode=False,
            )
        return self._gates[camera_id][behavior]

    def _collect_detections(self, frame: np.ndarray, camera_id: str) -> list[Detection]:
        demo = match_demo_detections(frame, camera_id)
        if demo:
            return demo
        return []

    def process_frame(self, frame: np.ndarray, camera_id: str) -> tuple[dict, list[ViolationEvent]]:
        detections = self._collect_detections(frame, camera_id)
        new_events: list[ViolationEvent] = []
        active_behaviors: set[str] = set()

        for det in detections:
            if det.behavior not in _EVENT_BEHAVIORS or det.confidence < _MIN_CONF:
                continue

            active_behaviors.add(det.behavior)
            episode_key = f"{camera_id}:{det.behavior}"
            gate = self._gate_for(camera_id, det.behavior)

            pending = self._episode_best.get(episode_key)
            if pending is None or det.confidence > pending["detection"].confidence:
                self._episode_best[episode_key] = {
                    "detection": det,
                    "frame": frame.copy(),
                }

            confirmed = gate.register(True)
            if confirmed:
                best = self._episode_best.pop(episode_key, None)
                top = best["detection"] if best else det
                snap = best["frame"] if best else frame
                event = self.store.add(top, snap, camera_id=camera_id)
                new_events.append(event)
                logger.info(
                    "PCCC event [%s] %s (%s) conf=%.0f%%",
                    event.id,
                    event.scenario_name,
                    det.behavior,
                    event.confidence * 100,
                )

        for behavior in _EVENT_BEHAVIORS:
            if behavior in active_behaviors:
                continue
            gate = self._gate_for(camera_id, behavior)
            was_active = gate.snapshot()["active"]
            gate.register(False)
            if was_active and not gate.snapshot()["active"]:
                self._episode_best.pop(f"{camera_id}:{behavior}", None)

        payload = {
            "type": "result",
            "camera_id": camera_id,
            "width": int(frame.shape[1]),
            "height": int(frame.shape[0]),
            "detections": [d.model_dump() for d in detections],
            "events": [e.model_dump() for e in new_events],
        }
        return payload, new_events
