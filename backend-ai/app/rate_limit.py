"""In-memory rate limit — đủ cho single-process POC."""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status

_lock = Lock()
_buckets: dict[str, list[float]] = defaultdict(list)


def rate_limit(request: Request, *, key: str, max_calls: int, window_sec: float) -> None:
    now = time.monotonic()
    client = request.client.host if request.client else "unknown"
    bucket_key = f"{key}:{client}"
    with _lock:
        hits = [t for t in _buckets[bucket_key] if now - t < window_sec]
        if len(hits) >= max_calls:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limited")
        hits.append(now)
        _buckets[bucket_key] = hits
