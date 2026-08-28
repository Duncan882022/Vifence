"""Signed URL cho ảnh patrol snapshot — TTL ngắn, yêu cầu auth để ký."""

from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import quote

from ..config import settings

SNAPSHOT_TTL_SEC = 60


def sign_snapshot_path(path: str, *, ttl_sec: int = SNAPSHOT_TTL_SEC) -> dict[str, str | int]:
    secret = settings.jwt_secret or "dev-insecure"
    exp = int(time.time()) + ttl_sec
    msg = f"{path}:{exp}".encode()
    token = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    return {"token": token, "exp": exp}


def verify_snapshot_token(path: str, token: str, exp: int) -> bool:
    if int(exp) < int(time.time()):
        return False
    secret = settings.jwt_secret or "dev-insecure"
    msg = f"{path}:{exp}".encode()
    expected = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, token)


def build_signed_snapshot_url(path: str, base: str = "/patrol/snapshot") -> str:
    signed = sign_snapshot_path(path)
    q_path = quote(path, safe="")
    return (
        f"{base}?path={q_path}"
        f"&token={signed['token']}&exp={signed['exp']}"
    )
