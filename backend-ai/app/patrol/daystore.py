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


def _person_snapshot_score_floor() -> float:
    """Điểm tối thiểu coi là ảnh có mặt đủ rõ (bodycam gate ×2 + confidence modest)."""
    from ..config import settings

    return float(settings.patrol_face_detect_min_score_bodycam) * 2.0 + 0.4


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
        if old_score < floor:
            return True, True
        if snapshot_score >= old_score:
            return True, True
        return interval_ok, True

    keep_new = snapshot_score >= old_score
    if keep_new:
        return True, True
    return interval_ok, False


def _fmt_obj(date: str, seq: int) -> str:
    return f"obj-{date.replace('-', '')}-{seq:04d}"


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
        _touch_appearance(
            conn, date, obj_id, camera_id, zone_id, ts,
            gps_lat=gps_lat, gps_lng=gps_lng,
            snapshot_path=appearance_snapshot,
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

    with db.tx() as conn:
        row = conn.execute(
            "SELECT snapshot_score, last_seen FROM daily_events"
            " WHERE event_date = ? AND pers_id = ?",
            (date, pid),
        ).fetchone()
        if row is None:
            attach_path = snapshot_path if face_eligible else None
            attach_score = snapshot_score if face_eligible else 0.0
            appearance_snapshot = attach_path
            conn.execute(
                "INSERT INTO daily_events"
                "(event_date, pers_id, first_seen, last_seen, snapshot_path, snapshot_score)"
                " VALUES(?,?,?,?,?,?)",
                (date, pid, first, ts, attach_path, attach_score),
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
                if keep_new:
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
                    if face_eligible and snapshot_path:
                        appearance_snapshot = snapshot_path
            elif face_eligible and snapshot_path:
                appearance_snapshot = snapshot_path
        conn.execute(
            "UPDATE persons SET last_seen = ?, first_seen = COALESCE(first_seen, ?)"
            " WHERE pers_id = ?",
            (ts, first, pid),
        )
        _touch_appearance(
            conn, date, pid, camera_id, zone_id, ts,
            gps_lat=gps_lat, gps_lng=gps_lng,
            snapshot_path=appearance_snapshot,
        )


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
) -> None:
    """Một lần gặp = một dòng popup + heatmap.

    Đứng trong khung liên tục (≤45s / cùng GPS) → gộp một lần gặp, kéo ended_at.
    Ra khỏi khung hoặc vắng lâu → lần gặp mới. Ảnh popup = snapshot mới nhất
    trong phiên gặp đó.
    """
    q = 1 if qualified else 0
    row = conn.execute(
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


def _resolve_appearance_subject_id(subject_id: str) -> str:
    """Map gallery/sgc alias → pers-* / obj-* lưu trong appearances."""
    sid = identity.resolve_alias((subject_id or "").strip())
    if sid.startswith("pers-") or sid.startswith("obj-"):
        return sid
    try:
        from ..patrol_identity_store import lookup_patrol_identity

        row = lookup_patrol_identity(sid)
        if row:
            for alias in row.get("aliases") or []:
                key = str(alias).strip()
                if key.startswith("pers-") or key.startswith("obj-"):
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
        " qualified, presence_seq, source_cameras, snapshot_path"
        " FROM appearances"
        " WHERE event_date = ? AND subject_id = ? AND qualified = 1"
        " ORDER BY started_at ASC",
        (d, sid),
    )
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
        " WHERE event_date = ? AND qualified = 1 AND subject_id NOT LIKE 'obj-%'",
        (d,),
    )
    obj_row = db.query_one(
        "SELECT COUNT(*) AS c FROM appearances"
        " WHERE event_date = ? AND qualified = 1 AND subject_id LIKE 'obj-%'",
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
