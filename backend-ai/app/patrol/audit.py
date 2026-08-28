"""Audit log — ghi hành động nhạy cảm trên patrol DB."""

from __future__ import annotations

import json
import time
from typing import Any

from . import db


def audit(
    action: str,
    *,
    actor: str,
    subject_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    payload = json.dumps(meta or {}, ensure_ascii=False, separators=(",", ":"))
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO audit_log(action, actor, subject_id, meta_json, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (action, actor, subject_id, payload, time.time()),
        )
