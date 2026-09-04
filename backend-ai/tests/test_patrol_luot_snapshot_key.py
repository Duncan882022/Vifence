"""Mỗi lượt gặp một file JPG riêng.

Trước đây mọi lượt của cùng một người ghi chung `{subject}.jpg`, nên popup
"Lịch sử xuất hiện" hiện N dòng khác giờ mà cùng một tấm ảnh — tấm cuối cùng
ghi đè hết các tấm trước. Đo trên máy thật: tk-0000014 có 3 lượt / 1 ảnh,
tk-0000011 có 2 lượt / 1 ảnh.
"""

from __future__ import annotations

import unittest

from app.patrol.aggregator import session_store
from app.patrol.aggregator.engine import _apply_encounter_split
from app.patrol.aggregator.flush import _session_luot_key
from app.patrol.aggregator.types import TrackSession


def _session(**kw) -> TrackSession:
    base = {
        "camera_id": "HC-01",
        "track_id": "ptk-1",
        "started_at": 1000.0,
        "last_seen_at": 1000.0,
        "subject_id": "obj-20260904-0001",
        "session_id": "sess-HC-01-abc",
    }
    base.update(kw)
    return TrackSession(**base)


class LuotSnapshotKeyTests(unittest.TestCase):
    def test_key_is_stable_within_one_luot(self) -> None:
        """Chụp lại frame đẹp hơn trong cùng lượt phải ghi đè đúng file lượt đó."""
        s = _session()
        first = _session_luot_key(s)
        self.assertEqual(first, _session_luot_key(s))
        self.assertEqual(first, _session_luot_key(s))

    def test_encounter_split_gives_new_key(self) -> None:
        """Lượt gặp mới trên cùng camera → file JPG mới."""
        s = _session()
        first = _session_luot_key(s)
        _apply_encounter_split(s, 2000.0)
        self.assertIsNone(s.luot_key)
        self.assertNotEqual(first, _session_luot_key(s))

    def test_keys_never_collide_across_subjects(self) -> None:
        keys = set()
        for i in range(20):
            keys.add(_session_luot_key(_session(track_id=f"ptk-{i}")))
        self.assertEqual(len(keys), 20)

    def test_key_never_equals_card_luot(self) -> None:
        """`CARD_SNAPSHOT_LUOT = 0` là tên file kiểu thẻ — lượt không được trùng."""
        from app.patrol import sink

        for _ in range(5):
            self.assertNotEqual(_session_luot_key(_session()), sink.CARD_SNAPSHOT_LUOT)

    def test_reclaimed_same_encounter_keeps_file(self) -> None:
        """Track mất rồi bắt lại trong cùng lượt vẫn ghi vào ảnh của lượt đó."""
        from app.patrol.aggregator import lost_track_memory

        lost_track_memory.reset()
        # Thẻ `obj-*` cố tình không được nối lại bằng IoU — phải dùng thẻ Người.
        s = _session(bbox=(10.0, 10.0, 60.0, 160.0), subject_id="tk-0000001")
        key = _session_luot_key(s)
        s.appearance_row_id = 7
        lost_track_memory.stash_session(s, embedding=None)

        revived = _session(track_id="ptk-2")
        slot = lost_track_memory.try_reclaim("HC-01", bbox=s.bbox, embedding=None, now=1002.0)
        self.assertIsNotNone(slot)
        lost_track_memory.apply_reclaim(revived, slot, now=1002.0)
        self.assertEqual(revived.luot_key, key)

    def test_next_luot_key_is_monotonic(self) -> None:
        a = session_store.next_luot_key()
        b = session_store.next_luot_key()
        self.assertGreater(b, a)


if __name__ == "__main__":
    unittest.main()
