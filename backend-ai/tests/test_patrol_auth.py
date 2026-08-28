"""Auth tests — JWT signin + RBAC scopes."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password, verify_password, AuthUser
from app.config import settings
from app.patrol import db
from app.patrol.api import router as patrol_router
from app.auth_routes import router as auth_router


class PatrolAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self._prev_disabled = settings.patrol_auth_disabled
        self._prev_users = settings.patrol_auth_users
        settings.patrol_auth_disabled = False
        settings.patrol_auth_users = f"admin:{hash_password('secret123')}:admin"

        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        db.get_conn()

        app = FastAPI()
        app.include_router(auth_router)
        app.include_router(patrol_router)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        settings.patrol_auth_disabled = self._prev_disabled
        settings.patrol_auth_users = self._prev_users
        db.close()
        self._tmp.cleanup()

    def test_signin_valid_credentials(self) -> None:
        res = self.client.post(
            "/auth/signin",
            json={"username": "admin", "password": "secret123"},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["ok"])
        self.assertIn("access_token", body)

    def test_signin_invalid_credentials(self) -> None:
        res = self.client.post(
            "/auth/signin",
            json={"username": "admin", "password": "wrong"},
        )
        self.assertEqual(res.status_code, 401)

    def test_patrol_read_requires_token(self) -> None:
        res = self.client.get("/patrol/persons")
        self.assertEqual(res.status_code, 401)

    def test_patrol_read_with_viewer_token(self) -> None:
        token = create_access_token(AuthUser(username="admin", role="admin"))
        res = self.client.get(
            "/patrol/persons",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["ok"])

    def test_verify_password_plaintext_env(self) -> None:
        settings.patrol_auth_users = "viewer:plainpass:viewer"
        user = verify_password("viewer", "plainpass")
        self.assertIsNotNone(user)
        self.assertEqual(user.role, "viewer")
