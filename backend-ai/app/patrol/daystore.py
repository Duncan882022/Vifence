"""Sự kiện tuần tra theo ngày — Đối tượng / Người / Định danh.

Quy tắc nghiệp vụ: **một người một thẻ mỗi ngày**. Camera quay liên tục thì
không đẻ sự kiện theo khung hình: gặp lại chỉ cập nhật hiện diện (last_seen /
lịch sử xuất hiện), không tăng bộ đếm. Khoá chính `(event_date, pers_id)` nên
không có đường nào lách qua được.

Ba tầng không phải ba bảng: Đối tượng sống trong ngày rồi xoá (chưa thấy mặt
nên chẳng có gì để nhận lại hôm sau), còn Người và Định danh dùng chung bảng
`persons`, phân biệt bằng `status`.
"""

from __future__ import annotations

import time
from typing import Any

from . import db, identity
from .presence import (
    merge_source_cameras,
    parse_source_cameras,
    should_extend_presence,
)

# Legacy alias — không GPS thì fallback trong should_extend_presence.
APPEARANCE_GAP_SEC = 45.0
# Tab Người / Định danh — điểm tối thiểu (face_quality×2 + confidence), đồng bộ FE.
PERSON_LIST_MIN_SNAPSHOT_SCORE = 1.05
# Camera quay liên tục (~6 FPS): đứng yên hàng giờ không được ghi SQLite mỗi khung.
# Refresh last_seen / appearance tối đa mỗi khoảng này, trừ khi ảnh rõ hơn.
TOUCH_MIN_INTERVAL_SEC = 10.0
# Hai ByteTrack song song (ptk0001 + ptk0004) trên cùng camera → một thẻ obj-*.
PARALLEL_OBJ_START_MAX_SEC = 30.0
PARALLEL_OBJ_OVERLAP_MIN_RATIO = 0.75
PARALLEL_OBJ_ACTIVE_SEC = 90.0


def _person_snapshot_score_floor() -> float:
    """Điểm tối thiểu coi là ảnh có mặt đủ rõ (bodycam gate ×2 + confidence modest)."""
    from ..config import settings

    return float(settings.patrol_face_detect_min_score_bodycam) * 2.0 + 0.4


def _person_card_eligible(
    *,
    face_eligible: bool,
    snapshot_path: str | None,
    snapshot_score: float,
) -> bool:
    """Tab Người / popup — chỉ khi mặt đủ rõ (đồng bộ FE ≥1.05)."""
    if not face_eligible or not snapshot_path:
        return False
    return float(snapshot_score) >= PERSON_LIST_MIN_SNAPSHOT_SCORE


def _should_refresh_presence(
    row,
    ts: float,
    snapshot_path: str | None,
    snapshot_score: float,
) -> tuple[bool, bool]:
    """(ghi DB, giữ snapshot mới). Hàng mới luôn ghi — dùng cho Đối tượng."""
    if row is None:
        return True, bool(snapshot_path)
    keep_new = bool(snapshot_path) and snapshot_score >= float(row["snapshot_score"] or 0)
    if keep_new:
        return True, True
    last = float(row["last_seen"] or 0)
    return (ts - last) >= TOUCH_MIN_INTERVAL_SEC, False


def _should_refresh_person_snapshot(
    row,
    ts: float,
    snapshot_path: str | None,
    snapshot_score: float,
    *,
    face_eligible: bool,
    is_identified: bool,
) -> tuple[bool, bool]:
    """(ghi DB, giữ snapshot mới) cho Người / Định danh.

    Không gắn ảnh lưng/tay lên thẻ khi chưa face_eligible. Định danh dùng
    khung mặt mới nhất đủ rõ — không giữ best-of cả đời khiến ảnh đứng im.
    """
    if row is None:
        return True, bool(snapshot_path) and face_eligible

    last = float(row["last_seen"] or 0)
    interval_ok = (ts - last) >= TOUCH_MIN_INTERVAL_SEC

    if not face_eligible or not snapshot_path:
        return interval_ok, False

    old_score = float(row["snapshot_score"] or 0)
    floor = _person_snapshot_score_floor()

    if is_identified:
        if snapshot_score < floor:
            return interval_ok, False
        # Định danh: luôn dùng khung mặt mới nhất đủ rõ — đồng bộ thẻ ↔ popup.
        return True, True

    keep_new = snapshot_score >= old_score
    if keep_new:
        return True, True
    return interval_ok, False


def _fmt_obj(date: str, seq: int) -> str:
    return f"obj-{date.replace('-', '')}-{seq:04d}"


def _ensure_obj_counter(conn, date: str) -> None:
    """Sau restore DB — counter obj:* không được thấp hơn obj_id đã có."""
    row = conn.execute(
        "SELECT MAX(CAST(substr(obj_id, -4) AS INTEGER)) FROM daily_objects"
        " WHERE event_date = ?",
        (date,),
    ).fetchone()
    max_seq = int(row[0] or 0) if row else 0
    if max_seq <= 0:
        return
    name = f"obj:{date}"
    conn.execute(
        "INSERT INTO counters(name, value) VALUES(?, ?)"
        " ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)",
        (name, max_seq),
    )


