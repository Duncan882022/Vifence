"""Gắn thông tin công nhân vào ViolationEvent."""

from __future__ import annotations

from ..schemas import ViolationEvent
from .models import WorkerMatch


def apply_worker_match(event: ViolationEvent, match: WorkerMatch | None) -> ViolationEvent:
    if match is None:
        return event
    event.worker_id = match.worker_id
    event.worker_name = match.worker_name
    event.employee_code = match.employee_code
    event.contractor_name = match.contractor_name
    event.face_match_confidence = match.confidence
    event.face_match_source = match.match_source
    return event
