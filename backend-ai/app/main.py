from __future__ import annotations

import asyncio
import base64
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .camera_stream import CameraStream
from .config import settings
from .crane_proximity_engine import CraneProximityEngine
from .detection_engine import DetectionEngine
from .mobile_config_store import MobileAiConfigStore
from .road_analysis_engine import RoadAnalysisEngine
from .road_detection_catalog import analyze_road_catalog, render_road_catalog, save_road_catalog_snapshot
from .schemas import MobileAiConfigPayload, MobileFramePayload

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
_analyze_executor = ThreadPoolExecutor(max_workers=1)


def _decode_frame(image_b64: str) -> Optional[np.ndarray]:
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _downscale_for_mobile(frame: np.ndarray, max_width: int = 480) -> np.ndarray:
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / w
    return cv2.resize(frame, (max_width, int(h * scale)), interpolation=cv2.INTER_AREA)


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
crane_engine = CraneProximityEngine(engine.store)
mobile_config_store = MobileAiConfigStore()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Đang load model detection...")
    engine.load_models()
    camera.start()
    engine.start()
    logger.info("Backend AI sẵn sàng tại http://%s:%s", settings.host, settings.port)
    yield
    engine.stop()
    camera.stop()
    _analyze_executor.shutdown(wait=False)


app = FastAPI(title="Vifence Safety AI — local POC", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health():
    return {"status": "ok", **engine.status()}


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
def list_events(limit: int = 50, date: str | None = None):
    return [e.model_dump() for e in engine.store.list_events(limit=limit, date=date)]


@app.get("/events/dates")
def list_event_dates():
    return engine.store.list_event_dates()


@app.delete("/events")
def clear_events():
    """Xóa toàn bộ sự kiện đã lưu (RAM + JSONL + snapshot)."""
    return engine.store.clear_all()


@app.get("/events/{event_id}/snapshot")
def event_snapshot(event_id: str):
    events = engine.store.list_events(limit=200)
    snapshot_file = next((e.snapshot_file for e in events if e.id == event_id), None)
    path = engine.store.resolve_snapshot_path(event_id, snapshot_file)
    if path is None or not path.exists():
        return {"error": "not_found"}
    return FileResponse(path)


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


def _analyze_road_frame(frame: np.ndarray, camera_id: str) -> dict:
    small = _downscale_for_mobile(frame, max_width=640)
    result, _ = road_engine.process_frame(small, camera_id)
    sw, sh = small.shape[1], small.shape[0]
    ow, oh = frame.shape[1], frame.shape[0]
    if sw != ow or sh != oh:
        sx, sy = ow / sw, oh / sh
        scaled = []
        for d in result.get("detections", []):
            x1, y1, x2, y2 = d["bbox"]
            scaled.append({**d, "bbox": [x1 * sx, y1 * sy, x2 * sx, y2 * sy]})
        result["detections"] = scaled
        scaled_events = []
        for e in result.get("events", []):
            x1, y1, x2, y2 = e["bbox"]
            scaled_events.append({**e, "bbox": [x1 * sx, y1 * sy, x2 * sx, y2 * sy]})
        result["events"] = scaled_events
        result["width"] = ow
        result["height"] = oh
    return result


def _analyze_crane_frame(frame: np.ndarray, camera_id: str) -> dict:
    small = _downscale_for_mobile(frame, max_width=640)
    result, _ = crane_engine.process_frame(small, camera_id)
    sw, sh = small.shape[1], small.shape[0]
    ow, oh = frame.shape[1], frame.shape[0]
    if sw != ow or sh != oh:
        sx, sy = ow / sw, oh / sh
        scaled = []
        for d in result.get("detections", []):
            x1, y1, x2, y2 = d["bbox"]
            scaled.append({**d, "bbox": [x1 * sx, y1 * sy, x2 * sx, y2 * sy]})
        result["detections"] = scaled
        scaled_events = []
        for e in result.get("events", []):
            x1, y1, x2, y2 = e["bbox"]
            scaled_events.append({**e, "bbox": [x1 * sx, y1 * sy, x2 * sx, y2 * sy]})
        result["events"] = scaled_events
        result["width"] = ow
        result["height"] = oh
    return result


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
