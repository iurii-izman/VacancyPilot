"""Repository invariant tests.

Verify the transactional and append-only guarantees from DATA_MODEL_V1.md.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    Application,
    ApplicationEvent,
    CoverLetter,
    EngineRun,
    Vacancy,
)
from app.domain.invariants import (
    ensure_append_only,
    ensure_no_secret_columns,
    ensure_sent_immutable,
)
from app.domain.repositories import (
    ApplicationRepository,
    CoverLetterRepository,
    VacancyRepository,
)

# ── VacancyRepository ──────────────────────────────────────────────────


class TestVacancyRepository:
    def test_upsert_creates_new(self, db_session: Session) -> None:
        repo = VacancyRepository(db_session)
        v = repo.upsert(source='hh', source_vacancy_id='v1', title='Engineer')
        assert v.id is not None
        assert v.source == 'hh'
        assert v.source_vacancy_id == 'v1'
        assert v.title == 'Engineer'

    def test_unique_vacancy_identity(self, db_session: Session) -> None:
        """Two upserts with the same natural key return the same row."""
        repo = VacancyRepository(db_session)
        v1 = repo.upsert(source='hh', source_vacancy_id='v2', title='First')
        v2 = repo.upsert(source='hh', source_vacancy_id='v2', title='Second')
        assert v1.id == v2.id

    def test_direct_duplicate_insert_fails(self, db_session: Session) -> None:
        """Inserting two vacancies with the same (source, source_vacancy_id)
        without using upsert raises IntegrityError."""

        db_session.add(Vacancy(source='hh', source_vacancy_id='v3', title='A'))
        db_session.flush()
        db_session.add(Vacancy(source='hh', source_vacancy_id='v3', title='B'))
        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_add_snapshot(self, db_session: Session) -> None:
        repo = VacancyRepository(db_session)
        v = repo.upsert(source='hh', source_vacancy_id='v4', title='Snap')
        snap = repo.add_snapshot(
            vacancy_id=v.id,
            description_hash='hash1',
            payload_json='{"desc":"test"}',
            capture_source='extension',
        )
        assert snap.id is not None
        assert snap.vacancy_id == v.id

    def test_snapshot_is_append_only(self, db_session: Session) -> None:
        """A persisted snapshot cannot be updated through the ORM session."""
        repo = VacancyRepository(db_session)
        v = repo.upsert(source='hh', source_vacancy_id='v5', title='Append')
        snap = repo.add_snapshot(vacancy_id=v.id, description_hash='h', capture_source='test')

        snap.capture_source = 'mutated'
        with pytest.raises(ValueError, match='append-only'):
            db_session.flush()
        db_session.rollback()

    def test_snapshot_idempotency_key_returns_original(self, db_session: Session) -> None:
        repo = VacancyRepository(db_session)
        vacancy = repo.upsert(source='hh', source_vacancy_id='v6', title='Idempotent')
        first = repo.add_snapshot(
            vacancy_id=vacancy.id,
            description_hash='first',
            capture_source='extension',
            idempotency_key='550e8400-e29b-41d4-a716-446655440000',
        )
        repeated = repo.add_snapshot(
            vacancy_id=vacancy.id,
            description_hash='ignored-on-retry',
            capture_source='extension',
            idempotency_key='550e8400-e29b-41d4-a716-446655440000',
        )
        assert repeated.id == first.id
        assert repeated.description_hash == 'first'

    def test_timestamps_use_one_utc_text_format(self, db_session: Session) -> None:
        vacancy = VacancyRepository(db_session).upsert(
            source='hh',
            source_vacancy_id='v7',
            title='Timestamps',
        )
        application = ApplicationRepository(db_session).create(vacancy_id=vacancy.id)
        for timestamp in (
            vacancy.first_seen_at,
            vacancy.last_seen_at,
            vacancy.updated_at,
            application.created_at,
            application.updated_at,
        ):
            assert isinstance(timestamp, str)
            assert timestamp.endswith('Z')


# ── ApplicationRepository ──────────────────────────────────────────────


class TestApplicationRepository:
    def test_create_writes_event(self, db_session: Session) -> None:
        repo = VacancyRepository(db_session)
        v = repo.upsert(source='hh', source_vacancy_id='av1', title='App Vacancy')

        app_repo = ApplicationRepository(db_session)
        app = app_repo.create(vacancy_id=v.id)

        # An event must have been written
        events = (
            db_session.execute(
                select(ApplicationEvent).where(ApplicationEvent.application_id == app.id)
            )
            .scalars()
            .all()
        )
        assert len(events) == 1
        assert events[0].event_type == 'created'

    def test_change_status_writes_event_and_updates_projection(self, db_session: Session) -> None:
        repo = VacancyRepository(db_session)
        v = repo.upsert(source='hh', source_vacancy_id='av2', title='Status')

        app_repo = ApplicationRepository(db_session)
        app = app_repo.create(vacancy_id=v.id, status='saved')
        original_revision = app.revision

        updated = app_repo.change_status(
            application_id=app.id,
            new_status='applied',
            source='user',
            expected_revision=original_revision,
        )

        assert updated.status == 'applied'
        assert updated.revision == original_revision + 1

        events = (
            db_session.execute(
                select(ApplicationEvent).where(ApplicationEvent.application_id == app.id)
            )
            .scalars()
            .all()
        )
        event_types = {e.event_type for e in events}
        assert 'created' in event_types
        assert 'applied' in event_types

    def test_optimistic_revision_conflict(self, db_session: Session) -> None:
        repo = VacancyRepository(db_session)
        v = repo.upsert(source='hh', source_vacancy_id='av3', title='Conflict')

        app_repo = ApplicationRepository(db_session)
        app = app_repo.create(vacancy_id=v.id)

        # First update sets revision to 2
        app_repo.change_status(application_id=app.id, new_status='applied', expected_revision=1)

        # Stale revision — should raise
        with pytest.raises(ValueError, match='Revision mismatch'):
            app_repo.change_status(
                application_id=app.id, new_status='rejected', expected_revision=1
            )

    def test_delete_does_not_erase_audit_events(self, db_session: Session) -> None:
        """Deletion is blocked until a preview/confirmation workflow exists."""
        repo = VacancyRepository(db_session)
        v = repo.upsert(source='hh', source_vacancy_id='av4', title='Delete')

        app_repo = ApplicationRepository(db_session)
        app = app_repo.create(vacancy_id=v.id)
        event_id = app.events[0].id
        with pytest.raises(ValueError, match='preview/confirmation'):
            app_repo.delete(app.id)
        assert db_session.get(Application, app.id) is not None
        assert db_session.get(ApplicationEvent, event_id) is not None

    def test_event_and_status_in_one_transaction_rollback(self, db_session: Session) -> None:
        """A failed status change must not leave a partial event."""
        repo = VacancyRepository(db_session)
        v = repo.upsert(source='hh', source_vacancy_id='av5', title='Rollback')

        app_repo = ApplicationRepository(db_session)
        app = app_repo.create(vacancy_id=v.id)
        app_id = app.id

        db_session.commit()

        with pytest.raises(IntegrityError):
            app_repo.change_status(
                application_id=app_id,
                new_status='invalid_status_that_will_fail',
                expected_revision=1,
            )
        db_session.rollback()

        recovered = db_session.get(Application, app_id)
        assert recovered is not None
        assert recovered.status == 'saved'
        assert recovered.revision == 1
        events = db_session.execute(
            select(ApplicationEvent).where(ApplicationEvent.application_id == app_id)
        ).scalars()
        assert [event.event_type for event in events] == ['created']

    def test_application_event_is_append_only(self, db_session: Session) -> None:
        vacancy = VacancyRepository(db_session).upsert(
            source='hh',
            source_vacancy_id='av6',
            title='Event append-only',
        )
        application = ApplicationRepository(db_session).create(vacancy_id=vacancy.id)
        event = application.events[0]
        event.source = 'verified_sync'
        with pytest.raises(ValueError, match='append-only'):
            db_session.flush()
        db_session.rollback()

    def test_engine_run_is_append_only(self, db_session: Session) -> None:
        vacancy = VacancyRepository(db_session).upsert(
            source='hh',
            source_vacancy_id='av7',
            title='Run append-only',
        )
        run = EngineRun(
            vacancy_id=vacancy.id,
            engine_version='4.0.0',
            provider='manual',
            prompt_version='p1',
            input_hash='hash',
            status='success',
        )
        db_session.add(run)
        db_session.flush()
        run.status = 'error'
        with pytest.raises(ValueError, match='append-only'):
            db_session.flush()
        db_session.rollback()


# ── CoverLetterRepository ──────────────────────────────────────────────


class TestCoverLetterRepository:
    def test_add_generated_version(self, db_session: Session) -> None:
        repo = VacancyRepository(db_session)
        v = repo.upsert(source='hh', source_vacancy_id='cl1', title='Letter')

        app_repo = ApplicationRepository(db_session)
        app = app_repo.create(vacancy_id=v.id)

        cl_repo = CoverLetterRepository(db_session)
        letter = cl_repo.create(application_id=app.id, mode='api')

        version = cl_repo.add_version(
            cover_letter_id=letter.id,
            version_type='generated',
            body_text='Dear hiring manager...',
            source='ai',
            provider='openai',
            model='gpt-4',
            expected_revision=letter.revision,
        )
        assert version.id is not None
        assert letter.generated_text == 'Dear hiring manager...'

    def test_sent_version_is_immutable(self, db_session: Session) -> None:
        repo = VacancyRepository(db_session)
        v = repo.upsert(source='hh', source_vacancy_id='cl2', title='Immutable')

        app_repo = ApplicationRepository(db_session)
        app = app_repo.create(vacancy_id=v.id)

        cl_repo = CoverLetterRepository(db_session)
        letter = cl_repo.create(application_id=app.id, mode='api')

        # First version: sent
        cl_repo.add_version(
            cover_letter_id=letter.id,
            version_type='sent',
            body_text='Final sent text',
            source='user',
            expected_revision=letter.revision,
        )

        # Try to add another version after sent
        with pytest.raises(ValueError, match='immutable'):
            cl_repo.add_version(
                cover_letter_id=letter.id,
                version_type='user_draft',
                body_text='Should not be allowed',
                source='user',
                expected_revision=letter.revision,
            )

    def test_letter_version_is_append_only(self, db_session: Session) -> None:
        repo = VacancyRepository(db_session)
        vacancy = repo.upsert(source='hh', source_vacancy_id='cl-append', title='Append')
        application = ApplicationRepository(db_session).create(vacancy_id=vacancy.id)
        letter = CoverLetterRepository(db_session).create(application_id=application.id)
        version = CoverLetterRepository(db_session).add_version(
            cover_letter_id=letter.id,
            version_type='generated',
            body_text='Original',
            expected_revision=letter.revision,
        )
        version.body_text = 'Mutated'
        with pytest.raises(ValueError, match='append-only'):
            db_session.flush()
        db_session.rollback()

    def test_sent_text_projection_updated(self, db_session: Session) -> None:
        repo = VacancyRepository(db_session)
        v = repo.upsert(source='hh', source_vacancy_id='cl3', title='Projection')

        app_repo = ApplicationRepository(db_session)
        app = app_repo.create(vacancy_id=v.id)

        cl_repo = CoverLetterRepository(db_session)
        letter = cl_repo.create(application_id=app.id, mode='api')

        cl_repo.add_version(
            cover_letter_id=letter.id,
            version_type='sent',
            body_text='My sent letter',
            source='user',
            expected_revision=letter.revision,
        )

        db_session.expire_all()
        reloaded = db_session.get(CoverLetter, letter.id)
        assert reloaded is not None
        assert reloaded.sent_text == 'My sent letter'
        assert reloaded.is_final is True

    def test_cover_letter_revision_conflict(self, db_session: Session) -> None:
        vacancy = VacancyRepository(db_session).upsert(
            source='hh',
            source_vacancy_id='cl4',
            title='Letter conflict',
        )
        application = ApplicationRepository(db_session).create(vacancy_id=vacancy.id)
        repo = CoverLetterRepository(db_session)
        letter = repo.create(application_id=application.id)
        repo.add_version(
            cover_letter_id=letter.id,
            version_type='generated',
            body_text='First',
            expected_revision=1,
        )
        with pytest.raises(ValueError, match='Revision mismatch'):
            repo.add_version(
                cover_letter_id=letter.id,
                version_type='user_draft',
                body_text='Stale',
                expected_revision=1,
            )


# ── Invariant unit tests ───────────────────────────────────────────────


class TestInvariants:
    def test_ensure_append_only_allows_insert_only(self) -> None:
        # Must not raise for non-append-only tables
        ensure_append_only('applications')  # allowed — not in the set

    def test_ensure_append_only_blocks_mutable_ops(self) -> None:
        with pytest.raises(ValueError):
            ensure_append_only('application_events')

    def test_ensure_sent_immutable_raises(self) -> None:
        with pytest.raises(ValueError, match='immutable'):
            ensure_sent_immutable('draft', 'sent')

    def test_ensure_sent_immutable_allows_non_sent(self) -> None:
        # Must not raise
        ensure_sent_immutable('draft', 'generated')

    def test_ensure_no_secret_columns_finds_violations(self) -> None:
        from app.db.base import Base

        # Our current schema must be clean
        violations = ensure_no_secret_columns(Base)
        assert not violations, f'Secret columns found: {violations}'
