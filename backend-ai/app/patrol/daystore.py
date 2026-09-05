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

from ..patrol_tracker import END_REASON_STREAM_OFFLINE as SIGHTING_END_STREAM_OFFLINE
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
# Gộp tk trùng người — cùng ô GPS + cửa sổ thời gian (đồng bộ audit duplicate).
NEARBY_PERSON_MERGE_SEC = 120.0
GPS_BUCKET_EPS = 0.00015
# Camera quay liên tục (~6 FPS): đứng yên hàng giờ không được ghi SQLite mỗi khung.
# Refresh last_seen / appearance tối đa mỗi khoảng này, trừ khi ảnh rõ hơn.
TOUCH_MIN_INTERVAL_SEC = 10.0
# Cùng session/track nhưng hai cửa sổ thời gian phải chồng ít nhất ngần này mới
# coi là một lượt; rời nhau hơn thì người đã đi khỏi rồi quay lại.
_SAME_PRESENCE_OVERLAP_MIN_RATIO = 0.75


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


def _gps_bucket(lat: float, lng: float) -> tuple[int, int]:
    return (round(float(lat) / GPS_BUCKET_EPS), round(float(lng) / GPS_BUCKET_EPS))


def find_same_site_person_today(
    date: str,
    gps_lat: float | None,
    gps_lng: float | None,
    *,
    exclude_pers: str | None = None,
) -> str | None:
    """Cùng ô GPS trong ngày — lần vào lại sau khi rời khỏi camera (không giới hạn 120s)."""
    if gps_lat is None or gps_lng is None:
        return None
    bucket = _gps_bucket(gps_lat, gps_lng)
    exclude = identity.resolve_alias((exclude_pers or "").strip()) if exclude_pers else ""

    rows = db.query(
        "SELECT e.pers_id, e.snapshot_score, a.gps_lat, a.gps_lng"
        " FROM daily_events e"
        " INNER JOIN appearances a"
        "  ON a.event_date = e.event_date AND a.subject_id = e.pers_id"
        " WHERE e.event_date = ? AND a.qualified = 1"
        " AND e.snapshot_path IS NOT NULL AND e.snapshot_path != ''"
        " AND e.snapshot_score >= ?"
        " AND a.gps_lat IS NOT NULL AND a.gps_lng IS NOT NULL"
        " ORDER BY e.snapshot_score DESC, e.last_seen DESC",
        (date, PERSON_LIST_MIN_SNAPSHOT_SCORE),
    )
    best_id: str | None = None
    best_score = -1.0
    for row in rows:
        sid = identity.resolve_alias(str(row["pers_id"]))
        if exclude and sid == exclude:
            continue
        if _gps_bucket(float(row["gps_lat"]), float(row["gps_lng"])) != bucket:
            continue
        score = float(row["snapshot_score"] or 0)
        if score > best_score:
            best_score = score
            best_id = sid
    return best_id


def find_nearby_person_pers_id(
    date: str,
    gps_lat: float | None,
    gps_lng: float | None,
    now: float,
    *,
    exclude_pers: str | None = None,
    within_sec: float = NEARBY_PERSON_MERGE_SEC,
) -> str | None:
    """Tra pers_id thẻ Người gần đây cùng ô GPS — tránh tk-024/025 song song."""
    if gps_lat is None or gps_lng is None:
        return None
    bucket = _gps_bucket(gps_lat, gps_lng)
    exclude = identity.resolve_alias((exclude_pers or "").strip()) if exclude_pers else ""

    rows = db.query(
        "SELECT a.subject_id, e.snapshot_score, a.gps_lat, a.gps_lng"
        " FROM appearances a"
        " INNER JOIN daily_events e"
        "  ON e.event_date = a.event_date AND e.pers_id = a.subject_id"
        " WHERE a.event_date = ? AND a.qualified = 1"
        " AND a.subject_id NOT LIKE 'obj-%'"
        " AND a.gps_lat IS NOT NULL AND a.gps_lng IS NOT NULL"
        " AND ABS(a.started_at - ?) <= ?"
        " AND e.snapshot_path IS NOT NULL AND e.snapshot_path != ''"
        " ORDER BY e.snapshot_score DESC, a.started_at DESC",
        (date, now, within_sec),
    )
    best_id: str | None = None
    best_score = -1.0
    for row in rows:
        sid = identity.resolve_alias(str(row["subject_id"]))
        if exclude and sid == exclude:
            continue
        if _gps_bucket(float(row["gps_lat"]), float(row["gps_lng"])) != bucket:
            continue
        score = float(row["snapshot_score"] or 0)
        if score > best_score:
            best_score = score
            best_id = sid
    return best_id


def _tier_rank_value(tier: str | None) -> int:
    return {"object": 0, "person": 1, "identity": 2}.get((tier or "").strip(), 0)


def _merge_tier_ever(current: str | None, new_tier: str) -> str:
    cur = (current or "object").strip() or "object"
    nt = (new_tier or "object").strip() or "object"
    return nt if _tier_rank_value(nt) >= _tier_rank_value(cur) else cur


