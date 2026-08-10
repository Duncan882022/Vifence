from __future__ import annotations

from typing import Union

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    camera_source: str = "0"

    host: str = "0.0.0.0"
    port: int = 8000

    detection_fps: float = 5.0
    stream_fps: float = 12.0

    fire_model_repo: str = "SalahALHaismawi/yolov26-fire-detection"
    fire_model_file: str = "best.pt"
    fire_conf_threshold: float = 0.62
    # Detector heuristic (màu sắc + độ sáng) bổ sung, bắt lửa nhỏ/cận cảnh mà
    # YOLO model bỏ sót (vd bật lửa, diêm, lửa xanh dương của bật lửa khò).
    flame_heuristic_conf_threshold: float = 0.48

    smoking_model_repo: str = "Enos-123/smoking-detection"
    smoking_model_file: str = "best.pt"
    smoking_conf_threshold: float = 0.5

    event_cooldown_seconds: float = 900.0
    # Fallback khi behavior không có cấu hình riêng.
    event_min_duration_seconds: float = 5.0

    # Hút thuốc — bắt nhanh (~2.5s), 1 sự kiện/phiên (chỉ log lại khi mất detect đủ lâu).
    smoking_event_min_duration_seconds: float = 2.5
    smoking_event_max_gap_seconds: float = 12.0

    # Cháy nổ — chờ lâu hơn (~6s), có thể nhắc lại sau cooldown nếu vẫn phát hiện.
    fire_event_min_duration_seconds: float = 6.0
    fire_event_max_gap_seconds: float = 15.0
    fire_event_cooldown_seconds: float = 900.0

    # Không log lại cùng behavior trên cùng camera trong N giây (trừ khi đã qua phiên mới + đủ thời gian).
    event_repeat_min_seconds: float = 900.0

    # Tối đa 1 snapshot sự kiện / loại / camera mỗi 15 phút (giảm lag I/O + FE poll).
    road_event_repeat_seconds: float = 900.0
    crane_event_repeat_seconds: float = 900.0
    ppe_event_repeat_seconds: float = 900.0
    pccc_event_repeat_seconds: float = 900.0
    wah_event_repeat_seconds: float = 900.0
    atgt_event_repeat_seconds: float = 900.0

    # Chặn ghi trùng nhanh cùng dedup_key (giây) — bổ sung one_event_per_episode.
    event_rapid_dedup_seconds: float = 45.0

    # Nhận diện công nhân — gắn danh tính vào vi phạm (PPE/WAH/PCCC).
    worker_recognition_enabled: bool = True
    worker_match_min_confidence: float = 0.42
    worker_demo_fallback_enabled: bool = False
    worker_gallery_dir: str = "data/worker_gallery"

    # ATGT demo — detect xe → log ATGT-002 + snapshot + biển số (fake nếu OCR fail).
    atgt_demo_enabled: bool = True
    atgt_demo_confirm_seconds: float = 0.0
    atgt_demo_max_gap_seconds: float = 120.0
    atgt_demo_vehicle_conf: float = 0.32

    # Hút thuốc — lặp snapshot mỗi 15 phút nếu vẫn phát hiện.
    smoking_event_cooldown_seconds: float = 900.0
    smoking_event_repeat_min_seconds: float = 900.0

    # Tạm tắt thu thập + train tự động khi chưa đủ video đa dạng (bật lại
    # bằng AUTO_TRAIN_ENABLED=true trong .env khi đã có thêm dữ liệu).
    auto_train_enabled: bool = False

    # Train theo cửa sổ cố định — mặc định 6h và 18h (UTC+7), ~2 lần/ngày.
    # Để trống chuỗi → chế độ cũ (poll + min_interval từng task).
    auto_train_schedule_hours_local: str = "6,18"
    auto_train_schedule_tz_offset_hours: int = 7
    auto_train_schedule_window_minutes: float = 90.0
    auto_train_check_interval_seconds: float = 120.0
    auto_train_min_interval_seconds: float = 39600.0
    auto_train_min_new_samples_delta: int = 10

    # Tắt vòng lặp detect nền (webcam) khi chỉ dùng FE gửi frame qua ngrok —
    # giảm RAM, tránh backend bị kill khi chạy đồng thời road + crane.
    detection_loop_enabled: bool = True

    # Tắt inference YOLO auto-train (road/crane) — chỉ rule/demo; tiết kiệm RAM.
    auto_train_inference_enabled: bool = True

    # --- VMS mode (Phase 1) ---
    # Bật VMS: BE ingest + AI + HLS + clip; FE chỉ xem stream.
    vms_mode_enabled: bool = False

    # Đường dẫn file nguồn MP4 cho từng camera (VMS mode).
    # Format: "A-03:/path/to/cam03.mp4,A-04:/path/to/cam04.mp4"
    vms_camera_sources: str = ""

    # FPS AI trên server (VMS mode) — tiết kiệm CPU, đủ ATLĐ.
    vms_ai_fps: float = 6.0

    @property
    def camera_source_value(self) -> Union[int, str]:
        """cv2.VideoCapture chấp nhận cả index webcam (int) lẫn URL/path (str)."""
        try:
            return int(self.camera_source)
        except ValueError:
            return self.camera_source

    @property
    def vms_camera_map(self) -> dict[str, str]:
        """Parse VMS_CAMERA_SOURCES → dict camera_id → source_path."""
        result: dict[str, str] = {}
        for entry in self.vms_camera_sources.split(","):
            entry = entry.strip()
            if ":" not in entry:
                continue
            cam_id, path = entry.split(":", 1)
            cam_id = cam_id.strip()
            path = path.strip()
            if cam_id and path:
                result[cam_id] = path
        return result


settings = Settings()