# ---------------------------------------------------------------------------
# Đối tượng — chỉ sống trong ngày


def touch_object(
    obj_id: str | None,
    *,
    camera_id: str,
    zone_id: str | None = None,
    snapshot_path: str | None = None,
    snapshot_score: float = 0.0,
    now: float | None = None,
    seen_since: float | None = None,
    gps_lat: float | None = None,
    gps_lng: float | None = None,
    skip_appearance: bool = False,
) -> str:
    """Ghi nhận một Đối tượng. Không truyền `obj_id` thì cấp mã mới.

    `seen_since` — mốc bắt đầu bám track (trước dwell). `now` là lúc chốt /
    lần thấy mới nhất. Camera liên tục: không UPDATE mỗi khung.
    """
    ts = now or time.time()
    first = float(seen_since) if seen_since is not None else ts
    if first > ts:
        first = ts
    date = db.today_vn(ts)
    appearance_snapshot: str | None = None

    with db.tx() as conn:
        if not obj_id:
            _ensure_obj_counter(conn, date)
            seq = db.next_counter(conn, f"obj:{date}")
            obj_id = _fmt_obj(date, seq)
            conn.execute(
                "INSERT INTO daily_objects"
                "(event_date, obj_id, first_seen, last_seen, snapshot_path, snapshot_score)"
                " VALUES(?,?,?,?,?,?)",
                (date, obj_id, first, ts, snapshot_path, snapshot_score),
            )
            appearance_snapshot = snapshot_path
        else:
            row = conn.execute(
                "SELECT snapshot_score, last_seen FROM daily_objects"
                " WHERE event_date = ? AND obj_id = ?",
                (date, obj_id),
            ).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO daily_objects"
                    "(event_date, obj_id, first_seen, last_seen, snapshot_path, snapshot_score)"
                    " VALUES(?,?,?,?,?,?)",
                    (date, obj_id, first, ts, snapshot_path, snapshot_score),
                )
                appearance_snapshot = snapshot_path
            else:
                write, keep_new = _should_refresh_presence(
                    row, ts, snapshot_path, snapshot_score
                )
                if write:
                    if keep_new:
                        conn.execute(
                            "UPDATE daily_objects SET last_seen = ?, snapshot_path = ?,"
                            " snapshot_score = ? WHERE event_date = ? AND obj_id = ?",
                            (ts, snapshot_path, snapshot_score, date, obj_id),
                        )
                        appearance_snapshot = snapshot_path
                    else:
                        conn.execute(
                            "UPDATE daily_objects SET last_seen = ?"
                            " WHERE event_date = ? AND obj_id = ?",
                            (ts, date, obj_id),
                        )
                        if snapshot_path:
                            appearance_snapshot = snapshot_path
                elif snapshot_path:
                    appearance_snapshot = snapshot_path
        if not skip_appearance:
            _touch_appearance(
                conn, date, obj_id, camera_id, zone_id, ts,
                gps_lat=gps_lat, gps_lng=gps_lng,
                snapshot_path=appearance_snapshot,
                new_encounter=seen_since is not None,
            )

    return obj_id


def list_objects(date: str | None = None) -> list[dict[str, Any]]:
    d = date or db.today_vn()
    rows = db.query(
        "SELECT * FROM daily_objects WHERE event_date = ? ORDER BY last_seen DESC", (d,)
    )
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Người / Định danh — thẻ theo ngày


