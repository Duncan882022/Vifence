"""Module 05 — alias tk-* / obj-* → gallery worker p-* (chỉ khi có hồ sơ HR)."""

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
    """Chuẩn hoá alias — legacy sgc-* → tk-*."""
    from .patrol_ids import normalize_track_id

    k = (key or "").strip()
    if not k:
        return k
    normalized = normalize_track_id(k)
    return normalized or k


def _resolve_alias_to_gallery_raw(alias: str) -> str | None:
    """Map alias → gallery id từ file binding, không kiểm tra HR."""
    key = normalize_alias_key(alias)
    if not key:
        return None
    wid = (_load().get("alias_to_gallery") or {}).get(key)
    return str(wid).strip() if wid else None


def _get_binding_row(gallery_id: str) -> dict[str, Any] | None:
    wid = (gallery_id or "").strip()
    if not wid:
        return None
    row = (_load().get("by_gallery_worker") or {}).get(wid)
    return row if isinstance(row, dict) else None


def _gallery_binding_has_hr(gallery_id: str) -> bool:
    """Gallery binding chỉ hợp lệ khi SQLite còn hồ sơ HR status=identified."""
    row = _get_binding_row(gallery_id)
    if not row:
        return False
    code = str(row.get("employee_code") or "").strip()
    if not code:
        return False
    try:
        from .patrol import identity as patrol_identity

        return patrol_identity.hr_profile_for_employee_code(code) is not None
    except Exception:  # noqa: BLE001
        return False


def lookup_gallery_worker(alias: str) -> str | None:
    key = normalize_alias_key(alias)
    if not key:
        return None
    wid = _resolve_alias_to_gallery_raw(key)
    if not wid or not _gallery_binding_has_hr(wid):
        return None
    return wid


def lookup_gallery_worker_raw(alias: str) -> str | None:
    """Map alias → gallery id — không yêu cầu HR identified (draft gallery OK)."""
    key = normalize_alias_key(alias)
    if not key:
        return None
    wid = _resolve_alias_to_gallery_raw(key)
    return str(wid).strip() if wid else None


def lookup_patrol_binding_row(gallery_worker_id: str) -> dict[str, Any] | None:
    """Row binding gallery — kể cả draft chưa có HR identified."""
    wid = (gallery_worker_id or "").strip()
    if not wid:
        return None
    row = (_load().get("by_gallery_worker") or {}).get(wid)
    return row if isinstance(row, dict) else None


def lookup_patrol_identity_any(alias: str) -> dict[str, Any] | None:
    """Binding gallery + metadata — draft hoặc identified."""
    wid = lookup_gallery_worker_raw(alias)
    if not wid:
        return None
    return lookup_patrol_binding_row(wid)


def lookup_patrol_identity(alias: str) -> dict[str, Any] | None:
    wid = lookup_gallery_worker(alias)
    if not wid:
        return None
    row = (_load().get("by_gallery_worker") or {}).get(wid)
    return row if isinstance(row, dict) else None


def list_patrol_identity_bindings() -> list[dict[str, Any]]:
    state = _load()
    rows: list[dict[str, Any]] = []
    alias_map = state.get("alias_to_gallery") or {}
    for wid, row in (state.get("by_gallery_worker") or {}).items():
        if not isinstance(row, dict):
            continue
        canonical_aliases = sorted({
            alias
            for alias, owner in alias_map.items()
            if str(owner).strip() == str(wid).strip()
        })
        rows.append({
            "gallery_worker_id": wid,
            "worker_name": row.get("worker_name"),
            "employee_code": row.get("employee_code"),
            "contractor_name": row.get("contractor_name"),
            "aliases": canonical_aliases or (row.get("aliases") or []),
            "updated_at": row.get("updated_at"),
        })
    return rows


def prune_stale_gallery_bindings() -> dict[str, Any]:
    """Gỡ gallery worker / alias khi không còn hồ sơ HR identified."""
    removed_workers: list[str] = []
    removed_aliases: list[str] = []
    with _lock:
        state = _load()
        by_gallery = state.setdefault("by_gallery_worker", {})
        alias_map = state.setdefault("alias_to_gallery", {})
        for wid in list(by_gallery.keys()):
            if _gallery_binding_has_hr(wid):
                continue
            row = by_gallery.pop(wid, {})
            removed_workers.append(wid)
            aliases = row.get("aliases") or [] if isinstance(row, dict) else []
            for alias in aliases:
                if alias_map.get(alias) == wid:
                    alias_map.pop(alias, None)
                    removed_aliases.append(alias)
        if removed_workers:
            _save(state)
    return {
        "pruned_gallery_workers": removed_workers,
        "pruned_aliases": removed_aliases,
        "pruned_count": len(removed_workers),
    }


def repair_patrol_identity_bindings() -> dict[str, Any]:
    """Đồng bộ aliases[] từ alias_to_gallery — gỡ binding không còn HR."""
    gallery_out = prune_stale_gallery_bindings()
    with _lock:
        state = _load()
        by_gallery = state.setdefault("by_gallery_worker", {})
        alias_map = state.setdefault("alias_to_gallery", {})
        repaired = 0
        for wid, row in list(by_gallery.items()):
            if not isinstance(row, dict):
                continue
            canonical = sorted({
                alias for alias, owner in alias_map.items()
                if str(owner).strip() == str(wid).strip()
            })
            if canonical != sorted(row.get("aliases") or []):
                row["aliases"] = canonical
                by_gallery[wid] = row
                repaired += 1
        _save(state)
    return {
        "repaired": repaired,
        "workers": len(by_gallery),
        **gallery_out,
    }


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

        for alias in merged_aliases:
            for other_wid, other_row in list(by_gallery.items()):
                if other_wid == wid or not isinstance(other_row, dict):
                    continue
                other_aliases = other_row.get("aliases") or []
                if alias not in other_aliases:
                    continue
                other_row["aliases"] = [a for a in other_aliases if a != alias]
                by_gallery[other_wid] = other_row
            alias_map[alias] = wid

        row = {
            "gallery_worker_id": wid,
            "worker_name": worker_name.strip(),
            "employee_code": employee_code.strip(),
            "contractor_name": contractor_name.strip(),
            "aliases": merged_aliases,
            "updated_at": now,
        }
        by_gallery[wid] = row
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


def unbind_patrol_identity(gallery_worker_id: str) -> bool:
    """Gỡ một gallery worker và mọi alias trỏ tới nó."""
    wid = gallery_worker_id.strip()
    if not wid:
        return False
    with _lock:
        state = _load()
        by_gallery = state.get("by_gallery_worker") or {}
        row = by_gallery.pop(wid, None)
        if row is None:
            return False
        alias_map = state.setdefault("alias_to_gallery", {})
        for alias in row.get("aliases") or []:
            if alias_map.get(alias) == wid:
                alias_map.pop(alias, None)
        if alias_map.get(wid) == wid:
            alias_map.pop(wid, None)
        _save(state)
    return True
