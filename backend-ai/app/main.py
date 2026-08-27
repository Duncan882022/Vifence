from __future__ import annotations

import asyncio
import base64
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .auto_train.frame_collectors import (
    collect_crane_sample,
    collect_face_sample,
    collect_mesh_sample,
    collect_ppe_sample,
    collect_road_sample,
)
from .auto_train.scheduler import scheduler as auto_train_scheduler
from . import machinery_detector
from . import overlay_bus
from .patrol import db as patrol_db
from .patrol.api import router as patrol_api_router
from .camera_stream import CameraStream
from .config import settings
from .crane_proximity_engine import CraneProximityEngine
from .detection_engine import DetectionEngine
from .mobile_config_store import MobileAiConfigStore
from .road_analysis_engine import RoadAnalysisEngine
from .mesh_analysis_engine import MeshAnalysisEngine
from .road_detection_catalog import analyze_road_catalog, render_road_catalog, save_road_catalog_snapshot
from .crane_detection_catalog import analyze_crane_catalog, render_crane_catalog
from .ppe_engine import PpeEngine
from .patrol_engine import patrol_engine
from .pccc_engine import PcccEngine
from .wah_engine import WahEngine
from .atgt_engine import AtgtEngine
from .mobile_frame_utils import analyze_engine_frame, downscale_for_mobile
from .schemas import MobileAiConfigPayload, MobileFramePayload, PatrolIdentityAssignPayload, WorkerGalleryEnrollPayload
from .worker_identity.gallery import enroll_face, get_enrollment_status, resolve_worker_id
from .worker_identity.recognizer import gallery_status, reload_gallery
from .vms_worker import CameraVmsWorker, CLIPS_DIR
from .patrol_api import (
    build_patrol_aggregate_events_payload,
    build_patrol_aggregate_metrics_payload,
    build_patrol_events_payload,
    build_patrol_metrics_payload,
    update_patrol_gps,
    update_patrol_mobile_metrics,
)
from .workforce_engine import workforce_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
_analyze_executor = ThreadPoolExecutor(max_workers=4)

# Nhịp heartbeat WS detections — đủ ngắn để qua idle timeout của nginx/ngrok (60s).
WS_DETECTIONS_HEARTBEAT_SEC = 10.0

# VMS workers — khởi tạo trong lifespan khi VMS_MODE_ENABLED=true
_vms_workers: dict[str, CameraVmsWorker] = {}


def _decode_frame(image_b64: str) -> Optional[np.ndarray]:
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _downscale_for_mobile(frame: np.ndarray, max_width: int = 480) -> np.ndarray:
    return downscale_for_mobile(frame, max_width=max_width)


def _analyze_mobile_frame(frame: np.ndarray, camera_id: str) -> dict:
    small = _downscale_for_mobile(frame)
    detections, new_events = engine.process_remote_frame(small, camera_id)
    # Scale bbox về kích thước frame gốc (FE vẽ overlay theo frame gửi lên)
    sw, sh = small.shape[1], small.shape[0]
    ow, oh = frame.shape[1], frame.shape[0]
    if sw != ow or sh != oh:
        sx, sy = ow / sw, oh / sh
        scaled = []
        for d in detections:
            x1, y1, x2, y2 = d.bbox
            scaled.append(d.model_copy(update={
                "bbox": [x1 * sx, y1 * sy, x2 * sx, y2 * sy],
            }))
        detections = scaled
    return {
        "type": "result",
        "camera_id": camera_id,
        "width": frame.shape[1],
        "height": frame.shape[0],
        "detections": [d.model_dump() for d in detections],
        "events": [e.model_dump() for e in new_events],
    }

camera = CameraStream(settings.camera_source_value)
engine = DetectionEngine(camera)
road_engine = RoadAnalysisEngine(engine.store)
mesh_engine = MeshAnalysisEngine(engine.store)
crane_engine = CraneProximityEngine(engine.store)
ppe_engine = PpeEngine(engine.store)
pccc_engine = PcccEngine(engine.store)
wah_engine = WahEngine(engine.store)
atgt_engine = AtgtEngine(engine.store)
mobile_config_store = MobileAiConfigStore()

from .engine_loop_reset import _bind_engine

for _eng in (
    road_engine,
    mesh_engine,
    atgt_engine,
    ppe_engine,
    pccc_engine,
    wah_engine,
    crane_engine,
):
    _bind_engine(_eng)

from .engine_loop_reset import reset_all_engines
from .vms_loop_state import register_reset_handler

register_reset_handler(reset_all_engines)


