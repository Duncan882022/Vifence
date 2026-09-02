"""GET /patrol/snapshot — signed URL không cần Bearer (img tag)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.patrol import db, sink
from app.patrol.snapshot_sign import sign_snapshot_path


class PatrolSnapshotSignTests(unittest.TestCase):
    def setUp(self) -> None:
        import tempfile
        from pathlib import Path

        from app.patrol import db

        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()

        self.client = TestClient(app)
        sink.SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        self.rel = "2026-08-28/test-snap.jpg"
        snap_file = sink.SNAPSHOT_DIR / self.rel
        snap_file.parent.mkdir(parents=True, exist_ok=True)
        snap_file.write_bytes(b"\xff\xd8\xff fake jpeg")
        self._snap_file = snap_file

    def tearDown(self) -> None:
        if self._snap_file.is_file():
            self._snap_file.unlink()
        db.close()
        self._tmp.cleanup()

    @patch("app.patrol.api.settings_patrol_auth_disabled", return_value=False)
    def test_signed_url_works_without_bearer(self, _mock_demo: object) -> None:
        signed = sign_snapshot_path(self.rel)
        res = self.client.get(
            "/patrol/snapshot",
            params={"path": self.rel, "token": signed["token"], "exp": signed["exp"]},
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn(res.headers.get("content-type", ""), ("image/jpeg", "image/jpeg; charset=utf-8"))

    @patch("app.patrol.api.settings_patrol_auth_disabled", return_value=False)
    def test_missing_token_returns_401(self, _mock_demo: object) -> None:
        res = self.client.get("/patrol/snapshot", params={"path": self.rel})
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
