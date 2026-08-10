"""Đọc biển số xe từ khung hình — OCR thật; demo fallback khi bật ATGT_DEMO_ENABLED."""

from __future__ import annotations

import hashlib
import logging
import os
import re
import shutil
import subprocess
import tempfile
from typing import Iterable

import cv2
import numpy as np

from .config import settings

logger = logging.getLogger("atgt_plate_reader")

_DEMO_PLATES: tuple[str, ...] = (
    "51A-123.45",
    "51B-678.90",
    "50F-888.88",
    "29C-456.78",
    "30H-321.09",
    "43D-555.66",
    "60K-112.23",
)

_TESSERACT = shutil.which("tesseract")
_OCR_LANG = "vie+eng"


def _clamp_bbox(x1: int, y1: int, x2: int, y2: int, w: int, h: int) -> tuple[int, int, int, int]:
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    return x1, y1, x2, y2


def _crop_rect(frame: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> np.ndarray | None:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = _clamp_bbox(x1, y1, x2, y2, w, h)
    if x2 <= x1 or y2 <= y1:
        return None
    return frame[y1:y2, x1:x2]


def _plate_crop(frame: np.ndarray, bbox: list[float] | tuple[float, ...]) -> np.ndarray | None:
    x1, y1, x2, y2 = [int(v) for v in bbox]
    bw, bh = x2 - x1, y2 - y1
    if bw <= 0 or bh <= 0:
        return None

    py1 = y1 + int(bh * 0.52)
    py2 = y2
    px1 = x1 + int(bw * 0.12)
    px2 = x2 - int(bw * 0.12)
    return _crop_rect(frame, px1, py1, px2, py2)


def _rel_plate_crop(
    frame: np.ndarray,
    bbox: list[float] | tuple[float, ...],
    plate_box_rel: list[float] | tuple[float, ...],
) -> np.ndarray | None:
    if len(plate_box_rel) != 4:
        return None
    x1, y1, x2, y2 = [int(v) for v in bbox]
    bw, bh = x2 - x1, y2 - y1
    if bw <= 0 or bh <= 0:
        return None
    rx1, ry1, rx2, ry2 = plate_box_rel
    return _crop_rect(
        frame,
        x1 + int(bw * rx1),
        y1 + int(bh * ry1),
        x1 + int(bw * rx2),
        y1 + int(bh * ry2),
    )


def _find_plate_rect_in_vehicle(crop: np.ndarray) -> np.ndarray | None:
    """Tìm vùng chữ nhật sáng (biển trắng) ở cản trước xe."""
    if crop.size == 0:
        return None
    h, w = crop.shape[:2]
    if h < 24 or w < 40:
        return None

    lower = crop[int(h * 0.45) :, :]
    gray = cv2.cvtColor(lower, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, white = cv2.threshold(blur, 165, 255, cv2.THRESH_BINARY)
    white = cv2.morphologyEx(white, cv2.MORPH_CLOSE, np.ones((5, 11), np.uint8), iterations=2)

    cnts, _ = cv2.findContours(white, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best: tuple[float, tuple[int, int, int, int]] | None = None
    y_off = int(h * 0.45)

    for cnt in cnts:
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw < w * 0.12 or bh < 8:
            continue
        if bw > w * 0.92 or bh > lower.shape[0] * 0.55:
            continue
        aspect = bw / max(bh, 1)
        if aspect < 2.2 or aspect > 8.5:
            continue
        area = bw * bh
        cx = x + bw / 2
        center_penalty = abs(cx - w / 2) * 0.4
        score = area * min(aspect, 6.0) - center_penalty
        if best is None or score > best[0]:
            best = (score, (x, y + y_off, x + bw, y + y_off + bh))

    if best is None:
        return None
    x1, y1, x2, y2 = best[1]
    pad_x = max(2, int((x2 - x1) * 0.06))
    pad_y = max(2, int((y2 - y1) * 0.12))
    return crop[
        max(0, y1 - pad_y) : min(h, y2 + pad_y),
        max(0, x1 - pad_x) : min(w, x2 + pad_x),
    ]


def _plate_crop_candidates(
    frame: np.ndarray,
    bbox: list[float] | tuple[float, ...],
    plate_box_rel: list[float] | tuple[float, ...] | None = None,
) -> Iterable[np.ndarray]:
    seen: set[tuple[int, int, int, int]] = set()

    def emit(crop: np.ndarray | None) -> np.ndarray | None:
        if crop is None or crop.size == 0:
            return None
        key = crop.shape[:2]
        if key in seen:
            return None
        seen.add(key)
        return crop

    if plate_box_rel is not None:
        rel = emit(_rel_plate_crop(frame, bbox, plate_box_rel))
        if rel is not None:
            yield rel

    vehicle = emit(_crop_rect(frame, *[int(v) for v in bbox]))
    if vehicle is not None:
        plate_patch = emit(_find_plate_rect_in_vehicle(vehicle))
        if plate_patch is not None:
            yield plate_patch

    base = emit(_plate_crop(frame, bbox))
    if base is not None:
        yield base

    x1, y1, x2, y2 = [int(v) for v in bbox]
    bw, bh = x2 - x1, y2 - y1
    if bw <= 0 or bh <= 0:
        return

    fallbacks = [
        (0.28, 0.74, 0.72, 0.99),
        (0.22, 0.72, 0.78, 1.0),
        (0.18, 0.68, 0.82, 1.0),
        (0.32, 0.78, 0.68, 0.98),
        (0.35, 0.80, 0.65, 0.97),
    ]
    for rel in fallbacks:
        crop = emit(_rel_plate_crop(frame, bbox, rel))
        if crop is not None:
            yield crop


def _normalize_plate(raw: str) -> str | None:
    cleaned = re.sub(r"[^0-9A-Z.\-\s]", "", raw.upper())
    if not cleaned:
        return None
    compact = re.sub(r"\s+", "", cleaned)

    patterns = [
        re.compile(r"^(\d{2})[-\s]?([A-Z]\d?)[-\s.]?(\d{2,3}\.?\d{0,2})$", re.IGNORECASE),
        re.compile(r"^(\d{2})[-\s]?([A-Z]\d?)[-\s.]?(\d{4,5})$", re.IGNORECASE),
        re.compile(r"^(\d{2})([A-Z]\d?)(\d{2,3}\.?\d{0,2})$", re.IGNORECASE),
        re.compile(r"^(\d{2})([A-Z]\d?)(\d{4,5})$", re.IGNORECASE),
    ]

    for text in (compact, cleaned.replace(" ", "")):
        for pattern in patterns:
            match = pattern.search(text)
            if not match:
                continue
            province, series, number = match.groups()
            series = series.upper()
            number = number.replace(" ", "")
            if "." in number:
                plate = f"{province}-{series}{number}"
            elif len(number) >= 4:
                plate = f"{province}-{series}.{number}"
            else:
                plate = f"{province}-{series}-{number}"
            alnum = re.sub(r"[^0-9A-Z]", "", plate)
            if len(alnum) < 7:
                continue
            return plate
    return None


def _ocr_image(image: np.ndarray, psm: int) -> str | None:
    if _TESSERACT is None:
        return None
    ok, buf = cv2.imencode(".png", image)
    if not ok:
        return None

    path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            handle.write(buf.tobytes())
            path = handle.name
        cmd = [
            _TESSERACT,
            path,
            "stdout",
            "-l",
            _OCR_LANG,
            "--psm",
            str(psm),
            "-c",
            "tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.-",
        ]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=4,
            check=False,
        )
        if result.returncode != 0:
            return None
        text = result.stdout.strip()
        return text or None
    except (OSError, subprocess.SubprocessError) as exc:
        logger.debug("OCR biển số thất bại: %s", exc)
        return None
    finally:
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass


def _preprocess_variants(crop: np.ndarray) -> Iterable[np.ndarray]:
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 5, 50, 50)
    target_h = max(140, gray.shape[0] * 14)
    scale = max(5, target_h // max(gray.shape[0], 1))
    gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_LANCZOS4)
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    adapt = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 8,
    )
    yield otsu
    yield cv2.bitwise_not(otsu)
    yield adapt
    yield cv2.bitwise_not(adapt)


