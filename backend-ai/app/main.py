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
from .detection_engine import DetectionEngine
from .events import SNAPSHOT_DIR
from .schemas import MobileFramePayload

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
_analyze_executor = ThreadPoolExecutor(max_workers=1)


def _decode_frame(image_b64: str) -> Optional[np.ndarray]:
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _analyze_mobile_frame(frame: np.ndarray, camera_id: str) -> dict:
    detections, new_events = engine.process_remote_frame(frame, camera_id)
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


@app.get("/events")
def list_events(limit: int = 50):
    return [e.model_dump() for e in engine.store.list_events(limit=limit)]


@app.get("/events/{event_id}/snapshot")
def event_snapshot(event_id: str):
    path = SNAPSHOT_DIR / f"{event_id}.jpg"
    if not path.exists():
        return {"error": "not_found"}
    return FileResponse(path)


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
    return await loop.run_in_executor(
        _analyze_executor,
        _analyze_mobile_frame,
        frame,
        camera_id,
    )


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
    last_event_count = 0
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
            if len(events) != last_event_count:
                last_event_count = len(events)
                await websocket.send_json(
                    {"type": "events", "events": [e.model_dump() for e in events]}
                )

            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        logger.info("Client WS ngắt kết nối.")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
