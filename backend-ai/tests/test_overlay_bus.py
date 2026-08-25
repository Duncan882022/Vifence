"""Overlay bus — đánh thức WS subscriber từ AI thread (latest-state)."""
from __future__ import annotations

import asyncio
import sys
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import overlay_bus  # noqa: E402


class TestOverlayBus(unittest.TestCase):
    def setUp(self):
        # Bus là module-level state — dọn giữa các test.
        overlay_bus._subscribers.clear()  # noqa: SLF001
        overlay_bus._revisions.clear()  # noqa: SLF001
        overlay_bus._loop = None  # noqa: SLF001

    def test_revision_tang_moi_lan_notify(self):
        self.assertEqual(overlay_bus.get_revision("HC-02"), 0)
        overlay_bus.notify("HC-02")
        overlay_bus.notify("HC-02")
        self.assertEqual(overlay_bus.get_revision("HC-02"), 2)

    def test_revision_tach_theo_camera(self):
        overlay_bus.notify("HC-01")
        self.assertEqual(overlay_bus.get_revision("HC-01"), 1)
        self.assertEqual(overlay_bus.get_revision("HC-02"), 0)

    def test_notify_khong_loi_khi_chua_co_subscriber(self):
        overlay_bus.notify("HC-99")
        self.assertEqual(overlay_bus.get_revision("HC-99"), 1)

    def test_subscribe_va_unsubscribe(self):
        async def run():
            event = overlay_bus.subscribe("HC-02")
            self.assertEqual(overlay_bus.subscriber_count("HC-02"), 1)
            overlay_bus.unsubscribe("HC-02", event)
            self.assertEqual(overlay_bus.subscriber_count("HC-02"), 0)

        asyncio.run(run())

    def test_notify_tu_worker_thread_danh_thuc_subscriber(self):
        """AI thread gọi notify → coroutine đang chờ phải tỉnh."""

        async def run():
            overlay_bus.bind_event_loop(asyncio.get_running_loop())
            event = overlay_bus.subscribe("HC-02")

            # Mô phỏng AI thread của CameraVmsWorker.
            threading.Timer(0.05, lambda: overlay_bus.notify("HC-02")).start()

            await asyncio.wait_for(event.wait(), timeout=2.0)
            self.assertTrue(event.is_set())
            self.assertEqual(overlay_bus.get_revision("HC-02"), 1)

            overlay_bus.unsubscribe("HC-02", event)

        asyncio.run(run())

    def test_nhieu_subscriber_deu_duoc_danh_thuc(self):
        """Nhiều người xem cùng camera — tất cả phải nhận, không ai bị bỏ sót."""

        async def run():
            overlay_bus.bind_event_loop(asyncio.get_running_loop())
            events = [overlay_bus.subscribe("HC-01") for _ in range(3)]
            self.assertEqual(overlay_bus.subscriber_count("HC-01"), 3)

            threading.Timer(0.05, lambda: overlay_bus.notify("HC-01")).start()
            await asyncio.wait_for(
                asyncio.gather(*(e.wait() for e in events)),
                timeout=2.0,
            )

            for event in events:
                self.assertTrue(event.is_set())
                overlay_bus.unsubscribe("HC-01", event)

        asyncio.run(run())

    def test_notify_khong_danh_thuc_camera_khac(self):
        async def run():
            overlay_bus.bind_event_loop(asyncio.get_running_loop())
            hc01 = overlay_bus.subscribe("HC-01")
            hc02 = overlay_bus.subscribe("HC-02")

            threading.Timer(0.05, lambda: overlay_bus.notify("HC-01")).start()
            await asyncio.wait_for(hc01.wait(), timeout=2.0)

            self.assertTrue(hc01.is_set())
            self.assertFalse(hc02.is_set())

            overlay_bus.unsubscribe("HC-01", hc01)
            overlay_bus.unsubscribe("HC-02", hc02)

        asyncio.run(run())

    def test_khong_mat_notify_giua_clear_va_wait(self):
        """Vòng lặp WS: clear() → đọc revision → wait. Notify xen giữa không mất."""

        async def run():
            overlay_bus.bind_event_loop(asyncio.get_running_loop())
            event = overlay_bus.subscribe("HC-02")
            last_revision = overlay_bus.get_revision("HC-02")

            event.clear()
            # Notify xảy ra ngay sau clear, trước khi kịp await.
            overlay_bus.notify("HC-02")
            await asyncio.sleep(0)  # nhường loop chạy call_soon_threadsafe

            revision = overlay_bus.get_revision("HC-02")
            self.assertNotEqual(revision, last_revision)

            # Dù revision đã đổi, event cũng được set nên vòng wait kế không kẹt.
            await asyncio.wait_for(event.wait(), timeout=1.0)

            overlay_bus.unsubscribe("HC-02", event)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
