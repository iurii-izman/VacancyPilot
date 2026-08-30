"""AOPS-13 application, event and follow-up workflow API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.vacancies import _require_db
from app.db.base import new_uuid, utcnow
from app.db.models import Application, ApplicationEvent, FollowUp, Vacancy
from app.db.session import get_db_session_long
from app.domain.workflow import (
    WorkflowError,
    append_event,
    followup_state,
    normalize_status,
    transition_application,
)
from app.security.auth import ClientTokenDep

router = APIRouter(tags=['applications', 'followups'])


def _request_id(request: Request) -> str:
    return str(request.state.request_id)


class ApplicationData(BaseModel):
    id: str
    vacancy_id: str
    vacancy_title: str | None
    company_name: str | None
    status: str
    decision: str | None
    score: float | None
    confidence: float | None
    applied_at: str | None
    next_action_at: str | None
    revision: int
    created_at: str
    updated_at: str


class ApplicationListMeta(BaseModel):
    request_id: str
    total: int
    limit: int
    offset: int


class ApplicationListResponse(BaseModel):
    data: list[ApplicationData]
    meta: ApplicationListMeta


class ApplicationResponse(BaseModel):
    data: ApplicationData
    meta: dict[str, str]


class CreateApplicationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    vacancy_id: str = Field(min_length=1, max_length=128)
    status: str = Field(default='saved', max_length=32)


class UpdateApplicationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_revision: int = Field(ge=1)
    status: str | None = Field(default=None, max_length=32)
    source: Literal['user', 'hh_sync', 'migration', 'system'] = 'user'
    confirmation: bool = False
    application_without_letter: bool = False
    reason: str | None = Field(default=None, max_length=100)
    next_action_at: str | None = Field(default=None, max_length=64)


class EventRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    event_type: str = Field(min_length=1, max_length=80)
    source: Literal['user', 'hh_sync', 'migration', 'system']
    payload: dict[str, Any] | None = None
    occurred_at: str | None = Field(default=None, max_length=64)
    idempotency_key: str | None = Field(default=None, max_length=128)
    status: str | None = Field(default=None, max_length=32)
    expected_revision: int | None = Field(default=None, ge=1)
    confirmation: bool = False
    application_without_letter: bool = False
    reason: str | None = Field(default=None, max_length=100)


class EventData(BaseModel):
    id: str
    application_id: str
    event_type: str
    source: str
    payload: dict[str, Any] | None
    occurred_at: str
    created_at: str


class EventResponse(BaseModel):
    data: EventData
    meta: dict[str, str]


class EventListResponse(BaseModel):
    data: list[EventData]
    meta: dict[str, str]


class FollowUpData(BaseModel):
    id: str
    application_id: str
    reason: str | None
    due_at: str | None
    status: str
    derived_state: str
    draft_text: str | None
    sent_at: str | None
    revision: int
    created_at: str
    updated_at: str


class FollowUpListMeta(BaseModel):
    request_id: str
    total: int
    limit: int
    offset: int


class FollowUpListResponse(BaseModel):
    data: list[FollowUpData]
    meta: FollowUpListMeta


class FollowUpResponse(BaseModel):
    data: FollowUpData
    meta: dict[str, str]


class CreateFollowUpRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    application_id: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=100)
    due_at: str | None = Field(default=None, max_length=64)
    draft_text: str | None = Field(default=None, max_length=10000)


class UpdateFollowUpRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_revision: int = Field(ge=1)
    status: (
        Literal['pending', 'sent', 'skipped', 'scheduled', 'completed', 'snoozed', 'cancelled']
        | None
    ) = None
    due_at: str | None = Field(default=None, max_length=64)
    draft_text: str | None = Field(default=None, max_length=10000)
    sent_confirmation: bool = False


class GenerateFollowUpRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_revision: int = Field(ge=1)


def _application_data(app: Application, vacancy: Vacancy | None) -> ApplicationData:
    return ApplicationData(
        id=app.id,
        vacancy_id=app.vacancy_id,
        vacancy_title=vacancy.title if vacancy else None,
        company_name=vacancy.company_name if vacancy else None,
        status=normalize_status(app.status),
        decision=app.decision,
        score=app.score,
        confidence=app.confidence,
        applied_at=app.applied_at,
        next_action_at=app.next_action_at,
        revision=app.revision,
        created_at=app.created_at,
        updated_at=app.updated_at,
    )


def _followup_data(item: FollowUp) -> FollowUpData:
    return FollowUpData(
        id=item.id,
        application_id=item.application_id,
        reason=item.reason,
        due_at=item.due_at,
        status=item.status,
        derived_state=followup_state(item.due_at, item.status),
        draft_text=item.draft_text,
        sent_at=item.sent_at,
        revision=item.revision,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _event_data(item: ApplicationEvent) -> EventData:
    payload: dict[str, Any] | None = None
    if item.payload_json:
        import json

        try:
            parsed = json.loads(item.payload_json)
            payload = parsed if isinstance(parsed, dict) else None
        except ValueError:
            payload = None
    return EventData(
        id=item.id,
        application_id=item.application_id,
        event_type=item.event_type,
        source=item.source,
        payload=payload,
        occurred_at=item.occurred_at,
        created_at=item.created_at,
    )


@router.get('/applications', response_model=ApplicationListResponse)
def list_applications(
    request: Request,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, max_length=32),
) -> ApplicationListResponse:
    del client_identity
    session = _require_db(db)
    filters = []
    if status is not None:
        try:
            filters.append(Application.status == normalize_status(status))
        except WorkflowError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
    total = session.execute(
        select(func.count()).select_from(Application).where(*filters)
    ).scalar_one()
    rows = (
        session.execute(
            select(Application)
            .where(*filters)
            .order_by(Application.updated_at.desc(), Application.id.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    vacancies = (
        {
            v.id: v
            for v in session.execute(
                select(Vacancy).where(Vacancy.id.in_([a.vacancy_id for a in rows]))
            )
            .scalars()
            .all()
        }
        if rows
        else {}
    )
    return ApplicationListResponse(
        data=[_application_data(a, vacancies.get(a.vacancy_id)) for a in rows],
        meta=ApplicationListMeta(
            request_id=_request_id(request), total=int(total or 0), limit=limit, offset=offset
        ),
    )


@router.post('/applications', response_model=ApplicationResponse)
def create_application(
    request: Request,
    body: CreateApplicationRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> ApplicationResponse:
    del client_identity
    session = _require_db(db)
    if session.get(Vacancy, body.vacancy_id) is None:
        raise HTTPException(status_code=404, detail='Vacancy not found')
    try:
        status = normalize_status(body.status)
    except WorkflowError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if status == 'applied':
        raise HTTPException(
            status_code=409,
            detail='Create the application first, then confirm APPLIED through the transition API',
        )
    existing = session.execute(
        select(Application).where(Application.vacancy_id == body.vacancy_id)
    ).scalar_one_or_none()
    if existing is not None:
        return ApplicationResponse(
            data=_application_data(existing, existing.vacancy),
            meta={'request_id': _request_id(request)},
        )
    app = Application(id=new_uuid(), vacancy_id=body.vacancy_id, status=status)
    session.add(app)
    session.flush()
    append_event(
        session, app.id, event_type='application_created', source='user', payload={'status': status}
    )
    session.commit()
    return ApplicationResponse(
        data=_application_data(app, app.vacancy), meta={'request_id': _request_id(request)}
    )


@router.patch('/applications/{application_id}', response_model=ApplicationResponse)
def update_application(
    request: Request,
    application_id: str,
    body: UpdateApplicationRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> ApplicationResponse:
    del client_identity
    session = _require_db(db)
    app = session.get(Application, application_id)
    if app is None:
        raise HTTPException(status_code=404, detail='Application not found')
    try:
        if body.status is not None:
            app = transition_application(
                session,
                application_id,
                target_status=body.status,
                source=body.source,
                expected_revision=body.expected_revision,
                confirmation=body.confirmation,
                application_without_letter=body.application_without_letter,
                reason=body.reason,
                idempotency_key=request.headers.get('X-VacancyPilot-Idempotency-Key'),
            )
        else:
            if app.revision != body.expected_revision:
                raise WorkflowError('Application revision is stale')
            now = utcnow()
            session.execute(
                update(Application)
                .where(
                    Application.id == application_id, Application.revision == body.expected_revision
                )
                .values(
                    next_action_at=body.next_action_at,
                    revision=Application.revision + 1,
                    updated_at=now,
                )
            )
            append_event(
                session,
                application_id,
                event_type='next_action_updated',
                source=body.source,
                payload={'next_action_at': body.next_action_at},
                occurred_at=now,
            )
            session.flush()
        session.commit()
    except WorkflowError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail=str(error)) from error
    session.refresh(app)
    return ApplicationResponse(
        data=_application_data(app, app.vacancy), meta={'request_id': _request_id(request)}
    )


@router.post('/applications/{application_id}/events', response_model=EventResponse)
def create_application_event(
    request: Request,
    application_id: str,
    body: EventRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> EventResponse:
    del client_identity
    session = _require_db(db)
    if session.get(Application, application_id) is None:
        raise HTTPException(status_code=404, detail='Application not found')
    try:
        if body.status is not None:
            if body.expected_revision is None:
                raise WorkflowError('expected_revision is required for a status event')
            app = transition_application(
                session,
                application_id,
                target_status=body.status,
                source=body.source,
                expected_revision=body.expected_revision,
                confirmation=body.confirmation,
                application_without_letter=body.application_without_letter,
                reason=body.reason,
                idempotency_key=body.idempotency_key,
            )
            event = (
                session.execute(
                    select(ApplicationEvent).where(
                        ApplicationEvent.application_id == app.id,
                        ApplicationEvent.idempotency_key == body.idempotency_key,
                    )
                ).scalar_one_or_none()
                if body.idempotency_key
                else session.execute(
                    select(ApplicationEvent)
                    .where(ApplicationEvent.application_id == app.id)
                    .order_by(ApplicationEvent.created_at.desc(), ApplicationEvent.id.desc())
                )
                .scalars()
                .first()
            )
            assert event is not None
        else:
            event = append_event(
                session,
                application_id,
                event_type=body.event_type,
                source=body.source,
                payload=body.payload,
                occurred_at=body.occurred_at,
                idempotency_key=body.idempotency_key,
            )
        session.commit()
    except WorkflowError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail=str(error)) from error
    return EventResponse(data=_event_data(event), meta={'request_id': _request_id(request)})


@router.get('/applications/{application_id}/events', response_model=EventListResponse)
def list_application_events(
    request: Request,
    application_id: str,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> EventListResponse:
    del client_identity
    session = _require_db(db)
    if session.get(Application, application_id) is None:
        raise HTTPException(status_code=404, detail='Application not found')
    events = (
        session.execute(
            select(ApplicationEvent)
            .where(ApplicationEvent.application_id == application_id)
            .order_by(ApplicationEvent.occurred_at.asc(), ApplicationEvent.id.asc())
        )
        .scalars()
        .all()
    )
    return EventListResponse(
        data=[_event_data(event) for event in events],
        meta={'request_id': _request_id(request)},
    )


@router.get('/followups', response_model=FollowUpListResponse)
def list_followups(
    request: Request,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    application_id: str | None = Query(default=None, max_length=128),
    state: Literal['due', 'overdue', 'upcoming', 'open', 'completed'] | None = None,
) -> FollowUpListResponse:
    del client_identity
    session = _require_db(db)
    filters = [FollowUp.application_id == application_id] if application_id else []
    rows = (
        session.execute(
            select(FollowUp).where(*filters).order_by(FollowUp.due_at.asc(), FollowUp.id.asc())
        )
        .scalars()
        .all()
    )
    if state == 'completed':
        rows = [
            item for item in rows if item.status in {'completed', 'sent', 'skipped', 'cancelled'}
        ]
    elif state == 'open':
        rows = [item for item in rows if item.status in {'pending', 'scheduled', 'snoozed'}]
    elif state in {'due', 'upcoming', 'overdue'}:
        # `due` is the public name for a future-due open item; `upcoming` is
        # retained as a readable alias for clients that use that vocabulary.
        wanted = 'overdue' if state == 'overdue' else 'due'
        rows = [item for item in rows if followup_state(item.due_at, item.status) == wanted]
    total = len(rows)
    rows = rows[offset : offset + limit]
    return FollowUpListResponse(
        data=[_followup_data(item) for item in rows],
        meta=FollowUpListMeta(
            request_id=_request_id(request), total=int(total or 0), limit=limit, offset=offset
        ),
    )


@router.post('/followups', response_model=FollowUpResponse)
def create_followup(
    request: Request,
    body: CreateFollowUpRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> FollowUpResponse:
    del client_identity
    session = _require_db(db)
    if session.get(Application, body.application_id) is None:
        raise HTTPException(status_code=404, detail='Application not found')
    if body.due_at:
        try:
            datetime.fromisoformat(body.due_at.replace('Z', '+00:00'))
        except ValueError as error:
            raise HTTPException(status_code=422, detail='due_at must be ISO-8601') from error
    idempotency_key = request.headers.get('X-VacancyPilot-Idempotency-Key')
    if idempotency_key:
        existing = session.execute(
            select(FollowUp).where(FollowUp.idempotency_key == idempotency_key)
        ).scalar_one_or_none()
        if existing is not None:
            if existing.application_id != body.application_id:
                raise HTTPException(
                    status_code=409,
                    detail='Follow-up idempotency key belongs to another application',
                )
            return FollowUpResponse(
                data=_followup_data(existing), meta={'request_id': _request_id(request)}
            )
    item = FollowUp(
        id=new_uuid(),
        application_id=body.application_id,
        reason=body.reason,
        due_at=body.due_at,
        status='pending',
        draft_text=body.draft_text,
        idempotency_key=idempotency_key,
    )
    session.add(item)
    session.flush()
    append_event(
        session,
        body.application_id,
        event_type='followup_created',
        source='user',
        payload={'followup_id': item.id, 'reason': body.reason},
    )
    session.commit()
    return FollowUpResponse(data=_followup_data(item), meta={'request_id': _request_id(request)})


@router.patch('/followups/{followup_id}', response_model=FollowUpResponse)
def update_followup(
    request: Request,
    followup_id: str,
    body: UpdateFollowUpRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> FollowUpResponse:
    del client_identity
    session = _require_db(db)
    item = session.get(FollowUp, followup_id)
    if item is None:
        raise HTTPException(status_code=404, detail='Follow-up not found')
    if item.revision != body.expected_revision:
        raise HTTPException(status_code=409, detail='Follow-up revision is stale')
    if body.status == 'sent' and not body.sent_confirmation:
        raise HTTPException(status_code=409, detail='Explicit sent_confirmation is required')
    now = utcnow()
    status = 'sent' if body.sent_confirmation else (body.status or item.status)
    sent_at = now if body.sent_confirmation else item.sent_at
    result = session.execute(
        update(FollowUp)
        .where(FollowUp.id == followup_id, FollowUp.revision == body.expected_revision)
        .values(
            status=status,
            due_at=body.due_at if body.due_at is not None else item.due_at,
            draft_text=body.draft_text if body.draft_text is not None else item.draft_text,
            sent_at=sent_at,
            revision=FollowUp.revision + 1,
            updated_at=now,
        )
    )
    if result.rowcount != 1:  # type: ignore[attr-defined]
        raise HTTPException(status_code=409, detail='Follow-up revision is stale')  # type: ignore[attr-defined]
    append_event(
        session,
        item.application_id,
        event_type='followup_updated',
        source='user',
        payload={'followup_id': item.id, 'status': status},
        occurred_at=now,
    )
    session.commit()
    session.refresh(item)
    return FollowUpResponse(data=_followup_data(item), meta={'request_id': _request_id(request)})


@router.post('/followups/{followup_id}/generate', response_model=FollowUpResponse)
def generate_followup(
    request: Request,
    followup_id: str,
    body: GenerateFollowUpRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> FollowUpResponse:
    del client_identity
    session = _require_db(db)
    item = session.get(FollowUp, followup_id)
    if item is None:
        raise HTTPException(status_code=404, detail='Follow-up not found')
    if item.revision != body.expected_revision:
        raise HTTPException(status_code=409, detail='Follow-up revision is stale')
    application = session.get(Application, item.application_id)
    assert application is not None
    vacancy = session.get(Vacancy, application.vacancy_id)
    title = vacancy.title if vacancy else 'this vacancy'
    draft = (
        'Hello,\n\nI am following up regarding my application for '
        f'{title}. Could you please share whether there is an update on the process?'
        '\n\nBest regards'
    )
    now = utcnow()
    session.execute(
        update(FollowUp)
        .where(FollowUp.id == item.id, FollowUp.revision == body.expected_revision)
        .values(draft_text=draft, revision=FollowUp.revision + 1, updated_at=now)
    )
    append_event(
        session,
        item.application_id,
        event_type='followup_draft_generated',
        source='system',
        payload={'followup_id': item.id, 'mode': 'offline_template'},
        occurred_at=now,
    )
    session.commit()
    session.refresh(item)
    return FollowUpResponse(data=_followup_data(item), meta={'request_id': _request_id(request)})