def _build_vms_workers() -> None:
    """Khởi tạo VMS worker cho từng camera theo VMS_CAMERA_SOURCES."""
    cam_map = settings.vms_camera_map
    if not cam_map:
        logger.warning(
            "VMS_MODE_ENABLED=true nhưng VMS_CAMERA_SOURCES rỗng — không có worker nào. "
            "Cài: VMS_CAMERA_SOURCES=A-03:/path/cam03.mp4,A-04:/path/cam04.mp4"
        )
        return

    # Cấu hình engines per camera theo ma trận (Spec §4)
    patrol_vms_engines = {
        "patrol": patrol_engine.process_frame,
    }
    cam_engines: dict[str, dict[str, object]] = {
        "A-03": {
            "atgt": atgt_engine.process_frame,
            "mesh": mesh_engine.process_frame,
            "road": road_engine.process_frame,
        },
        "A-04": {
            "ppe": ppe_engine.process_frame,
            "pccc": pccc_engine.process_frame,
            "wah": wah_engine.process_frame,
            "crane": crane_engine.process_frame,
        },
        "HC-01": dict(patrol_vms_engines),
        "HC-02": dict(patrol_vms_engines),
        "DR-03": dict(patrol_vms_engines),
    }

    def on_event(ev):
        """Callback khi VMS worker xác nhận sự kiện."""
        logger.info("[VMS] Event confirmed: %s %s", ev.scenario_id, ev.id)

    for cam_id, source_path, fallback_source in settings.vms_camera_entries:
        engines = cam_engines.get(cam_id, {})
        hls_relay = settings.vms_hls_relay_enabled_for(cam_id)
        worker = CameraVmsWorker(
            camera_id=cam_id,
            source_path=source_path,
            fallback_source=fallback_source,
            process_frame_fns=engines,
            on_event=on_event,
            ai_fps=settings.vms_ai_fps,
            hls_relay=hls_relay,
            ai_max_width=settings.vms_ai_max_width,
        )
        _vms_workers[cam_id] = worker
        logger.info(
            "[VMS] Worker %s tạo xong (%d engines, HLS relay %s).",
            cam_id,
            len(engines),
            "bật" if hls_relay else "tắt — CMS xem qua MediaMTX",
        )

    from .vms_loop_state import register_seek_handler

    def _seek_all_vms() -> None:
        for worker in _vms_workers.values():
            worker.seek_to_start()

    register_seek_handler(_seek_all_vms)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Đang khởi động backend AI…")

    # Bus overlay cần loop chính để đánh thức WS subscriber từ AI thread.
    overlay_bus.bind_event_loop(asyncio.get_running_loop())

    if settings.vms_mode_enabled:
        logger.info("VMS mode: server-side AI + HLS stream đang khởi động…")
        if settings.event_test_mode:
            logger.info("EVENT_TEST_MODE=true — dedup 2 phút (debug timing, không dùng audit loop).")
        else:
            logger.info(
                "Audit grace: dedup tắt %.0f phút đầu; sau đó cửa sổ dedup=%.0fs.",
                settings.event_audit_grace_minutes,
                settings.event_first_seen_window_seconds,
            )
        from .vms_loop_state import arm_dedup_grace

        arm_dedup_grace()
        if not settings.a03_bptc_event_logging_enabled:
            logger.info("Cam A-03: không ghi sự kiện BPTC (chỉ overlay).")
        if settings.atgt_lane_violation_only:
            logger.info("ATGT: chỉ log thiếu phân làn (ATGT-004).")
        # VMS dùng engine riêng (road/mesh/atgt/ppe/…) — không cần preload smoking/fire YOLO (tiết kiệm RAM local).
        _build_vms_workers()
        for worker in _vms_workers.values():
            worker.start()
    elif settings.detection_loop_enabled:
        engine.ensure_models_loaded()
        camera.start()
        engine.start()
        logger.info("Smoking/fire detection loop đang chạy (webcam).")
    else:
        logger.info(
            "Detection loop tắt — smoking/fire lazy-load khi mobile gửi frame; "
            "road/crane nhận frame từ FE."
        )

    if settings.auto_train_enabled:
        auto_train_scheduler.start()
    else:
        logger.info("Auto-train tắt — chỉ chạy detect rule-based / model gốc.")

    if settings.machinery_detector_enabled:
        threading.Thread(
            target=machinery_detector.preload,
            name="machinery-preload",
            daemon=True,
        ).start()
    else:
        logger.info("OWLv2 (crane/machinery) tắt — nhường CPU cho luồng live.")

    # Đối tượng chỉ sống trong ngày. Dọn lúc khởi động là đủ: tiến trình chạy
    # qua nửa đêm thì lượt ghi đầu của ngày mới tự tạo phân vùng ngày mới.
    try:
        removed = patrol_db.purge_old_days()
        logger.info("Patrol DB sẵn sàng — xoá %d đối tượng của ngày trước.", removed)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Không mở được patrol DB: %s", exc)
    logger.info("Backend AI sẵn sàng tại http://%s:%s", settings.host, settings.port)
    if settings.event_test_mode:
        logger.warning(
            "EVENT_TEST_MODE=bật — log sự kiện lặp ~8s/track (chỉ dùng local/test)."
        )
    yield

    if settings.vms_mode_enabled:
        for worker in _vms_workers.values():
            worker.stop()
    if settings.detection_loop_enabled and not settings.vms_mode_enabled:
        engine.stop()
        camera.stop()
    if settings.auto_train_enabled:
        auto_train_scheduler.stop()
    _analyze_executor.shutdown(wait=False)


app = FastAPI(title="Vifence Safety AI — local POC", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patrol_api_router)


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health():
    """Trạng thái backend + từng VMS worker.

    FE dùng để chọn transport: có worker cho camera → dùng WS detections,
    không có → rơi về luồng analyze frame.
    """
    cameras = {
        camera_id: {
            "stream_online": worker.is_stream_live(),
            "hls_ready": worker.hls_ready(),
            "overlay_subscribers": overlay_bus.subscriber_count(camera_id),
        }
        for camera_id, worker in _vms_workers.items()
    }
    return {
        "status": "ok",
        "vms_mode": settings.vms_mode_enabled,
        "cameras": cameras,
        **engine.status(),
    }


@app.get("/workers/gallery/status")
def worker_gallery_status(user_id: str | None = None, cccd: str | None = None):
    status = gallery_status()
    if user_id or cccd:
        try:
            worker_id = resolve_worker_id(user_id=user_id, cccd=cccd)
        except ValueError as exc:
            return {**status, "error": str(exc)}
        status["enrollment"] = get_enrollment_status(worker_id)
    return status


