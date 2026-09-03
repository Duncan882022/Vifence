"""Module 05 — lịch sử xuất hiện theo master_id × camera (blocks popup)."""

from __future__ import annotations

import json
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
APPEARANCE_FILE = DATA_DIR / "patrol_appearance_log.json"

# Đóng block nếu không thấy lại sau khoảng này (giây).
SEGMENT_GAP_SECONDS = 45.0

_lock = threading.Lock()
_state: dict[str, Any] | None = None


def _empty() -> dict[str, Any]:
    return {"version": 1, "segments": [], "open": {}}


def _load() -> dict[str, Any]:
    global _state
    if _state is not None:
        return _state
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if APPEARANCE_FILE.exists():
        try:
            _state = json.loads(APPEARANCE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            _state = _empty()
    else:
        _state = _empty()
    _state.setdefault("version", 1)
    _state.setdefault("segments", [])
    _state.setdefault("open", {})
    return _state


def _save(state: dict[str, Any]) -> None:
    APPEARANCE_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _segment_key(master_id: str, camera_id: str) -> str:
    return f"{master_id.strip().upper()}|{camera_id.strip()}"


def _today_iso(ts: float | None = None) -> str:
    """Ngày lịch VN (cắt 0h) — khớp ``db.today_vn`` và filter ngày của FE.

    Giờ local của máy chủ không phải lúc nào cũng là UTC+7 (container thường chạy
    UTC): lấy theo local thì các lần xuất hiện từ 0h đến 7h sáng bị dồn sang ngày
    hôm trước, lệch hẳn với thẻ sự kiện đọc từ SQLite.
    """
    vn = timezone(timedelta(hours=7))
    return datetime.fromtimestamp(ts or time.time(), tz=vn).strftime("%Y-%m-%d")


def touch_appearance(
    *,
    master_id: str,
    camera_id: str,
    zone_id: str | None = None,
    event_id: str | None = None,
    tier: str = "object",
    now: float | None = None,
) -> None:
    """Mở hoặc kéo dài block xuất hiện cho master_id trên camera."""
    mid = (master_id or "").strip()
    cam = (camera_id or "").strip()
    if not mid or mid == "unknown" or not cam:
        return
    ts = now if now is not None else time.time()
    key = _segment_key(mid, cam)

    with _lock:
        state = _load()
        segments: list[dict[str, Any]] = state.setdefault("segments", [])
        open_map: dict[str, str] = state.setdefault("open", {})
        seg_id = open_map.get(key)
        seg: dict[str, Any] | None = None
        if seg_id:
            for row in reversed(segments):
                if row.get("id") == seg_id:
                    seg = row
                    break
        if seg is not None:
            last = float(seg.get("ended_at") or seg.get("started_at") or ts)
            if ts - last > SEGMENT_GAP_SECONDS:
                seg = None
                open_map.pop(key, None)

        if seg is None:
            seg_id = uuid.uuid4().hex[:12]
            seg = {
                "id": seg_id,
                "master_id": mid.upper() if mid.lower().startswith("sgc-") else mid,
                "camera_id": cam,
                "zone_id": zone_id,
                "tier": tier,
                "started_at": ts,
                "ended_at": ts,
                "event_id": event_id,
                "date": _today_iso(ts),
            }
            segments.append(seg)
            open_map[key] = seg_id
        else:
            seg["ended_at"] = ts
            if event_id:
                seg["event_id"] = event_id
            if zone_id:
                seg["zone_id"] = zone_id
            seg["tier"] = tier

        if len(segments) > 4000:
            state["segments"] = segments[-3000:]
        _save(state)


def list_appearances(
    master_id: str,
    *,
    date: str | None = None,
) -> list[dict[str, Any]]:
    mid = (master_id or "").strip()
    if not mid:
        return []
    target_date = date or _today_iso()
    mid_upper = mid.upper()
    mid_lower = mid.lower()
    with _lock:
        state = _load()
        rows = state.get("segments") or []
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if str(row.get("date") or "") != target_date:
            continue
        rm = str(row.get("master_id") or "")
        if rm.upper() != mid_upper and rm.lower() != mid_lower and rm != mid:
            continue
        out.append(dict(row))
    out.sort(key=lambda r: float(r.get("started_at") or 0))
    return out


def clear_patrol_appearances() -> int:
    global _state
    with _lock:
        count = len((_state or {}).get("segments") or [])
        _state = _empty()
        _save(_state)
    return count
