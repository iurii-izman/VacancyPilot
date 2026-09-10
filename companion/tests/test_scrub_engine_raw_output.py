"""Tests for the dry-run-first legacy provider-body scrubber."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.maintenance.scrub_engine_raw_output import scrub


def _make_dummy_db(root: Path) -> Path:
    path = root / '.local' / 'data' / 'companion' / 'vacancypilot.db'
    path.parent.mkdir(parents=True)
    with sqlite3.connect(path) as connection:
        connection.execute(
            'CREATE TABLE engine_runs '
            '(id TEXT PRIMARY KEY, raw_output TEXT, structured_result TEXT)'
        )
        connection.execute(
            'INSERT INTO engine_runs VALUES (?, ?, ?)',
            ('run-1', '{"private":"provider body"}', '{"score": 88}'),
        )
    return path


def test_dry_run_reports_count_without_mutating_or_printing_raw_value(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = _make_dummy_db(tmp_path)

    assert scrub(path, confirm=False, project_root=tmp_path) == 1

    with sqlite3.connect(path) as connection:
        assert connection.execute('SELECT raw_output FROM engine_runs').fetchone()[0]
    output = capsys.readouterr().out
    assert 'legacy_raw_output_rows=1' in output
    assert 'provider body' not in output
    assert 'score' not in output


def test_confirm_scrubs_only_raw_column_and_checks_integrity(tmp_path: Path) -> None:
    path = _make_dummy_db(tmp_path)

    assert scrub(path, confirm=True, project_root=tmp_path) == 1

    with sqlite3.connect(path) as connection:
        assert connection.execute('SELECT raw_output FROM engine_runs').fetchone()[0] is None
        assert (
            connection.execute('SELECT structured_result FROM engine_runs').fetchone()[0]
            == '{"score": 88}'
        )
        assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'


def test_external_store_is_refused(tmp_path: Path) -> None:
    path = tmp_path / 'arbitrary.db'
    with sqlite3.connect(path) as connection:
        connection.execute('CREATE TABLE engine_runs (raw_output TEXT)')
    with pytest.raises(SystemExit, match='SCRUB_REFUSED_UNRECOGNIZED_STORE'):
        scrub(path, confirm=True, project_root=tmp_path)
