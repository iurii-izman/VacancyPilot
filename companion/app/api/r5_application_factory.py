"""R5-A human-controlled, resumable application preparation queue."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analysis.models import PromptCompilerInput
from app.analysis.service import AnalysisOptions, AnalysisService, EnginePackageUnavailableError
from app.api.analysis import _format_salary
from app.api.vacancies import _require_db
from app.db.base import new_uuid, utcnow
from app.db.models import (
    Application,
    ApplicationSession,
    ApplicationSessionItem,
    EngineRun,
    Vacancy,
)
from app.db.session import get_db_session_long
from app.security.auth import ClientTokenDep

router = APIRouter(tags=['application-factory'])
MAX_ITEMS = 20
MAX_ANALYSIS_CALLS = 20


class SessionCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    vacancy_ids: list[str] = Field(min_length=1, max_length=MAX_ITEMS)


class SessionExecuteRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    confirmation: bool = False
    max_items: int = Field(default=MAX_ANALYSIS_CALLS, ge=1, le=MAX_ANALYSIS_CALLS)


class SessionItemData(BaseModel):
    id: str
    vacancy_id: str
    title: str
    company_name: str | None
    queue_state: str
    position: int
    analysis_run_id: str | None
    application_id: str | None
    error_message: str | None


class SessionData(BaseModel):
    id: str
    status: str
    started_at: str
    completed_at: str | None
    items: list[SessionItemData]


class SessionResponse(BaseModel):
    data: SessionData
    meta: dict[str, Any]


class PreviewData(BaseModel):
    session_id: str | None
    selected: int
    already_stage_a: int
    cached_v4: int
    need_full_v4: int
    valid_letters: int
    likely_letter_work: int
    archived_or_ineligible: int
    expected_provider_calls: int
    cost_estimate_available: bool = False
    message: str = 'Cost estimate unavailable; provider call count shown.'


class PreviewResponse(BaseModel):
    data: PreviewData
    meta: dict[str, Any]


def _item_data(item: ApplicationSessionItem, vacancy: Vacancy) -> SessionItemData:
    return SessionItemData(
        id=item.id,
        vacancy_id=item.vacancy_id,
        title=vacancy.title,
        company_name=vacancy.company_name,
        queue_state=item.queue_state,
        position=item.position,
        analysis_run_id=item.analysis_run_id,
        application_id=item.application_id,
        error_message=item.error_message,
    )


def _session_data(session: ApplicationSession) -> SessionData:
    return SessionData(
        id=session.id,
        status=session.status,
        started_at=session.started_at,
        completed_at=session.completed_at,
        items=[_item_data(item, item.vacancy) for item in session.items],
    )


def _preview(session: Session, vacancy_ids: list[str], session_id: str | None) -> PreviewData:
    unique = list(dict.fromkeys(vacancy_ids))
    vacancies = session.execute(select(Vacancy).where(Vacancy.id.in_(unique))).scalars().all()
    runs = (
        session.execute(
            select(EngineRun)
            .where(EngineRun.vacancy_id.in_(unique))
            .order_by(EngineRun.created_at.desc())
        )
        .scalars()
        .all()
    )
    latest: dict[str, EngineRun] = {}
    for run in runs:
        latest.setdefault(run.vacancy_id, run)
    applications = (
        session.execute(select(Application).where(Application.vacancy_id.in_(unique)))
        .scalars()
        .all()
    )
    letters_by_app: set[str] = set()
    if applications:
        from app.db.models import CoverLetter

        letters_by_app = {
            row.application_id
            for row in session.execute(
                select(CoverLetter).where(
                    CoverLetter.application_id.in_([a.id for a in applications])
                )
            )
            .scalars()
            .all()
        }
    cached = sum(1 for run in latest.values() if run.status == 'success')
    eligible = sum(1 for vacancy in vacancies if not vacancy.archived)
    return PreviewData(
        session_id=session_id,
        selected=len(vacancy_ids),
        already_stage_a=0,
        cached_v4=cached,
        need_full_v4=max(0, eligible - cached),
        valid_letters=len(letters_by_app),
        likely_letter_work=max(0, eligible - len(letters_by_app)),
        archived_or_ineligible=len(vacancy_ids) - eligible,
        expected_provider_calls=max(0, eligible - cached),
    )


def _compiler_input(vacancy: Vacancy) -> PromptCompilerInput:
    skills: list[str] = []
    if vacancy.skills_json:
        try:
            value = json.loads(vacancy.skills_json)
            if isinstance(value, list):
                skills = [str(item) for item in value]
        except json.JSONDecodeError:
            pass
    return PromptCompilerInput(
        title=vacancy.title,
        company_name=vacancy.company_name,
        salary_raw=_format_salary(vacancy),
        city=None,
        work_mode=vacancy.work_mode,
        experience_raw=vacancy.experience,
        skills=skills,
        description_clean=vacancy.description or '',
    )


@router.post('/application-sessions/preview', response_model=PreviewResponse)
def preview_session(
    request: Request,
    body: SessionCreateRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> PreviewResponse:
    del client_identity
    session = _require_db(db)
    if len(set(body.vacancy_ids)) != len(body.vacancy_ids):
        raise HTTPException(status_code=422, detail='Duplicate vacancy IDs are not allowed')
    missing = set(body.vacancy_ids) - {
        row[0]
        for row in session.execute(select(Vacancy.id).where(Vacancy.id.in_(body.vacancy_ids)))
    }
    if missing:
        raise HTTPException(status_code=404, detail='One or more vacancies not found')
    return PreviewResponse(
        data=_preview(session, body.vacancy_ids, None),
        meta={'request_id': str(request.state.request_id)},
    )


@router.post('/application-sessions', response_model=SessionResponse, status_code=201)
def create_session(
    request: Request,
    body: SessionCreateRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> SessionResponse:
    del client_identity
    session = _require_db(db)
    if len(set(body.vacancy_ids)) != len(body.vacancy_ids):
        raise HTTPException(status_code=422, detail='Duplicate vacancy IDs are not allowed')
    vacancies = (
        session.execute(select(Vacancy).where(Vacancy.id.in_(body.vacancy_ids))).scalars().all()
    )
    by_id = {row.id: row for row in vacancies}
    if len(by_id) != len(body.vacancy_ids):
        raise HTTPException(status_code=404, detail='One or more vacancies not found')
    item_session = ApplicationSession(
        id=new_uuid(), status='active', started_at=utcnow(), completed_at=None
    )
    session.add(item_session)
    for position, vacancy_id in enumerate(body.vacancy_ids):
        session.add(
            ApplicationSessionItem(
                id=new_uuid(),
                session_id=item_session.id,
                vacancy_id=vacancy_id,
                queue_state='NEEDS_ANALYSIS' if not by_id[vacancy_id].archived else 'DEFERRED',
                position=position,
                selected_at=utcnow(),
                started_at=None,
                completed_at=None,
                analysis_run_id=None,
                application_id=None,
                skip_reason='archived' if by_id[vacancy_id].archived else None,
                error_message=None,
            )
        )
    session.flush()
    session.refresh(item_session)
    session.commit()
    return SessionResponse(
        data=_session_data(item_session), meta={'request_id': str(request.state.request_id)}
    )


@router.get('/application-sessions/{session_id}', response_model=SessionResponse)
def get_session(
    request: Request,
    session_id: str,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> SessionResponse:
    del client_identity
    item_session = _require_db(db).get(ApplicationSession, session_id)
    if item_session is None:
        raise HTTPException(status_code=404, detail='Application session not found')
    return SessionResponse(
        data=_session_data(item_session), meta={'request_id': str(request.state.request_id)}
    )


@router.post('/application-sessions/{session_id}/execute', response_model=SessionResponse)
def execute_session(
    request: Request,
    session_id: str,
    body: SessionExecuteRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> SessionResponse:
    del client_identity
    session = _require_db(db)
    item_session = session.get(ApplicationSession, session_id)
    if item_session is None:
        raise HTTPException(status_code=404, detail='Application session not found')
    if not body.confirmation:
        raise HTTPException(
            status_code=409, detail='Explicit confirmation is required before provider calls'
        )
    remaining = [item for item in item_session.items if item.queue_state == 'NEEDS_ANALYSIS'][
        : body.max_items
    ]
    service = AnalysisService(session)
    for item in remaining:
        vacancy = session.get(Vacancy, item.vacancy_id)
        if vacancy is None or vacancy.archived:
            item.queue_state = 'DEFERRED'
            item.skip_reason = 'archived'
            continue
        item.queue_state = 'ANALYZING'
        item.started_at = utcnow()
        session.commit()
        try:
            result = service.analyze(vacancy.id, _compiler_input(vacancy), AnalysisOptions())
            item.analysis_run_id = result.run_id
            decision = (
                result.structured_result.score.decision
                if result.structured_result and result.structured_result.score
                else result.status
            )
            item.queue_state = (
                'SKIPPED'
                if str(decision).lower() in {'skip', 'dont_spend_time', "don't_spend_time"}
                else 'READY_FOR_MANUAL_APPLY'
            )
            item.completed_at = utcnow()
            item.error_message = None
        except EnginePackageUnavailableError as error:
            item.queue_state = 'FAILED'
            item.error_message = str(error)
        except Exception as error:  # keep one failed item from corrupting the queue
            item.queue_state = 'FAILED'
            item.error_message = f'ANALYSIS_FAILED: {type(error).__name__}'
        session.commit()
    if not any(item.queue_state == 'NEEDS_ANALYSIS' for item in item_session.items):
        item_session.status = 'completed'
        item_session.completed_at = utcnow()
        session.commit()
    session.refresh(item_session)
    return SessionResponse(
        data=_session_data(item_session), meta={'request_id': str(request.state.request_id)}
    )
