"""Khai báo 4 task tự train — Cam 03 (vật tư/bùn/nước), Cam 04 (máy móc),
lửa, hút thuốc. Mỗi task có bộ class riêng + tham số train riêng."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TaskConfig:
    task_id: str
    classes: list[str]
    # Weight khởi điểm khi CHƯA có checkpoint tự train nào được promote.
    # Luôn dùng kiến trúc yolov8n chuẩn (đảm bảo tương thích chắc chắn với
    # bản ultralytics đang cài) — không dùng trực tiếp checkpoint community
    # (yolov26...) làm base train vì có thể lệch kiến trúc giữa các bản.
    base_weights: str = "yolov8n.pt"
    min_new_samples: int = 80
    min_interval_seconds: float = 900.0
    epochs: int = 10
    imgsz: int = 384
    batch: int = 8
    # Ngưỡng tin cậy tối thiểu để pipeline runtime chấp nhận dùng box do
    # model tự train sinh ra (thay/thêm so với rule-based).
    runtime_conf_threshold: float = 0.55


TASKS: dict[str, TaskConfig] = {
    "crane_machinery": TaskConfig(
        task_id="crane_machinery",
        classes=["tower_crane", "crane_green", "sany_drill"],
        min_new_samples=80,
        min_interval_seconds=900.0,
        epochs=12,
        imgsz=384,
    ),
    "road_material": TaskConfig(
        task_id="road_material",
        classes=["mud", "water", "material"],
        min_new_samples=80,
        min_interval_seconds=900.0,
        epochs=12,
        imgsz=384,
    ),
    "fire": TaskConfig(
        task_id="fire",
        classes=["fire", "smoke"],
        min_new_samples=40,
        min_interval_seconds=1800.0,
        epochs=10,
        imgsz=384,
    ),
    "smoking": TaskConfig(
        task_id="smoking",
        classes=["cigarette"],
        min_new_samples=40,
        min_interval_seconds=1800.0,
        epochs=10,
        imgsz=384,
    ),
    "ppe_helmet": TaskConfig(
        task_id="ppe_helmet",
        classes=["hard_hat"],
        min_new_samples=12,
        min_interval_seconds=600.0,
        epochs=20,
        imgsz=416,
        runtime_conf_threshold=0.42,
    ),
    "ppe_vest": TaskConfig(
        task_id="ppe_vest",
        classes=["safety_vest"],
        min_new_samples=12,
        min_interval_seconds=600.0,
        epochs=20,
        imgsz=416,
        runtime_conf_threshold=0.40,
    ),
    "ppe_shoes": TaskConfig(
        task_id="ppe_shoes",
        classes=["safety_shoes"],
        min_new_samples=12,
        min_interval_seconds=600.0,
        epochs=20,
        imgsz=416,
        runtime_conf_threshold=0.38,
    ),
    "wah_harness": TaskConfig(
        task_id="wah_harness",
        classes=["safety_harness"],
        min_new_samples=12,
        min_interval_seconds=600.0,
        epochs=25,
        imgsz=416,
        runtime_conf_threshold=0.35,
    ),
    # BPTC-001 — Lưới bao che giàn giáo (safety mesh cover).
    # Phase 1: stub (model chưa train). Cần seed 150–300 ảnh/class.
    # Class 1 YOLO: "mesh_cover" (panel present) → vi phạm detect bằng rule
    # (zone coverage < 60%, rách theo contour, bẩn theo HSV offset).
    # Khi có đủ seed → activate bằng AUTO_TRAIN_ENABLED=true.
    "safety_mesh_cover": TaskConfig(
        task_id="safety_mesh_cover",
        classes=["mesh_cover"],
        base_weights="yolov8n.pt",
        min_new_samples=150,
        min_interval_seconds=3600.0,
        epochs=30,
        imgsz=640,
        batch=8,
        runtime_conf_threshold=0.50,
    ),
}
