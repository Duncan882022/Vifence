from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend-ai/
DATA_DIR = BASE_DIR / "data" / "auto_train"
RUNS_DIR = DATA_DIR / "runs"
REGISTRY_PATH = DATA_DIR / "registry.json"


def task_dir(task_id: str) -> Path:
    d = DATA_DIR / task_id
    (d / "images").mkdir(parents=True, exist_ok=True)
    (d / "labels").mkdir(parents=True, exist_ok=True)
    return d