def _ocr_crop(crop: np.ndarray) -> str | None:
    for variant in _preprocess_variants(crop):
        for psm in (7, 6, 11, 13):
            candidate = _ocr_image(variant, psm)
            if not candidate:
                continue
            plate = _normalize_plate(candidate)
            if plate:
                return plate
    return None


def demo_plate_from_bbox(
    camera_id: str,
    bbox: list[float] | tuple[float, ...],
) -> str:
    """Biển số demo ổn định theo vị trí xe trên camera (presentation)."""
    cx = (float(bbox[0]) + float(bbox[2])) / 2.0
    cy = (float(bbox[1]) + float(bbox[3])) / 2.0
    digest = hashlib.md5(f"{camera_id}:{int(cx // 40)}:{int(cy // 40)}".encode()).hexdigest()
    idx = int(digest[:8], 16) % len(_DEMO_PLATES)
    return _DEMO_PLATES[idx]


def read_vehicle_plate(
    frame: np.ndarray,
    bbox: list[float] | tuple[float, ...],
    plate_box_rel: list[float] | tuple[float, ...] | None = None,
) -> str | None:
    """Trả biển số đọc được từ ảnh — None nếu OCR không xác thực được."""
    if _TESSERACT is None:
        logger.debug("Chưa cài tesseract — bỏ qua OCR biển số")
        return None
    for crop in _plate_crop_candidates(frame, bbox, plate_box_rel):
        plate = _ocr_crop(crop)
        if plate:
            return plate
    return None


def resolve_vehicle_plate(
    frame: np.ndarray,
    bbox: list[float] | tuple[float, ...],
    *,
    camera_id: str = "A-03",
    plate_box_rel: list[float] | tuple[float, ...] | None = None,
) -> str | None:
    """OCR trước; nếu demo bật thì gán biển số mẫu ổn định."""
    plate = read_vehicle_plate(frame, bbox, plate_box_rel)
    if plate:
        return plate
    if settings.atgt_demo_enabled:
        return demo_plate_from_bbox(camera_id, bbox)
    return None


def tesseract_available() -> bool:
    return _TESSERACT is not None