def _upsert_event_tier_ever(
    conn: Any,
    date: str,
    pers_id: str,
    tier: str,
    tier_snapshot_json: str | None = None,
) -> None:
    row = conn.execute(
        "SELECT tier_ever FROM daily_events WHERE event_date = ? AND pers_id = ?",
        (date, pers_id),
    ).fetchone()
    if row is None:
        return
    merged = _merge_tier_ever(row["tier_ever"] if row else None, tier)
    if tier_snapshot_json:
        conn.execute(
            "UPDATE daily_events SET tier_ever = ?, tier_snapshot_json = ?"
            " WHERE event_date = ? AND pers_id = ?",
            (merged, tier_snapshot_json, date, pers_id),
        )
    else:
        conn.execute(
            "UPDATE daily_events SET tier_ever = ? WHERE event_date = ? AND pers_id = ?",
            (merged, date, pers_id),
        )



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

    # Người (draft/tk): đứng trong khung — upsert last_seen, không ghi đè ảnh
    # mỗi flush khi score ngang/bằng; chỉ thay khi rõ hơn.
    keep_new = snapshot_score > old_score
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
    """Thẻ Đối tượng còn chưa gán được người — thẻ đã thăng hạng nằm ở tab Người."""
    d = date or db.today_vn()
    rows = db.query(
        "SELECT * FROM daily_objects WHERE event_date = ? AND promoted_to IS NULL"
        " ORDER BY last_seen DESC",
        (d,),
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
            "SELECT snapshot_score, last_seen, snapshot_path FROM daily_events"
            " WHERE event_date = ? AND pers_id = ?",
            (date, pid),
        ).fetchone()
        if row is None:
            if not card_eligible:
                conn.execute(
                    "UPDATE persons SET last_seen = ?, first_seen = COALESCE(first_seen, ?)"
                    " WHERE pers_id = ?",
                    (ts, first, pid),
                )
                return
            appearance_snapshot = snapshot_path
            conn.execute(
                "INSERT INTO daily_events"
                "(event_date, pers_id, first_seen, last_seen, snapshot_path, snapshot_score)"
                " VALUES(?,?,?,?,?,?)",
                (date, pid, first, ts, snapshot_path, snapshot_score),
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
                    prev_snap = str(row["snapshot_path"] or "").strip() or None
                    merged_snap = keep_snapshot_for_luot(prev_snap, snapshot_path)
                    conn.execute(
                        "UPDATE daily_events SET last_seen = ?, snapshot_path = ?,"
                        " snapshot_score = ? WHERE event_date = ? AND pers_id = ?",
                        (ts, merged_snap, snapshot_score, date, pid),
                    )
                    appearance_snapshot = merged_snap
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
        tier = "identity" if is_identified else "person"
        _upsert_event_tier_ever(conn, date, pid, tier)


def _appearance_time_overlap_ratio(a: dict[str, Any], b: dict[str, Any]) -> float:
    """Tỷ lệ overlap thời gian giữa hai appearance segment."""
    first_a, last_a = float(a["started_at"]), float(a["ended_at"])
    first_b, last_b = float(b["started_at"]), float(b["ended_at"])
    overlap = max(0.0, min(last_a, last_b) - max(first_a, first_b))
    min_dur = min(max(last_a - first_a, 1.0), max(last_b - first_b, 1.0))
    return overlap / min_dur


def coerce_appearance_id_for_camera(
    appearance_id: int | None,
    camera_id: str,
) -> int | None:
    """Chỉ giữ row id khi thuộc đúng camera — tránh UPDATE nhầm dòng camera khác."""
    if appearance_id is None:
        return None
    row = db.query_one(
        "SELECT camera_id FROM appearances WHERE id = ?",
        (int(appearance_id),),
    )
    if row is None:
        return None
    row_cam = str(row["camera_id"] or "").strip()
    want = (camera_id or "").strip()
    if not row_cam or row_cam != want:
        return None
    return int(appearance_id)


def coerce_appearance_id_for_encounter_gap(
    appearance_id: int | None,
    camera_id: str,
    ts: float,
    *,
    encounter_started_at: float | None = None,
) -> int | None:
    """Bỏ row id cũ nếu đã ngắt >45s — buộc INSERT lượt gặp mới (cùng camera)."""
    appearance_id = coerce_appearance_id_for_camera(appearance_id, camera_id)
    if appearance_id is None:
        return None
    row = db.query_one(
        "SELECT ended_at FROM appearances WHERE id = ?",
        (int(appearance_id),),
    )
    if row is None:
        return None
    from .presence import GAP_FALLBACK_SEC

    ended = float(row["ended_at"])
    if ts - ended > GAP_FALLBACK_SEC:
        return None
    if encounter_started_at is not None and encounter_started_at - ended > GAP_FALLBACK_SEC:
        return None
    return int(appearance_id)


def find_overlapping_appearance_row(
    event_date: str,
    subject_id: str,
    camera_id: str,
    started_at: float,
    ended_at: float,
    *,
    session_id: str | None = None,
    track_id: str | None = None,
) -> int | None:
    """Row của **chính** session/track này, khi lượt hiện tại vẫn là lượt cũ.

    Chỉ khớp theo `session_id` hoặc `track_id` — không suy đoán theo thời gian.
    Hai track khác nhau cùng chồng giờ trên một camera có thể là hai người, gộp
    ở đây là mất một lượt gặp mà không cách nào phát hiện về sau.
    """
    cam = (camera_id or "").strip()
    sid = (subject_id or "").strip()
    if not cam or not sid:
        return None
    probe = {"started_at": started_at, "ended_at": ended_at}
    sess = (session_id or "").strip()
    tid = (track_id or "").strip()
    if not sess and not tid:
        return None
    rows = db.query(
        "SELECT id, started_at, ended_at, track_id, session_id FROM appearances"
        " WHERE event_date = ? AND subject_id = ? AND camera_id = ? AND qualified = 1"
        " ORDER BY ended_at DESC",
        (event_date, sid, cam),
    )
    for row in rows:
        row_dict = dict(row)
        row_sess = str(row_dict.get("session_id") or "").strip()
        row_tid = str(row_dict.get("track_id") or "").strip()
        same_session = bool(sess and row_sess and sess == row_sess)
        same_track = bool(tid and row_tid and tid == row_tid)
        if not same_session and not same_track:
            continue
        from .presence import GAP_FALLBACK_SEC

        if float(started_at) - float(row_dict["ended_at"]) > GAP_FALLBACK_SEC:
            continue
        # Cùng session nhưng cửa sổ thời gian rời nhau là lượt khác — người này
        # đã đi khỏi rồi quay lại, phải mở dòng mới.
        if _appearance_time_overlap_ratio(row_dict, probe) >= _SAME_PRESENCE_OVERLAP_MIN_RATIO:
            return int(row["id"])
    return None


def merge_pers_event_cards(
    from_pers: str,
    to_pers: str,
    *,
    now: float | None = None,
) -> None:
    """Gộp thẻ sự kiện trùng người — tk-024/025/026 cùng một pers."""
    ts = now or time.time()
    date = db.today_vn(ts)
    src = identity.resolve_alias((from_pers or "").strip())
    dst = identity.resolve_alias((to_pers or "").strip())
    if not src or not dst or src == dst:
        return

    with db.tx() as conn:
        src_row = conn.execute(
            "SELECT * FROM daily_events WHERE event_date = ? AND pers_id = ?",
            (date, src),
        ).fetchone()
        dst_row = conn.execute(
            "SELECT * FROM daily_events WHERE event_date = ? AND pers_id = ?",
            (date, dst),
        ).fetchone()
        if dst_row is None and src_row is not None:
            conn.execute(
                "UPDATE daily_events SET pers_id = ?"
                " WHERE event_date = ? AND pers_id = ?",
                (dst, date, src),
            )
        elif src_row is not None and dst_row is not None:
            better = float(src_row["snapshot_score"]) > float(dst_row["snapshot_score"])
            conn.execute(
                "UPDATE daily_events SET first_seen = ?, last_seen = ?,"
                " snapshot_path = ?, snapshot_score = ?"
                " WHERE event_date = ? AND pers_id = ?",
                (
                    min(float(dst_row["first_seen"]), float(src_row["first_seen"])),
                    max(float(dst_row["last_seen"]), float(src_row["last_seen"]), ts),
                    src_row["snapshot_path"] if better else dst_row["snapshot_path"],
                    max(float(dst_row["snapshot_score"]), float(src_row["snapshot_score"])),
                    date,
                    dst,
                ),
            )
            conn.execute(
                "DELETE FROM daily_events WHERE event_date = ? AND pers_id = ?",
                (date, src),
            )
        conn.execute(
            "UPDATE appearances SET subject_id = ?"
            " WHERE event_date = ? AND subject_id = ?",
            (dst, date, src),
        )
        conn.execute(
            "UPDATE track_profile_bindings SET pers_id = ? WHERE pers_id = ?",
            (dst, src),
        )
        conn.execute(
            "INSERT OR REPLACE INTO person_aliases(old_pers_id, pers_id, merged_at)"
            " VALUES(?,?,?)",
            (src, dst, ts),
        )
        from ..patrol_ids import is_anonymous_track_id

        if is_anonymous_track_id(src):
            identity.bind_tk_profile(src, dst, now=ts)
        _renumber_presence_seq(conn, date, dst)

    coalesce_subject_appearances(dst, date)


def _snapshot_basename(path: str | None) -> str:
    return (path or "").rsplit("/", 1)[-1]


def _is_object_snapshot_path(path: str | None) -> bool:
    name = _snapshot_basename(path)
    return bool(name.startswith("obj-"))


def _snapshot_path_kind(path: str | None) -> str:
    name = _snapshot_basename(path)
    if name.startswith("obj-"):
        return "object"
    if name.startswith("tk-") or name.startswith("pers-"):
        return "person"
    return "unknown"


def _apply_payload_tier(
    raw: str | None,
    tier: str,
    *,
    promoted_from: str | None = None,
) -> str:
    import json

    payload: dict[str, Any] = {}
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                payload = parsed
        except (json.JSONDecodeError, TypeError):
            payload = {}
    payload["tier_at_observation"] = tier
    if promoted_from:
        payload["promoted_from_object"] = promoted_from
    return json.dumps(payload, ensure_ascii=False)


def _transfer_promoted_object_appearances(
    conn: Any,
    date: str,
    obj_id: str,
    pid: str,
    ts: float,
    obj_snapshot: str | None,
) -> None:
    """Chuyển lịch sử obj → pers — giữ JPG lưng + tier Đối tượng trước khi chụp mặt."""
    rows = conn.execute(
        "SELECT id, started_at, ended_at, snapshot_path, event_payload_json"
        " FROM appearances WHERE event_date = ? AND subject_id = ? AND qualified = 1"
        " ORDER BY started_at ASC, id ASC",
        (date, obj_id),
    ).fetchall()
    obj_snap = (obj_snapshot or "").strip() or None
    for row in rows:
        snap = str(row["snapshot_path"] or "").strip() or obj_snap
        end_at = max(float(row["started_at"]), min(float(row["ended_at"]), ts))
        payload = _apply_payload_tier(
            row["event_payload_json"],
            "object",
            promoted_from=obj_id,
        )
        conn.execute(
            "UPDATE appearances SET subject_id = ?, ended_at = ?, snapshot_path = ?,"
            " event_payload_json = ? WHERE id = ?",
            (pid, end_at, snap or None, payload, int(row["id"])),
        )


def _person_card_snap_from_object(obj_row: dict[str, Any]) -> tuple[str | None, float]:
    """Không gắn JPG obj-* lên thẻ Người — chờ reshoot tk cùng lượt."""
    path = str(obj_row.get("snapshot_path") or "").strip() or None
    score = float(obj_row.get("snapshot_score") or 0)
    if _is_object_snapshot_path(path):
        return None, 0.0
    return path, score


def promote_object(
    obj_id: str,
    pers_id: str,
    *,
    now: float | None = None,
) -> None:
    """Đối tượng bắt được mặt → dồn sang thẻ của Người."""
    ts = now or time.time()
    date = db.today_vn(ts)
    pid = identity.resolve_alias(pers_id)

    with db.tx() as conn:
        obj = conn.execute(
            "SELECT * FROM daily_objects WHERE event_date = ? AND obj_id = ?",
            (date, obj_id),
        ).fetchone()
        if obj is None or obj["promoted_to"]:
            return

        existing = conn.execute(
            "SELECT * FROM daily_events WHERE event_date = ? AND pers_id = ?",
            (date, pid),
        ).fetchone()

        obj_snap, obj_score = _person_card_snap_from_object(dict(obj))

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
                    obj_snap,
                    obj_score,
                ),
            )
        else:
            better = obj_score > float(existing["snapshot_score"] or 0)
            incoming = obj_snap if better else existing["snapshot_path"]
            merged = keep_snapshot_for_luot(existing["snapshot_path"], incoming)
            if _is_object_snapshot_path(merged):
                merged = existing["snapshot_path"]
            merged_score = max(float(existing["snapshot_score"] or 0), obj_score)
            if not merged or _is_object_snapshot_path(merged):
                merged_score = float(existing["snapshot_score"] or 0)
            conn.execute(
                "UPDATE daily_events SET first_seen = ?, last_seen = ?,"
                " snapshot_path = ?, snapshot_score = ?"
                " WHERE event_date = ? AND pers_id = ?",
                (
                    min(float(existing["first_seen"]), float(obj["first_seen"])),
                    max(float(existing["last_seen"]), float(obj["last_seen"]), ts),
                    merged,
                    merged_score,
                    date,
                    pid,
                ),
            )

        obj_snapshot_path = str(obj["snapshot_path"] or "").strip() or None
        _transfer_promoted_object_appearances(
            conn, date, obj_id, pid, ts, obj_snapshot_path,
        )
        _renumber_presence_seq(conn, date, pid)
        from .promoted_registry import mark_promoted

        mark_promoted(pid, date, obj_id)
        conn.execute(
            "UPDATE daily_objects SET promoted_to = ?, promoted_at = ?"
            " WHERE event_date = ? AND obj_id = ?",
            (pid, ts, date, obj_id),
        )
        import json

        from .tier_snapshot import build_tier_snapshot

        tier_snap = build_tier_snapshot(
            tier="person",
            tier_since=ts,
            subject_id=pid,
            promoted_from=[obj_id],
            promoted_at=ts,
            tier_source="promote",
        )
        _upsert_event_tier_ever(conn, date, pid, "person", json.dumps(tier_snap.to_payload_dict()))
        conn.execute(
            "UPDATE persons SET last_seen = ?, first_seen = COALESCE(first_seen, ?)"
            " WHERE pers_id = ?",
            (ts, float(obj["first_seen"]), pid),
        )

    # Không gộp dòng Đối tượng (lưng) với dòng Người (mặt) vừa tách.
    coalesce_subject_appearances(pid, date)


