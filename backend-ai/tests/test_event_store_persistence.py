"""Ghi sự kiện — thẻ đọc lại phải khớp với ảnh đã lưu.

Dedup giữ lại thẻ đầu tiên và chỉ thay ảnh JPG. Trước đây dòng JSONL không được
ghi lại, nên sau khi refresh thì ảnh là khung mới còn bbox/độ tin cậy trên thẻ
vẫn là của khung đầu — ROI vẽ trên ảnh sự kiện lệch hẳn khỏi người trong ảnh.
Đồng thời ``list_events(date=...)`` nối bản đĩa với bản RAM nên mỗi sự kiện ra
hai thẻ, và thẻ được giữ lại là bản đĩa cũ.
"""

from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import events as events_module  # noqa: E402
from app.events import EventStore, collapse_events_by_id  # noqa: E402
from app.schemas import ViolationEvent, event_day_vn  # noqa: E402


def _event(event_id: str, *, created_at: float, confidence: float = 0.5) -> ViolationEvent:
    return ViolationEvent(
        id=event_id,
        behavior="no_helmet",
        scenario_id="ATLD-001",
        scenario_name="Không đội mũ",
        violation_type="ppe",
        group="ATLĐ",
        confidence=confidence,
        bbox=[0.0, 0.0, 10.0, 10.0],
        created_at=created_at,
        event_date=event_day_vn(created_at),
        camera_id="A-03",
        dedup_key=f"A-03|ATLD-001|{event_id}",
    )


class CollapseByIdTests(unittest.TestCase):
    def test_keeps_last_row_per_id(self) -> None:
        first = _event("evt1", created_at=1000.0, confidence=0.4)
        refreshed = _event("evt1", created_at=1000.0, confidence=0.9)
        other = _event("evt2", created_at=1001.0)

        rows = collapse_events_by_id([first, other, refreshed])

        self.assertEqual({row.id for row in rows}, {"evt1", "evt2"})
        kept = next(row for row in rows if row.id == "evt1")
        self.assertEqual(kept.confidence, 0.9)


class EventStoreDiskTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = Path(__file__).resolve().parent / "_tmp_events"
        self._prev_events_dir = events_module.EVENTS_DIR
        self._prev_snapshot_dir = events_module.SNAPSHOT_DIR
        events_module.EVENTS_DIR = self._tmp / "events"
        events_module.SNAPSHOT_DIR = self._tmp / "snapshots"
        events_module.EVENTS_DIR.mkdir(parents=True, exist_ok=True)
        events_module.SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        events_module.EVENTS_DIR = self._prev_events_dir
        events_module.SNAPSHOT_DIR = self._prev_snapshot_dir
        for path in sorted(self._tmp.rglob("*"), reverse=True):
            path.unlink() if path.is_file() else path.rmdir()
        if self._tmp.exists():
            self._tmp.rmdir()

    def test_refresh_row_replaces_stale_disk_row(self) -> None:
        store = EventStore()
        now = time.time()
        day = event_day_vn(now)

        original = _event("evt-refresh", created_at=now, confidence=0.40)
        store._append_to_disk(original)

        refreshed = original.model_copy(deep=True)
        refreshed.confidence = 0.93
        refreshed.bbox = [40.0, 40.0, 90.0, 90.0]
        store._append_to_disk(refreshed)

        rows = store.list_events(date=day)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].confidence, 0.93)
        self.assertEqual(rows[0].bbox, [40.0, 40.0, 90.0, 90.0])

    def test_list_events_by_date_does_not_duplicate_ram_and_disk(self) -> None:
        store = EventStore()
        now = time.time()
        day = event_day_vn(now)

        event = _event("evt-dup", created_at=now)
        store._events.appendleft(event)
        store._append_to_disk(event)

        rows = store.list_events(date=day)

        self.assertEqual([row.id for row in rows], ["evt-dup"])

    def test_ram_state_wins_over_older_disk_row(self) -> None:
        store = EventStore()
        now = time.time()
        day = event_day_vn(now)

        stale = _event("evt-live", created_at=now, confidence=0.30)
        store._append_to_disk(stale)

        live = stale.model_copy(deep=True)
        live.confidence = 0.88
        store._events.appendleft(live)

        rows = store.list_events(date=day)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].confidence, 0.88)

    def test_refresh_persist_is_throttled(self) -> None:
        store = EventStore()
        event = _event("evt-throttle", created_at=time.time())
        store._events.appendleft(event)

        store._persist_refresh(event)
        store._persist_refresh(event)
        store._persist_refresh(event)

        path = events_module._daily_events_file(event.event_date or "")
        lines = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertEqual(len(lines), 1)

    def test_compact_rewrites_day_file_to_one_row_per_event(self) -> None:
        store = EventStore()
        now = time.time()
        day = event_day_vn(now)
        event = _event("evt-compact", created_at=now, confidence=0.2)

        for step in range(5):
            row = event.model_copy(deep=True)
            row.confidence = 0.2 + step / 10.0
            store._append_to_disk(row)

        store._compact_daily_file(day)

        path = events_module._daily_events_file(day)
        lines = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertEqual(len(lines), 1)
        self.assertAlmostEqual(ViolationEvent.model_validate_json(lines[0]).confidence, 0.6)


class VietnamDayBucketTests(unittest.TestCase):
    def test_early_morning_vn_stays_on_same_calendar_day(self) -> None:
        # 2026-03-03 03:30 giờ VN == 2026-03-02 20:30 UTC.
        ts = 1_772_483_400.0
        self.assertEqual(event_day_vn(ts), "2026-03-03")

    def test_matches_patrol_store_day_bucket(self) -> None:
        from app import patrol_appearance_store

        ts = time.time()
        self.assertEqual(event_day_vn(ts), patrol_appearance_store._today_iso(ts))


if __name__ == "__main__":
    unittest.main()
