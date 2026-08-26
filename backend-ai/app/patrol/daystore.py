"""Sự kiện tuần tra theo ngày — Đối tượng / Người / Định danh.

Quy tắc nghiệp vụ: **một người một thẻ mỗi ngày**. Gặp lại thì cập nhật giờ
mới nhất và ghi thêm một đoạn vào lịch sử xuất hiện, không đẻ thẻ mới. Ở đây
quy tắc đó là khoá chính `(event_date, pers_id)` chứ không phải một lớp gộp
trùng chạy sau — nên không có đường nào lách qua được.

Ba tầng không phải ba bảng: Đối tượng sống trong ngày rồi xoá (chưa thấy mặt
nên chẳng có gì để nhận lại hôm sau), còn Người và Định danh dùng chung bảng
`persons`, phân biệt bằng `status`.
"""

from __future__ import annotations

import time
from typing import Any

from . import db, identity

# Hai lần thấy cách nhau quá ngưỡng này thì tính là hai lượt xuất hiện riêng.
APPEARANCE_GAP_SEC = 45.0


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
) -> str:
    """Ghi nhận một Đối tượng. Không truyền `obj_id` thì cấp mã mới."""
    ts = now or time.time()
    date = db.today_vn(ts)

    with db.tx() as conn:
        if not obj_id:
            seq = db.next_counter(conn, f"obj:{date}")
            obj_id = _fmt_obj(date, seq)
            conn.execute(
                "INSERT INTO daily_objects"
                "(event_date, obj_id, first_seen, last_seen, snapshot_path, snapshot_score)"
                " VALUES(?,?,?,?,?,?)",
                (date, obj_id, ts, ts, snapshot_path, snapshot_score),
            )
        else:
            row = conn.execute(
                "SELECT snapshot_score FROM daily_objects"
                " WHERE event_date = ? AND obj_id = ?",
                (date, obj_id),
            ).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO daily_objects"
                    "(event_date, obj_id, first_seen, last_seen, snapshot_path, snapshot_score)"
                    " VALUES(?,?,?,?,?,?)",
                    (date, obj_id, ts, ts, snapshot_path, snapshot_score),
                )
            else:
                # Giữ ảnh rõ nhất, không phải ảnh mới nhất — ảnh mới hay là lưng.
                keep_new = snapshot_path and snapshot_score >= float(
                    row["snapshot_score"]
                )
                if keep_new:
                    conn.execute(
                        "UPDATE daily_objects SET last_seen = ?, snapshot_path = ?,"
                        " snapshot_score = ? WHERE event_date = ? AND obj_id = ?",
                        (ts, snapshot_path, snapshot_score, date, obj_id),
                    )
                else:
                    conn.execute(
                        "UPDATE daily_objects SET last_seen = ?"
                        " WHERE event_date = ? AND obj_id = ?",
                        (ts, date, obj_id),
                    )
        _touch_appearance(conn, date, obj_id, camera_id, zone_id, ts)

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
    now: float | None = None,
) -> None:
    ts = now or time.time()
    date = db.today_vn(ts)
    pid = identity.resolve_alias(pers_id)

    with db.tx() as conn:
        row = conn.execute(
            "SELECT snapshot_score FROM daily_events WHERE event_date = ? AND pers_id = ?",
            (date, pid),
        ).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO daily_events"
                "(event_date, pers_id, first_seen, last_seen, snapshot_path, snapshot_score)"
                " VALUES(?,?,?,?,?,?)",
                (date, pid, ts, ts, snapshot_path, snapshot_score),
            )
        elif snapshot_path and snapshot_score >= float(row["snapshot_score"]):
            conn.execute(
                "UPDATE daily_events SET last_seen = ?, snapshot_path = ?,"
                " snapshot_score = ? WHERE event_date = ? AND pers_id = ?",
                (ts, snapshot_path, snapshot_score, date, pid),
            )
        else:
            conn.execute(
                "UPDATE daily_events SET last_seen = ?"
                " WHERE event_date = ? AND pers_id = ?",
                (ts, date, pid),
            )
        conn.execute(
            "UPDATE persons SET last_seen = ?, first_seen = COALESCE(first_seen, ?)"
            " WHERE pers_id = ?",
            (ts, ts, pid),
        )
        _touch_appearance(conn, date, pid, camera_id, zone_id, ts)


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


def _touch_appearance(
    conn,
    date: str,
    subject_id: str,
    camera_id: str,
    zone_id: str | None,
    ts: float,
) -> None:
    row = conn.execute(
        "SELECT id, ended_at FROM appearances"
        " WHERE event_date = ? AND subject_id = ? AND camera_id = ?"
        " ORDER BY ended_at DESC LIMIT 1",
        (date, subject_id, camera_id),
    ).fetchone()

    if row is not None and ts - float(row["ended_at"]) <= APPEARANCE_GAP_SEC:
        conn.execute("UPDATE appearances SET ended_at = ? WHERE id = ?", (ts, row["id"]))
        return

    conn.execute(
        "INSERT INTO appearances"
        "(event_date, subject_id, camera_id, zone_id, started_at, ended_at)"
        " VALUES(?,?,?,?,?,?)",
        (date, subject_id, camera_id, zone_id, ts, ts),
    )


def list_appearances(subject_id: str, date: str | None = None) -> dict[str, Any]:
    """Lịch sử xuất hiện cho popup — nhóm theo camera."""
    d = date or db.today_vn()
    sid = identity.resolve_alias(subject_id)
    rows = db.query(
        "SELECT camera_id, zone_id, started_at, ended_at FROM appearances"
        " WHERE event_date = ? AND subject_id = ? ORDER BY started_at ASC",
        (d, sid),
    )
    by_camera: dict[str, list[dict[str, Any]]] = {}
    segments: list[dict[str, Any]] = []
    for r in rows:
        item = dict(r)
        segments.append(item)
        by_camera.setdefault(str(r["camera_id"]), []).append(item)
    return {"by_camera": by_camera, "segments": segments}
