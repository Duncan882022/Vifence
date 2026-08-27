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

    # Cửa sổ "lần đầu" theo dedup_key: giữ created_at, chỉ refresh snapshot.
    # Sau cửa sổ mới cho phép event mới (cùng lỗi có thể là lần hành vi khác).
    event_first_seen_window_seconds: float = 10800.0  # 3 giờ

    # Chặn ghi trùng rất nhanh (giây) — lớp phụ; cửa sổ chính = first_seen.
    event_rapid_dedup_seconds: float = 45.0

    # Local/test: confirm nhanh ~8s, dedup 2 phút — chỉ dùng debug timing. Production/audit: false.
    # false = vòng loop đầu ghi đủ nhóm; loop lại trong 3h chỉ refresh snapshot (event_first_seen_window).
    event_test_mode: bool = False

    # Cam A-03: ghi sự kiện BPTC (bùn/nước/vật/lưới). false = chỉ overlay, không vào tab Sự kiện.
    a03_bptc_event_logging_enabled: bool = True

    # ATGT: false = log cả vượt tốc độ (ATGT-002) + thiếu phân làn (ATGT-004).
    atgt_lane_violation_only: bool = False

    # Phút đầu sau restart / DELETE /events: dedup tắt — ghi đủ 13/13 qua vài loop VMS.
    event_audit_grace_minutes: float = 5.0
    # Legacy — không còn dùng cho dedup (giữ env tương thích).
    event_audit_grace_loops: int = 2

    def event_repeat_seconds(self, configured: float) -> float:
        """Cooldown giữa các lần confirm engine cùng track."""
        if self.event_test_mode:
            return 8.0
        if not self.event_dedup_enabled():
            return 12.0
        return configured

    def event_debounce_min_seconds(self, configured: float) -> float:
        """Thời gian giữ detect liên tục trước khi confirm — rút ngắn trong audit grace."""
        if self.event_test_mode:
            return min(configured, 1.0)
        if not self.event_dedup_enabled():
            return min(configured, 1.2)
        return configured

    @property
    def event_log_one_per_episode(self) -> bool:
        """False trong audit grace — mỗi loop VMS ghi lại đủ ~13 kịch bản."""
        if self.event_test_mode:
            return False
        if not self.event_dedup_enabled():
            return False
        return True

    def event_dedup_enabled(self) -> bool:
        """False trong N phút audit đầu — ghi đủ trước khi dedup 3h."""
        if self.event_test_mode:
            return True
        from .vms_loop_state import dedup_grace_elapsed

        return dedup_grace_elapsed()

    @property
    def event_first_seen_window_effective(self) -> float:
        """Cửa sổ giữ giờ lần đầu — test mode rút 2 phút để audit/local re-log được."""
        return 120.0 if self.event_test_mode else self.event_first_seen_window_seconds

    @property
    def event_rapid_dedup_effective(self) -> float:
        return self.event_first_seen_window_effective

    # Nhận diện công nhân — gắn danh tính vào vi phạm (PPE/WAH/PCCC).
    worker_recognition_enabled: bool = True
    worker_match_min_confidence: float = 0.72
    # Khoảng cách top-1 vs top-2 gallery — tránh histogram khớp nhầm.
    worker_match_min_margin: float = 0.10
    worker_demo_fallback_enabled: bool = False
    worker_gallery_dir: str = "data/worker_gallery"

    # Patrol HC-* — tiêu chí mặt cho 1 người / 1 ID (sgc hoặc gallery).
    # Thang histogram (chỉ dùng khi thiếu model SFace) — xem worker_identity/face_thresholds.py.
    patrol_face_reuse_min_similarity: float = 0.76
    patrol_face_split_max_similarity: float = 0.62
    patrol_face_reuse_min_margin: float = 0.07
    patrol_face_cross_camera_min_similarity: float = 0.84
    patrol_gallery_min_confidence: float = 0.74
    patrol_gallery_min_margin: float = 0.12

    # Thang cosine SFace — cùng người ~0.4–0.7, khác người < 0.3.
    face_deep_gallery_min_confidence: float = 0.42
    face_deep_gallery_min_margin: float = 0.05
    face_deep_patrol_gallery_min_confidence: float = 0.50
    face_deep_patrol_gallery_min_margin: float = 0.08
    face_deep_reuse_min_similarity: float = 0.46
    face_deep_split_max_similarity: float = 0.34
    face_deep_reuse_min_margin: float = 0.05
    face_deep_cross_camera_min_similarity: float = 0.58
    # Điểm YuNet tối thiểu để coi là "thấy mặt" (cấp sgc) — độc lập ngưỡng khớp
    # gallery.
    #
    # 0.65 quá dễ dãi: cảnh lộn xộn (bàn phím, hộp đồ, vân gỗ) cũng qua được, và
    # embedding rút từ mảng vô nghĩa đó lại **khớp với nhau**, nên mọi phát hiện
    # rác dồn hết vào cùng một mã. Tab Người khi ấy đầy những mã không hề dựa
    # trên khuôn mặt nào.
    #
    # Thà bỏ sót một khuôn mặt mờ — track vẫn nằm ở tab Đối tượng và được cấp mã
    # ngay khi bắt được góc rõ hơn.
    patrol_face_detect_min_score: float = 0.82
    # Bodycam HC-* — webcam/indoor, YuNet thường 0.55–0.75 dù mắt người thấy rõ.
    # 0.82 để lại cho flycam/ cố định; bodycam dùng ngưỡng riêng.
    patrol_face_detect_min_score_bodycam: float = 0.62
    # Khẩu trang che miệng/mũi — không đủ tiêu chí cấp sgc / pers-*.
    patrol_face_reject_mask: bool = True
    # Tab Đối tượng — đầu + ≥30% thân, không đủ mặt, bám track ≥ N giây.
    patrol_object_confirm_seconds: float = 3.0
    patrol_face_object_confirm_seconds: float = 1.5
    # Tab Người / Định danh — xác nhận nhanh khi mặt đủ tiêu chí.
    patrol_person_confirm_seconds: float = 0.15

    # ATGT demo — detect xe → log ATGT-002 + snapshot + biển số.
    atgt_demo_enabled: bool = True
    atgt_demo_confirm_seconds: float = 0.0
    atgt_demo_max_gap_seconds: float = 120.0
    atgt_demo_vehicle_conf: float = 0.32
    # Biển số giả ngẫu nhiên khi OCR fail — tắt mặc định (dùng anchor/OCR thật).
    atgt_demo_fake_plate_fallback: bool = False

    # Hút thuốc — lặp snapshot mỗi 15 phút nếu vẫn phát hiện.
    smoking_event_cooldown_seconds: float = 900.0
    smoking_event_repeat_min_seconds: float = 900.0

    # Tạm tắt thu thập + train tự động khi chưa đủ video đa dạng (bật lại
    # bằng AUTO_TRAIN_ENABLED=true trong .env khi đã có thêm dữ liệu).
    auto_train_enabled: bool = False

    # Train theo cửa sổ cố định — mặc định 6h và 18h (UTC+7), ~2 lần/ngày.
    # Để trống chuỗi → chế độ cũ (poll + min_interval từng task).
    auto_train_schedule_hours_local: str = "0,6"
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

    # Camera CMS xem thẳng qua MediaMTX (WHEP/LL-HLS) — worker khỏi re-encode HLS.
    # Mỗi camera bỏ đi ở đây là bớt một ffmpeg + ~69 MB/s ghi raw frame vào pipe.
    vms_hls_relay_skip_prefixes: str = "HC-,DR-"

    # Nơi `/stream/<cam>/index.m3u8` chuyển hướng tới khi worker không relay nữa.
    # Đường dẫn công khai (qua nginx), không phải cổng 8888 nội bộ.
    mediamtx_hls_public_base: str = "/mediamtx/hls"

    # Ánh xạ camera → path MediaMTX khi tên không chỉ là chữ thường của id.
    # Định dạng: "DR-03:dr03,HC-01:hc-01"
    mediamtx_path_overrides: str = "DR-03:dr03"

    # Cạnh dài tối đa của frame đưa vào AI (0 = giữ nguyên). Snapshot sự kiện vẫn
    # dùng frame gốc, nên hạ giá trị này chỉ đổi chi phí inference.
    vms_ai_max_width: int = 0

    # OWLv2 (crane/machinery) là transformer ~1.2 GB, inference CPU hàng giây mỗi
    # frame. Tắt khi VPS chỉ cần phục vụ Module 05.
    machinery_detector_enabled: bool = True

    def vms_ai_fps_effective(self) -> float:
        """FPS AI trên VMS — luôn dùng cấu hình đầy đủ (grace không hạ FPS)."""
        return self.vms_ai_fps

    def vms_hls_relay_enabled_for(self, camera_id: str) -> bool:
        """CMS đã xem camera này qua MediaMTX chưa — chưa thì worker phải relay HLS."""
        for prefix in self.vms_hls_relay_skip_prefixes.split(","):
            prefix = prefix.strip()
            if prefix and camera_id.startswith(prefix):
                return False
        return True

    def mediamtx_path_for(self, camera_id: str) -> str:
        """Path MediaMTX của camera — mặc định là id viết thường (`HC-01` → `hc-01`)."""
        for entry in self.mediamtx_path_overrides.split(","):
            entry = entry.strip()
            if ":" not in entry:
                continue
            cam, path = entry.split(":", 1)
            if cam.strip() == camera_id:
                return path.strip()
        return camera_id.lower()

    @property
    def camera_source_value(self) -> Union[int, str]:
        """cv2.VideoCapture chấp nhận cả index webcam (int) lẫn URL/path (str)."""
        try:
            return int(self.camera_source)
        except ValueError:
            return self.camera_source

    @property
    def vms_camera_map(self) -> dict[str, str]:
        """Parse VMS_CAMERA_SOURCES → dict camera_id → source_path (bỏ phần |fallback)."""
        result: dict[str, str] = {}
        for cam_id, primary, _fallback in self.vms_camera_entries:
            result[cam_id] = primary
        return result

    @property
    def vms_camera_entries(self) -> list[tuple[str, str, str | None]]:
        """Parse VMS_CAMERA_SOURCES → (camera_id, primary, fallback_mp4|None).

        Fallback (tuỳ chọn): HC-01:rtsp://host/path|/opt/videos/bodycam-01.mp4
        """
        rows: list[tuple[str, str, str | None]] = []
        for entry in self.vms_camera_sources.split(","):
            entry = entry.strip()
            if ":" not in entry:
                continue
            cam_id, path = entry.split(":", 1)
            cam_id = cam_id.strip()
            path = path.strip()
            if not cam_id or not path:
                continue
            fallback: str | None = None
            if "|" in path:
                path, fb = path.split("|", 1)
                path = path.strip()
                fb = fb.strip()
                fallback = fb or None
            rows.append((cam_id, path, fallback))
        return rows


settings = Settings()
