"""Bus thông báo overlay — worker thread → WebSocket subscribers.

FE trước đây poll ``GET /stream/{cam}/detections`` mỗi 450ms: bbox nhảy bậc theo
nhịp poll và tải backend tăng tuyến tính theo số người xem.

Bus này cho phép push: AI thread gọi :func:`notify` sau mỗi lần cập nhật overlay,
các WebSocket đang mở được đánh thức và tự đọc snapshot mới nhất từ worker.

Ngữ nghĩa "latest state": subscriber luôn lấy trạng thái mới nhất, không xếp hàng
snapshot cũ. Overlay là dữ liệu tức thời — gửi bù frame quá khứ vô nghĩa và chỉ
làm bbox trễ thêm.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Dict, Set

logger = logging.getLogger(__name__)

_loop: asyncio.AbstractEventLoop | None = None
_lock = threading.Lock()
_subscribers: Dict[str, Set[asyncio.Event]] = {}
_revisions: Dict[str, int] = {}


def bind_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Ghi nhận event loop chính — gọi một lần lúc startup."""
    global _loop
    _loop = loop


def get_revision(camera_id: str) -> int:
    with _lock:
        return _revisions.get(camera_id, 0)


def _wake_subscribers(camera_id: str) -> None:
    """Chạy trên event loop thread — an toàn khi đụng asyncio.Event."""
    with _lock:
        events = list(_subscribers.get(camera_id, ()))
    for event in events:
        event.set()


def notify(camera_id: str) -> None:
    """Báo có overlay mới. Gọi được từ worker thread bất kỳ."""
    with _lock:
        _revisions[camera_id] = _revisions.get(camera_id, 0) + 1
        has_subscribers = bool(_subscribers.get(camera_id))

    if not has_subscribers or _loop is None or _loop.is_closed():
        return

    try:
        _loop.call_soon_threadsafe(_wake_subscribers, camera_id)
    except RuntimeError:
        # Loop đang đóng (shutdown) — bỏ qua.
        pass


def subscribe(camera_id: str) -> asyncio.Event:
    event = asyncio.Event()
    with _lock:
        _subscribers.setdefault(camera_id, set()).add(event)
    return event


def unsubscribe(camera_id: str, event: asyncio.Event) -> None:
    with _lock:
        subs = _subscribers.get(camera_id)
        if not subs:
            return
        subs.discard(event)
        if not subs:
            _subscribers.pop(camera_id, None)


def subscriber_count(camera_id: str) -> int:
    with _lock:
        return len(_subscribers.get(camera_id, ()))
