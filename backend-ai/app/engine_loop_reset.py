"""Reset track/debouncer tất cả engine VMS — sau loop video hoặc DELETE /events."""

from __future__ import annotations

from typing import Callable

_handlers: list[Callable[[str | None], None]] = []


def register_engine_reset(handler: Callable[[str | None], None]) -> None:
    _handlers.append(handler)


def reset_all_engines(camera_id: str | None = None) -> None:
    """camera_id=None → reset mọi camera (audit mới)."""
    for handler in _handlers:
        handler(camera_id)


def _bind_engine(engine: object) -> None:
    reset = getattr(engine, "reset_camera", None)
    if not callable(reset):
        return

    def _handler(cam_id: str | None) -> None:
        if cam_id is None:
            store = getattr(engine, "_tracks", {})
            for cid in list(store.keys()):
                reset(cid)
            return
        reset(cam_id)

    register_engine_reset(_handler)
