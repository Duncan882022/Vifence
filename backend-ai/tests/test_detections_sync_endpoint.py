"""Đầu-cuối: FE báo mốc khung hình, backend trả overlay của đúng khung đó.

Đây là phần thấy được của lỗi "hộp chạy trước người": AI đã phân tích tới khung
mới nhất trong khi người xem vẫn đang ở khung của vài giây trước. Test dựng một
worker giả có sẵn lịch sử overlay rồi kiểm tra cả hai đường HTTP và WebSocket.
"""

from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import main as main_module  # noqa: E402
from app.main import app  # noqa: E402
from app.vms_worker import CameraVmsWorker  # noqa: E402

CAMERA_ID = "HC-SYNCTEST"


class _FakeWorker:
    """Chỉ giữ phần overlay của worker thật — không mở camera, không chạy AI."""

    def __init__(self, entries: list[dict]) -> None:
        self._entries = entries
        self._latest = entries[-1]

    def is_stream_live(self) -> bool:
        return True

    def get_latest_overlay(self) -> dict:
        return self.get_overlay_at(None)

    def get_overlay_at(self, at_ms: float | None) -> dict:
        chosen, mode, drift = CameraVmsWorker._select_overlay_entry(
            self._latest, self._entries, at_ms,
        )
        payload = {
            "camera_id": CAMERA_ID,
            "width": int(chosen["width"]),
            "height": int(chosen["height"]),
            "updated_at": float(chosen["updated_at"]),
            "frame_wallclock_ms": float(chosen["frame_wallclock_ms"]),
            "stream_online": True,
            "detections": list(chosen["detections"]),
            "roi_zones": [],
            "metrics": {},
            "overlay_sync": mode,
            "overlay_history_span_ms": CameraVmsWorker._overlay_history_span_ms(self._entries),
            "overlay_epoch": 7,
        }
        if at_ms is not None:
            payload["requested_at_ms"] = float(at_ms)
            payload["overlay_drift_ms"] = drift
        return payload


def _entries(base_ms: float) -> list[dict]:
    """Sáu giây overlay ở nhịp 10 FPS, mỗi bản có một người ở vị trí khác nhau."""
    rows = []
    for step in range(60):
        x = step / 100.0
        rows.append({
            "width": 1280,
            "height": 720,
            "updated_at": (base_ms + step * 100) / 1000.0,
            "frame_wallclock_ms": base_ms + step * 100,
            "detections": [{
                "behavior": "person",
                "label": "person",
                "worker_id": f"w{step:02d}",
                "confidence": 0.9,
                "bbox": [x * 1280, 0.0, (x + 0.1) * 1280, 720.0],
            }],
        })
    return rows


class DetectionsSyncEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.base_ms = time.time() * 1000.0 - 6_000.0
        self.rows = _entries(self.base_ms)
        main_module._vms_workers[CAMERA_ID] = _FakeWorker(self.rows)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        main_module._vms_workers.pop(CAMERA_ID, None)

    def _worker_id(self, payload: dict) -> str:
        return payload["detections"][0]["id"]

    @staticmethod
    def _await_sync_mode(ws, expected: str, attempts: int = 12) -> dict:
        """Đẩy overlay mới cho tới khi nhận được payload ở chế độ mong muốn.

        Server đọc mốc của FE trong một task riêng, nên mốc vừa gửi có thể chưa
        kịp áp vào lần đẩy ngay sau đó. Ngoài đời FE báo lại mỗi giây nên chênh
        một nhịp AI là không đáng kể; ở test thì chờ hội tụ cho khỏi chớp nhả.
        """
        last: dict = {}
        for _ in range(attempts):
            main_module.overlay_bus.notify(CAMERA_ID)
            message = ws.receive_json()
            if message.get("type") != "detections":
                continue
            last = message
            if message.get("overlay_sync") == expected:
                return message
        raise AssertionError(
            f"Không nhận được overlay_sync={expected!r}; lần cuối: {last.get('overlay_sync')!r}",
        )

    def test_http_without_at_ms_returns_latest(self) -> None:
        res = self.client.get(f"/stream/{CAMERA_ID}/detections")
        self.assertEqual(res.status_code, 200)
        payload = res.json()

        self.assertEqual(payload["overlay_sync"], "latest")
        self.assertEqual(self._worker_id(payload), "w59")
        self.assertNotIn("requested_at_ms", payload)

    def test_http_with_at_ms_returns_frame_the_viewer_sees(self) -> None:
        # Người xem chậm 3 giây so với khung mới nhất.
        at_ms = self.base_ms + 2_900
        res = self.client.get(f"/stream/{CAMERA_ID}/detections", params={"at_ms": at_ms})
        payload = res.json()

        self.assertEqual(payload["overlay_sync"], "aligned")
        self.assertEqual(self._worker_id(payload), "w29")
        self.assertEqual(payload["overlay_drift_ms"], 0)
        self.assertEqual(payload["overlay_history_span_ms"], 5_900)

    def test_http_reports_epoch_for_track_reset(self) -> None:
        payload = self.client.get(f"/stream/{CAMERA_ID}/detections").json()
        self.assertEqual(payload["overlay_epoch"], 7)

    def test_bbox_normalized_for_patrol_camera(self) -> None:
        at_ms = self.base_ms + 2_000
        payload = self.client.get(
            f"/stream/{CAMERA_ID}/detections", params={"at_ms": at_ms},
        ).json()

        bbox = payload["detections"][0]["bbox"]
        self.assertAlmostEqual(bbox[0], 0.20, places=3)
        self.assertLessEqual(max(bbox), 1.0)

    def test_websocket_sync_message_aligns_pushed_overlay(self) -> None:
        with self.client.websocket_connect(f"/ws/stream/{CAMERA_ID}/detections") as ws:
            # Chưa báo mốc — backend gửi bản mới nhất.
            first = self._await_sync_mode(ws, "latest")
            self.assertEqual(self._worker_id(first), "w59")

            # Báo đang xem khung của 3 giây trước.
            ws.send_json({"type": "sync", "at_ms": self.base_ms + 2_900})
            aligned = self._await_sync_mode(ws, "aligned")

            self.assertEqual(self._worker_id(aligned), "w29")
            self.assertEqual(aligned["overlay_epoch"], 7)

    def test_websocket_sync_null_returns_to_latest(self) -> None:
        with self.client.websocket_connect(f"/ws/stream/{CAMERA_ID}/detections") as ws:
            ws.send_json({"type": "sync", "at_ms": self.base_ms + 2_900})
            self._await_sync_mode(ws, "aligned")

            ws.send_json({"type": "sync", "at_ms": None})
            back = self._await_sync_mode(ws, "latest")
            self.assertEqual(self._worker_id(back), "w59")

    def test_unknown_camera_still_404(self) -> None:
        res = self.client.get("/stream/KHONG-CO/detections")
        self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
