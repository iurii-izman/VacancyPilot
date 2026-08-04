"""Normalized vacancy intake, snapshot-on-change, and idempotency — AOPS-06.

The intake engine turns a sanitized ``VacancyIntakeV1`` payload into a
``vacancies`` row plus a ``vacancy_snapshots`` row, using explicit change
detection:

- Upsert identity is ``(source, source_vacancy_id)``; a deterministic fallback
  identity is used only when the source ID is truly absent.
- A normalized content hash is computed from the user-visible normalized
  payload. A new snapshot is appended only when the normalized payload changed;
  ``updated_at``/``revision`` advance only on an actual change.
- ``first_seen_at`` is set once; ``last_seen_at`` advances on every intake.
- A request idempotency key replays the original result without side effects.

The content hash deliberately uses SHA-256 (the extension-side
``hashString`` helper is a different, non-cryptographic routine). This
difference is reported in the AOPS-06 handoff so it is not mistaken for a
silent score-parity change.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import re
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.db.models import Vacancy, VacancySnapshot
from app.domain.repositories import VacancyRepository

INTAKE_SCHEMA_VERSION = 1
INTAKE_SCHEMA_NAME = 'VacancyIntakeV1'

_WORK_MODE_VALUES = ('remote', 'hybrid', 'office', 'unknown')


class IdempotencyConflictError(ValueError):
    """A request key was reused for a different normalized payload."""


@dataclasses.dataclass(frozen=True)
class IntakeResult:
    """Outcome of a single normalized vacancy intake."""

    result: Literal['created', 'updated', 'unchanged']
    vacancy_id: str
    revision: int
    first_seen_at: str
    last_seen_at: str
    snapshot_id: str | None


@dataclasses.dataclass(frozen=True)
class NormalizedVacancy:
    """Canonical normalized projection stored in the vacancy row."""

    source: str
    source_vacancy_id: str
    url: str | None
    title: str
    company_id: str | None
    company_name: str | None
    salary_min: float | None
    salary_max: float | None
    currency: str | None
    work_mode: str | None
    city: str | None
    experience: str | None
    description: str | None
    skills: tuple[str, ...]
    content_hash: str
    captured_at: str
    capture_source: str


def sha256_hex(value: str) -> str:
    """Return a lowercase SHA-256 hex digest."""
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def normalize_description(value: str | None) -> str:
    """Normalize whitespace so formatting-only changes are not snapshotted."""
    if not value:
        return ''
    return re.sub(r'[ \t ]+', ' ', value.strip().replace('\r\n', '\n'))


def normalize_intake(payload: dict[str, Any]) -> NormalizedVacancy:
    """Normalize a validated ``VacancyIntakeV1`` payload into stored form.

    Mirrors the frozen DATA_MODEL_V1 vacancy columns exactly. Optional
    null values stay null so an intentional ``null`` clears prior data.
    """
    source = str(payload.get('source') or '').strip().lower() or 'manual'
    source_vacancy_id = str(payload.get('source_vacancy_id') or '').strip()
    if not source_vacancy_id:
        source_vacancy_id = _fallback_identity(payload, source)

    skills = [str(s) for s in (payload.get('skills') or []) if str(s).strip()]
    skills = list(dict.fromkeys(skills))[:20]

    normalized = NormalizedVacancy(
        source=source,
        source_vacancy_id=source_vacancy_id,
        url=_clean_string(payload.get('url'), 2048),
        title=_clean_string(payload.get('title'), 500) or 'Unknown',
        company_id=_clean_string(payload.get('company_id'), 500),
        company_name=_clean_string(payload.get('company_name'), 500),
        salary_min=_to_float(payload.get('salary_min')),
        salary_max=_to_float(payload.get('salary_max')),
        currency=_clean_string(payload.get('currency'), 16),
        work_mode=_clean_work_mode(payload.get('work_mode')),
        city=_clean_string(payload.get('city'), 200),
        experience=_clean_string(payload.get('experience'), 500),
        description=normalize_description(payload.get('description')),
        skills=tuple(skills),
        content_hash='',
        captured_at=_clean_string(payload.get('captured_at'), 64) or utcnow(),
        capture_source=str(payload.get('capture_source') or 'manual').strip() or 'manual',
    )
    return dataclasses.replace(normalized, content_hash=_content_hash_from_normalized(normalized))


def _clean_string(value: Any, max_length: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:max_length] or None


def _clean_work_mode(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if text not in _WORK_MODE_VALUES:
        return None
    return text


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fallback_identity(payload: dict[str, Any], source: str) -> str:
    """Deterministic fallback identity only when a source ID is truly absent.

    Scoped to ``source`` so identical titles across different sources do not
    collide on one fallback row.
    """
    title = str(payload.get('title') or '').strip() or 'unknown'
    url = str(payload.get('url') or '').strip()
    company = str(payload.get('company_name') or '').strip() or 'unknown'
    basis = f'{source}|{title}|{url}|{company}'
    return f'fallback_{sha256_hex(basis)[:12]}'


def _content_hash_from_normalized(v: NormalizedVacancy) -> str:
    """Deterministic SHA-256 over the exact normalized stored fields.

    Because the hash is computed from the stored projection, two intakes that
    would produce identical rows always produce identical digests.
    """
    builder: dict[str, Any] = {
        'source': v.source,
        'source_vacancy_id': v.source_vacancy_id,
        'url': v.url,
        'title': v.title,
        'company_id': v.company_id,
        'company_name': v.company_name,
        'salary_min': v.salary_min,
        'salary_max': v.salary_max,
        'currency': v.currency,
        'work_mode': v.work_mode,
        'city': v.city,
        'experience': v.experience,
        'description': v.description,
        'skills': list(v.skills),
    }
    return sha256_hex(json.dumps(builder, ensure_ascii=False, sort_keys=True))


class VacancyIntakeService:
    """Change-aware idempotent intake backed by the repository and session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._repo = VacancyRepository(session)

    def intake(self, normalized: NormalizedVacancy, idempotency_key: str) -> IntakeResult:
        """Apply a normalized intake and return a clear result.

        ``idempotency_key`` is the caller-supplied retry key. Replaying the
        same key is detected up-front: the stored result is returned without
        mutating the vacancy, so the row and its snapshot history never
        diverge. A content change produces a distinct content-derived key, so
        a genuine update always appends a fresh snapshot.
        """
        prior_by_key = self._repo.get_snapshot_by_key(idempotency_key) if idempotency_key else None
        if prior_by_key is not None:
            if prior_by_key.description_hash != normalized.content_hash:
                raise IdempotencyConflictError(
                    'Idempotency key was already used with a different normalized payload'
                )
            vacancy = self._repo.get_by_id(prior_by_key.vacancy_id)
            if vacancy is None:
                raise ValueError(
                    f'Snapshot idempotency key {idempotency_key!r} points to a missing vacancy'
                )
            return IntakeResult(
                result='unchanged',
                vacancy_id=vacancy.id,
                revision=vacancy.revision,
                first_seen_at=vacancy.first_seen_at,
                last_seen_at=vacancy.last_seen_at,
                snapshot_id=prior_by_key.id,
            )

        existing = self._repo.get_by_source(normalized.source, normalized.source_vacancy_id)

        if existing is not None:
            prior_snapshot = self._latest_snapshot(existing.id)
            if (
                prior_snapshot is not None
                and prior_snapshot.description_hash == normalized.content_hash
            ):
                existing.last_seen_at = utcnow()
                self._session.flush()
                return IntakeResult(
                    result='unchanged',
                    vacancy_id=existing.id,
                    revision=existing.revision,
                    first_seen_at=existing.first_seen_at,
                    last_seen_at=existing.last_seen_at,
                    snapshot_id=prior_snapshot.id,
                )

        if existing is None:
            return self._create(normalized, idempotency_key)
        return self._update(existing, normalized, idempotency_key)

    def _create(self, normalized: NormalizedVacancy, idempotency_key: str) -> IntakeResult:
        now = utcnow()
        vacancy = Vacancy(
            source=normalized.source,
            source_vacancy_id=normalized.source_vacancy_id,
            url=normalized.url,
            title=normalized.title,
            company_id=normalized.company_id,
            company_name=normalized.company_name,
            salary_min=normalized.salary_min,
            salary_max=normalized.salary_max,
            currency=normalized.currency,
            work_mode=normalized.work_mode,
            experience=normalized.experience,
            description=normalized.description,
            description_hash=normalized.content_hash,
            skills_json=json.dumps(normalized.skills, ensure_ascii=False),
            first_seen_at=now,
            last_seen_at=now,
            updated_at=now,
            revision=1,
        )
        self._session.add(vacancy)
        self._session.flush()
        snapshot = self._append_snapshot(vacancy, normalized, idempotency_key)
        return IntakeResult(
            result='created',
            vacancy_id=vacancy.id,
            revision=vacancy.revision,
            first_seen_at=vacancy.first_seen_at,
            last_seen_at=vacancy.last_seen_at,
            snapshot_id=snapshot.id,
        )

    def _update(
        self, existing: Vacancy, normalized: NormalizedVacancy, idempotency_key: str
    ) -> IntakeResult:
        now = utcnow()
        # Explicit field-for-field assignment (no ``or`` semantics): a
        # normalized ``None`` intentionally clears prior data, e.g. when a
        # previously-parsed company name disappears from the listing.
        existing.source = normalized.source
        existing.source_vacancy_id = normalized.source_vacancy_id
        existing.url = normalized.url
        existing.title = normalized.title
        existing.company_id = normalized.company_id
        existing.company_name = normalized.company_name
        existing.salary_min = normalized.salary_min
        existing.salary_max = normalized.salary_max
        existing.currency = normalized.currency
        existing.work_mode = normalized.work_mode
        existing.experience = normalized.experience
        existing.description = normalized.description
        existing.description_hash = normalized.content_hash
        existing.skills_json = json.dumps(normalized.skills, ensure_ascii=False)
        existing.last_seen_at = now
        existing.updated_at = now
        existing.revision += 1
        self._session.flush()
        snapshot = self._append_snapshot(existing, normalized, idempotency_key)
        return IntakeResult(
            result='updated',
            vacancy_id=existing.id,
            revision=existing.revision,
            first_seen_at=existing.first_seen_at,
            last_seen_at=existing.last_seen_at,
            snapshot_id=snapshot.id,
        )

    def _append_snapshot(
        self, vacancy: Vacancy, normalized: NormalizedVacancy, idempotency_key: str
    ) -> VacancySnapshot:
        """Append a snapshot, or return the prior row for a repeated key."""
        prior = self._repo.add_snapshot(
            vacancy_id=vacancy.id,
            description_hash=normalized.content_hash,
            payload_json=json.dumps(
                {
                    'schema': INTAKE_SCHEMA_NAME,
                    'version': INTAKE_SCHEMA_VERSION,
                    'captured_at': normalized.captured_at,
                    'capture_source': normalized.capture_source,
                    'payload': self._snapshot_payload(normalized),
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
            capture_source=normalized.capture_source,
            idempotency_key=idempotency_key,
        )
        return prior

    def _latest_snapshot(self, vacancy_id: str) -> VacancySnapshot | None:
        return self._session.execute(
            select(VacancySnapshot)
            .where(VacancySnapshot.vacancy_id == vacancy_id)
            .order_by(VacancySnapshot.captured_at.desc(), VacancySnapshot.id.desc())
            .limit(1)
        ).scalar_one_or_none()

    def _snapshot_payload(self, normalized: NormalizedVacancy) -> dict[str, Any]:
        """Store the same normalized projection, never raw source blobs."""
        return {
            'source': normalized.source,
            'source_vacancy_id': normalized.source_vacancy_id,
            'url': normalized.url,
            'title': normalized.title,
            'company_id': normalized.company_id,
            'company_name': normalized.company_name,
            'salary_min': normalized.salary_min,
            'salary_max': normalized.salary_max,
            'currency': normalized.currency,
            'work_mode': normalized.work_mode,
            'city': normalized.city,
            'experience': normalized.experience,
            'description': normalized.description,
            'skills': list(normalized.skills),
            'captured_at': normalized.captured_at,
            'capture_source': normalized.capture_source,
        }
