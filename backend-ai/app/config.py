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
    fire_conf_threshold: float = 0.5
    # Detector heuristic (màu sắc + độ sáng) bổ sung, bắt lửa nhỏ/cận cảnh mà
    # YOLO model bỏ sót (vd bật lửa, diêm, lửa xanh dương của bật lửa khò).
    flame_heuristic_conf_threshold: float = 0.35

    smoking_model_repo: str = "Enos-123/smoking-detection"
    smoking_model_file: str = "best.pt"
    smoking_conf_threshold: float = 0.5

    debounce_hits: int = 3
    debounce_window: int = 5
    event_cooldown_seconds: float = 30.0
    # Fallback khi behavior không có cấu hình riêng.
    event_min_duration_seconds: float = 5.0

    # Hút thuốc — bắt nhanh (~2.5s), 1 sự kiện/phiên (chỉ log lại khi mất detect đủ lâu).
    smoking_event_min_duration_seconds: float = 2.5
    smoking_event_max_gap_seconds: float = 12.0

    # Cháy nổ — chờ lâu hơn (~6s), có thể nhắc lại sau cooldown nếu vẫn phát hiện.
    fire_event_min_duration_seconds: float = 6.0
    fire_event_max_gap_seconds: float = 15.0
    fire_event_cooldown_seconds: float = 60.0

    # Không log lại cùng behavior trên cùng camera trong N giây (trừ khi đã qua phiên mới + đủ thời gian).
    event_repeat_min_seconds: float = 180.0

    # Tạm tắt thu thập + train tự động khi chưa đủ video đa dạng (bật lại
    # bằng AUTO_TRAIN_ENABLED=true trong .env khi đã có thêm dữ liệu).
    auto_train_enabled: bool = False

    @property
    def camera_source_value(self) -> Union[int, str]:
        """cv2.VideoCapture chấp nhận cả index webcam (int) lẫn URL/path (str)."""
        try:
            return int(self.camera_source)
        except ValueError:
            return self.camera_source


settings = Settings()