@app.post("/workers/gallery/enroll")
def worker_gallery_enroll(payload: WorkerGalleryEnrollPayload):
    frame = _decode_frame(payload.image_b64)
    if frame is None:
        return {"ok": False, "error": "invalid_image"}
    if not payload.user_id and not payload.cccd:
        return {"ok": False, "error": "missing_identity"}
    try:
        worker_id = resolve_worker_id(user_id=payload.user_id, cccd=payload.cccd)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    try:
        enrollment = enroll_face(
            worker_id,
            payload.worker_name.strip(),
            payload.employee_code.strip(),
            frame,
            contractor_name=(payload.contractor_name or None),
            pose_slot=payload.pose_slot,
            cccd=payload.cccd,
        )
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    except RuntimeError as exc:
        return {"ok": False, "error": str(exc)}
    reload_gallery()
    return {"ok": True, "enrollment": enrollment}


@app.get("/config/mobile-ai")
def get_mobile_ai_config():
    record = mobile_config_store.get()
    if not record:
        return {"configured": False}
    return {"configured": True, **record}


@app.put("/config/mobile-ai")
def put_mobile_ai_config(payload: MobileAiConfigPayload):
    url = payload.backend_url.strip()
    if not url:
        return {"error": "missing_url"}
    record = mobile_config_store.save(url, source=payload.source)
    return {"ok": True, **record}


@app.get("/config/mobile-ai/history")
def get_mobile_ai_config_history(date: str | None = None, limit: int = 50):
    return mobile_config_store.list_history(date=date, limit=limit)


@app.get("/events")
def list_events(limit: int = 50, date: str | None = None, camera_id: str | None = None):
    return [
        e.model_dump()
        for e in engine.store.list_events(limit=limit, date=date, camera_id=camera_id)
    ]


@app.get("/patrol/metrics")
def patrol_aggregate_metrics(cameras: str = "HC-01,HC-02"):
    """Module 05 — gộp đếm công nhân / PPE từ nhiều mũ HC-*."""
    camera_ids = [cam.strip() for cam in cameras.split(",") if cam.strip()]
    return build_patrol_aggregate_metrics_payload(
        camera_ids,
        store=engine.store,
        vms_workers=_vms_workers,
    )


@app.get("/patrol/events")
def patrol_aggregate_events(
    cameras: str = "HC-01,HC-02",
    date: str | None = None,
    limit: int = 500,
):
    """Module 05 — gộp sự kiện PPE từ nhiều mũ HC-*."""
    camera_ids = [cam.strip() for cam in cameras.split(",") if cam.strip()]
    return build_patrol_aggregate_events_payload(
        camera_ids,
        store=engine.store,
        date=date,
        limit=limit,
    )


@app.get("/patrol/workforce/state")
def patrol_workforce_state(cameras: str = "HC-01,HC-02"):
    """Module 05 — snapshot HELMET/OBJECT/POPULATION/HEAT/EVENT (spec MD)."""
    camera_ids = [c.strip() for c in cameras.split(",") if c.strip()]
    if len(camera_ids) == 1:
        return workforce_engine.snapshot(camera_ids[0])
    # Merge multi-helmet snapshot
    merged: dict = {
        "helmets": {},
        "objects": {},
        "zonePopulation": {},
        "heatPoints": [],
        "events": [],
        "server_time": None,
    }
    for cam in camera_ids:
        snap = workforce_engine.snapshot(cam)
        merged["helmets"].update(snap.get("helmets") or {})
        merged["objects"].update(snap.get("objects") or {})
        merged["zonePopulation"].update(snap.get("zonePopulation") or {})
        merged["heatPoints"].extend(snap.get("heatPoints") or [])
        merged["events"].extend(snap.get("events") or [])
        merged["server_time"] = snap.get("server_time")
    # Dedupe events by id, newest first
    seen = set()
    uniq = []
    for ev in sorted(merged["events"], key=lambda e: e.get("timestamp") or "", reverse=True):
        eid = ev.get("event_id")
        if eid in seen:
            continue
        seen.add(eid)
        uniq.append(ev)
    merged["events"] = uniq[:80]
    return merged


@app.get("/patrol/workforce/events")
def patrol_workforce_events(limit: int = 50):
    """Meaningful workforce events only (no raw PERSON_DETECTED)."""
    snap = workforce_engine.snapshot()
    return (snap.get("events") or [])[: max(1, min(limit, 200))]


@app.get("/patrol/identity/bindings")
def patrol_identity_bindings():
    """Module 05 — danh sách định danh patrol đã lưu DB (gallery + alias)."""
    from .patrol_identity_store import list_patrol_identity_bindings

    return {"ok": True, "bindings": list_patrol_identity_bindings()}


@app.get("/patrol/appearances")
def patrol_appearances(master_id: str, date: str | None = None):
    """Lịch sử xuất hiện theo master_id (sgc / gallery) — blocks popup."""
    from .patrol_api import list_patrol_appearances_payload

    return list_patrol_appearances_payload(master_id, date=date)


@app.post("/patrol/identity/assign")
def patrol_identity_assign(payload: PatrolIdentityAssignPayload):
    """Enroll khuôn mặt + bind sgc/OBJ → gallery worker."""
    from .patrol_api import assign_patrol_identity

    result = assign_patrol_identity(payload.model_dump())
    if not result.get("ok"):
        return result
    return result


@app.get("/patrol/{camera_id}/events")
def patrol_helmet_events(camera_id: str, date: str | None = None, limit: int = 500):
    """Module 05 — chỉ sự kiện PPE của camera HC-* (không lẫn A-03/A-04)."""
    return build_patrol_events_payload(
        camera_id,
        store=engine.store,
        date=date,
        limit=limit,
    )