def list_person_events(date: str | None = None) -> list[dict[str, Any]]:
    """Thẻ Người + Định danh trong ngày.

    Tầng suy từ `persons.status` lúc truy vấn chứ không chụp lại vào thẻ: gán
    tên lúc 3 giờ chiều là thẻ chuyển sang tab Định danh ngay, kể cả thẻ của
    những ngày trước.
    """
    d = date or db.today_vn()
    rows = db.query(
        "SELECT e.event_date, e.pers_id, e.first_seen, e.last_seen,"
        "       e.snapshot_path, e.snapshot_score, e.tier_ever, e.tier_snapshot_json,"
        "       p.status, p.full_name, p.employee_code, p.contractor,"
        # Thẻ này vốn là Đối tượng nào — để giao diện đánh dấu "vừa thăng hạng".
        # Không có mốc này thì người xem không phân biệt được thẻ Người mang ảnh
        # badge "Đối tượng" là do thăng hạng giữa lượt hay do nhận dạng sai.
        "       (SELECT GROUP_CONCAT(o.obj_id) FROM daily_objects o"
        "         WHERE o.event_date = e.event_date AND o.promoted_to = e.pers_id)"
        "        AS promoted_from,"
        "       (SELECT MAX(o.promoted_at) FROM daily_objects o"
        "         WHERE o.event_date = e.event_date AND o.promoted_to = e.pers_id)"
        "        AS promoted_at"
        "  FROM daily_events e JOIN persons p ON p.pers_id = e.pers_id"
        " WHERE e.event_date = ?"
        " AND e.snapshot_path IS NOT NULL AND e.snapshot_path != ''"
        " AND e.snapshot_score >= ?"
        " ORDER BY e.last_seen DESC",
        (d, PERSON_LIST_MIN_SNAPSHOT_SCORE),
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        item = dict(r)
        raw = str(item.pop("promoted_from", "") or "")
        item["promoted_from"] = [s for s in raw.split(",") if s]
        out.append(item)
    return out


# ---------------------------------------------------------------------------
# Lịch sử xuất hiện


def _luot_of(path: str | None) -> str | None:
    """Khoá lượt nằm trong đuôi tên file `{subject}-{luot}.jpg`."""
    if not path:
        return None
    name = path.rsplit("/", 1)[-1]
    stem = name[:-4] if name.endswith(".jpg") else name
    subject, sep, luot = stem.rpartition("-")
    if not sep or not subject or not luot.isdigit():
        return None
    return luot


def keep_snapshot_for_luot(prev: str | None, incoming: str | None) -> str | None:
    """Ảnh đại diện cho một lượt gặp — đóng băng, trừ khi vừa thăng hạng.

    Lịch sử cố ý giữ ảnh lúc bắt đầu lần gặp: thẻ ngoài đổi ảnh liên tục theo
    khung mặt rõ hơn, còn dòng lịch sử phải đứng yên để người xem còn đối chiếu
    được. Nhưng nếu Đối tượng thăng hạng **giữa lượt**, tấm đóng băng lại là
    tấm `obj-*` mang badge "Đối tượng" — thẻ Người mở ra thấy dòng lịch sử ghi
    "Đối tượng", và tấm ảnh ngoài thẻ không có trong danh sách lịch sử.

    Cùng một lượt mà mã chủ thể đổi từ `obj-*` sang `tk-*`/`pers-*` thì đó là
    cùng một khoảnh khắc chụp lại với badge đúng — lấy tấm mới. Mọi trường hợp
    khác giữ nguyên tấm cũ.
    """
    prev = (prev or "").strip() or None
    incoming = (incoming or "").strip() or None
    if prev is None:
        return incoming
    if incoming is None:
        return prev
    prev_name = prev.rsplit("/", 1)[-1]
    if not prev_name.startswith("obj-"):
        return prev
    new_name = incoming.rsplit("/", 1)[-1]
    if new_name.startswith("obj-"):
        return prev
    prev_luot = _luot_of(prev)
    if prev_luot is None or prev_luot != _luot_of(incoming):
        return prev
    return incoming


def _renumber_presence_seq(conn, date: str, subject_id: str) -> None:
    """Đánh số lại lượt gặp theo thứ tự thời gian.

    `presence_seq` đếm bằng `MAX(presence_seq)+1` **trong phạm vi một subject_id**.
    Lúc dồn `obj-*` sang `pers-*` thì các dòng mang theo số cũ, mà mỗi obj đều tự
    đếm từ 1 — người được thăng hạng từ hai obj khác nhau có hai lần gặp cùng mang
    số "lượt 1". Đo trên máy thật: đúng hai subject bị trùng số là đúng hai subject
    promote từ nhiều hơn một obj.
    """
    rows = conn.execute(
        "SELECT id FROM appearances"
        " WHERE event_date = ? AND subject_id = ? AND qualified = 1"
        " ORDER BY started_at ASC, id ASC",
        (date, subject_id),
    ).fetchall()
    for seq, row in enumerate(rows, start=1):
        conn.execute(
            "UPDATE appearances SET presence_seq = ? WHERE id = ?",
            (seq, int(row["id"])),
        )


def renumber_presence_seq(subject_id: str, date: str) -> None:
    """`_renumber_presence_seq` cho lời gọi ngoài transaction (merge_persons)."""
    with db.tx() as conn:
        _renumber_presence_seq(conn, date, subject_id)


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
        " WHERE event_date = ? AND subject_id = ? AND camera_id = ? AND qualified = 1"
        " ORDER BY ended_at DESC LIMIT 1",
        (date, subject_id, camera_id),
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
        snap = keep_snapshot_for_luot(prev_snap, incoming)
        conn.execute(
            "UPDATE appearances SET ended_at = ?, gps_lat_end = ?, gps_lng_end = ?,"
            " source_cameras = ?, snapshot_path = ?,"
            " counted = MAX(counted, ?) WHERE id = ?",
            (ts, lat_end, lng_end, src, snap, q, row["id"]),
        )
        return

    seq = _next_presence_seq(conn, date, subject_id)
    src = merge_source_cameras(None, camera_id)
    snap = (snapshot_path or "").strip() or None
    conn.execute(
        "INSERT INTO appearances"
        "(event_date, subject_id, camera_id, zone_id, started_at, ended_at,"
        " gps_lat, gps_lng, gps_lat_end, gps_lng_end, qualified, presence_seq,"
        " source_cameras, snapshot_path, counted)"
        " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            date, subject_id, camera_id, zone_id, ts, ts,
            gps_lat, gps_lng, lat_end, lng_end, q, seq, src, snap, q,
        ),
    )


