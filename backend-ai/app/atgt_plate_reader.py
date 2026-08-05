"""Đọc biển số xe từ khung hình — chỉ trả giá trị khi OCR xác thực được, không fake."""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
from typing import Iterable

import cv2
import numpy as np

logger = logging.getLogger("atgt_plate_reader")

_VN_PLATE_RE = re.compile(
    r"(\d{2})[-\s]?([A-Z][0-9A-Z]?)[-\s.]?(\d{3,5}(?:\.\d{1,2})?)",
    re.IGNORECASE,
)

_TESSERACT = shutil.which("tesseract")


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

    base = emit(_plate_crop(frame, bbox))
    if base is not None:
        yield base

    x1, y1, x2, y2 = [int(v) for v in bbox]
    bw, bh = x2 - x1, y2 - y1
    if bw <= 0 or bh <= 0:
        return

    fallbacks = [
        (0.22, 0.72, 0.78, 1.0),
        (0.18, 0.68, 0.82, 1.0),
        (0.28, 0.76, 0.72, 0.98),
    ]
    for rel in fallbacks:
        crop = emit(_rel_plate_crop(frame, bbox, rel))
        if crop is not None:
            yield crop


def _normalize_plate(raw: str) -> str | None:
    cleaned = re.sub(r"[^0-9A-Z.\-\s]", "", raw.upper())
    if not cleaned:
        return None
    match = _VN_PLATE_RE.search(cleaned.replace(" ", "")) or _VN_PLATE_RE.search(cleaned)
    if not match:
        return None
    province, series, number = match.groups()
    series = series.upper()
    number = number.replace(" ", "")
    if "." in number:
        plate = f"{province}-{series}{number}"
    else:
        plate = f"{province}-{series}.{number}"
    if len(re.sub(r"[^0-9A-Z]", "", plate)) < 7:
        return None
    return plate


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
        result = subprocess.run(
            [
                _TESSERACT,
                path,
                "stdout",
                "--psm",
                str(psm),
                "-c",
                "tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.-",
            ],
            capture_output=True,
            text=True,
            timeout=3,
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
    target_h = max(120, gray.shape[0] * 12)
    scale = max(4, target_h // max(gray.shape[0], 1))
    gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_LANCZOS4)
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    adapt = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 8,
    )
    yield otsu
    yield cv2.bitwise_not(otsu)
    yield adapt


def _ocr_crop(crop: np.ndarray) -> str | None:
    for variant in _preprocess_variants(crop):
        for psm in (6, 7, 11):
            candidate = _ocr_image(variant, psm)
            if not candidate:
                continue
            plate = _normalize_plate(candidate)
            if plate:
                return plate
    return None


def read_vehicle_plate(
    frame: np.ndarray,
    bbox: list[float] | tuple[float, ...],
    plate_box_rel: list[float] | tuple[float, ...] | None = None,
) -> str | None:
    """Trả biển số đọc được từ ảnh — None nếu OCR không xác thực được."""
    for crop in _plate_crop_candidates(frame, bbox, plate_box_rel):
        plate = _ocr_crop(crop)
        if plate:
            return plate
    return None
