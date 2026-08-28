"""Mã hoá embedding at-rest — Fernet khi có PATROL_EMBED_KEY."""

from __future__ import annotations

import base64
import hashlib
import struct
from typing import Iterable

from ..config import settings

_FERNET: object | None = None


def _fernet():
    global _FERNET
    if _FERNET is not None:
        return _FERNET
    key_raw = (settings.patrol_embed_key or "").strip()
    if not key_raw:
        _FERNET = False
        return _FERNET
    try:
        from cryptography.fernet import Fernet

        if len(key_raw) == 44 and key_raw.endswith("="):
            fkey = key_raw.encode()
        else:
            digest = hashlib.sha256(key_raw.encode()).digest()
            fkey = base64.urlsafe_b64encode(digest)
        _FERNET = Fernet(fkey)
    except Exception:
        _FERNET = False
    return _FERNET


def encrypt_embedding(values: Iterable[float]) -> bytes:
    vals = list(values)
    raw = struct.pack(f"{len(vals)}f", *vals)
    f = _fernet()
    if f:
        return f.encrypt(raw)
    return raw


def decrypt_embedding(blob: bytes, dim: int) -> list[float]:
    f = _fernet()
    data = f.decrypt(blob) if f else blob
    count = len(data) // 4
    if count != dim:
        count = min(dim, count)
    vals = struct.unpack(f"{count}f", data[: count * 4])
    return list(vals)
