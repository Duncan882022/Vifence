"""GET /patrol/live/bundle — route wiring."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import settings
from app.patrol.legacy_routes import init_legacy_ctx, router


class PatrolLiveBundleTests(unittest.TestCase):
    def setUp(self) -> None:
        self._prev_auth = settings.patrol_auth_disabled
        settings.patrol_auth_disabled = True
        init_legacy_ctx(store=object(), vms_workers={})
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        settings.patrol_auth_disabled = self._prev_auth

    @patch("app.patrol.legacy_routes.build_patrol_live_bundle_payload")
    def test_live_bundle_route(self, mock_build) -> None:
        mock_build.return_value = {
            "ok": True,
            "metrics": {
                "cameras": [
                    {"camera_id": "HC-01", "stream_online": True, "person_count": 1,
                     "identified_workers": 0, "person_events_today": 0},
                ],
                "backend_reachable": True,
                "stream_online": True,
                "person_count": 1,
                "identified_workers": 0,
                "worker_names": [],
                "person_events_today": 0,
            },
            "workforce": {
                "helmets": {},
                "objects": {},
                "zonePopulation": {},
                "heatPoints": [],
                "events": [],
                "server_time": "2026-08-28T00:00:00Z",
            },
            "server_time": "2026-08-28T00:00:00Z",
        }
        res = self.client.get("/patrol/live/bundle?cameras=HC-01,HC-02")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body.get("ok"))
        mock_build.assert_called_once()
        args, kwargs = mock_build.call_args
        self.assertEqual(args[0], ["HC-01", "HC-02"])
