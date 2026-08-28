"""Module 05 — parse AI detections → schema Vifence (bbox chuẩn hoá 0–1).

Tách khỏi `ppe_analyzer` / `vms_worker` để WebSocket và HTTP poll dùng chung
một lớp chuyển đổi tọa độ — FE map overlay theo `width`×`height` + bbox 0–1.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

# Ngưỡng nhận diện bbox đã chuẩn hoá (0–1) thay vì pixel.
_NORM_BBOX_MAX = 1.5

# ByteTrack — số frame miss liên tiếp trước khi bỏ track khỏi danh sách.
MODULE05_BYTETRACK_MAX_AGE = 5


def is_normalized_bbox(bbox: Sequence[float]) -> bool:
    if len(bbox) < 4:
        return False
    return max(abs(float(v)) for v in bbox[:4]) <= _NORM_BBOX_MAX


def normalize_bbox(
    bbox: Sequence[float],
    orig_w: float,
    orig_h: float,
) -> list[float]:
    """Pixel → tỉ lệ 0–1 trên khung gốc (`orig_w` × `orig_h`)."""
    if orig_w <= 0 or orig_h <= 0 or len(bbox) < 4:
        return [float(v) for v in bbox[:4]]
    x1, y1, x2, y2 = (float(v) for v in bbox[:4])
    if is_normalized_bbox(bbox):
        return [x1, y1, x2, y2]
    return [
        x1 / orig_w,
        y1 / orig_h,
        x2 / orig_w,
        y2 / orig_h,
    ]


def denormalize_bbox(
    bbox: Sequence[float],
    orig_w: float,
    orig_h: float,
) -> list[float]:
    """0–1 → pixel (dùng nội bộ khi engine vẫn chạy trên pixel)."""
    if orig_w <= 0 or orig_h <= 0 or len(bbox) < 4:
        return [float(v) for v in bbox[:4]]
    x1, y1, x2, y2 = (float(v) for v in bbox[:4])
    if not is_normalized_bbox(bbox):
        return [x1, y1, x2, y2]
    return [x1 * orig_w, y1 * orig_h, x2 * orig_w, y2 * orig_h]


def _is_technical_track_worker_id(wid: str) -> bool:
    """Mã ByteTrack — không dùng làm worker_id API."""
    sl = wid.lower()
    if sl.startswith("ptk"):
        return True
    if sl.endswith(":person"):
        slot = sl.split(":", 1)[0]
        if slot.startswith("p") and len(slot) > 1 and slot[1:].isdigit():
            return True
    return False


def _resolve_worker_id(row: Mapping[str, Any]) -> str:
    """Chỉ lấy mã nhân sự thật — không fallback track_id (ptk*:person)."""
    for key in ("worker_id", "id"):
        raw = row.get(key)
        if raw is None:
            continue
        wid = str(raw).strip()
        if not wid or wid == "unknown" or _is_technical_track_worker_id(wid):
            continue
        return wid
    return ""


def _resolve_label(row: Mapping[str, Any], worker_id: str) -> str:
    for key in ("label", "worker_name", "behavior"):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return worker_id or "person"


def format_module05_detection(
    row: Mapping[str, Any],
    orig_w: float,
    orig_h: float,
) -> dict[str, Any]:
    """Một detection cho Module 05 — `id` sgc-*, bbox chuẩn hoá."""
    bbox_raw = row.get("bbox") or row.get("subject_bbox")
    if not bbox_raw or len(bbox_raw) < 4:
        raise ValueError("missing_bbox")

    worker_id = _resolve_worker_id(row)
    label = _resolve_label(row, worker_id)
    confidence = float(row.get("confidence") or 0.0)
    bbox = normalize_bbox(bbox_raw, orig_w, orig_h)

    out: dict[str, Any] = {
        "id": worker_id,
        "label": label,
        "confidence": round(confidence, 4),
        "bbox": [round(v, 6) for v in bbox],
        # Trường legacy — FE VMS hiện tại vẫn đọc.
        "behavior": str(row.get("behavior") or "person"),
        "worker_id": worker_id,
        "worker_name": str(row.get("worker_name") or label),
    }
    if row.get("track_id"):
        out["track_id"] = str(row["track_id"])
    if row.get("tier"):
        out["tier"] = row["tier"]
    if row.get("velocity") and len(row["velocity"]) >= 2:
        vx, vy = float(row["velocity"][0]), float(row["velocity"][1])
        # Vận tốc theo pixel/giây → chuẩn hoá theo cạnh khung.
        if orig_w > 0 and orig_h > 0:
            out["velocity"] = [round(vx / orig_w, 4), round(vy / orig_h, 4)]
        else:
            out["velocity"] = [round(vx, 2), round(vy, 2)]
    if row.get("subject_bbox") and len(row["subject_bbox"]) >= 4:
        out["subject_bbox"] = normalize_bbox(row["subject_bbox"], orig_w, orig_h)
    return out


def format_module05_detections(
    detections: Sequence[Mapping[str, Any]],
    orig_w: float,
    orig_h: float,
    *,
    behavior: str | None = "person",
) -> list[dict[str, Any]]:
    """Lọc + chuẩn hoá danh sách detection cho overlay live."""
    rows: list[dict[str, Any]] = []
    for raw in detections:
        if behavior and str(raw.get("behavior") or "") not in ("", behavior):
            continue
        try:
            rows.append(format_module05_detection(raw, orig_w, orig_h))
        except ValueError:
            continue
    return rows


def count_module05_workers(detections: Sequence[Mapping[str, Any]]) -> int:
    """Số người đếm cho KPI — chỉ behavior `person`."""
    return sum(1 for d in detections if str(d.get("behavior") or "") == "person")


def is_module05_patrol_camera(camera_id: str) -> bool:
    cam = (camera_id or "").strip().upper()
    return cam.startswith("HC-") or cam.startswith("DR-")
