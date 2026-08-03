"""Schema tests — verify that the SQLAlchemy models match the contract."""

from __future__ import annotations

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.engine import Engine

from app.db.base import Base
from app.domain.invariants import ensure_no_secret_columns

# ── Table existence ────────────────────────────────────────────────────

EXPECTED_TABLES = frozenset(
    {
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
    }
)


class TestTableExistence:
    def test_all_expected_tables_created(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        actual = set(inspector.get_table_names())
        missing = EXPECTED_TABLES - actual
        assert not missing, f'Tables missing from schema: {missing}'

    def test_no_unexpected_tables(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        actual = set(inspector.get_table_names())
        extra = actual - EXPECTED_TABLES
        # Alembic version table is allowed
        extra.discard('alembic_version')
        assert not extra, f'Unexpected tables in schema: {extra}'


# ── Unique constraints ─────────────────────────────────────────────────


class TestUniqueConstraints:
    def test_vacancy_source_unique(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        constraints = inspector.get_unique_constraints('vacancies')
        names = {c['name'] for c in constraints}
        assert 'uq_vacancy_source' in names

    def test_hh_user_id_unique(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        constraints = inspector.get_unique_constraints('hh_accounts')
        # hh_user_id has unique=True — check via unique constraints
        col_names_in_unique: set[str] = set()
        for c in constraints:
            col_names_in_unique.update(c['column_names'])
        assert 'hh_user_id' in col_names_in_unique


# ── Foreign keys ───────────────────────────────────────────────────────


class TestForeignKeys:
    def test_vacancy_snapshot_fk(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        fks = inspector.get_foreign_keys('vacancy_snapshots')
        assert any(fk['referred_table'] == 'vacancies' for fk in fks)

    def test_application_fk(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        fks = inspector.get_foreign_keys('applications')
        assert any(fk['referred_table'] == 'vacancies' for fk in fks)

    def test_application_event_fk(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        fks = inspector.get_foreign_keys('application_events')
        assert any(fk['referred_table'] == 'applications' for fk in fks)

    def test_engine_run_fk(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        fks = inspector.get_foreign_keys('engine_runs')
        assert any(fk['referred_table'] == 'vacancies' for fk in fks)

    def test_cover_letter_fk(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        fks = inspector.get_foreign_keys('cover_letters')
        assert any(fk['referred_table'] == 'applications' for fk in fks)

    def test_letter_version_fk(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        fks = inspector.get_foreign_keys('letter_versions')
        assert any(fk['referred_table'] == 'cover_letters' for fk in fks)


# ── Check constraints ──────────────────────────────────────────────────


class TestCheckConstraints:
    def test_application_status_ck(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        names = {c['name'] for c in inspector.get_check_constraints('applications')}
        assert 'ck_application_status' in names

    def test_engine_run_status_ck(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cks = inspector.get_check_constraints('engine_runs')
        names = {c['name'] for c in cks}
        assert 'ck_engine_run_status' in names

    def test_letter_version_type_ck(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cks = inspector.get_check_constraints('letter_versions')
        names = {c['name'] for c in cks}
        assert 'ck_letter_version_type' in names

    def test_followup_status_ck(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cks = inspector.get_check_constraints('followups')
        names = {c['name'] for c in cks}
        assert 'ck_followup_status' in names

    def test_sync_run_status_ck(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cks = inspector.get_check_constraints('hh_sync_runs')
        names = {c['name'] for c in cks}
        assert 'ck_sync_run_status' in names


# ── Revision column on mutable projections ─────────────────────────────


class TestRevisionColumns:
    def test_vacancy_has_revision(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cols = {c['name'] for c in inspector.get_columns('vacancies')}
        assert 'revision' in cols

    def test_application_has_revision(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cols = {c['name'] for c in inspector.get_columns('applications')}
        assert 'revision' in cols

    def test_cover_letter_has_revision(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cols = {c['name'] for c in inspector.get_columns('cover_letters')}
        assert 'revision' in cols

    def test_followup_has_revision(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cols = {c['name'] for c in inspector.get_columns('followups')}
        assert 'revision' in cols

    def test_search_profile_has_revision(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cols = {c['name'] for c in inspector.get_columns('search_profiles')}
        assert 'revision' in cols

    def test_interview_pack_has_revision(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cols = {c['name'] for c in inspector.get_columns('interview_packs')}
        assert 'revision' in cols

    def test_hh_account_has_revision(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cols = {c['name'] for c in inspector.get_columns('hh_accounts')}
        assert 'revision' in cols

    def test_settings_has_revision(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cols = {c['name'] for c in inspector.get_columns('settings')}
        assert 'revision' in cols


# ── Timestamps ─────────────────────────────────────────────────────────


class TestTimestampColumns:
    def test_vacancy_has_timestamps(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cols = {c['name'] for c in inspector.get_columns('vacancies')}
        for col in ('first_seen_at', 'last_seen_at', 'updated_at'):
            assert col in cols, f'Missing {col} in vacancies'

    def test_application_has_timestamps(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cols = {c['name'] for c in inspector.get_columns('applications')}
        for col in ('created_at', 'updated_at'):
            assert col in cols, f'Missing {col} in applications'

    def test_mutable_metadata_has_timestamps(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        for table in ('hh_accounts', 'search_profiles', 'settings'):
            cols = {c['name'] for c in inspector.get_columns(table)}
            assert {'created_at', 'updated_at'} <= cols


# ── No secret columns ──────────────────────────────────────────────────


class TestNoSecretColumns:
    def test_no_secret_named_columns(self) -> None:
        violations = ensure_no_secret_columns(Base)
        assert not violations, (
            f'Secret-like column names detected: {violations}. '
            'Remove or rename them — no credentials in domain tables.'
        )

    def test_hh_accounts_has_no_token_column(self, db_engine: Engine) -> None:
        inspector = sa_inspect(db_engine)
        cols = {c['name'].lower() for c in inspector.get_columns('hh_accounts')}
        secretish = {'token', 'access_token', 'refresh_token', 'api_key', 'secret'}
        intersection = cols & secretish
        assert not intersection, f'hh_accounts contains secret-like columns: {intersection}'
