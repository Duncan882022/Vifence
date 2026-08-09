"""Cửa sổ train cố định — mặc định 2 lần/ngày (giờ local VN)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def parse_schedule_hours(raw: str) -> list[int]:
    hours: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        hour = int(part)
        if 0 <= hour <= 23:
            hours.append(hour)
    return sorted(set(hours))


def local_datetime(ts: float, tz_offset_hours: int) -> datetime:
    tz = timezone(timedelta(hours=tz_offset_hours))
    return datetime.fromtimestamp(ts, tz=tz)


def in_schedule_window(
    ts: float,
    *,
    schedule_hours: list[int],
    tz_offset_hours: int,
    window_minutes: float,
) -> bool:
    if not schedule_hours:
        return True
    local = local_datetime(ts, tz_offset_hours)
    minute_of_day = local.hour * 60 + local.minute
    window = max(1, int(window_minutes))
    for hour in schedule_hours:
        start = hour * 60
        end = start + window
        if start <= minute_of_day < end:
            return True
    return False


def next_schedule_window(
    ts: float,
    *,
    schedule_hours: list[int],
    tz_offset_hours: int,
) -> dict[str, int | str] | None:
    """Trả slot kế tiếp — dùng cho /training/status."""
    if not schedule_hours:
        return None
    local = local_datetime(ts, tz_offset_hours)
    minute_of_day = local.hour * 60 + local.minute
    for hour in schedule_hours:
        if hour * 60 > minute_of_day:
            return {"hour_local": hour, "label": f"{hour:02d}:00"}
    return {"hour_local": schedule_hours[0], "label": f"{schedule_hours[0]:02d}:00 (ngày mai)"}
