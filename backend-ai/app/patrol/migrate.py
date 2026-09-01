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
        "CREATE INDEX IF NOT EXISTS ix_appearances_session"
        " ON appearances(event_date, session_id)"
    )
    conn.execute("PRAGMA user_version=6")
    conn.commit()


def migrate_to_v7(conn: sqlite3.Connection) -> None:
    """Hồ sơ bản nháp (draft) + map sgc-* → pers-* bền vững."""
    version = int(conn.execute("PRAGMA user_version").fetchone()[0])
    if version >= 7:
        return

    person_cols = {
        str(r[1]) for r in conn.execute("PRAGMA table_info(persons)").fetchall()
    }
    if "iden_code" not in person_cols:
        # Fresh install: `_SCHEMA` already created v8-style persons — skip v7 reshape.
        conn.execute("PRAGMA user_version=7")
        conn.commit()
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS person_sgc_map (
          sgc_id     TEXT PRIMARY KEY,
          pers_id    TEXT NOT NULL REFERENCES persons(pers_id) ON DELETE CASCADE,
          created_at REAL NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS ix_person_sgc_map_pers ON person_sgc_map(pers_id)"
    )

    conn.execute(
        """
        CREATE TABLE persons_v7 (
          pers_id       TEXT PRIMARY KEY,
          status        TEXT NOT NULL,
          iden_code     TEXT UNIQUE,
          full_name     TEXT,
          employee_code TEXT UNIQUE,
          contractor    TEXT,
          origin        TEXT NOT NULL DEFAULT 'camera',
          first_seen    REAL,
          last_seen     REAL,
          identified_at REAL,
          identified_by TEXT,
          created_at    REAL NOT NULL,
          CHECK (status IN ('person', 'draft', 'identified')),
          CHECK ((status = 'identified') = (iden_code IS NOT NULL))
        )
        """
    )
    conn.execute("INSERT INTO persons_v7 SELECT * FROM persons")
    conn.execute("DROP TABLE persons")
    conn.execute("ALTER TABLE persons_v7 RENAME TO persons")

    conn.execute("PRAGMA user_version=7")
    conn.commit()


def migrate_to_v8(conn: sqlite3.Connection) -> None:
    """tk-* redesign — xoá sạch patrol, pers_id = tk-* hoặc gallery, bỏ pers-/iden- tự sinh."""
    version = int(conn.execute("PRAGMA user_version").fetchone()[0])
    if version >= 8:
        return

    conn.execute("DELETE FROM appearances")
    conn.execute("DELETE FROM daily_events")
    conn.execute("DELETE FROM daily_objects")
    conn.execute("DELETE FROM person_aliases")
    conn.execute("DELETE FROM person_faces")
    conn.execute("DELETE FROM enroll_session_faces")
    conn.execute("DELETE FROM enroll_sessions")
    conn.execute("DELETE FROM persons")
    conn.execute("DROP TABLE IF EXISTS person_sgc_map")
    conn.execute("DROP TABLE IF EXISTS person_tk_map")

    conn.execute(
        """
        CREATE TABLE persons_v8 (
          pers_id       TEXT PRIMARY KEY,
          status        TEXT NOT NULL,
          full_name     TEXT,
          employee_code TEXT UNIQUE,
          contractor    TEXT,
          origin        TEXT NOT NULL DEFAULT 'camera',
          first_seen    REAL,
          last_seen     REAL,
          identified_at REAL,
          identified_by TEXT,
          created_at    REAL NOT NULL,
          CHECK (status IN ('draft', 'identified')),
          CHECK (
            (status = 'identified') = (
              employee_code IS NOT NULL
              AND employee_code NOT LIKE 'tk-%'
              AND employee_code NOT LIKE 'sgc-%'
            )
          )
        )
        """
    )
    conn.execute("DROP TABLE IF EXISTS persons")
    conn.execute("ALTER TABLE persons_v8 RENAME TO persons")

    conn.execute("DELETE FROM counters WHERE name IN ('pers', 'iden', 'sgc')")
    conn.execute(
        "INSERT INTO counters(name, value) VALUES('tk', 0) ON CONFLICT(name) DO NOTHING"
    )

    conn.execute("PRAGMA user_version=8")
    conn.commit()


def migrate_to_v9(conn: sqlite3.Connection) -> None:
    """Gắn tk registry → pers_id bền — tránh cấp tk mới mỗi lần observe_face."""
    version = int(conn.execute("PRAGMA user_version").fetchone()[0])
    if version >= 9:
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS track_profile_bindings (
          tk_id    TEXT PRIMARY KEY,
          pers_id  TEXT NOT NULL REFERENCES persons(pers_id) ON DELETE CASCADE,
          bound_at REAL NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS ix_track_profile_bindings_pers"
        " ON track_profile_bindings(pers_id)"
    )

    conn.execute("PRAGMA user_version=9")
    conn.commit()