def touch_person_event(
    pers_id: str,
    *,
    camera_id: str,
    zone_id: str | None = None,
    snapshot_path: str | None = None,
    snapshot_score: float = 0.0,
    face_eligible: bool = False,
    now: float | None = None,
    seen_since: float | None = None,
    gps_lat: float | None = None,
    gps_lng: float | None = None,
    skip_appearance: bool = False,
) -> None:
    ts = now or time.time()
    first = float(seen_since) if seen_since is not None else ts
    if first > ts:
        first = ts
    date = db.today_vn(ts)
    pid = identity.resolve_alias(pers_id)
    person = identity.get_person(pid)
    is_identified = bool(
        person and person.get("status") == identity.STATUS_IDENTIFIED
    )
    appearance_snapshot: str | None = None
    card_eligible = _person_card_eligible(
        face_eligible=face_eligible,
        snapshot_path=snapshot_path,
        snapshot_score=snapshot_score,
    )

    with db.tx() as conn:
        row = conn.execute(
            "SELECT snapshot_score, last_seen FROM daily_events"
            " WHERE event_date = ? AND pers_id = ?",
            (date, pid),
        ).fetchone()
        if row is None:
            card_snap = snapshot_path if card_eligible else None
            card_score = snapshot_score if card_eligible else 0.0
            appearance_snapshot = card_snap
            conn.execute(
                "INSERT INTO daily_events"
                "(event_date, pers_id, first_seen, last_seen, snapshot_path, snapshot_score)"
                " VALUES(?,?,?,?,?,?)",
                (date, pid, first, ts, card_snap, card_score),
            )
        else:
            write, keep_new = _should_refresh_person_snapshot(
                row,
                ts,
                snapshot_path,
                snapshot_score,
                face_eligible=face_eligible,
                is_identified=is_identified,
            )
            if write:
                if keep_new and card_eligible:
                    conn.execute(
                        "UPDATE daily_events SET last_seen = ?, snapshot_path = ?,"
                        " snapshot_score = ? WHERE event_date = ? AND pers_id = ?",
                        (ts, snapshot_path, snapshot_score, date, pid),
                    )
                    appearance_snapshot = snapshot_path
                else:
                    conn.execute(
                        "UPDATE daily_events SET last_seen = ?"
                        " WHERE event_date = ? AND pers_id = ?",
                        (ts, date, pid),
                    )
                    if card_eligible and snapshot_path:
                        appearance_snapshot = snapshot_path
            elif card_eligible and snapshot_path:
                appearance_snapshot = snapshot_path
        conn.execute(
            "UPDATE persons SET last_seen = ?, first_seen = COALESCE(first_seen, ?)"
            " WHERE pers_id = ?",
            (ts, first, pid),
        )
        if not skip_appearance:
            _touch_appearance(
                conn, date, pid, camera_id, zone_id, ts,
                gps_lat=gps_lat, gps_lng=gps_lng,
                snapshot_path=appearance_snapshot,
                new_encounter=seen_since is not None,
            )


