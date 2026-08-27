#!/usr/bin/env python3
"""Export YOLOv8s person model → OpenVINO (CPU VPS).

Usage (trên server):
    cd backend-ai
    .venv/bin/python scripts/export_person_openvino.py

Sau đó bật trong .env:
    PERSON_USE_OPENVINO=true
    PERSON_OPENVINO_DIR=models/person_openvino
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ai_engine import export_person_openvino, person_infer_config  # noqa: E402


def main() -> int:
    cfg = person_infer_config()
    print(f"Export yolov8s @ imgsz={cfg.imgsz} …")
    out = export_person_openvino(imgsz=cfg.imgsz)
    print(f"Done: {out}")
    print("Set PERSON_USE_OPENVINO=true and restart backend.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
