"""ID ẩn danh sgc-0xxxxxxx — dedup người chưa nhận diện (Module 05 HC-*)."""

from __future__ import annotations

import json
import threading
from pathlib import Path

from .schemas import PpeDetection

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
REGISTRY_FILE = DATA_DIR / "person_identity_registry.json"

_lock = threading.Lock()
_state: dict | None = None


def _load() -> dict:
    global _state
    if _state is not None:
        return _state
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if REGISTRY_FILE.exists():
        try:
            _state = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            _state = {"next_seq": 1, "tracks": {}}
    else:
        _state = {"next_seq": 1, "tracks": {}}
    _state.setdefault("next_seq", 1)
    _state.setdefault("tracks", {})
    return _state


def _save(state: dict) -> None:
    REGISTRY_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _format_sgc(seq: int) -> str:
    return f"sgc-0{seq:07d}"


def _track_key(camera_id: str, track_id: str) -> str:
    return f"{camera_id}|{track_id}"


def is_sgc_worker_id(worker_id: str | None) -> bool:
    return bool(worker_id and str(worker_id).startswith("sgc-0"))


def is_identified_gallery_worker(worker_id: str | None) -> bool:
    if not worker_id or worker_id == "unknown":
        return False
    return not is_sgc_worker_id(worker_id)


def resolve_patrol_person_identity(
    detection: PpeDetection,
    camera_id: str,
    track_id: str,
) -> tuple[str, str]:
    """Trả (worker_id, worker_name) — gallery verified hoặc sgc-0xxxxxxx."""
    from .worker_identity.verify import is_verified_face_match, worker_match_from_detection

    wid = (detection.worker_id or "").strip()
    wname = (detection.worker_name or "").strip()
    match = worker_match_from_detection(detection)
    if wid and wid != "unknown" and is_verified_face_match(match):
        key = _track_key(camera_id, track_id)
        with _lock:
            state = _load()
            state["tracks"][key] = wid
            _save(state)
        return wid, wname or wid

    key = _track_key(camera_id, track_id)
    with _lock:
        state = _load()
        existing = state["tracks"].get(key)
        if isinstance(existing, str) and existing.strip():
            return existing.strip(), existing.strip()
        seq = max(int(state.get("next_seq") or 1), 1)
        sgc = _format_sgc(seq)
        state["next_seq"] = seq + 1
        state["tracks"][key] = sgc
        _save(state)
        return sgc, sgc
