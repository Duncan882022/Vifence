from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("mobile_config")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CONFIG_DIR = DATA_DIR / "config"
CURRENT_FILE = CONFIG_DIR / "mobile_ai.json"
HISTORY_FILE = CONFIG_DIR / "mobile_ai_history.jsonl"


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


class MobileAiConfigStore:
    """Lưu URL tunnel ngrok/mobile — JSON hiện tại + lịch sử theo ngày."""

    def __init__(self) -> None:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    def get(self) -> Optional[dict[str, Any]]:
        if not CURRENT_FILE.exists():
            return None
        try:
            return json.loads(CURRENT_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Không đọc được mobile_ai.json: %s", exc)
            return None

    def save(self, backend_url: str, *, source: str = "mobile-fe") -> dict[str, Any]:
        now = time.time()
        record = {
            "backend_url": backend_url.strip().rstrip("/"),
            "updated_at": now,
            "date": _today(),
            "source": source,
        }
        CURRENT_FILE.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            with open(HISTORY_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        except OSError as exc:
            logger.warning("Không ghi được mobile_ai_history.jsonl: %s", exc)
        logger.info("Đã lưu cấu hình mobile AI (%s): %s", record["date"], record["backend_url"])
        return record

    def list_history(self, *, date: Optional[str] = None, limit: int = 50) -> list[dict[str, Any]]:
        if not HISTORY_FILE.exists():
            return []
        rows: list[dict[str, Any]] = []
        try:
            with open(HISTORY_FILE, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if date and row.get("date") != date:
                        continue
                    rows.append(row)
        except OSError as exc:
            logger.warning("Không đọc được lịch sử cấu hình: %s", exc)
            return []
        return rows[-limit:][::-1]
