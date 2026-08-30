"""Repository classes implementing transactional invariants.

Every repository method that modifies state enforces the invariant
contract from DATA_MODEL_V1.md § Required invariants:

- Append-only tables never accept UPDATE or DELETE through repos.
- Application status changes write an event + update projection in one tx.
- Sent letter versions are immutable.
- Optimistic concurrency uses ``revision``; stale writes raise ``ValueError``.
- Duplicate vacancy intake is idempotent by ``(source, source_vacancy_id)``.
"""

from __future__ import annotations

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.db.models import (
    Application,
    ApplicationEvent,
    CoverLetter,
    LetterVersion,
    Vacancy,
    VacancySnapshot,
)
from app.domain.invariants import ensure_sent_immutable

# ── VacancyRepository ──────────────────────────────────────────────────


class VacancyRepository:
    """Repository for ``vacancies`` and ``vacancy_snapshots``."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert(
        self,
        *,
        source: str,
        source_vacancy_id: str,
        url: str | None = None,
        title: str,
        company_id: str | None = None,
        company_name: str | None = None,
        salary_min: float | None = None,
        salary_max: float | None = None,
        currency: str | None = None,
        work_mode: str | None = None,
        experience: str | None = None,
        description: str | None = None,
        description_hash: str | None = None,
        skills_json: str | None = None,
    ) -> Vacancy:
        """Create or refresh a vacancy by ``(source, source_vacancy_id)``.

        Idempotent — repeated calls with the same natural key return the
        existing row without error.
        """
        stmt = select(Vacancy).where(
            Vacancy.source == source,
            Vacancy.source_vacancy_id == source_vacancy_id,
        )
        existing = self._session.execute(stmt).scalar_one_or_none()

        now = utcnow()

        if existing is not None:
            existing.url = url or existing.url
            existing.title = title
            existing.company_id = company_id or existing.company_id
            existing.company_name = company_name or existing.company_name
            existing.salary_min = salary_min if salary_min is not None else existing.salary_min
            existing.salary_max = salary_max if salary_max is not None else existing.salary_max
            existing.currency = currency or existing.currency
            existing.work_mode = work_mode or existing.work_mode
            existing.experience = experience or existing.experience
            existing.description = description or existing.description
            existing.description_hash = description_hash or existing.description_hash
            existing.skills_json = skills_json or existing.skills_json
            existing.last_seen_at = now
            existing.updated_at = now
            existing.revision += 1
            self._session.flush()
            return existing

        vacancy = Vacancy(
            source=source,
            source_vacancy_id=source_vacancy_id,
            url=url,
            title=title,
            company_id=company_id,
            company_name=company_name,
            salary_min=salary_min,
            salary_max=salary_max,
            currency=currency,
            work_mode=work_mode,
            experience=experience,
            description=description,
            description_hash=description_hash,
            skills_json=skills_json,
            first_seen_at=now,
            last_seen_at=now,
            updated_at=now,
        )
        self._session.add(vacancy)
        self._session.flush()
        return vacancy

    def get_by_id(self, vacancy_id: str) -> Vacancy | None:
        return self._session.get(Vacancy, vacancy_id)

    def get_by_source(self, source: str, source_vacancy_id: str) -> Vacancy | None:
        stmt = select(Vacancy).where(
            Vacancy.source == source,
            Vacancy.source_vacancy_id == source_vacancy_id,
        )
        return self._session.execute(stmt).scalar_one_or_none()

    def get_snapshot_by_key(self, idempotency_key: str) -> VacancySnapshot | None:
        """Return a prior snapshot applied with this idempotency key, if any.

        Used to detect replays up-front so a retried request never mutates the
        vacancy row after the original operation already committed.
        """
        stmt = select(VacancySnapshot).where(VacancySnapshot.idempotency_key == idempotency_key)
        return self._session.execute(stmt).scalar_one_or_none()

    def add_snapshot(
        self,
        *,
        vacancy_id: str,
        description_hash: str,
        payload_json: str | None = None,
        capture_source: str = 'manual',
        idempotency_key: str | None = None,
    ) -> VacancySnapshot:
        """Append a snapshot, returning the prior row for a repeated request key."""
        if idempotency_key is not None:
            prior = self._session.execute(
                select(VacancySnapshot).where(VacancySnapshot.idempotency_key == idempotency_key)
            ).scalar_one_or_none()
            if prior is not None:
                if prior.vacancy_id != vacancy_id:
                    raise ValueError('Idempotency key belongs to another vacancy')
                return prior

        # Append-only guard: this method only inserts.  Any future
        # update/delete path must call ensure_append_only first.
        snapshot = VacancySnapshot(
            vacancy_id=vacancy_id,
            description_hash=description_hash,
            payload_json=payload_json,
            captured_at=utcnow(),
            capture_source=capture_source,
            idempotency_key=idempotency_key,
        )
        self._session.add(snapshot)
        self._session.flush()
        return snapshot


# ── ApplicationRepository ──────────────────────────────────────────────


class ApplicationRepository:
    """Repository for ``applications`` and ``application_events``.

    Invariant: every status change writes an ``application_events`` row
    and updates the ``applications`` projection in a single transaction.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, *, vacancy_id: str, status: str = 'saved') -> Application:
        app = Application(vacancy_id=vacancy_id, status=status)
        self._session.add(app)
        self._session.flush()

        event = ApplicationEvent(
            application_id=app.id,
            event_type='created',
            source='user',
            occurred_at=utcnow(),
        )
        self._session.add(event)
        self._session.flush()
        return app

    def change_status(
        self,
        *,
        application_id: str,
        new_status: str,
        source: str = 'user',
        payload_json: str | None = None,
        expected_revision: int,
    ) -> Application:
        """Atomically update status and write an event.

        Raises ``ValueError`` when *expected_revision* does not match.
        """
        self._get_or_raise(application_id)
        now = utcnow()
        result = self._session.execute(
            update(Application)
            .where(
                Application.id == application_id,
                Application.revision == expected_revision,
            )
            .values(
                status=new_status,
                revision=Application.revision + 1,
                updated_at=now,
            )
        )
        if result.rowcount != 1:  # type: ignore[attr-defined]
            raise ValueError(
                f'Revision mismatch for application {application_id}: expected {expected_revision}'
            )

        event = ApplicationEvent(
            application_id=application_id,
            event_type=new_status,
            source=source,
            payload_json=payload_json,
            occurred_at=now,
        )
        self._session.add(event)
        self._session.flush()
        app = self._get_or_raise(application_id)
        self._session.refresh(app)
        return app

    def _get_or_raise(self, application_id: str) -> Application:
        app = self._session.get(Application, application_id)
        if app is None:
            raise ValueError(f'Application {application_id} not found')
        return app

    def get_by_id(self, application_id: str) -> Application | None:
        return self._session.get(Application, application_id)

    def delete(self, application_id: str) -> None:
        """Reject unreviewed destructive deletion at this repository boundary."""
        self._get_or_raise(application_id)
        raise ValueError(
            'Application deletion requires the preview/confirmation workflow implemented later.'
        )


