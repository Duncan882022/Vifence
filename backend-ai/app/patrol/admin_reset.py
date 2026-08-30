"""Xóa sạch dữ liệu Module 05 patrol."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

_DATA = Path(__file__).resolve().parent.parent.parent / "data"


def purge_patrol_all(*, keep_counters: bool = True) -> dict[str, Any]:
    from ..person_identity_registry import clear_registry
    from ..patrol_appearance_store import clear_patrol_appearances
    from ..patrol_identity_store import clear_patrol_identity_bindings
    from ..worker_identity.gallery import clear_gallery_storage
    from ..worker_identity.recognizer import reload_gallery
    from . import db, identity
    from .enroll_images import SESSION_IMAGES_ROOT
    from .person_analyzer import reset_all_hc_patrol_state
    from .sink import SNAPSHOT_DIR

    stats: dict[str, Any] = {}

    db.close()
    stats["sqlite"] = db.reset_all(keep_counters=keep_counters)
    stats["identity_bindings"] = clear_patrol_identity_bindings()
    stats["gallery"] = clear_gallery_storage()
    stats["track_registry"] = clear_registry()
    stats["appearance_log"] = clear_patrol_appearances()
    stats["hc_patrol_state"] = reset_all_hc_patrol_state()

    snapshots_removed = 0
    if SNAPSHOT_DIR.is_dir():
        for child in SNAPSHOT_DIR.iterdir():
            if child.is_dir():
                snapshots_removed += len(list(child.glob("*.jpg")))
                shutil.rmtree(child, ignore_errors=True)
            elif child.is_file() and child.suffix.lower() == ".jpg":
                child.unlink(missing_ok=True)
                snapshots_removed += 1
    stats["snapshots_removed"] = snapshots_removed

    enroll_removed = 0
    if SESSION_IMAGES_ROOT.is_dir():
        for child in SESSION_IMAGES_ROOT.iterdir():
            if child.is_dir():
                enroll_removed += len(list(child.glob("*.jpg")))
                shutil.rmtree(child, ignore_errors=True)
    stats["enroll_sessions_removed"] = enroll_removed

    events_removed = 0
    events_root = _DATA / "events"
    if events_root.is_dir():
        for path in events_root.rglob("*.jsonl"):
            events_removed += sum(1 for _ in path.open(encoding="utf-8"))
            path.unlink(missing_ok=True)
        for day_dir in list(events_root.iterdir()):
            if day_dir.is_dir() and not any(day_dir.iterdir()):
                day_dir.rmdir()
    stats["patrol_events_lines_removed"] = events_removed

    reload_gallery()
    identity._invalidate_face_index()
    db.get_conn()

    stats["ok"] = True
    return stats