@app.get("/patrol/{camera_id}/metrics")
def patrol_helmet_metrics(camera_id: str):
    """Module 05 — đếm công nhân live theo camera HC-* / DR-*."""
    if camera_id.startswith("DR-"):
        from .drone_heatmap import get_drone_heatmap_metrics

        live = get_drone_heatmap_metrics(camera_id)
        if live.get("updated_at"):
            return live
    return build_patrol_metrics_payload(
        camera_id,
        store=engine.store,
        vms_workers=_vms_workers,
    )


@app.get("/patrol/{camera_id}/heatmap.png")
def patrol_drone_heatmap_png(camera_id: str):
    """DR-* — heatmap mật độ pixel (JET), render ~30s/lần."""
    if not camera_id.startswith("DR-"):
        raise HTTPException(status_code=404, detail="heatmap_only_for_drone")
    from .drone_heatmap import get_drone_heatmap_png_path

    path = get_drone_heatmap_png_path(camera_id)
    if path is None:
        raise HTTPException(status_code=404, detail="heatmap_not_ready")
    return FileResponse(path, media_type="image/png")


@app.get("/events/dates")
def list_event_dates():
    return engine.store.list_event_dates()


@app.delete("/events")
def clear_events():
    """Xóa toàn bộ sự kiện đã lưu (RAM + JSONL + snapshot)."""
    return engine.store.clear_all()


@app.get("/events/{event_id}/snapshot")
def event_snapshot(event_id: str):
    event = engine.store.get_event(event_id)
    snapshot_file = event.snapshot_file if event else None
    path = engine.store.resolve_snapshot_path(event_id, snapshot_file)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return FileResponse(
        path,
        headers={"Cache-Control": "no-cache, max-age=0, must-revalidate"},
    )


@app.get("/training/status")
def training_status():
    """Trạng thái cơ chế tự train — số sample đã thu thập, model đang chạy
    (version + mAP50), lần train gần nhất mỗi task (Cam 03/04, lửa, hút
    thuốc)."""
    return auto_train_scheduler.status()


@app.post("/training/trigger")
def training_trigger(task: str):
    """Bắt buộc train ngay 1 task (không cần chờ đủ ngưỡng dữ liệu/thời
    gian) — dùng để test hoặc ép train ngay khi vừa nạp thêm dữ liệu."""
    return auto_train_scheduler.trigger(task, background=True)


@app.get("/debug/debouncers")
def debug_debouncers():
    """Trạng thái debounce realtime — test timing smoking (~2.5s) vs fire (~6s)."""
    return {
        "config": engine.debouncer_config(),
        "state": engine.debouncer_snapshots(),
        "events_today": len(engine.store.list_events(limit=200)),
    }


@app.get("/debug/raw_detections")
def debug_raw_detections():
    """Chẩn đoán: lấy 1 frame TRỰC TIẾP từ camera mà server đang giữ (không mở
    thêm kết nối camera nào khác, tránh xung đột thiết bị trên macOS) và chạy
    toàn bộ detector với threshold rất thấp để xem confidence thật, kể cả dưới
    ngưỡng báo động. Chỉ dùng để debug, không dùng trong production."""
    frame = camera.get_frame()
    if frame is None:
        return {"error": "no_frame"}
    raw = []
    for detector in engine.detectors:
        if not getattr(detector, "ready", False):
            continue
        model = getattr(detector, "_model", None)
        if model is not None:
            results = model.predict(frame, conf=0.05, verbose=False)
            if results and results[0].boxes is not None:
                names = results[0].names
                for box in results[0].boxes:
                    raw.append(
                        {
                            "detector": getattr(detector, "name", detector.behavior),
                            "label": names.get(int(box.cls[0]), str(int(box.cls[0]))),
                            "confidence": round(float(box.conf[0]), 3),
                            "bbox": [round(float(v), 1) for v in box.xyxy[0]],
                        }
                    )
        else:
            for d in detector.predict(frame):
                raw.append(
                    {
                        "detector": getattr(detector, "name", detector.behavior),
                        "label": d.label,
                        "confidence": round(d.confidence, 3),
                        "bbox": [round(v, 1) for v in d.bbox],
                    }
                )
    return {"raw_detections": raw}


@app.get("/debug/frame.jpg")
def debug_frame():
    """Trả về JPEG của frame hiện tại camera server đang giữ, để xem chính xác
    server đang thấy gì tại thời điểm gọi."""
    frame = camera.get_frame()
    if frame is None:
        return {"error": "no_frame"}
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not ok:
        return {"error": "encode_failed"}
    return Response(content=buf.tobytes(), media_type="image/jpeg")


# ---------------------------------------------------------------------------
# VMS stream endpoints — CORS: CORSMiddleware (không thêm header nginx / FileResponse)
# ---------------------------------------------------------------------------

def _hls_bytes_response(path: Path, media_type: str) -> Response:
    """Đọc snapshot file HLS — tránh race ffmpeg rewrite gây lỗi Content-Length (206)."""
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        body = path.read_bytes()
    except OSError as exc:
        raise HTTPException(status_code=503, detail="HLS file temporarily unavailable") from exc
    if not body:
        raise HTTPException(status_code=503, detail="HLS file empty")
    return Response(
        content=body,
        media_type=media_type,
        headers={"Cache-Control": "no-cache, no-store"},
    )


