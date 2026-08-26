"""Unit tests — nhịp retry nguồn + chế độ ưu tiên live của VMS worker."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import Settings  # noqa: E402
from app.vms_worker import (  # noqa: E402
    LOCAL_SOURCE_RETRY_SEC,
    SOURCE_RETRY_FAST_ATTEMPTS,
    SOURCE_RETRY_MAX_SEC,
    _source_retry_delay,
)


class TestSourceRetryBackoff(unittest.TestCase):
    LOCAL = "rtsp://127.0.0.1:8554/hc-02"

    def test_fast_window_keeps_base_delay(self):
        """Mũ vừa bật phải bắt được ngay — chưa giãn nhịp trong cửa sổ đầu."""
        for attempt in range(SOURCE_RETRY_FAST_ATTEMPTS + 1):
            self.assertEqual(
                _source_retry_delay(self.LOCAL, attempt), LOCAL_SOURCE_RETRY_SEC,
            )

    def test_backoff_grows_after_fast_window(self):
        first = _source_retry_delay(self.LOCAL, SOURCE_RETRY_FAST_ATTEMPTS + 1)
        second = _source_retry_delay(self.LOCAL, SOURCE_RETRY_FAST_ATTEMPTS + 2)
        self.assertGreater(first, LOCAL_SOURCE_RETRY_SEC)
        self.assertGreater(second, first)

    def test_backoff_capped(self):
        """Mũ tắt cả buổi vẫn không được vượt trần — tránh nện RTSP vô hạn."""
        self.assertLessEqual(
            _source_retry_delay(self.LOCAL, 500), SOURCE_RETRY_MAX_SEC,
        )

    def test_remote_source_slower_than_local(self):
        remote = _source_retry_delay("rtsp://157.66.100.182:8554/cam", 0)
        self.assertGreater(remote, _source_retry_delay(self.LOCAL, 0))


class TestHlsRelayScope(unittest.TestCase):
    def test_patrol_cameras_skip_relay(self):
        """CMS xem HC-*/DR-* qua MediaMTX nên worker không được encode lại."""
        s = Settings(vms_hls_relay_skip_prefixes="HC-,DR-")
        self.assertFalse(s.vms_hls_relay_enabled_for("HC-01"))
        self.assertFalse(s.vms_hls_relay_enabled_for("HC-02"))
        self.assertFalse(s.vms_hls_relay_enabled_for("DR-03"))

    def test_other_cameras_keep_relay(self):
        s = Settings(vms_hls_relay_skip_prefixes="HC-,DR-")
        self.assertTrue(s.vms_hls_relay_enabled_for("A-03"))
        self.assertTrue(s.vms_hls_relay_enabled_for("A-04"))

    def test_empty_config_keeps_all_relays(self):
        s = Settings(vms_hls_relay_skip_prefixes="")
        self.assertTrue(s.vms_hls_relay_enabled_for("HC-01"))


class TestMediaMtxPathMapping(unittest.TestCase):
    """`/stream/<cam>/` chuyển hướng đúng path — CMS bản cũ vẫn xem được."""

    def test_default_is_lowercased_id(self):
        s = Settings(mediamtx_path_overrides="")
        self.assertEqual(s.mediamtx_path_for("HC-01"), "hc-01")
        self.assertEqual(s.mediamtx_path_for("HC-02"), "hc-02")

    def test_override_wins(self):
        s = Settings(mediamtx_path_overrides="DR-03:dr03")
        self.assertEqual(s.mediamtx_path_for("DR-03"), "dr03")

    def test_unlisted_camera_falls_back(self):
        s = Settings(mediamtx_path_overrides="DR-03:dr03")
        self.assertEqual(s.mediamtx_path_for("HC-01"), "hc-01")


if __name__ == "__main__":
    unittest.main()
