"""Dry-run-first scrubber for legacy Companion provider bodies.

The current engine never writes ``engine_runs.raw_output``. This utility is
deliberately conservative for older local databases: it reports only a
recognized path category and row counts by default, and requires explicit
``--confirm`` before making the one-column update. It never creates a backup
and refuses paths outside the repository's recognized Companion data roots.
"""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

_DB_SUFFIXES = {'.db', '.sqlite', '.sqlite3'}


def _recognized_store_category(path: Path, project_root: Path) -> str | None:
    resolved = path.resolve()
    root = project_root.resolve()
    current_root = root / '.local' / 'data' / 'companion'
    legacy_root = root / 'companion' / 'data'

    if resolved == current_root / 'vacancypilot.db':
        return 'canonical-local-companion-db'
    if resolved == legacy_root / 'vacancypilot.db':
        return 'legacy-companion-db'

    for backup_root in (current_root, legacy_root):
        try:
            relative = resolved.relative_to(backup_root)
        except ValueError:
            continue
        if (
            len(relative.parts) >= 1
            and resolved.name.lower().startswith('vacancypilot')
            and resolved.suffix.lower() in _DB_SUFFIXES
            and (
                'backup' in {part.lower() for part in relative.parts[:-1]}
                or 'backup' in resolved.stem.lower()
            )
        ):
            return 'recognized-companion-backup-db'
    return None


def _raw_output_count(connection: sqlite3.Connection) -> int:
    table = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'engine_runs'"
    ).fetchone()
    if table is None:
        return 0
    columns = {
        str(row[1])
        for row in connection.execute('PRAGMA table_info(engine_runs)').fetchall()
    }
    if 'raw_output' not in columns:
        return 0
    row = connection.execute(
        "SELECT COUNT(*) FROM engine_runs "
        "WHERE raw_output IS NOT NULL AND raw_output <> ''"
    ).fetchone()
    return int(row[0] if row else 0)


def _integrity_check(connection: sqlite3.Connection) -> str:
    row = connection.execute('PRAGMA integrity_check').fetchone()
    return str(row[0]) if row else 'unknown'


def scrub(
    path: Path,
    *,
    confirm: bool,
    project_root: Path | None = None,
) -> int:
    """Report or scrub legacy raw provider bodies in one recognized DB.

    ``project_root`` is injectable only for tests using disposable temporary
    databases. The CLI always resolves it from this repository's script path.
    """

    root = project_root or Path(__file__).resolve().parents[2]
    resolved = path.resolve()
    category = _recognized_store_category(resolved, root)
    if category is None:
        raise SystemExit('SCRUB_REFUSED_UNRECOGNIZED_STORE')
    if not resolved.is_file():
        raise SystemExit(f'database not found: {resolved}')

    uri_mode = 'rw' if confirm else 'ro'
    uri = f'file:{resolved}?mode={uri_mode}'
    with sqlite3.connect(uri, uri=True) as connection:
        count = _raw_output_count(connection)
        print(f'path={resolved}')
        print(f'category={category}')
        print(f'legacy_raw_output_rows={count}')
        if not confirm:
            print(f'dry_run=true would_scrub_rows={count}')
            return count

        before_integrity = _integrity_check(connection)
        if before_integrity != 'ok':
            raise SystemExit('SCRUB_BLOCKED_INTEGRITY_CHECK_BEFORE')
        if count:
            connection.execute(
                'UPDATE engine_runs SET raw_output = NULL '
                'WHERE raw_output IS NOT NULL'
            )
            connection.commit()
        after_integrity = _integrity_check(connection)
        if after_integrity != 'ok':
            raise SystemExit('SCRUB_BLOCKED_INTEGRITY_CHECK_AFTER')
        print(f'confirmed=true scrubbed_rows={count} integrity_check={after_integrity}')
        return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, required=True)
    parser.add_argument(
        '--confirm',
        action='store_true',
        help='scrub the recognized database after integrity checks',
    )
    args = parser.parse_args()
    scrub(args.db, confirm=args.confirm)


if __name__ == '__main__':
    main()
