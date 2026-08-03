"""Migration tests — upgrade, downgrade round-trip, and integrity."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import sessionmaker

from app.db.base import register_sqlite_pragmas


def _migrations_dir() -> Path:
    return Path(__file__).resolve().parents[1] / 'migrations'


def _run_alembic(args: list[str], db_url: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    return subprocess.run(
        [sys.executable, '-m', 'alembic', '-c', str(cwd / 'alembic.ini'), *args],
        capture_output=True,
        text=True,
        cwd=str(cwd),
        env=env,
        timeout=30,
    )


# ── Clean migration to head ───────────────────────────────────────────


class TestMigrationToHead:
    def test_upgrade_creates_all_tables(self) -> None:
        """Run ``alembic upgrade head`` against a temporary DB and verify tables."""
        companion_root = Path(__file__).resolve().parents[1]

        with tempfile.TemporaryDirectory() as td:
            db_path = Path(td) / 'test.db'
            db_url = f'sqlite:///{db_path.resolve().as_posix()}'

            env = os.environ.copy()
            env['VACANCYPILOT_DB_PATH'] = str(db_path)

            result = subprocess.run(
                [
                    sys.executable,
                    '-m',
                    'alembic',
                    '-c',
                    str(companion_root / 'alembic.ini'),
                    'upgrade',
                    'head',
                ],
                capture_output=True,
                text=True,
                cwd=str(companion_root),
                env=env,
                timeout=30,
            )
            assert result.returncode == 0, (
                f'alembic upgrade head failed:\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}'
            )

            # Verify tables exist
            engine = create_engine(db_url)
            register_sqlite_pragmas(engine)
            inspector = sa_inspect(engine)
            tables = set(inspector.get_table_names())

            expected = {
                'vacancies',
                'vacancy_snapshots',
                'applications',
                'application_events',
                'engine_runs',
                'evidence_usage',
                'cover_letters',
                'letter_versions',
                'followups',
                'interview_packs',
                'hh_accounts',
                'hh_sync_runs',
                'search_profiles',
                'settings',
                'alembic_version',
            }
            missing = expected - tables
            assert not missing, f'Tables missing after upgrade: {missing}'
            engine.dispose()

    def test_upgrade_is_idempotent(self) -> None:
        """Two consecutive upgrades produce the same result."""
        companion_root = Path(__file__).resolve().parents[1]

        with tempfile.TemporaryDirectory() as td:
            db_path = Path(td) / 'test.db'
            env = os.environ.copy()
            env['VACANCYPILOT_DB_PATH'] = str(db_path)

            run_args = [
                sys.executable,
                '-m',
                'alembic',
                '-c',
                str(companion_root / 'alembic.ini'),
                'upgrade',
                'head',
            ]

            r1 = subprocess.run(
                run_args,
                capture_output=True,
                text=True,
                cwd=str(companion_root),
                env=env,
                timeout=30,
            )
            assert r1.returncode == 0, f'First upgrade failed: {r1.stderr}'

            r2 = subprocess.run(
                run_args,
                capture_output=True,
                text=True,
                cwd=str(companion_root),
                env=env,
                timeout=30,
            )
            assert r2.returncode == 0, f'Second upgrade failed: {r2.stderr}'

    def test_downgrade_upgrade_roundtrip(self) -> None:
        """Migrate up, down, then up again — the schema is restored."""
        companion_root = Path(__file__).resolve().parents[1]

        with tempfile.TemporaryDirectory() as td:
            db_path = Path(td) / 'test.db'
            env = os.environ.copy()
            env['VACANCYPILOT_DB_PATH'] = str(db_path)

            base_args = [
                sys.executable,
                '-m',
                'alembic',
                '-c',
                str(companion_root / 'alembic.ini'),
            ]

            # Upgrade
            r = subprocess.run(
                base_args + ['upgrade', 'head'],
                capture_output=True,
                text=True,
                cwd=str(companion_root),
                env=env,
                timeout=30,
            )
            assert r.returncode == 0, f'Initial upgrade failed: {r.stderr}'

            # Downgrade to base
            r = subprocess.run(
                base_args + ['downgrade', 'base'],
                capture_output=True,
                text=True,
                cwd=str(companion_root),
                env=env,
                timeout=30,
            )
            assert r.returncode == 0, f'Downgrade failed: {r.stderr}'

            # Verify all tables dropped
            engine = create_engine(f'sqlite:///{db_path.resolve().as_posix()}')
            inspector = sa_inspect(engine)
            tables = set(inspector.get_table_names())
            # Only alembic_version should remain (and it gets dropped too in practice)
            domain_tables = tables - {'alembic_version'}
            assert not domain_tables, f'Tables remain after downgrade: {domain_tables}'
            engine.dispose()

            # Re-upgrade
            r = subprocess.run(
                base_args + ['upgrade', 'head'],
                capture_output=True,
                text=True,
                cwd=str(companion_root),
                env=env,
                timeout=30,
            )
            assert r.returncode == 0, f'Re-upgrade failed: {r.stderr}'

            engine = create_engine(f'sqlite:///{db_path.resolve().as_posix()}')
            register_sqlite_pragmas(engine)
            inspector = sa_inspect(engine)
            tables = set(inspector.get_table_names())
            assert 'vacancies' in tables, 'Tables not restored after round-trip'
            engine.dispose()

    def test_alembic_head_is_current(self) -> None:
        """The migration revision matches the current model metadata."""
        companion_root = Path(__file__).resolve().parents[1]

        with tempfile.TemporaryDirectory() as td:
            db_path = Path(td) / 'test.db'
            env = os.environ.copy()
            env['VACANCYPILOT_DB_PATH'] = str(db_path)

            base_args = [
                sys.executable,
                '-m',
                'alembic',
                '-c',
                str(companion_root / 'alembic.ini'),
            ]

            # Apply migration
            r = subprocess.run(
                base_args + ['upgrade', 'head'],
                capture_output=True,
                text=True,
                cwd=str(companion_root),
                env=env,
                timeout=30,
            )
            assert r.returncode == 0, f'Upgrade failed: {r.stderr}'

            # Check no new autogeneration is needed
            r = subprocess.run(
                base_args + ['check'],
                capture_output=True,
                text=True,
                cwd=str(companion_root),
                env=env,
                timeout=30,
            )
            # alembic check exits 0 when up-to-date
            assert r.returncode == 0, (
                f'alembic check failed — schema drift detected:\n{r.stdout}\n{r.stderr}'
            )


# ── Foreign key enforcement ────────────────────────────────────────────


class TestForeignKeyEnforcement:
    def test_production_engine_applies_all_pragmas(self, db_engine: Engine) -> None:
        from sqlalchemy import text

        with db_engine.connect() as connection:
            assert connection.execute(text('PRAGMA foreign_keys')).scalar_one() == 1
            assert connection.execute(text('PRAGMA busy_timeout')).scalar_one() == 5000
            assert connection.execute(text('PRAGMA journal_mode')).scalar_one().lower() == 'wal'

    def test_insert_with_invalid_fk_fails(self, db_engine: Engine) -> None:
        """Inserting a row with a non-existent FK must raise IntegrityError."""
        from sqlalchemy.exc import IntegrityError

        factory = sessionmaker(bind=db_engine)
        session = factory()
        try:
            from app.db.models import VacancySnapshot

            snap = VacancySnapshot(
                vacancy_id='nonexistent-id',
                description_hash='abc',
                capture_source='test',
            )
            session.add(snap)
            with pytest.raises(IntegrityError):
                session.flush()
        finally:
            session.rollback()
            session.close()

    def test_parent_delete_cannot_erase_append_only_child(self, db_engine: Engine) -> None:
        """Deleting a vacancy must not silently erase its audit snapshot."""
        from sqlalchemy.exc import IntegrityError

        from app.db.models import Vacancy, VacancySnapshot

        factory = sessionmaker(bind=db_engine)
        session = factory()
        try:
            v = Vacancy(source='hh', source_vacancy_id='123', title='Test')
            session.add(v)
            session.flush()

            snap = VacancySnapshot(
                vacancy_id=v.id,
                description_hash='abc',
                capture_source='test',
            )
            session.add(snap)
            session.flush()

            session.delete(v)
            with pytest.raises(IntegrityError):
                session.flush()
            session.rollback()
        finally:
            session.rollback()
            session.close()
