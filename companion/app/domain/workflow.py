"""Canonical application transitions and local follow-up operations."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.base import new_uuid, utcnow
from app.db.models import Application, ApplicationEvent, CoverLetter, LetterVersion
from app.security.redaction import sanitize_dict

APPLICATION_STATUSES = {
    'new',
    'saved',
    'analyzed',
    'ready_to_send',
    'applied',
    'hr_replied',
    'interview',
    'test_task',
    'offer',
    'rejected_by_company',
    'rejected_by_me',
    'archived',
}
STATUS_ALIASES = {'viewed': 'new', 'letter_ready': 'ready_to_send', 'blacklist': 'archived'}
EVENT_SOURCES = {'user', 'hh_sync', 'migration', 'system'}

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    'new': {'saved', 'analyzed', 'rejected_by_me', 'archived'},
    'saved': {'analyzed', 'ready_to_send', 'rejected_by_me', 'archived'},
    'analyzed': {'ready_to_send', 'applied', 'rejected_by_me', 'archived'},
    'ready_to_send': {'applied', 'rejected_by_me', 'archived'},
    'applied': {
        'hr_replied',
        'interview',
        'test_task',
        'offer',
        'rejected_by_company',
        'rejected_by_me',
        'archived',
    },
    'hr_replied': {
        'interview',
        'test_task',
        'offer',
        'rejected_by_company',
        'rejected_by_me',
        'archived',
    },
    'interview': {'test_task', 'offer', 'rejected_by_company', 'rejected_by_me', 'archived'},
    'test_task': {'offer', 'rejected_by_company', 'rejected_by_me', 'archived'},
    'offer': {'archived', 'rejected_by_me'},
    'rejected_by_company': {'new', 'archived'},
    'rejected_by_me': {'new', 'archived'},
    'archived': {'new', 'saved'},
}


class WorkflowError(ValueError):
    """Safe, user-actionable workflow validation error."""


def normalize_status(value: str) -> str:
    normalized = value.strip().lower()
    normalized = STATUS_ALIASES.get(normalized, normalized)
    if normalized not in APPLICATION_STATUSES:
        raise WorkflowError(f'Unsupported application status: {value}')
    return normalized


def _get_application(session: Session, application_id: str) -> Application:
    application = session.get(Application, application_id)
    if application is None:
        raise WorkflowError('Application not found')
    return application


def _has_sent_letter(session: Session, application_id: str) -> bool:
    return (
        session.execute(
            select(LetterVersion.id)
            .join(CoverLetter, LetterVersion.cover_letter_id == CoverLetter.id)
            .where(
                CoverLetter.application_id == application_id, LetterVersion.version_type == 'sent'
            )
            .limit(1)
        ).first()
        is not None
    )


def safe_payload(payload: dict[str, Any] | None) -> str | None:
    if payload is None:
        return None
    encoded = json.dumps(sanitize_dict(payload), ensure_ascii=False, separators=(',', ':'))
    if len(encoded) > 4000:
        raise WorkflowError('Event payload is too large')
    return encoded


def append_event(
    session: Session,
    application_id: str,
    *,
    event_type: str,
    source: str,
    payload: dict[str, Any] | None = None,
    occurred_at: str | None = None,
    idempotency_key: str | None = None,
) -> ApplicationEvent:
    if source not in EVENT_SOURCES:
        raise WorkflowError('Unsupported event source')
    if not event_type or len(event_type) > 80:
        raise WorkflowError('Invalid event type')
    if idempotency_key:
        prior = session.execute(
            select(ApplicationEvent).where(ApplicationEvent.idempotency_key == idempotency_key)
        ).scalar_one_or_none()
        if prior is not None:
            if prior.application_id != application_id:
                raise WorkflowError('Event idempotency key belongs to another application')
            return prior
    event = ApplicationEvent(
        id=new_uuid(),
        application_id=application_id,
        event_type=event_type,
        source=source,
        payload_json=safe_payload(payload),
        occurred_at=occurred_at or utcnow(),
        idempotency_key=idempotency_key,
    )
    session.add(event)
    session.flush()
    return event


def transition_application(
    session: Session,
    application_id: str,
    *,
    target_status: str,
    source: str,
    expected_revision: int,
    confirmation: bool = False,
    application_without_letter: bool = False,
    reason: str | None = None,
    idempotency_key: str | None = None,
) -> Application:
    app = _get_application(session, application_id)
    if idempotency_key:
        prior = session.execute(
            select(ApplicationEvent).where(ApplicationEvent.idempotency_key == idempotency_key)
        ).scalar_one_or_none()
        if prior is not None:
            if prior.application_id != application_id:
                raise WorkflowError('Event idempotency key belongs to another application')
            return app
    target = normalize_status(target_status)
    current = normalize_status(app.status)
    if target == 'applied':
        if source != 'user' or not confirmation:
            raise WorkflowError('APPLIED requires explicit user confirmation')
        if not _has_sent_letter(session, application_id) and not application_without_letter:
            raise WorkflowError(
                'A sent letter or explicit no-letter application reason is required'
            )
        if application_without_letter and reason != 'application_without_letter':
            raise WorkflowError('No-letter application reason must be application_without_letter')
    if target not in ALLOWED_TRANSITIONS.get(current, set()):
        raise WorkflowError(f'Transition {current} → {target} is not allowed')
    now = utcnow()
    result = session.execute(
        update(Application)
        .where(Application.id == application_id, Application.revision == expected_revision)
        .values(
            status=target,
            applied_at=now if target == 'applied' else app.applied_at,
            revision=Application.revision + 1,
            updated_at=now,
        )
    )
    if result.rowcount != 1:  # type: ignore[attr-defined]
        raise WorkflowError('Application revision is stale')
    payload: dict[str, Any] = {'from_status': current, 'to_status': target}
    if reason:
        payload['reason'] = reason
    append_event(
        session,
        application_id,
        event_type='application_confirmed' if target == 'applied' else 'status_changed',
        source=source,
        payload=payload,
        occurred_at=now,
        idempotency_key=idempotency_key,
    )
    session.flush()
    return _get_application(session, application_id)


def parse_iso(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise WorkflowError('Timestamp must be ISO-8601') from error
    return result.astimezone(UTC)


def followup_state(due_at: str | None, status: str, *, now: datetime | None = None) -> str:
    if status not in {'pending', 'scheduled', 'snoozed'} or due_at is None:
        return status
    due = parse_iso(due_at)
    assert due is not None
    return 'overdue' if due <= (now or datetime.now(UTC)) else 'due'