def _object_cards_overlap(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Hai thẻ obj cùng lượt (track song song) — overlap thời gian + start gần nhau."""
    first_a, last_a = float(a["first_seen"]), float(a["last_seen"])
    first_b, last_b = float(b["first_seen"]), float(b["last_seen"])
    if abs(first_a - first_b) > PARALLEL_OBJ_START_MAX_SEC:
        return False
    overlap = max(0.0, min(last_a, last_b) - max(first_a, first_b))
    min_dur = min(max(last_a - first_a, 1.0), max(last_b - first_b, 1.0))
    return overlap / min_dur >= PARALLEL_OBJ_OVERLAP_MIN_RATIO


def _object_primary_camera(event_date: str, obj_id: str) -> str | None:
    row = db.query_one(
        "SELECT camera_id FROM appearances"
        " WHERE event_date = ? AND subject_id = ? AND qualified = 1"
        " ORDER BY started_at ASC LIMIT 1",
        (event_date, obj_id),
    )
    if row is None:
        return None
    cam = str(row["camera_id"] or "").strip()
    return cam or None


def _object_primary_gps(event_date: str, obj_id: str) -> tuple[float | None, float | None]:
    row = db.query_one(
        "SELECT gps_lat, gps_lng FROM appearances"
        " WHERE event_date = ? AND subject_id = ? AND qualified = 1"
        " ORDER BY started_at ASC LIMIT 1",
        (event_date, obj_id),
    )
    if row is None:
        return None, None
    try:
        lat = float(row["gps_lat"]) if row["gps_lat"] is not None else None
        lng = float(row["gps_lng"]) if row["gps_lng"] is not None else None
    except (TypeError, ValueError):
        return None, None
    return lat, lng


def _objects_same_site(
    event_date: str,
    obj_a: str,
    obj_b: str,
) -> bool:
    """Cùng GPS (≤15m) hoặc chưa có GPS — chỉ gộp khi cùng camera."""
    from .presence import haversine_m

    lat_a, lng_a = _object_primary_gps(event_date, obj_a)
    lat_b, lng_b = _object_primary_gps(event_date, obj_b)
    if lat_a is None or lng_a is None or lat_b is None or lng_b is None:
        return True
    return haversine_m(lat_a, lng_a, lat_b, lng_b) <= 15.0


def find_parallel_object_card(
    event_date: str,
    camera_id: str,
    started_at: float,
    now_ts: float,
) -> str | None:
    """Thẻ obj đang active cùng camera — tránh cấp obj mới khi ByteTrack tách đôi."""
    cam = (camera_id or "").strip()
    if not cam:
        return None
    rows = db.query(
        "SELECT o.obj_id, o.first_seen, o.last_seen"
        " FROM daily_objects o"
        " WHERE o.event_date = ?"
        " ORDER BY o.first_seen ASC",
        (event_date,),
    )
    best: str | None = None
    best_last = 0.0
    probe = {"first_seen": started_at, "last_seen": now_ts}
    for row in rows:
        oid = str(row["obj_id"])
        if _object_primary_camera(event_date, oid) != cam:
            continue
        if not _object_cards_overlap(dict(row), probe):
            continue
        last_seen = float(row["last_seen"])
        if now_ts - last_seen > PARALLEL_OBJ_ACTIVE_SEC:
            continue
        if last_seen >= best_last:
            best_last = last_seen
            best = oid
    return best


def merge_object_cards(
    keep_obj_id: str,
    drop_obj_id: str,
    *,
    now: float | None = None,
    event_date: str | None = None,
) -> bool:
    """Gộp hai thẻ Đối tượng trùng một người (track song song) → giữ keep."""
    keep = (keep_obj_id or "").strip()
    drop = (drop_obj_id or "").strip()
    if not keep or not drop or keep == drop:
        return False
    ts = now or time.time()
    date = event_date or db.today_vn(ts)
    with db.tx() as conn:
        keep_row = conn.execute(
            "SELECT * FROM daily_objects WHERE event_date = ? AND obj_id = ?",
            (date, keep),
        ).fetchone()
        drop_row = conn.execute(
            "SELECT * FROM daily_objects WHERE event_date = ? AND obj_id = ?",
            (date, drop),
        ).fetchone()
        if keep_row is None or drop_row is None:
            return False
        better = float(drop_row["snapshot_score"]) > float(keep_row["snapshot_score"])
        conn.execute(
            "UPDATE daily_objects SET first_seen = ?, last_seen = ?,"
            " snapshot_path = ?, snapshot_score = ?"
            " WHERE event_date = ? AND obj_id = ?",
            (
                min(float(keep_row["first_seen"]), float(drop_row["first_seen"])),
                max(float(keep_row["last_seen"]), float(drop_row["last_seen"]), ts),
                drop_row["snapshot_path"] if better else keep_row["snapshot_path"],
                max(float(keep_row["snapshot_score"]), float(drop_row["snapshot_score"])),
                date,
                keep,
            ),
        )
        conn.execute(
            "UPDATE appearances SET subject_id = ? WHERE event_date = ? AND subject_id = ?",
            (keep, date, drop),
        )
        conn.execute(
            "DELETE FROM daily_objects WHERE event_date = ? AND obj_id = ?",
            (date, drop),
        )
    coalesce_subject_appearances(keep, date)
    return True


def coalesce_parallel_object_cards(date: str | None = None) -> int:
    """Gộp thẻ obj trùng lượt (2 track cùng camera/GPS) — repair sau deploy."""
    d = date or db.today_vn()
    objs = list_objects(d)
    merged = 0
    removed: set[str] = set()
    for i, a in enumerate(objs):
        aid = str(a["obj_id"])
        if aid in removed:
            continue
        cam_a = _object_primary_camera(d, aid)
        for b in objs[i + 1 :]:
            bid = str(b["obj_id"])
            if bid in removed:
                continue
            if not _object_cards_overlap(a, b):
                continue
            cam_b = _object_primary_camera(d, bid)
            if cam_a and cam_b and cam_a != cam_b:
                continue
            if not _objects_same_site(d, aid, bid):
                continue
            keep, drop = (aid, bid) if aid < bid else (bid, aid)
            if merge_object_cards(keep, drop, event_date=d):
                merged += 1
                removed.add(drop)
                if drop == aid:
                    break
                a = db.query_one(
                    "SELECT * FROM daily_objects WHERE event_date = ? AND obj_id = ?",
                    (d, aid),
                ) or a
    return merged


def promote_objects_with_face_snapshot(date: str | None = None) -> int:
    """Repair: obj có snapshot_score ≥ ngưỡng Người → thăng pers-* (không cần embedding)."""
    d = date or db.today_vn()
    promoted = 0
    for row in list_objects(d):
        score = float(row.get("snapshot_score") or 0)
        if score < PERSON_LIST_MIN_SNAPSHOT_SCORE:
            continue
        oid = str(row["obj_id"])
        pers_id = identity.create_person(origin="camera_promote", now=float(row["last_seen"]))
        promote_object(oid, pers_id, now=float(row["last_seen"]))
        promoted += 1
    return promoted


def promote_object(
    obj_id: str,
    pers_id: str,
    *,
    now: float | None = None,
) -> None:
    """Đối tượng bắt được mặt → dồn sang thẻ của Người.

    Người này có thể đã có thẻ hôm nay (gặp ở camera khác lúc trước). Khi đó
    phải **gộp** chứ không thể dời: khoá chính chặn hai thẻ cùng ngày. Đúng
    nghiệp vụ — gặp lại thì vào lịch sử, không đẻ thẻ mới.
    """
    ts = now or time.time()
    date = db.today_vn(ts)
    pid = identity.resolve_alias(pers_id)

    with db.tx() as conn:
        obj = conn.execute(
            "SELECT * FROM daily_objects WHERE event_date = ? AND obj_id = ?",
            (date, obj_id),
        ).fetchone()
        if obj is None:
            return

        existing = conn.execute(
            "SELECT * FROM daily_events WHERE event_date = ? AND pers_id = ?",
            (date, pid),
        ).fetchone()

        if existing is None:
            conn.execute(
                "INSERT INTO daily_events"
                "(event_date, pers_id, first_seen, last_seen, snapshot_path, snapshot_score)"
                " VALUES(?,?,?,?,?,?)",
                (
                    date,
                    pid,
                    obj["first_seen"],
                    max(float(obj["last_seen"]), ts),
                    obj["snapshot_path"],
                    obj["snapshot_score"],
                ),
            )
        else:
            better = float(obj["snapshot_score"]) > float(existing["snapshot_score"])
            conn.execute(
                "UPDATE daily_events SET first_seen = ?, last_seen = ?,"
                " snapshot_path = ?, snapshot_score = ?"
                " WHERE event_date = ? AND pers_id = ?",
                (
                    min(float(existing["first_seen"]), float(obj["first_seen"])),
                    max(float(existing["last_seen"]), float(obj["last_seen"]), ts),
                    obj["snapshot_path"] if better else existing["snapshot_path"],
                    max(float(obj["snapshot_score"]), float(existing["snapshot_score"])),
                    date,
                    pid,
                ),
            )

        # Lịch sử xuất hiện của Đối tượng thuộc về Người kể từ giờ.
        conn.execute(
            "UPDATE appearances SET subject_id = ? WHERE event_date = ? AND subject_id = ?",
            (pid, date, obj_id),
        )
        conn.execute(
            "DELETE FROM daily_objects WHERE event_date = ? AND obj_id = ?",
            (date, obj_id),
        )
        conn.execute(
            "UPDATE persons SET last_seen = ?, first_seen = COALESCE(first_seen, ?)"
            " WHERE pers_id = ?",
            (ts, float(obj["first_seen"]), pid),
        )


def list_person_events(date: str | None = None) -> list[dict[str, Any]]:
    """Thẻ Người + Định danh trong ngày.

    Tầng suy từ `persons.status` lúc truy vấn chứ không chụp lại vào thẻ: gán
    tên lúc 3 giờ chiều là thẻ chuyển sang tab Định danh ngay, kể cả thẻ của
    những ngày trước.
    """
    d = date or db.today_vn()
    rows = db.query(
        "SELECT e.event_date, e.pers_id, e.first_seen, e.last_seen,"
        "       e.snapshot_path, e.snapshot_score,"
        "       p.status, p.iden_code, p.full_name, p.employee_code, p.contractor"
        "  FROM daily_events e JOIN persons p ON p.pers_id = e.pers_id"
        " WHERE e.event_date = ? ORDER BY e.last_seen DESC",
        (d,),
    )
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Lịch sử xuất hiện


def _next_presence_seq(conn, date: str, subject_id: str) -> int:
    row = conn.execute(
        "SELECT COALESCE(MAX(presence_seq), 0) AS mx FROM appearances"
        " WHERE event_date = ? AND subject_id = ? AND qualified = 1",
        (date, subject_id),
    ).fetchone()
    return int(row["mx"] or 0) + 1


def _touch_appearance(
    conn,
    date: str,
    subject_id: str,
    camera_id: str,
    zone_id: str | None,
    ts: float,
    *,
    gps_lat: float | None = None,
    gps_lng: float | None = None,
    qualified: bool = True,
    snapshot_path: str | None = None,
    new_encounter: bool = False,
) -> None:
    """Một lần gặp = một dòng popup + heatmap.

    Đứng trong khung liên tục (≤45s / cùng GPS) → gộp một lần gặp, kéo ended_at.
    Track mới (`new_encounter`) hoặc vắng lâu → dòng mới. Ảnh popup = snapshot
    lúc bắt đầu lần gặp (card ngoài giữ ảnh mới nhất).
    """
    q = 1 if qualified else 0
    row = None if new_encounter else conn.execute(
        "SELECT id, ended_at, camera_id, gps_lat, gps_lng, gps_lat_end, gps_lng_end,"
        " source_cameras, snapshot_path FROM appearances"
        " WHERE event_date = ? AND subject_id = ? AND qualified = 1"
        " ORDER BY ended_at DESC LIMIT 1",
        (date, subject_id),
    ).fetchone()

    lat_end = gps_lat
    lng_end = gps_lng

    if row is not None and should_extend_presence(
        row, ts, gps_lat, gps_lng, camera_id=camera_id,
    ):
        src = merge_source_cameras(
            str(row["source_cameras"]) if row["source_cameras"] else None,
            camera_id,
        )
        if lat_end is None:
            lat_end = row["gps_lat_end"] if row["gps_lat_end"] is not None else row["gps_lat"]
        if lng_end is None:
            lng_end = row["gps_lng_end"] if row["gps_lng_end"] is not None else row["gps_lng"]
        # Lịch sử tích lũy — giữ ảnh lúc bắt đầu lần gặp; card ngoài vẫn upsert ảnh mới.
        prev_snap = str(row["snapshot_path"] or "").strip() or None
        incoming = (snapshot_path or "").strip() or None
        snap = prev_snap or incoming
        conn.execute(
            "UPDATE appearances SET ended_at = ?, gps_lat_end = ?, gps_lng_end = ?,"
            " camera_id = ?, source_cameras = ?,"
            " snapshot_path = COALESCE(snapshot_path, ?) WHERE id = ?",
            (ts, lat_end, lng_end, camera_id, src, incoming, row["id"]),
        )
        return

    seq = _next_presence_seq(conn, date, subject_id)
    src = merge_source_cameras(None, camera_id)
    snap = (snapshot_path or "").strip() or None
    conn.execute(
        "INSERT INTO appearances"
        "(event_date, subject_id, camera_id, zone_id, started_at, ended_at,"
        " gps_lat, gps_lng, gps_lat_end, gps_lng_end, qualified, presence_seq,"
        " source_cameras, snapshot_path)"
        " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            date, subject_id, camera_id, zone_id, ts, ts,
            gps_lat, gps_lng, lat_end, lng_end, q, seq, src, snap,
        ),
    )


def _appearance_row_payload(row: Any) -> dict[str, Any]:
    item = dict(row)
    item["source_cameras"] = parse_source_cameras(
        str(row["source_cameras"]) if row["source_cameras"] else None,
    )
    return item


def _dedupe_aggregator_appearance_rows(rows: list[Any]) -> list[Any]:
    """Bỏ dòng legacy (_touch_appearance) trùng session aggregator (track_id)."""
    track_rows = [r for r in rows if str(r["track_id"] or "").strip()]
    if not track_rows:
        return rows
    legacy_rows = [r for r in rows if not str(r["track_id"] or "").strip()]
    if not legacy_rows:
        return rows

    def _overlaps_track(leg: Any) -> bool:
        leg_start = float(leg["started_at"])
        leg_cam = str(leg["camera_id"])
        for tr in track_rows:
            if str(tr["camera_id"]) != leg_cam:
                continue
            tr_start = float(tr["started_at"])
            if abs(tr_start - leg_start) <= 45.0:
                return True
        return False

    kept_legacy = [leg for leg in legacy_rows if not _overlaps_track(leg)]
    merged = list(track_rows) + kept_legacy
    merged.sort(key=lambda r: float(r["started_at"]))
    return merged


def _resolve_appearance_subject_id(subject_id: str) -> str:
    """Map gallery/sgc alias → pers-* lưu trong appearances.

    Không map sang obj-* — OBJ là quan sát chưa định danh, gộp nhầm sẽ trộn
    snapshot Unknown với người đã gán gallery (vd. Duncan).
    """
    sid = identity.resolve_alias((subject_id or "").strip())
    if sid.startswith("pers-") or sid.startswith("obj-"):
        return sid
    try:
        from ..patrol_identity_store import lookup_patrol_identity

        row = lookup_patrol_identity(sid)
        if row:
            for alias in row.get("aliases") or []:
                key = str(alias).strip()
                if key.startswith("pers-"):
                    return identity.resolve_alias(key)
    except Exception:  # noqa: BLE001
        pass
    return sid


def list_appearances(subject_id: str, date: str | None = None) -> dict[str, Any]:
    """Lịch sử xuất hiện cho popup — nhóm theo camera."""
    d = date or db.today_vn()
    sid = _resolve_appearance_subject_id(subject_id)
    rows = db.query(
        "SELECT id, camera_id, zone_id, started_at, ended_at,"
        " gps_lat, gps_lng, gps_lat_end, gps_lng_end,"
        " qualified, presence_seq, source_cameras, snapshot_path,"
        " track_id, session_id, counted, event_payload_json, interactions_json"
        " FROM appearances"
        " WHERE event_date = ? AND subject_id = ? AND qualified = 1"
        " ORDER BY started_at ASC",
        (d, sid),
    )
    rows = _dedupe_aggregator_appearance_rows(rows)
    by_camera: dict[str, list[dict[str, Any]]] = {}
    segments: list[dict[str, Any]] = []
    for r in rows:
        item = _appearance_row_payload(r)
        segments.append(item)
        primary = str(r["camera_id"])
        by_camera.setdefault(primary, []).append(item)
        for cam in item["source_cameras"]:
            if cam != primary:
                by_camera.setdefault(cam, []).append(item)
    return {"by_camera": by_camera, "segments": segments}


def list_day_presences(date: str | None = None) -> list[dict[str, Any]]:
    """Mọi lượt gặp qualified trong ngày — heatmap + API."""
    d = date or db.today_vn()
    rows = db.query(
        "SELECT a.id, a.subject_id, a.camera_id, a.zone_id,"
        " a.started_at, a.ended_at, a.gps_lat, a.gps_lng,"
        " a.gps_lat_end, a.gps_lng_end, a.presence_seq, a.source_cameras,"
        " a.track_id, a.session_id, a.counted,"
        " a.event_payload_json, a.interactions_json,"
        " p.status AS person_status, p.iden_code, p.full_name"
        " FROM appearances a"
        " LEFT JOIN persons p ON p.pers_id = a.subject_id"
        " WHERE a.event_date = ? AND a.qualified = 1"
        " ORDER BY a.started_at ASC",
        (d,),
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        item = _appearance_row_payload(r)
        sid = str(r["subject_id"])
        if sid.startswith("obj-"):
            item["tier"] = "object"
        elif r["person_status"] == identity.STATUS_IDENTIFIED:
            item["tier"] = "identity"
        else:
            item["tier"] = "person"
        item["display_name"] = (
            str(r["full_name"]).strip()
            if r["full_name"]
            else (str(r["iden_code"]) if r["iden_code"] else sid)
        )
        out.append(item)
    return out


def coalesce_subject_appearances(
    subject_id: str,
    event_date: str,
    *,
    camera_id: str | None = None,
) -> int:
    """Gộp appearance trùng lượt gặp (2 ByteTrack / merge pers-*)."""
    params: list[Any] = [event_date, subject_id]
    cam_clause = ""
    if camera_id:
        cam_clause = " AND camera_id = ?"
        params.append(camera_id)
    rows = db.query(
        "SELECT id, started_at, ended_at, camera_id, gps_lat, gps_lng,"
        " gps_lat_end, gps_lng_end, snapshot_path, track_id, session_id,"
        " event_payload_json, interactions_json, counted"
        " FROM appearances"
        " WHERE event_date = ? AND subject_id = ? AND qualified = 1"
        f"{cam_clause}"
        " ORDER BY started_at ASC, id ASC",
        tuple(params),
    )
    if len(rows) < 2:
        return 0

    merged = 0
    with db.tx() as conn:
        keep = rows[0]
        for nxt in rows[1:]:
            if str(nxt["camera_id"] or "") != str(keep["camera_id"] or ""):
                keep = nxt
                continue
            if not should_extend_presence(
                keep, float(nxt["ended_at"]), None, None,
                camera_id=str(keep["camera_id"] or ""),
            ):
                keep = nxt
                continue
            snap = (keep["snapshot_path"] or "").strip() or (nxt["snapshot_path"] or "").strip() or None
            conn.execute(
                "UPDATE appearances SET"
                " ended_at = ?, gps_lat_end = ?, gps_lng_end = ?,"
                " snapshot_path = COALESCE(snapshot_path, ?),"
                " counted = MAX(counted, ?)"
                " WHERE id = ?",
                (
                    max(float(keep["ended_at"]), float(nxt["ended_at"])),
                    nxt["gps_lat_end"] or nxt["gps_lat"],
                    nxt["gps_lng_end"] or nxt["gps_lng"],
                    (nxt["snapshot_path"] or "").strip() or None,
                    int(nxt["counted"] or 0),
                    int(keep["id"]),
                ),
            )
            conn.execute("DELETE FROM appearances WHERE id = ?", (int(nxt["id"]),))
            merged += 1
            keep = conn.execute(
                "SELECT id, started_at, ended_at, camera_id, gps_lat, gps_lng,"
                " gps_lat_end, gps_lng_end, snapshot_path, track_id, session_id,"
                " event_payload_json, interactions_json, counted"
                " FROM appearances WHERE id = ?",
                (int(keep["id"]),),
            ).fetchone()
            if keep is None:
                break
    return merged


def find_extendable_track_appearance_row(
    event_date: str,
    subject_id: str,
    camera_id: str,
    ts: float,
    *,
    gps_lat: float | None = None,
    gps_lng: float | None = None,
) -> int | None:
    """Track mới cùng pers + camera trong gap — UPDATE row cũ thay vì INSERT."""
    row = db.query_one(
        "SELECT id, ended_at, camera_id, gps_lat, gps_lng, gps_lat_end, gps_lng_end"
        " FROM appearances"
        " WHERE event_date = ? AND subject_id = ? AND camera_id = ? AND qualified = 1"
        " ORDER BY ended_at DESC LIMIT 1",
        (event_date, subject_id, camera_id),
    )
    if row is None:
        return None
    if not should_extend_presence(
        row, ts, gps_lat, gps_lng, camera_id=camera_id,
    ):
        return None
    return int(row["id"])


def upsert_track_appearance(
    *,
    appearance_id: int | None,
    event_date: str,
    subject_id: str,
    camera_id: str,
    zone_id: str | None,
    track_id: str,
    session_id: str,
    started_at: float,
    ended_at: float,
    gps_lat: float | None,
    gps_lng: float | None,
    payload_json: str,
    interactions_json: str,
    snapshot_path: str | None = None,
    counted: bool = False,
    finalize: bool = False,
) -> int:
    """Một appearance / track session — UPDATE in-place thay vì INSERT mỗi frame."""
    _ = finalize  # reserved — close semantics via ended_at
    counted_int = 1 if counted else 0
    with db.tx() as conn:
        row_id = appearance_id
        if row_id is None:
            extend = conn.execute(
                "SELECT id, ended_at, camera_id, gps_lat, gps_lng, gps_lat_end, gps_lng_end"
                " FROM appearances"
                " WHERE event_date = ? AND subject_id = ? AND camera_id = ? AND qualified = 1"
                " ORDER BY ended_at DESC LIMIT 1",
                (event_date, subject_id, camera_id),
            ).fetchone()
            if extend is not None and should_extend_presence(
                extend, ended_at, gps_lat, gps_lng, camera_id=camera_id,
            ):
                row_id = int(extend["id"])

        if row_id is not None:
            set_parts = [
                "ended_at = ?",
                "gps_lat_end = ?",
                "gps_lng_end = ?",
                "event_payload_json = ?",
                "interactions_json = ?",
                "session_id = ?",
                "track_id = ?",
                "counted = MAX(counted, ?)",
            ]
            params: list[Any] = [
                ended_at,
                gps_lat,
                gps_lng,
                payload_json,
                interactions_json,
                session_id,
                track_id,
                counted_int,
            ]
            if snapshot_path:
                set_parts.append("snapshot_path = ?")
                params.append(snapshot_path)
            params.append(row_id)
            conn.execute(
                f"UPDATE appearances SET {', '.join(set_parts)} WHERE id = ?",
                tuple(params),
            )
            return row_id

        seq_row = conn.execute(
            "SELECT COALESCE(MAX(presence_seq), 0) AS mx FROM appearances"
            " WHERE event_date = ? AND subject_id = ?",
            (event_date, subject_id),
        ).fetchone()
        seq = int(seq_row["mx"] or 0) + 1
        src = merge_source_cameras(None, camera_id)
        cur = conn.execute(
            "INSERT INTO appearances"
            "(event_date, subject_id, camera_id, zone_id, started_at, ended_at,"
            " gps_lat, gps_lng, gps_lat_end, gps_lng_end, qualified, presence_seq,"
            " source_cameras, snapshot_path, track_id, session_id, counted,"
            " event_payload_json, interactions_json)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                event_date,
                subject_id,
                camera_id,
                zone_id,
                started_at,
                ended_at,
                gps_lat,
                gps_lng,
                gps_lat,
                gps_lng,
                1,
                seq,
                src,
                snapshot_path,
                track_id,
                session_id,
                counted_int,
                payload_json,
                interactions_json,
            ),
        )
        return int(cur.lastrowid)


def day_stats(date: str | None = None) -> dict[str, Any]:
    """KPI đếm chuẩn — Người · Lượt gặp · Quan sát chưa gán."""
    d = date or db.today_vn()
    workers = db.query_one(
        "SELECT COUNT(*) AS c FROM daily_events WHERE event_date = ?", (d,),
    )
    person_row = db.query_one(
        "SELECT COUNT(*) AS c FROM daily_events e"
        " JOIN persons p ON p.pers_id = e.pers_id"
        " WHERE e.event_date = ? AND p.status = ?"
        " AND e.snapshot_path IS NOT NULL AND e.snapshot_path != ''"
        " AND e.snapshot_score >= ?",
        (d, identity.STATUS_PERSON, PERSON_LIST_MIN_SNAPSHOT_SCORE),
    )
    identity_row = db.query_one(
        "SELECT COUNT(*) AS c FROM daily_events e"
        " JOIN persons p ON p.pers_id = e.pers_id"
        " WHERE e.event_date = ? AND p.status = ?"
        " AND e.snapshot_path IS NOT NULL AND e.snapshot_path != ''"
        " AND e.snapshot_score >= ?",
        (d, identity.STATUS_IDENTIFIED, PERSON_LIST_MIN_SNAPSHOT_SCORE),
    )
    enc_row = db.query_one(
        "SELECT COUNT(*) AS c FROM appearances"
        " WHERE event_date = ? AND qualified = 1 AND counted = 1"
        " AND subject_id NOT LIKE 'obj-%'",
        (d,),
    )
    obj_row = db.query_one(
        "SELECT COUNT(*) AS c FROM appearances"
        " WHERE event_date = ? AND qualified = 1 AND counted = 1"
        " AND subject_id LIKE 'obj-%'",
        (d,),
    )
    return {
        "date": d,
        "workers_standard": int(workers["c"] if workers else 0),
        "person_count": int(person_row["c"] if person_row else 0),
        "identity_count": int(identity_row["c"] if identity_row else 0),
        "encounters_standard": int(enc_row["c"] if enc_row else 0),
        "unassigned_observations": int(obj_row["c"] if obj_row else 0),
    }
