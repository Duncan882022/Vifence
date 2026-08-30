"""Event Aggregator — gom quan sát theo track trước khi ghi SQLite.

Mặc định bật (`PATROL_USE_AGGREGATOR=1`). Tắt bằng env để dùng luồng legacy.
"""

from .engine import finalize_track, ingest_observation, reset_sessions

__all__ = ["ingest_observation", "finalize_track", "reset_sessions"]
