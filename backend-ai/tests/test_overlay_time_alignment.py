"""Backend chọn lại overlay theo khung hình FE đang chiếu.

HLS đưa hình tới người xem chậm vài giây so với lúc AI chạy. Nếu cứ trả bbox mới
nhất thì hộp đi trước người đúng bằng độ trễ buffer — thấy rõ nhất khi có người
đi ngang khung hình. FE báo lên mốc khung hình đang chiếu, backend tìm lại
overlay của chính khung đó trong lịch sử rồi gửi về.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.overlay_client_clock import (  # noqa: E402
    CLIENT_CLOCK_STALE_SEC,
    DetectionsClientClock,
)
from app.vms_worker import CameraVmsWorker  # noqa: E402
from app.websocket_server import build_detections_ws_payload  # noqa: E402


def _entry(wallclock_ms: float, label: str) -> dict:
    return {
        "width": 1280,
        "height": 720,
        "detections": [{"behavior": "person", "label": label, "bbox": [0, 0, 10, 10]}],
        "roi_zones": [],
        "metrics": {},
        "updated_at": wallclock_ms / 1000.0,
        "source_pts_sec": 0.0,
        "frame_wallclock_ms": wallclock_ms,
    }


class SelectOverlayEntryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.history = [_entry(10_000 + step * 100, f"t{step}") for step in range(60)]
        self.latest = self.history[-1]

    def _label(self, entry: dict) -> str:
        return entry["detections"][0]["label"]

    def test_without_requested_time_returns_latest(self) -> None:
        chosen, mode, drift = CameraVmsWorker._select_overlay_entry(
            self.latest, self.history, None,
        )
        self.assertEqual(mode, "latest")
        self.assertIsNone(drift)
        self.assertEqual(self._label(chosen), "t59")

    def test_picks_frame_matching_delayed_playhead(self) -> None:
        # Người xem đang ở khung t20; AI đã chạy tới t59.
        chosen, mode, drift = CameraVmsWorker._select_overlay_entry(
            self.latest, self.history, 12_000.0,
        )
        self.assertEqual(mode, "aligned")
        self.assertEqual(self._label(chosen), "t20")
        self.assertEqual(drift, 0)

    def test_never_picks_frame_newer_than_playhead(self) -> None:
        # Mốc rơi giữa t20 và t21 — lấy t21 là vẽ tương lai lên khung quá khứ.
        chosen, _mode, _drift = CameraVmsWorker._select_overlay_entry(
            self.latest, self.history, 12_040.0,
        )
        self.assertEqual(self._label(chosen), "t20")

    def test_playhead_older_than_history_falls_back_to_latest(self) -> None:
        chosen, mode, drift = CameraVmsWorker._select_overlay_entry(
            self.latest, self.history, 5_000.0,
        )
        self.assertEqual(mode, "latest")
        self.assertIsNone(drift)
        self.assertEqual(self._label(chosen), "t59")

    def test_empty_history_falls_back_to_latest(self) -> None:
        chosen, mode, _drift = CameraVmsWorker._select_overlay_entry(
            self.latest, [], 12_000.0,
        )
        self.assertEqual(mode, "latest")
        self.assertEqual(self._label(chosen), "t59")

    def test_history_span_reported_in_milliseconds(self) -> None:
        self.assertEqual(CameraVmsWorker._overlay_history_span_ms(self.history), 5_900)
        self.assertEqual(CameraVmsWorker._overlay_history_span_ms(self.history[:1]), 0)


class ClientClockTests(unittest.TestCase):
    def test_extrapolates_between_reports(self) -> None:
        clock = DetectionsClientClock()
        base = 1_800_000_000.0
        self.assertTrue(clock.update(base * 1000.0 - 5_000.0, now=base))

        # Một giây sau, khung hình đang chiếu cũng tiến đúng một giây.
        self.assertAlmostEqual(
            clock.display_wallclock_ms(now=base + 1.0),
            base * 1000.0 - 4_000.0,
            places=3,
        )

    def test_stale_report_is_dropped(self) -> None:
        clock = DetectionsClientClock()
        base = 1_800_000_000.0
        clock.update(base * 1000.0 - 5_000.0, now=base)
        self.assertIsNone(clock.display_wallclock_ms(now=base + CLIENT_CLOCK_STALE_SEC + 1))

    def test_null_resets_to_unsynced(self) -> None:
        clock = DetectionsClientClock()
        base = 1_800_000_000.0
        clock.update(base * 1000.0, now=base)
        clock.update(None, now=base)
        self.assertIsNone(clock.display_wallclock_ms(now=base))

    def test_rejects_absurd_client_clock(self) -> None:
        clock = DetectionsClientClock()
        base = 1_800_000_000.0
        self.assertFalse(clock.update(base * 1000.0 - 3_600_000.0, now=base))
        self.assertFalse(clock.update("not-a-number", now=base))
        self.assertFalse(clock.update(0, now=base))
        self.assertIsNone(clock.display_wallclock_ms(now=base))


class PayloadSyncFieldsTests(unittest.TestCase):
    def test_payload_carries_alignment_metadata(self) -> None:
        overlay = {
            **_entry(1_700_000_000_000, "t0"),
            "overlay_sync": "aligned",
            "overlay_history_span_ms": 5_900,
            "requested_at_ms": 1_700_000_000_200.0,
            "overlay_drift_ms": 200,
        }
        payload = build_detections_ws_payload("HC-01", overlay, stream_online=True)

        self.assertEqual(payload["overlay_sync"], "aligned")
        self.assertEqual(payload["overlay_history_span_ms"], 5_900)
        self.assertEqual(payload["requested_at_ms"], 1_700_000_000_200.0)
        self.assertEqual(payload["overlay_drift_ms"], 200)

    def test_defaults_to_latest_when_backend_did_not_align(self) -> None:
        payload = build_detections_ws_payload("A-03", _entry(1_000, "t0"), stream_online=True)

        self.assertEqual(payload["overlay_sync"], "latest")
        self.assertNotIn("requested_at_ms", payload)


if __name__ == "__main__":
    unittest.main()
