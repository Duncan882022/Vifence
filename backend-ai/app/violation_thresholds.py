"""Ngưỡng ghi sự kiện vi phạm — per-scenario theo Spec v1 (2026-08-10)."""

from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class ScenarioThreshold:
    """Ngưỡng cho một scenario cụ thể."""
    min_confidence: float
    confirm_seconds: float
    max_gap_seconds: float
    cooldown_seconds: float


# Ngưỡng toàn cục (fallback khi scenario không có cấu hình riêng)
VIOLATION_MIN_CONFIDENCE = 0.80
VIOLATION_CONFIRM_SECONDS = 2.0
VIOLATION_MAX_GAP_SECONDS = 3.0

# Ngưỡng per-scenario — khớp Vifence_VMS-Spec-v1.md §5.2
SCENARIO_THRESHOLDS: dict[str, ScenarioThreshold] = {
    # PPE
    "PPE-001": ScenarioThreshold(min_confidence=0.85, confirm_seconds=2.0, max_gap_seconds=3.0, cooldown_seconds=900.0),
    "PPE-002": ScenarioThreshold(min_confidence=0.85, confirm_seconds=2.0, max_gap_seconds=3.0, cooldown_seconds=900.0),
    "PPE-003": ScenarioThreshold(min_confidence=0.85, confirm_seconds=2.0, max_gap_seconds=3.0, cooldown_seconds=900.0),
    # WAH
    "WAH-001": ScenarioThreshold(min_confidence=0.85, confirm_seconds=2.0, max_gap_seconds=3.0, cooldown_seconds=900.0),
    # DZ
    "DZ-003": ScenarioThreshold(min_confidence=0.85, confirm_seconds=2.0, max_gap_seconds=3.0, cooldown_seconds=900.0),
    # ATGT
    "ATGT-002": ScenarioThreshold(min_confidence=0.85, confirm_seconds=2.0, max_gap_seconds=3.0, cooldown_seconds=600.0),
    "ATGT-004": ScenarioThreshold(min_confidence=0.85, confirm_seconds=2.0, max_gap_seconds=3.0, cooldown_seconds=600.0),
    # PCCC
    "PCCC-001": ScenarioThreshold(min_confidence=0.85, confirm_seconds=2.5, max_gap_seconds=12.0, cooldown_seconds=900.0),
    "PCCC-002": ScenarioThreshold(min_confidence=0.88, confirm_seconds=6.0, max_gap_seconds=15.0, cooldown_seconds=900.0),
    # BPTC — đường
    "BPTC-007": ScenarioThreshold(min_confidence=0.80, confirm_seconds=2.0, max_gap_seconds=3.0, cooldown_seconds=600.0),
    "BPTC-008": ScenarioThreshold(min_confidence=0.90, confirm_seconds=4.0, max_gap_seconds=3.0, cooldown_seconds=3600.0),
    "BPTC-009": ScenarioThreshold(min_confidence=0.85, confirm_seconds=2.0, max_gap_seconds=3.0, cooldown_seconds=600.0),
    # BPTC — mesh cover
    "BPTC-001": ScenarioThreshold(min_confidence=0.85, confirm_seconds=2.0, max_gap_seconds=3.0, cooldown_seconds=1800.0),
}


def get_threshold(scenario_id: str) -> ScenarioThreshold:
    """Trả về ngưỡng cho scenario, fallback về global nếu chưa có cấu hình riêng."""
    return SCENARIO_THRESHOLDS.get(
        scenario_id,
        ScenarioThreshold(
            min_confidence=VIOLATION_MIN_CONFIDENCE,
            confirm_seconds=VIOLATION_CONFIRM_SECONDS,
            max_gap_seconds=VIOLATION_MAX_GAP_SECONDS,
            cooldown_seconds=900.0,
        ),
    )