def _mediamtx_hls_redirect(camera_id: str) -> RedirectResponse:
    """Đưa client sang thẳng MediaMTX — `HC-01` → `/mediamtx/hls/hc-01/index.m3u8`.

    Worker tuần tra không còn re-encode HLS, nhưng CMS đã phát hành trước đó vẫn
    gọi endpoint này. Trả 503 sẽ làm tile của bản cũ chết hẳn, nên chuyển hướng
    tới nguồn thật: client cũ chạy được ngay mà không cần build lại.
    """
    path = settings.mediamtx_path_for(camera_id)
    return RedirectResponse(
        url=f"{settings.mediamtx_hls_public_base.rstrip('/')}/{path}/index.m3u8",
        status_code=302,
        headers={"Cache-Control": "no-cache, no-store"},
    )


@app.get("/stream/{camera_id}/index.m3u8")
def vms_stream_playlist(camera_id: str):
    """HLS playlist cho camera VMS (live stream từ MP4 loop)."""
    worker = _vms_workers.get(camera_id)
    if worker is None:
        raise HTTPException(status_code=404, detail=f"Camera {camera_id!r} không có trong VMS workers")
    if not worker.hls_relay_enabled():
        return _mediamtx_hls_redirect(camera_id)
    if not worker.hls_ready():
        raise HTTPException(status_code=503, detail="HLS stream chưa sẵn sàng, thử lại sau 5s")
    return _hls_bytes_response(worker.hls_index_path(), "application/vnd.apple.mpegurl")


@app.get("/stream/{camera_id}/detections")
def vms_stream_detections(camera_id: str):
    """Detections + ROI zones mới nhất từ VMS AI — FE poll vẽ overlay (Option 2)."""
    worker = _vms_workers.get(camera_id)
    if worker is None:
        raise HTTPException(status_code=404, detail=f"Camera {camera_id!r} không có trong VMS workers")
    payload = worker.get_latest_overlay()
    stream_online = bool(payload.get("stream_online", True))
    return {
        "type": "detections",
        "vms_ready": stream_online and payload.get("updated_at", 0) > 0,
        **payload,
    }


@app.websocket("/ws/helmet/{camera_id}/telemetry")
async def ws_helmet_telemetry(websocket: WebSocket, camera_id: str):
    """GPS + IMU từ mũ — kênh riêng, không đi kèm frame video.

    Tách khỏi video có hai lợi ích: vị trí vẫn cập nhật khi sóng yếu không đẩy
    được video, và mọi người xem đều thấy vị trí thay vì chỉ tab đang mở camera.
    """
    await websocket.accept()

    try:
        while True:
            payload = await websocket.receive_json()
            if not isinstance(payload, dict):
                continue

            lat = payload.get("lat")
            lng = payload.get("lng")
            heading = payload.get("heading")
            pitch = payload.get("pitch")
            roll = payload.get("roll")

            update_patrol_gps(
                camera_id,
                float(lat) if isinstance(lat, (int, float)) else None,
                float(lng) if isinstance(lng, (int, float)) else None,
                heading=float(heading) if isinstance(heading, (int, float)) else None,
                pitch=float(pitch) if isinstance(pitch, (int, float)) else None,
                roll=float(roll) if isinstance(roll, (int, float)) else None,
            )
            await websocket.send_json({"type": "ack", "camera_id": camera_id})
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.info("[ws telemetry %s] đóng: %s", camera_id, exc)


@app.websocket("/ws/stream/{camera_id}/detections")
async def ws_stream_detections(websocket: WebSocket, camera_id: str):
    """Push detections theo sự kiện — thay cho FE poll 450ms.

    Bbox tới ngay khi AI chạy xong frame, không chờ nhịp poll, và tải backend
    không tăng theo số người xem (mỗi viewer chỉ là một subscriber nhẹ).
    """
    await websocket.accept()

    worker = _vms_workers.get(camera_id)
    if worker is None:
        await websocket.send_json({
            "type": "error",
            "message": f"Camera {camera_id!r} không có trong VMS workers",
        })
        await websocket.close(code=1008)
        return

    event = overlay_bus.subscribe(camera_id)
    last_revision = -1

    try:
        while True:
            # clear() trước khi đọc revision — notify xen giữa vẫn được bắt,
            # hoặc qua revision mới, hoặc qua event đã set cho vòng wait kế.
            event.clear()
            revision = overlay_bus.get_revision(camera_id)

            if revision != last_revision:
                last_revision = revision
                payload = worker.get_latest_overlay()
                stream_online = bool(payload.get("stream_online", True))
                await websocket.send_json({
                    "type": "detections",
                    "revision": revision,
                    "vms_ready": stream_online and payload.get("updated_at", 0) > 0,
                    **payload,
                })
                continue

            try:
                await asyncio.wait_for(event.wait(), timeout=WS_DETECTIONS_HEARTBEAT_SEC)
            except asyncio.TimeoutError:
                # Heartbeat: giữ kết nối qua proxy idle timeout và báo stream chết.
                await websocket.send_json({
                    "type": "heartbeat",
                    "camera_id": camera_id,
                    "stream_online": worker.is_stream_live(),
                })
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.info("[ws detections %s] đóng: %s", camera_id, exc)
    finally:
        overlay_bus.unsubscribe(camera_id, event)


@app.get("/stream/{camera_id}/{segment}")
def vms_stream_segment(camera_id: str, segment: str):
    """HLS segment .ts cho camera VMS."""
    worker = _vms_workers.get(camera_id)
    if worker is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not worker.hls_relay_enabled():
        # Client thường bám theo URL đã chuyển hướng nên không tới đây; giữ
        # nhánh này cho trình phát tự ghép URL từ playlist gốc.
        path = settings.mediamtx_path_for(camera_id)
        return RedirectResponse(
            url=f"{settings.mediamtx_hls_public_base.rstrip('/')}/{path}/{segment}",
            status_code=302,
            headers={"Cache-Control": "no-cache, no-store"},
        )
    seg_path = worker.hls_index_path().parent / segment
    if not seg_path.exists():
        raise HTTPException(status_code=404, detail="Segment not found")
    return _hls_bytes_response(seg_path, "video/mp2t")