def _appearance_row_payload(row: Any) -> dict[str, Any]:
    item = dict(row)
    item["source_cameras"] = parse_source_cameras(
        str(row["source_cameras"]) if row["source_cameras"] else None,
    )
    return item


def _tier_from_payload(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        import json

        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            snap = parsed.get("tier_snapshot")
            if isinstance(snap, dict):
                tier = str(snap.get("tier") or "").strip()
                if tier in ("object", "person", "identity"):
                    return tier
            tier = str(parsed.get("tier_at_observation") or "").strip()
            if tier in ("object", "person", "identity"):
                return tier
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def _same_coalesce_visit(a: Any, b: Any, *, subject_id: str = "") -> bool:
    """Chỉ gộp appearance cùng track/session — tránh trộn hai lượt gặp."""
    tier_a = _tier_from_payload(str(a["event_payload_json"] or ""))
    tier_b = _tier_from_payload(str(b["event_payload_json"] or ""))
    if tier_a == "object" and tier_b in ("person", "identity"):
        return False
    if tier_b == "object" and tier_a in ("person", "identity"):
        return False
    kind_a = _snapshot_path_kind(str(a["snapshot_path"] or ""))
    kind_b = _snapshot_path_kind(str(b["snapshot_path"] or ""))
    if kind_a == "object" and kind_b == "person":
        return False
    if kind_b == "object" and kind_a == "person":
        return False

    ta = str(a["track_id"] or "").strip()
    tb = str(b["track_id"] or "").strip()
    sa = str(a["session_id"] or "").strip()
    sb = str(b["session_id"] or "").strip()
    if ta and tb and ta == tb:
        return True
    # ByteTrack re-id: cùng session, track id đổi giữa chừng (≤5s).
    if sa and sb and sa == sb:
        if ta and tb and ta != tb:
            # INSERT đúp hoặc re-id trong cùng lượt stream — started_at trùng/chồng.
            if abs(float(b["started_at"]) - float(a["started_at"])) <= 0.5:
                return True
            gap = float(b["started_at"]) - float(a["ended_at"])
            return 0 <= gap <= 5.0
        return True
    if not ta and not tb and not sa and not sb:
        gap = float(b["started_at"]) - float(a["ended_at"])
        return 0 <= gap <= 2.0
    sid = (subject_id or "").strip()
    if sid.startswith("obj-"):
        gap = float(b["started_at"]) - float(a["ended_at"])
        if not (0 <= gap <= 45.0):
            return False
        first_a, last_a = float(a["started_at"]), float(a["ended_at"])
        first_b, last_b = float(b["started_at"]), float(b["ended_at"])
        # Song song (2 ByteTrack cùng lúc) — không gộp.
        if max(first_a, first_b) < min(last_a, last_b):
            return False
        return True
    return False


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
    """Map gallery/sgc/tk alias → pers_id lưu trong appearances.

    Không map sang obj-* — OBJ là quan sát chưa định danh, gộp nhầm sẽ trộn
    snapshot Unknown với người đã gán gallery (vd. Duncan).
    """
    sid = identity.resolve_alias((subject_id or "").strip())
    if sid.startswith("obj-"):
        return sid

    from ..patrol_ids import is_anonymous_track_id

    if sid.startswith("tk-") or sid.startswith("pers-"):
        return sid

    if is_anonymous_track_id(sid):
        from ..sink import lookup_bound_pers_for_tk

        bound = lookup_bound_pers_for_tk(sid)
        return bound or sid

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
        " p.status AS person_status, p.full_name, p.employee_code"
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
        tier_from_payload = _tier_from_payload(
            str(r["event_payload_json"]) if r["event_payload_json"] else None
        )
        if tier_from_payload:
            item["tier"] = tier_from_payload
        elif sid.startswith("obj-"):
            item["tier"] = "object"
        elif r["person_status"] in (identity.STATUS_IDENTIFIED,):
            item["tier"] = "identity"
        else:
            item["tier"] = "person"
        item["display_name"] = (
            str(r["full_name"]).strip()
            if r["full_name"]
            else (str(r["employee_code"]) if r["employee_code"] else sid)
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
            if not _same_coalesce_visit(keep, nxt, subject_id=subject_id):
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
        _renumber_presence_seq(conn, event_date, subject_id)
    return merged


def find_extendable_track_appearance_row(
    event_date: str,
    subject_id: str,
    camera_id: str,
    ts: float,
    *,
    encounter_started_at: float | None = None,
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
    from .presence import GAP_FALLBACK_SEC

    ended = float(row["ended_at"])
    ref = float(encounter_started_at) if encounter_started_at is not None else ts
    if ref - ended > GAP_FALLBACK_SEC:
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
    end_reason: str | None = None,
    finalize: bool = False,
) -> int:
    """Một appearance / track session — UPDATE in-place thay vì INSERT mỗi frame."""
    _ = finalize  # reserved — close semantics via ended_at
    counted_int = 1 if counted else 0
    reason = (end_reason or "").strip() or None
    with db.tx() as conn:
        row_id = appearance_id

        if row_id is not None:
            existing = conn.execute(
                "SELECT camera_id FROM appearances WHERE id = ?",
                (row_id,),
            ).fetchone()
            row_cam = str(existing["camera_id"] or "").strip() if existing else ""
            if not existing or row_cam != (camera_id or "").strip():
                row_id = None

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
            if reason:
                set_parts.append("end_reason = ?")
                params.append(reason)
            if snapshot_path:
                prev_row = conn.execute(
                    "SELECT snapshot_path FROM appearances WHERE id = ?", (row_id,),
                ).fetchone()
                set_parts.append("snapshot_path = ?")
                params.append(
                    keep_snapshot_for_luot(
                        prev_row["snapshot_path"] if prev_row else None,
                        snapshot_path,
                    ),
                )
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
            " event_payload_json, interactions_json, end_reason)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
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
                reason,
            ),
        )
        return int(cur.lastrowid)