# ── CoverLetterRepository ──────────────────────────────────────────────


class CoverLetterRepository:
    """Repository for ``cover_letters`` and ``letter_versions``."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        *,
        application_id: str,
        mode: str = 'manual',
        generated_text: str | None = None,
    ) -> CoverLetter:
        letter = CoverLetter(
            application_id=application_id,
            mode=mode,
            generated_text=generated_text,
        )
        self._session.add(letter)
        self._session.flush()
        return letter

    def add_version(
        self,
        *,
        cover_letter_id: str,
        version_type: str,
        body_text: str,
        source: str = 'user',
        provider: str | None = None,
        model: str | None = None,
        prompt_version: str | None = None,
        engine_run_id: str | None = None,
        bridge_request_id: str | None = None,
        vacancy_hash: str | None = None,
        validation_json: str | None = None,
        diff_json: str | None = None,
        expected_revision: int,
    ) -> LetterVersion:
        """Append a new version.  Raises ``ValueError`` if the latest
        version is already ``sent`` (immutable)."""
        # Append-only guard: this method only inserts.  Any future
        # update/delete path must call ensure_append_only first.

        # Check current sent status on the cover letter projection
        letter = self._session.get(CoverLetter, cover_letter_id)
        if letter is None:
            raise ValueError(f'CoverLetter {cover_letter_id} not found')

        # Check existing sent versions
        existing_sent = self._session.execute(
            select(LetterVersion).where(
                LetterVersion.cover_letter_id == cover_letter_id,
                LetterVersion.version_type == 'sent',
            )
        ).scalar_one_or_none()

        if existing_sent is not None:
            ensure_sent_immutable(version_type, 'sent')

        now = utcnow()
        result = self._session.execute(
            update(CoverLetter)
            .where(
                CoverLetter.id == cover_letter_id,
                CoverLetter.revision == expected_revision,
            )
            .values(
                # The generated/imported snapshot is provenance, not a mutable
                # "current draft" projection.  User edits and finals stay in
                # append-only history and must never overwrite it.
                generated_text=(
                    body_text
                    if version_type in ('generated', 'imported') and letter.generated_text is None
                    else letter.generated_text
                ),
                sent_text=body_text if version_type == 'sent' else letter.sent_text,
                is_final=version_type in ('final', 'sent') or letter.is_final,
                revision=CoverLetter.revision + 1,
                updated_at=now,
            )
        )
        if result.rowcount != 1:  # type: ignore[attr-defined]
            raise ValueError(
                f'Revision mismatch for cover letter {cover_letter_id}: '
                f'expected {expected_revision}'
            )

        version = LetterVersion(
            cover_letter_id=cover_letter_id,
            version_type=version_type,
            body_text=body_text,
            source=source,
            provider=provider,
            model=model,
            prompt_version=prompt_version,
            engine_run_id=engine_run_id,
            bridge_request_id=bridge_request_id,
            vacancy_hash=vacancy_hash,
            validation_json=validation_json,
            diff_json=diff_json,
            created_at=now,
        )
        self._session.add(version)
        self._session.flush()
        self._session.refresh(letter)
        return version

    def get_by_id(self, letter_id: str) -> CoverLetter | None:
        return self._session.get(CoverLetter, letter_id)

    def list_versions(self, cover_letter_id: str) -> list[LetterVersion]:
        """Return immutable history in creation order."""
        return list(
            self._session.execute(
                select(LetterVersion)
                .where(LetterVersion.cover_letter_id == cover_letter_id)
                # Timestamps are intentionally second-precision. SQLite rowid
                # is the stable insertion order for versions created in the
                # same second, preserving the append-only lifecycle.
                .order_by(LetterVersion.created_at.asc(), text('rowid ASC'))
            ).scalars()
        )
