"""Backward-compatible import — logic nằm ở app.detector + app.ai_engine."""

from __future__ import annotations

from ..detector import PersonDetector

__all__ = ["PersonDetector"]