# ---------------------------------------------------------------------------
# Sổ cái lượt gặp


def subject_kind(subject_id: str) -> str:
    """Phân loại chủ thể lúc chốt track — quyết định lượt này vào bảng nào."""
    sid = (subject_id or "").strip()
    if not sid:
        return "unqualified"
    if sid.startswith("obj-"):
        return "object"
    person = identity.get_person(identity.resolve_alias(sid))
    if person and person.get("status") == identity.STATUS_IDENTIFIED:
        return "identity"
    return "person"


def record_sighting(
    *,
    event_date: str,
    subject_id: str,
    camera_id: str,
    zone_id: str | None,
    track_id: str,
    session_id: str,
    started_at: float,
    ended_at: float,
    end_reason: str,
    qualified: bool,
    appearance_id: int | None = None,
    now: float | None = None,
) -> None:
    """Ghi một lượt gặp đã chốt. Gọi lại cùng session thì nới `ended_at`.

    Re-ID nối một session qua nhiều track ByteTrack, nên cùng `session_id` có
    thể chốt nhiều lần. Đó vẫn là **một** lượt gặp — khoá duy nhất theo session
    giữ đúng như vậy mà không cần phía gọi tự nhớ đã ghi hay chưa.
    """
    sess = (session_id or "").strip()
    cam = (camera_id or "").strip()
    if not sess or not cam:
        return
    ts = float(now if now is not None else time.time())
    kind = subject_kind(subject_id) if qualified else "unqualified"
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO sightings"
            "(event_date, subject_id, subject_kind, camera_id, zone_id, track_id,"
            " session_id, started_at, ended_at, end_reason, qualified, appearance_id,"
            " created_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT(event_date, camera_id, session_id) DO UPDATE SET"
            "   subject_id = excluded.subject_id,"
            "   subject_kind = excluded.subject_kind,"
            "   track_id = excluded.track_id,"
            "   started_at = MIN(started_at, excluded.started_at),"
            "   ended_at = MAX(ended_at, excluded.ended_at),"
            "   end_reason = excluded.end_reason,"
            "   qualified = MAX(qualified, excluded.qualified),"
            "   appearance_id = COALESCE(excluded.appearance_id, appearance_id)",
            (
                event_date,
                (subject_id or "").strip(),
                kind,
                cam,
                zone_id,
                (track_id or "").strip(),
                sess,
                float(started_at),
                float(ended_at),
                (end_reason or "").strip() or "lost",
                1 if qualified else 0,
                appearance_id,
                ts,
            ),
        )


