"""Module 05 — gán định danh patrol (sgc/OBJ → gallery worker) lưu DB file."""

from __future__ import annotations

import json
import re
import threading
import time
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
BINDINGS_FILE = DATA_DIR / "patrol_identity_bindings.json"

_lock = threading.Lock()
_state: dict[str, Any] | None = None


def _empty() -> dict[str, Any]:
    return {"version": 1, "by_gallery_worker": {}, "alias_to_gallery": {}}


def _load() -> dict[str, Any]:
    global _state
    if _state is not None:
        return _state
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if BINDINGS_FILE.exists():
        try:
            _state = json.loads(BINDINGS_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            _state = _empty()
    else:
        _state = _empty()
    _state.setdefault("version", 1)
    _state.setdefault("by_gallery_worker", {})
    _state.setdefault("alias_to_gallery", {})
    return _state


def _save(state: dict[str, Any]) -> None:
    BINDINGS_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def patrol_gallery_worker_id(employee_code: str) -> str:
    """Mã gallery ổn định từ mã nhân sự patrol."""
    safe = re.sub(r"[^a-zA-Z0-9_-]", "", employee_code.strip())[:40]
    return f"p-{safe}" if safe else "p-unknown"


def normalize_alias_key(key: str) -> str:
    k = key.strip()
    if not k:
        return k
    if k.lower().startswith("sgc-"):
        return k.lower()
    return k


def lookup_gallery_worker(alias: str) -> str | None:
    key = normalize_alias_key(alias)
    if not key:
        return None
    state = _load()
    wid = (state.get("alias_to_gallery") or {}).get(key)
    return str(wid).strip() if wid else None


def lookup_patrol_identity(alias: str) -> dict[str, Any] | None:
    wid = lookup_gallery_worker(alias)
    if not wid:
        return None
    row = (_load().get("by_gallery_worker") or {}).get(wid)
    return row if isinstance(row, dict) else None


def list_patrol_identity_bindings() -> list[dict[str, Any]]:
    state = _load()
    rows: list[dict[str, Any]] = []
    for wid, row in (state.get("by_gallery_worker") or {}).items():
        if not isinstance(row, dict):
            continue
        rows.append({
            "gallery_worker_id": wid,
            "worker_name": row.get("worker_name"),
            "employee_code": row.get("employee_code"),
            "contractor_name": row.get("contractor_name"),
            "aliases": row.get("aliases") or [],
            "updated_at": row.get("updated_at"),
        })
    return rows


def bind_patrol_identity(
    *,
    gallery_worker_id: str,
    worker_name: str,
    employee_code: str,
    contractor_name: str,
    alias_keys: list[str],
) -> dict[str, Any]:
    wid = gallery_worker_id.strip()
    if not wid:
        raise ValueError("missing_gallery_worker_id")
    now = time.time()
    aliases = sorted({
        normalize_alias_key(k)
        for k in alias_keys
        if k and k.strip()
    })
    with _lock:
        state = _load()
        by_gallery = state.setdefault("by_gallery_worker", {})
        alias_map = state.setdefault("alias_to_gallery", {})
        prev = by_gallery.get(wid) if isinstance(by_gallery.get(wid), dict) else {}
        merged_aliases = sorted(set([*(prev.get("aliases") or []), *aliases, wid]))
        row = {
            "gallery_worker_id": wid,
            "worker_name": worker_name.strip(),
            "employee_code": employee_code.strip(),
            "contractor_name": contractor_name.strip(),
            "aliases": merged_aliases,
            "updated_at": now,
        }
        by_gallery[wid] = row
        for alias in merged_aliases:
            alias_map[alias] = wid
        alias_map[wid] = wid
        _save(state)
    return row


def clear_patrol_identity_bindings() -> int:
    global _state
    with _lock:
        count = len((_state or {}).get("by_gallery_worker") or {})
        _state = _empty()
        _save(_state)
    return count
