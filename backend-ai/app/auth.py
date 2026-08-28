"""JWT auth + RBAC cho patrol API."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import dataclass
from typing import Annotated, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

ROLE_RANK = {"viewer": 0, "operator": 1, "hr": 2, "admin": 3}
SCOPE_ALIASES = {"read": "viewer", "write": "operator"}


@dataclass(frozen=True)
class AuthUser:
    username: str
    role: str

    def has_scope(self, minimum: str) -> bool:
        role_key = SCOPE_ALIASES.get(minimum, minimum)
        return ROLE_RANK.get(self.role, -1) >= ROLE_RANK.get(role_key, 99)


_bearer = HTTPBearer(auto_error=False)


def _b64url(data: bytes) -> str:
    return urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return urlsafe_b64decode(data + pad)


def hash_password(password: str) -> str:
    secret = settings.jwt_secret or "dev-insecure"
    return hashlib.sha256(f"{secret}:{password}".encode()).hexdigest()


def parse_auth_users(raw: str) -> dict[str, tuple[str, str]]:
    """username:password_or_hash:role"""
    users: dict[str, tuple[str, str]] = {}
    for part in raw.split(","):
        part = part.strip()
        if not part or part.count(":") < 2:
            continue
        username, secret, role = part.split(":", 2)
        username = username.strip()
        role = role.strip().lower()
        if username and role in ROLE_RANK:
            users[username] = (secret.strip(), role)
    return users


def verify_password(username: str, password: str) -> AuthUser | None:
    users = parse_auth_users(settings.patrol_auth_users)
    entry = users.get(username)
    if not entry:
        return None
    stored, role = entry
    if len(stored) == 64 and all(c in "0123456789abcdef" for c in stored.lower()):
        ok = hmac.compare_digest(stored, hash_password(password))
    else:
        ok = hmac.compare_digest(stored, password)
    return AuthUser(username=username, role=role) if ok else None


def create_access_token(user: AuthUser, *, ttl_sec: int | None = None) -> str:
    secret = settings.jwt_secret or "dev-insecure"
    ttl = ttl_sec if ttl_sec is not None else settings.jwt_ttl_sec
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user.username,
        "role": user.role,
        "exp": int(time.time()) + ttl,
        "iat": int(time.time()),
    }
    header_b64 = _b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode()
    sig = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url(sig)}"


def decode_access_token(token: str) -> AuthUser | None:
    secret = settings.jwt_secret or "dev-insecure"
    parts = token.split(".")
    if len(parts) != 3:
        return None
    header_b64, payload_b64, sig_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode()
    expected = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    try:
        actual = _b64url_decode(sig_b64)
    except Exception:
        return None
    if not hmac.compare_digest(expected, actual):
        return None
    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    username = str(payload.get("sub", "")).strip()
    role = str(payload.get("role", "")).strip().lower()
    if not username or role not in ROLE_RANK:
        return None
    return AuthUser(username=username, role=role)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthUser:
    if settings.patrol_auth_disabled:
        return AuthUser(username="dev", role="admin")
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing_token")
    user = decode_access_token(credentials.credentials)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    return user


def require_patrol_scope(minimum: str) -> Callable[..., AuthUser]:
    def _dep(user: Annotated[AuthUser, Depends(get_current_user)]) -> AuthUser:
        if not user.has_scope(minimum):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="insufficient_scope")
        return user

    return _dep


RequirePatrolRead = Annotated[AuthUser, Depends(require_patrol_scope("read"))]
RequirePatrolHr = Annotated[AuthUser, Depends(require_patrol_scope("hr"))]
RequirePatrolAdmin = Annotated[AuthUser, Depends(require_patrol_scope("admin"))]