@app.get("/cameras/vms")
def list_vms_cameras():
    """Danh sách camera VMS + trạng thái HLS."""
    return [
        {
            "camera_id": cam_id,
            "hls_ready": worker.hls_ready(),
            "stream_online": worker.is_stream_live(),
            "hls_url": f"/stream/{cam_id}/index.m3u8",
            "source_path": worker.source_path,
        }
        for cam_id, worker in _vms_workers.items()
    ]


@app.get("/events/{event_id}/clip")
def event_clip(event_id: str):
    """Trả về clip MP4 của sự kiện (VMS mode)."""
    events = engine.store.list_events(limit=500)
    event = next((e for e in events if e.id == event_id), None)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    if not event.clip_file:
        raise HTTPException(status_code=404, detail="Clip chưa có cho event này")

    clip_path = CLIPS_DIR / event.clip_file
    if not clip_path.exists():
        clip_path2 = CLIPS_DIR / event.camera_id / event.clip_file
        if not clip_path2.exists():
            raise HTTPException(status_code=404, detail="Clip file không tìm thấy trên server")
        clip_path = clip_path2

    return FileResponse(
        str(clip_path),
        media_type="video/mp4",
        headers={"Cache-Control": "public, max-age=86400"},
    )


def _collect_road_auto_train_sample(small: np.ndarray, result: dict) -> None:
    collect_road_sample(small, result)


def _collect_crane_auto_train_sample(small: np.ndarray, result: dict) -> None:
    collect_crane_sample(small, result)


def _collect_ppe_auto_train_sample(small: np.ndarray, result: dict) -> None:
    collect_ppe_sample(small, result)
    collect_face_sample(small, result)


def _collect_mesh_auto_train_sample(small: np.ndarray, result: dict) -> None:
    collect_mesh_sample(small, result)


def _analyze_road_frame(frame: np.ndarray, camera_id: str) -> dict:
    return analyze_engine_frame(
        frame,
        camera_id,
        road_engine.process_frame,
        after_process=_collect_road_auto_train_sample,
    )


def _analyze_mesh_frame(frame: np.ndarray, camera_id: str) -> dict:
    return analyze_engine_frame(
        frame,
        camera_id,
        mesh_engine.process_frame,
        after_process=_collect_mesh_auto_train_sample,
    )


def _analyze_crane_frame(frame: np.ndarray, camera_id: str) -> dict:
    return analyze_engine_frame(
        frame,
        camera_id,
        crane_engine.process_frame,
        after_process=_collect_crane_auto_train_sample,
    )


def _analyze_ppe_frame(frame: np.ndarray, camera_id: str) -> dict:
    return analyze_engine_frame(
        frame,
        camera_id,
        ppe_engine.process_frame,
        after_process=_collect_ppe_auto_train_sample,
    )


def _analyze_patrol_person_frame(frame: np.ndarray, camera_id: str) -> dict:
    """HC-* / DR-* — YOLO person only, không PPE."""
    return analyze_engine_frame(
        frame,
        camera_id,
        patrol_engine.process_frame,
    )


def _analyze_pccc_frame(frame: np.ndarray, camera_id: str) -> dict:
    return analyze_engine_frame(frame, camera_id, pccc_engine.process_frame)


def _analyze_wah_frame(frame: np.ndarray, camera_id: str) -> dict:
    return analyze_engine_frame(frame, camera_id, wah_engine.process_frame)


def _analyze_atgt_frame(frame: np.ndarray, camera_id: str) -> dict:
    return analyze_engine_frame(frame, camera_id, atgt_engine.process_frame)


@app.post("/analyze/ppe/frame")
async def analyze_ppe_frame_endpoint(payload: MobileFramePayload):
    """Phát hiện PPE — mũ / áo phản quang / giày (Cam A-04)."""
    if payload.type != "frame" or not payload.image:
        return {"type": "error", "message": "missing_image"}

    try:
        frame = _decode_frame(payload.image)
    except Exception as exc:  # noqa: BLE001
        return {"type": "error", "message": f"decode_failed: {exc}"}

    if frame is None:
        return {"type": "error", "message": "invalid_image"}

    camera_id = payload.camera_id or "A-04"
    if payload.gps_lat is not None and payload.gps_lng is not None:
        update_patrol_gps(
            camera_id,
            payload.gps_lat,
            payload.gps_lng,
            heading=getattr(payload, "heading", None),
            pitch=getattr(payload, "pitch", None),
            roll=getattr(payload, "roll", None),
        )
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        _analyze_executor,
        _analyze_ppe_frame,
        frame,
        camera_id,
    )
    if isinstance(result, dict):
        update_patrol_mobile_metrics(camera_id, result)
    return result


@app.post("/analyze/pccc/frame")
async def analyze_pccc_frame_endpoint(payload: MobileFramePayload):
    """Phát hiện PCCC — hút thuốc / cháy nổ (Cam A-04), log sự kiện ngay."""
    if payload.type != "frame" or not payload.image:
        return {"type": "error", "message": "missing_image"}

    try:
        frame = _decode_frame(payload.image)
    except Exception as exc:  # noqa: BLE001
        return {"type": "error", "message": f"decode_failed: {exc}"}

    if frame is None:
        return {"type": "error", "message": "invalid_image"}

    camera_id = payload.camera_id or "A-04"
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _analyze_executor,
        _analyze_pccc_frame,
        frame,
        camera_id,
    )