def list_sightings(date: str | None = None) -> list[dict[str, Any]]:
    d = date or db.today_vn()
    rows = db.query(
        "SELECT * FROM sightings WHERE event_date = ? ORDER BY started_at ASC", (d,)
    )
    return [dict(r) for r in rows]


def _count(sql: str, params: tuple) -> int:
    row = db.query_one(sql, params)
    return int(row["c"]) if row else 0


def day_stats(date: str | None = None) -> dict[str, Any]:
    """KPI đếm chuẩn — Nhân sự (1:1) · Lượt gặp Đối tượng · số đo tự hiệu chỉnh.

    Hai bộ đếm khác bản chất, không quy về nhau được. Người và Định danh có tiêu
    chí trùng khớp (khuôn mặt) nên đếm **thẻ**: một người một thẻ mỗi ngày.
    Đối tượng thì không có tiêu chí nào để nói hai lần nhìn thấy là một người,
    nên đếm **lượt gặp**: một track từ lúc vào khung tới lúc ra là một lượt, và
    con số này cố tình lớn hơn số người có mặt.

    Kèm theo là phần để đọc con số đó cho đúng: bao nhiêu lượt đóng vì mất tín
    hiệu (nguồn chập chờn thổi số lên), và bao nhiêu track thấy được nhưng không
    chốt nổi thẻ (phần hệ thống đang bỏ sót).
    """
    d = date or db.today_vn()
    person_n = _count(
        "SELECT COUNT(*) AS c FROM daily_events e"
        " JOIN persons p ON p.pers_id = e.pers_id"
        " WHERE e.event_date = ? AND p.status IN (?, ?)"
        " AND e.snapshot_path IS NOT NULL AND e.snapshot_path != ''"
        " AND e.snapshot_score >= ?",
        (d, identity.STATUS_PERSON, identity.STATUS_DRAFT, PERSON_LIST_MIN_SNAPSHOT_SCORE),
    )
    identity_n = _count(
        "SELECT COUNT(*) AS c FROM daily_events e"
        " JOIN persons p ON p.pers_id = e.pers_id"
        " WHERE e.event_date = ? AND p.status = ?"
        " AND e.snapshot_path IS NOT NULL AND e.snapshot_path != ''"
        " AND e.snapshot_score >= ?",
        (d, identity.STATUS_IDENTIFIED, PERSON_LIST_MIN_SNAPSHOT_SCORE),
    )
    # Lượt gặp của Người/Định danh: mọi lần hiện diện đã ghi nhận.
    #
    # Trước đây có thêm `counted = 1`, tức đã qua tripwire GPS của công trường.
    # Bodycam mất định vị trong nhà hoặc dưới gầm cầu là cả ngày hôm đó KPI bằng
    # không trong khi tab sự kiện đầy thẻ — số liệu tự mâu thuẫn vì một lý do
    # chẳng liên quan gì tới việc có gặp người hay không.
    encounters = _count(
        "SELECT COUNT(*) AS c FROM appearances"
        " WHERE event_date = ? AND qualified = 1 AND subject_id NOT LIKE 'obj-%'",
        (d,),
    )
    # Thẻ Đối tượng còn chưa gán được người.
    #
    # Trước đây còn chặn trên `snapshot_score < 1.05`, tạo một vùng chết: thẻ có
    # ảnh mặt rõ nhưng chưa khớp gallery thì rơi khỏi bộ đếm Đối tượng, mà cũng
    # chưa vào được bộ đếm Người vì chưa thăng hạng. Người đó biến mất khỏi mọi
    # con số trong khi thẻ của họ vẫn nằm đó trong danh sách.
    object_cards = _count(
        "SELECT COUNT(*) AS c FROM daily_objects"
        " WHERE event_date = ? AND promoted_to IS NULL"
        " AND snapshot_path IS NOT NULL AND snapshot_path != ''",
        (d,),
    )
    promoted_cards = _count(
        "SELECT COUNT(*) AS c FROM daily_objects"
        " WHERE event_date = ? AND promoted_to IS NOT NULL",
        (d,),
    )
    object_sightings = _count(
        "SELECT COUNT(*) AS c FROM sightings"
        " WHERE event_date = ? AND qualified = 1 AND subject_kind = 'object'"
        " AND end_reason != ?",
        (d, SIGHTING_END_STREAM_OFFLINE),
    )
    stream_offline_sightings = _count(
        "SELECT COUNT(*) AS c FROM sightings"
        " WHERE event_date = ? AND qualified = 1 AND end_reason = ?",
        (d, SIGHTING_END_STREAM_OFFLINE),
    )
    sightings_total = _count(
        "SELECT COUNT(*) AS c FROM sightings WHERE event_date = ?", (d,)
    )
    sightings_unqualified = _count(
        "SELECT COUNT(*) AS c FROM sightings WHERE event_date = ? AND qualified = 0",
        (d,),
    )
    return {
        "date": d,
        "workers_standard": person_n + identity_n,
        "person_count": person_n,
        "identity_count": identity_n,
        "object_card_count": object_cards,
        "promoted_object_count": promoted_cards,
        "encounters_standard": encounters,
        "object_sighting_count": object_sightings,
        # Tên cũ của cùng con số — frontend đã phát hành đang đọc khoá này.
        "unassigned_observations": object_sightings,
        "sightings_stream_offline": stream_offline_sightings,
        "sightings_total": sightings_total,
        "sightings_unqualified": sightings_unqualified,
    }
