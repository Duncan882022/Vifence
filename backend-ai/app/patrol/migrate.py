"""Migration idempotent patrol DB — user_version → v4."""

from __future__ import annotations

import sqlite3


def migrate_to_v3(conn: sqlite3.Connection) -> None:
    version = int(conn.execute("PRAGMA user_version").fetchone()[0])
    if version >= 3:
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_log (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          action      TEXT NOT NULL,
          actor       TEXT NOT NULL,
          subject_id  TEXT,
          meta_json   TEXT NOT NULL DEFAULT '{}',
          created_at  REAL NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS ix_audit_log_created ON audit_log(created_at)"
    )

    cols = {
        str(r[1])
        for r in conn.execute("PRAGMA table_info(enroll_sessions)").fetchall()
    }
    if "consented_at" not in cols:
        conn.execute("ALTER TABLE enroll_sessions ADD COLUMN consented_at REAL")

    conn.execute("PRAGMA user_version=3")
    conn.commit()


def migrate_to_v4(conn: sqlite3.Connection) -> None:
    version = int(conn.execute("PRAGMA user_version").fetchone()[0])
    if version >= 4:
        return

    cols = {
        str(r[1])
        for r in conn.execute("PRAGMA table_info(appearances)").fetchall()
    }
    if "snapshot_path" not in cols:
        conn.execute("ALTER TABLE appearances ADD COLUMN snapshot_path TEXT")

    conn.execute("PRAGMA user_version=4")
    conn.commit()


def migrate_to_v5(conn: sqlite3.Connection) -> None:
    """Aggregator — track_id + JSON payload trên appearances."""
    version = int(conn.execute("PRAGMA user_version").fetchone()[0])
    if version >= 5:
        return

    cols = {
        str(r[1])
        for r in conn.execute("PRAGMA table_info(appearances)").fetchall()
    }
    for name, typedef in (
        ("track_id", "TEXT"),
        ("event_payload_json", "TEXT"),
        ("interactions_json", "TEXT"),
    ):
        if name not in cols:
            conn.execute(f"ALTER TABLE appearances ADD COLUMN {name} {typedef}")

    conn.execute(
        "CREATE INDEX IF NOT EXISTS ix_appearances_track"
        " ON appearances(event_date, track_id)"
    )
    conn.execute("PRAGMA user_version=5")
    conn.commit()


def migrate_to_v6(conn: sqlite3.Connection) -> None:
    """Aggregator Phase 2 — session_id + counted trên appearances."""
    version = int(conn.execute("PRAGMA user_version").fetchone()[0])
    if version >= 6:
        return

    cols = {
        str(r[1])
        for r in conn.execute("PRAGMA table_info(appearances)").fetchall()
    }
    for name, typedef in (
        ("session_id", "TEXT"),
        ("counted", "INTEGER NOT NULL DEFAULT 0"),
    ):
        if name not in cols:
            conn.execute(f"ALTER TABLE appearances ADD COLUMN {name} {typedef}")

    conn.execute(
        "UPDATE appearances SET session_id = 'sess-' || track_id || '-' || event_date"
        " WHERE (session_id IS NULL OR session_id = '') AND track_id IS NOT NULL"
        " AND track_id != ''"
    )
    conn.execute(
        "UPDATE appearances SET session_id = 'sess-legacy-' || id"
        " WHERE session_id IS NULL OR session_id = ''"
    )
    conn.execute(
        "UPDATE appearances SET counted = 1 WHERE counted = 0 AND qualified = 1"
    )

    conn.execute(
        "CREATE INDEX IF NOT EXISTS ix_appearances_session"
        " ON appearances(event_date, session_id)"
    )
    conn.execute("PRAGMA user_version=6")
    conn.commit()