@app.post("/analyze/atgt/frame")
async def analyze_atgt_frame_endpoint(payload: MobileFramePayload):
    """Phát hiện ATGT — vượt tốc độ + làn phân cách cứng (Cam A-03)."""
    if payload.type != "frame" or not payload.image:
        return {"type": "error", "message": "missing_image"}

    try:
        frame = _decode_frame(payload.image)
    except Exception as exc:  # noqa: BLE001
        return {"type": "error", "message": f"decode_failed: {exc}"}

    if frame is None:
        return {"type": "error", "message": "invalid_image"}

    camera_id = payload.camera_id or "A-03"
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _analyze_executor,
        _analyze_atgt_frame,
        frame,
        camera_id,
    )


@app.post("/analyze/wah/frame")
async def analyze_wah_frame_endpoint(payload: MobileFramePayload):
    """Phát hiện WAH — làm việc mép biên không dây an toàn (Cam A-04)."""
    if payload.type != "frame" or not payload.image:
        return {"type": "error", "message": "missing_image"}

    try:
        frame = _decode_frame(payload.image)
    except Exception as exc:  # noqa: BLE001
        return {"type": "error", "message": f"decode_failed: {exc}"}

    if frame is None:
        return {"type": "error", "message": "invalid_image"}

    camera_id = payload.camera_id or "A-04"
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _analyze_executor,
        _analyze_wah_frame,
        frame,
        camera_id,
    )


@app.post("/analyze/frame")
async def analyze_frame(payload: MobileFramePayload):
    """Nhận frame JPEG (base64) qua HTTP — dùng cho mobile qua ngrok (fetch gửi được
    header ngrok-skip-browser-warning, WebSocket từ trình duyệt thì không)."""
    if payload.type != "frame" or not payload.image:
        return {"type": "error", "message": "missing_image"}

    try:
        frame = _decode_frame(payload.image)
    except Exception as exc:  # noqa: BLE001
        return {"type": "error", "message": f"decode_failed: {exc}"}

    if frame is None:
        return {"type": "error", "message": "invalid_image"}

    camera_id = payload.camera_id or "mobile"
    if payload.gps_lat is not None and payload.gps_lng is not None:
        update_patrol_gps(
            camera_id,
            payload.gps_lat,
            payload.gps_lng,
            heading=getattr(payload, "heading", None),
            pitch=getattr(payload, "pitch", None),
            roll=getattr(payload, "roll", None),
        )
    loop = asyncio.get_event_loop()
    if payload.mode == "road":
        return await loop.run_in_executor(
            _analyze_executor,
            _analyze_road_frame,
            frame,
            camera_id,
        )
    if payload.mode == "crane":
        return await loop.run_in_executor(
            _analyze_executor,
            _analyze_crane_frame,
            frame,
            camera_id,
        )
    if payload.mode == "ppe":
        result = await loop.run_in_executor(
            _analyze_executor,
            _analyze_ppe_frame,
            frame,
            camera_id,
        )
        if isinstance(result, dict):
            update_patrol_mobile_metrics(camera_id, result)
        return result
    if payload.mode == "person":
        result = await loop.run_in_executor(
            _analyze_executor,
            _analyze_patrol_person_frame,
            frame,
            camera_id,
        )
        if isinstance(result, dict):
            update_patrol_mobile_metrics(camera_id, result)
        return result
    return await loop.run_in_executor(
        _analyze_executor,
        _analyze_mobile_frame,
        frame,
        camera_id,
    )


@app.post("/analyze/road/frame")
async def analyze_road_frame_endpoint(payload: MobileFramePayload):
    """Phân tích lòng đường (bùn / nước / vật thể trong ROI) — Cam cố định Module 04."""
    if payload.type != "frame" or not payload.image:
        return {"type": "error", "message": "missing_image"}

    try:
        frame = _decode_frame(payload.image)
    except Exception as exc:  # noqa: BLE001
        return {"type": "error", "message": f"decode_failed: {exc}"}

    if frame is None:
        return {"type": "error", "message": "invalid_image"}

    camera_id = payload.camera_id or "A-03"
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _analyze_executor,
        _analyze_road_frame,
        frame,
        camera_id,
    )


@app.post("/analyze/mesh/frame")
async def analyze_mesh_frame_endpoint(payload: MobileFramePayload):
    """Phân tích lưới bao che (BPTC-001) — debounce + ghi sự kiện."""
    if payload.type != "frame" or not payload.image:
        return {"type": "error", "message": "missing_image"}

    try:
        frame = _decode_frame(payload.image)
    except Exception as exc:  # noqa: BLE001
        return {"type": "error", "message": f"decode_failed: {exc}"}

    if frame is None:
        return {"type": "error", "message": "invalid_image"}

    camera_id = payload.camera_id or "A-03"
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _analyze_executor,
        _analyze_mesh_frame,
        frame,
        camera_id,
    )


@app.post("/analyze/crane/frame")
async def analyze_crane_frame_endpoint(payload: MobileFramePayload):
    """Phát hiện làm việc gần máy cẩu — Cam A-04 (person + crane + ≤ 1m)."""
    if payload.type != "frame" or not payload.image:
        return {"type": "error", "message": "missing_image"}

    try:
        frame = _decode_frame(payload.image)
    except Exception as exc:  # noqa: BLE001
        return {"type": "error", "message": f"decode_failed: {exc}"}

    if frame is None:
        return {"type": "error", "message": "invalid_image"}

    camera_id = payload.camera_id or "A-04"
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _analyze_executor,
        _analyze_crane_frame,
        frame,
        camera_id,
    )


