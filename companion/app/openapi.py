"""Deterministic generation and drift checking for the OpenAPI snapshot."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.main import create_app

SNAPSHOT_PATH = Path(__file__).resolve().parents[2] / 'shared' / 'contracts' / 'openapi.json'


def render_openapi() -> str:
    """Return the canonical OpenAPI document with deterministic formatting."""
    return (
        json.dumps(
            create_app().openapi(),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + '\n'
    )


def check_snapshot() -> bool:
    """Return whether the checked-in snapshot exactly matches the application."""
    return SNAPSHOT_PATH.is_file() and SNAPSHOT_PATH.read_text(encoding='utf-8') == render_openapi()


def write_snapshot() -> None:
    """Write the canonical OpenAPI snapshot."""
    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(render_openapi(), encoding='utf-8')


def main() -> int:
    """Generate the snapshot or report drift without modifying the worktree."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--check',
        action='store_true',
        help='fail if the checked-in snapshot differs from the generated contract',
    )
    args = parser.parse_args()

    if args.check:
        if check_snapshot():
            print(f'OpenAPI snapshot is current: {SNAPSHOT_PATH}')
            return 0
        print(f'OpenAPI snapshot drift detected: {SNAPSHOT_PATH}')
        return 1

    write_snapshot()
    print(f'OpenAPI snapshot written: {SNAPSHOT_PATH}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
