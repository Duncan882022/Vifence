"""Bất biến vật lý: một người không thể xuất hiện hai chỗ cùng một lúc.

Thẻ sự kiện là hồ sơ theo dõi **một** đối tượng. Khi hai track khác nhau cùng
nằm trong một khung hình tại cùng thời điểm, đó chắc chắn là hai người — dù
mô hình khuôn mặt có chấm chúng giống nhau đến đâu. Đây là căn cứ chắc hơn mọi
ngưỡng cosine, nên dùng nó để chặn gộp nhầm và để tách lại lịch sử đã bị trộn.

Hai track trên **hai camera khác nhau** thì không kết luận được: cùng một người
đi qua hai mũ liền nhau vẫn có thể chồng thời gian do độ trễ luồng.
"""

from __future__ import annotations

from typing import Any

# Chồng lấn dưới ngưỡng này coi như nhiễu mốc thời gian giữa hai luồng, không
# phải bằng chứng hai người. Đúng một nhịp AI (~0.3s) cộng biên an toàn.
MIN_OVERLAP_SEC = 1.0


def _row_get(row: Any, key: str) -> Any:
    try:
        return row[key]
    except (KeyError, IndexError, TypeError):
        return None


def _track_of(row: Any) -> str:
    return str(_row_get(row, "track_id") or "").strip()


def _camera_of(row: Any) -> str:
    return str(_row_get(row, "camera_id") or "").strip()


def _span_of(row: Any) -> tuple[float, float]:
    start = float(_row_get(row, "started_at") or 0.0)
    end = float(_row_get(row, "ended_at") or start)
    return (start, max(end, start))


def overlap_seconds(a: Any, b: Any) -> float:
    a_start, a_end = _span_of(a)
    b_start, b_end = _span_of(b)
    return min(a_end, b_end) - max(a_start, b_start)


def rows_conflict(a: Any, b: Any) -> bool:
    """Hai lượt không thể cùng một người.

    Cùng camera, hai track khác nhau, khoảng thời gian chồng nhau đáng kể —
    nghĩa là hai người cùng có mặt trong một khung hình.
    """
    track_a, track_b = _track_of(a), _track_of(b)
    if not track_a or not track_b or track_a == track_b:
        return False
    if _camera_of(a) != _camera_of(b):
        return False
    return overlap_seconds(a, b) >= MIN_OVERLAP_SEC


def conflicting_track_pairs(rows: list[Any]) -> list[tuple[str, str]]:
    """Các cặp track chắc chắn thuộc hai người khác nhau."""
    pairs: set[tuple[str, str]] = set()
    for i, a in enumerate(rows):
        for b in rows[i + 1:]:
            if rows_conflict(a, b):
                pairs.add(tuple(sorted((_track_of(a), _track_of(b)))))  # type: ignore[arg-type]
    return sorted(pairs)


def has_conflict(rows: list[Any]) -> bool:
    return bool(conflicting_track_pairs(rows))


def _anchor_track(rows: list[Any], anchor_track_id: str | None) -> str:
    anchor = (anchor_track_id or "").strip()
    if anchor:
        return anchor
    # Không chỉ định thì bám lượt mới nhất — đó là lượt thẻ đang hiển thị.
    latest = max(rows, key=lambda r: _span_of(r)[1], default=None)
    return _track_of(latest) if latest is not None else ""


def select_single_subject_rows(
    rows: list[Any],
    *,
    anchor_track_id: str | None = None,
) -> list[Any]:
    """Giữ lại lịch sử của **một** đối tượng quanh track neo.

    Loại mọi track chứng minh được là người khác (chồng khung hình với track
    neo, hoặc với một track đã được giữ). Track không xung đột thì giữ — cùng
    một người đi qua nhiều camera hay bị ByteTrack cắt thành nhiều đoạn vẫn
    phải nằm chung một thẻ.

    Dòng không có `track_id` (bản ghi cũ trước aggregator) luôn được giữ: không
    có căn cứ để loại, và loại đi thì mất lịch sử thật.
    """
    if not rows:
        return rows

    anchor = _anchor_track(rows, anchor_track_id)
    if not anchor:
        return rows

    tracked = [r for r in rows if _track_of(r)]
    untracked = [r for r in rows if not _track_of(r)]

    by_track: dict[str, list[Any]] = {}
    for row in tracked:
        by_track.setdefault(_track_of(row), []).append(row)
    if anchor not in by_track:
        return rows

    accepted: list[str] = [anchor]
    # Duyệt theo thời điểm bắt đầu để kết quả ổn định giữa các lần gọi.
    candidates = sorted(
        (t for t in by_track if t != anchor),
        key=lambda t: min(_span_of(r)[0] for r in by_track[t]),
    )
    for track in candidates:
        conflicts = any(
            rows_conflict(row, kept_row)
            for row in by_track[track]
            for kept in accepted
            for kept_row in by_track[kept]
        )
        if not conflicts:
            accepted.append(track)

    keep = set(accepted)
    kept_rows = [r for r in tracked if _track_of(r) in keep]
    kept_rows.extend(untracked)
    kept_rows.sort(key=lambda r: _span_of(r)[0])
    return kept_rows


def subjects_can_merge(rows_a: list[Any], rows_b: list[Any]) -> bool:
    """Hai mã có thể là cùng một người không — theo bằng chứng thời gian."""
    for a in rows_a:
        for b in rows_b:
            if rows_conflict(a, b):
                return False
    return True


# Hai khung chồng nhau dưới mức này là hai vùng ảnh rời — hai người đứng cạnh
# nhau, không phải một người bị ByteTrack cắt làm hai track.
SPLIT_TRACK_MIN_IOU = 0.30


def bbox_iou(a: list[float] | tuple[float, ...], b: list[float] | tuple[float, ...]) -> float:
    ax1, ay1, ax2, ay2 = (float(v) for v in a[:4])
    bx1, by1, bx2, by2 = (float(v) for v in b[:4])
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = ix2 - ix1, iy2 - iy1
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = iw * ih
    area_a = max(ax2 - ax1, 0.0) * max(ay2 - ay1, 0.0)
    area_b = max(bx2 - bx1, 0.0) * max(by2 - by1, 0.0)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def looks_like_split_track(
    bbox_a: list[float] | None,
    bbox_b: list[float] | None,
) -> bool:
    """Hai track chồng thời gian có phải cùng một người bị cắt đôi không.

    Thiếu vị trí khung thì không kết luận được — trả `True` để giữ nguyên hành
    vi gộp cũ, tránh làm vỡ dữ liệu ghi trước khi có trường `bbox`.
    """
    if not bbox_a or not bbox_b or len(bbox_a) < 4 or len(bbox_b) < 4:
        return True
    return bbox_iou(bbox_a, bbox_b) >= SPLIT_TRACK_MIN_IOU
