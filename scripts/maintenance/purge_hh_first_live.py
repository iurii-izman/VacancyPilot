"""Safely identify and optionally purge a disposable HH first-live import.

This is a one-time operator tool, intentionally not exposed through the API/UI.
It requires an explicit database path and profile IDs, always creates and
verifies a SQLite backup, prints a dry-run report, and only mutates with
``--execute``.
"""

from __future__ import annotations

import argparse
import hashlib
import sqlite3
import sys
from pathlib import Path

PROTECTED_SQL = """
SELECT DISTINCT v.id FROM vacancies v
LEFT JOIN applications a ON a.vacancy_id = v.id
LEFT JOIN application_session_items si ON si.vacancy_id = v.id
LEFT JOIN engine_runs er ON er.vacancy_id = v.id
WHERE v.id IN ({}) AND (a.id IS NOT NULL OR si.id IS NOT NULL OR er.id IS NOT NULL)
"""


def _placeholders(values: list[str]) -> str:
    if not values:
        raise SystemExit("At least one --profile-id is required")
    return ",".join("?" for _ in values)


def _backup(source: Path, destination: Path) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise SystemExit(f"Backup already exists; refusing to overwrite: {destination}")
    src = sqlite3.connect(f"file:{source.resolve()}?mode=ro", uri=True)
    dst = sqlite3.connect(destination)
    try:
        src.backup(dst)
        dst.commit()
    finally:
        dst.close()
        src.close()
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    with sqlite3.connect(destination) as check:
        if check.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise SystemExit("PURGE_BACKUP_BLOCKED: backup integrity_check failed")
    return digest


def _ids(
    conn: sqlite3.Connection, profile_ids: list[str]
) -> tuple[list[str], list[str]]:
    marks = _placeholders(profile_ids)
    rows = conn.execute(
        f"SELECT DISTINCT v.id FROM vacancies v JOIN vacancy_search_profile_hits h ON h.vacancy_id=v.id "
        f"WHERE v.source='hh' AND h.search_profile_id IN ({marks})",
        profile_ids,
    ).fetchall()
    candidates = [row[0] for row in rows]
    if not candidates:
        return [], []
    protected = [
        row[0]
        for row in conn.execute(
            PROTECTED_SQL.format(_placeholders(candidates)), candidates
        ).fetchall()
    ]
    return candidates, protected


def _counts(conn: sqlite3.Connection, table: str, ids: list[str]) -> int:
    if not ids:
        return 0
    marks = _placeholders(ids)
    column = "vacancy_id"
    return int(
        conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE {column} IN ({marks})", ids
        ).fetchone()[0]
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True, type=Path)
    parser.add_argument("--backup", required=True, type=Path)
    parser.add_argument("--profile-id", action="append", required=True)
    parser.add_argument(
        "--execute", action="store_true", help="commit deletion after dry-run checks"
    )
    args = parser.parse_args()
    if not args.db.is_file():
        print("PURGE_BACKUP_BLOCKED: active SQLite DB does not exist", file=sys.stderr)
        return 2
    digest = _backup(args.db, args.backup)
    print(f"backup={args.backup}\nsha256={digest}\nintegrity=ok")
    with sqlite3.connect(args.db) as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        candidates, protected = _ids(conn, args.profile_id)
        deletable = [item for item in candidates if item not in set(protected)]
        print(
            f"vacancies candidates={len(candidates)} protected={len(protected)} deletable={len(deletable)}"
        )
        print(f"snapshots candidates={_counts(conn, 'vacancy_snapshots', candidates)}")
        print(
            f"profile_hits candidates={_counts(conn, 'vacancy_search_profile_hits', candidates)}"
        )
        print(f"applications preserved={_counts(conn, 'applications', protected)}")
        if protected:
            print(
                "PURGE_BLOCKED_PROTECTED_DATA: refusing to delete protected vacancies",
                file=sys.stderr,
            )
            return 3
        if not args.execute:
            print("dry_run=true")
            return 0
        conn.execute("BEGIN")
        marks = _placeholders(deletable)
        conn.execute(
            f"DELETE FROM vacancy_search_profile_hits WHERE vacancy_id IN ({marks})",
            deletable,
        )
        conn.execute(
            f"DELETE FROM vacancy_snapshots WHERE vacancy_id IN ({marks})", deletable
        )
        conn.execute(f"DELETE FROM vacancies WHERE id IN ({marks})", deletable)
        if conn.execute("PRAGMA foreign_key_check").fetchall():
            conn.rollback()
            raise SystemExit("PURGE_BLOCKED: foreign_key_check failed; rolled back")
        conn.commit()
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise SystemExit("PURGE_BLOCKED: integrity_check failed after commit")
        print(f"deleted vacancies={len(deletable)} foreign_keys=ok integrity=ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
