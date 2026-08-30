"""Phạm vi camera Module 05 — tách khỏi ppe_analyzer."""

from __future__ import annotations


def is_patrol_helmet_bodycam(camera_id: str) -> bool:
    return (camera_id or "").startswith("HC-")


def is_patrol_flycam(camera_id: str) -> bool:
    return (camera_id or "").startswith("DR-")


def is_patrol_metrics_camera(camera_id: str) -> bool:
    return is_patrol_helmet_bodycam(camera_id) or is_patrol_flycam(camera_id)