def _render_road_catalog_frame(frame: np.ndarray, camera_id: str) -> tuple[bytes, dict]:
    detections, polygon = analyze_road_catalog(frame, camera_id)
    rendered = render_road_catalog(frame, detections, polygon)
    ok, buf = cv2.imencode(".png", rendered)
    if not ok:
        raise RuntimeError("encode_failed")
    meta = {
        "camera_id": camera_id,
        "count": len(detections),
        "detections": [
            {
                "kind": d.kind,
                "label": d.label,
                "behavior": d.behavior,
                "confidence": round(d.confidence, 3),
                "bbox": list(d.bbox),
            }
            for d in detections
        ],
    }
    return buf.tobytes(), meta


@app.post("/analyze/road/catalog")
async def analyze_road_catalog_endpoint(payload: MobileFramePayload):
    """Catalog ROI — vẽ tất cả lớp detect trong polygon (Cam A-03). Trả PNG + metadata."""
    if payload.type != "frame" or not payload.image:
        return {"type": "error", "message": "missing_image"}

    try:
        frame = _decode_frame(payload.image)
    except Exception as exc:  # noqa: BLE001
        return {"type": "error", "message": f"decode_failed: {exc}"}

    if frame is None:
        return {"type": "error", "message": "invalid_image"}

    camera_id = payload.camera_id or "A-03"
    loop = asyncio.get_event_loop()
    try:
        png_bytes, meta = await loop.run_in_executor(
            _analyze_executor,
            _render_road_catalog_frame,
            frame,
            camera_id,
        )
    except RuntimeError as exc:
        return {"type": "error", "message": str(exc)}

    return {
        "type": "catalog",
        **meta,
        "image_png_base64": base64.b64encode(png_bytes).decode("ascii"),
    }


def _render_crane_catalog_frame(frame: np.ndarray, camera_id: str) -> tuple[bytes, dict]:
    detections, zone_polys = analyze_crane_catalog(frame, camera_id)
    rendered = render_crane_catalog(frame, detections, zone_polys, camera_id=camera_id)
    ok, buf = cv2.imencode(".png", rendered)
    if not ok:
        raise RuntimeError("encode_failed")
    core = [d for d in detections if d.behavior != "crane_proximity"]
    meta = {
        "camera_id": camera_id,
        "count": len(core),
        "detections": [
            {
                "kind": d.kind,
                "label": d.label,
                "behavior": d.behavior,
                "confidence": round(d.confidence, 3),
                "bbox": list(d.bbox),
                "distance_m": d.distance_m,
                "nearest_machine": d.nearest_machine,
            }
            for d in core
        ],
    }
    return buf.tobytes(), meta


@app.post("/analyze/crane/catalog")
async def analyze_crane_catalog_endpoint(payload: MobileFramePayload):
    """Catalog ROI Cam A-04 — máy khoan, cẩu tháp, máy xúc, người. Trả PNG + metadata."""
    if payload.type != "frame" or not payload.image:
        return {"type": "error", "message": "missing_image"}

    try:
        frame = _decode_frame(payload.image)
    except Exception as exc:  # noqa: BLE001
        return {"type": "error", "message": f"decode_failed: {exc}"}

    if frame is None:
        return {"type": "error", "message": "invalid_image"}

    camera_id = payload.camera_id or "A-04"
    loop = asyncio.get_event_loop()
    try:
        png_bytes, meta = await loop.run_in_executor(
            _analyze_executor,
            _render_crane_catalog_frame,
            frame,
            camera_id,
        )
    except RuntimeError as exc:
        return {"type": "error", "message": str(exc)}

    return {
        "type": "catalog",
        **meta,
        "image_png_base64": base64.b64encode(png_bytes).decode("ascii"),
    }


@app.websocket("/ws/analyze")
async def ws_analyze(websocket: WebSocket):
    """Nhận frame JPEG (base64) từ trình duyệt mobile, chạy AI, trả detections."""
    await websocket.accept()
    logger.info("Client mobile WS /ws/analyze kết nối.")
    try:
        while True:
            payload = await websocket.receive_json()
            if payload.get("type") != "frame":
                continue

            camera_id = str(payload.get("camera_id") or "mobile")
            image_b64 = payload.get("image")
            if not image_b64:
                await websocket.send_json({"type": "error", "message": "missing_image"})
                continue

            try:
                frame = _decode_frame(image_b64)
            except Exception as exc:  # noqa: BLE001
                await websocket.send_json({"type": "error", "message": f"decode_failed: {exc}"})
                continue

            if frame is None:
                await websocket.send_json({"type": "error", "message": "invalid_image"})
                continue

            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                _analyze_executor,
                _analyze_mobile_frame,
                frame,
                camera_id,
            )
            await websocket.send_json(result)
    except WebSocketDisconnect:
        logger.info("Client mobile WS /ws/analyze ngắt kết nối.")


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await websocket.accept()
    interval = 1.0 / max(settings.stream_fps, 1.0)
    last_event_head_id: str | None = None
    try:
        while True:
            frame = camera.get_frame()
            if frame is not None:
                ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                if ok:
                    detections = engine.get_latest_detections()
                    await websocket.send_json(
                        {
                            "type": "frame",
                            "image": base64.b64encode(buf.tobytes()).decode("ascii"),
                            "width": frame.shape[1],
                            "height": frame.shape[0],
                            "detections": [d.model_dump() for d in detections],
                        }
                    )

            events = engine.store.list_events(limit=10)
            head_id = engine.store.newest_id()
            if head_id != last_event_head_id:
                last_event_head_id = head_id
                await websocket.send_json(
                    {"type": "events", "events": [e.model_dump() for e in events]}
                )

            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        logger.info("Client WS ngắt kết nối.")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
