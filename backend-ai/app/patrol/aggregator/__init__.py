"""Event Aggregator — gom quan sát theo track trước khi ghi SQLite.

Bật qua env ``PATROL_USE_AGGREGATOR=1``. Khi tắt, ``sink.record_observation`` giữ luồng cũ.
"""

from .engine import finalize_track, ingest_observation, reset_sessions

__all__ = ["ingest_observation", "finalize_track", "reset_sessions"]
