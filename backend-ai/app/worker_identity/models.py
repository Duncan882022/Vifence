from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class WorkerProfile:
    worker_id: str
    worker_name: str
    employee_code: str
    contractor_name: Optional[str] = None


@dataclass(frozen=True)
class WorkerMatch:
    worker_id: str
    worker_name: str
    employee_code: str
    contractor_name: Optional[str]
    confidence: float
    match_source: str  # "face" | "track_demo" | "track_cache"
