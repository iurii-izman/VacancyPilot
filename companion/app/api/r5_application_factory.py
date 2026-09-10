"""R5-A human-controlled, resumable application preparation queue."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.analysis.compiler import _policy_fingerprint
from app.analysis.models import PromptCompilerInput, ProviderInputPolicy
from app.analysis.service import (
    AnalysisOptions,
    AnalysisService,
    EnginePackageUnavailableError,
    ProviderExecutionGateError,
)
from app.api.analysis import _format_salary
from app.api.vacancies import _require_db
from app.db.base import new_uuid, utcnow
from app.db.models import (
    Application,
    ApplicationSession,
    ApplicationSessionItem,
    Vacancy,
)
from app.db.session import get_db_session_long
from app.domain.vacancy_hydration import vacancy_is_analysis_ready
from app.security.auth import ClientTokenDep
from app.security.receipts import (
    ReceiptKeyUnavailableError,
    ReceiptSigner,
    ReceiptVerificationError,
)

router = APIRouter(tags=['application-factory'])
MAX_ITEMS = 20
MAX_ANALYSIS_CALLS = 20


class SessionCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    vacancy_ids: list[str] = Field(min_length=1, max_length=MAX_ITEMS)
    confirmation: bool = False
    policy: ProviderInputPolicy | None = None
    preview_receipts: dict[str, str] = Field(default_factory=dict, max_length=MAX_ITEMS)


class SessionExecuteRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    confirmation: bool = False
    max_items: int = Field(default=MAX_ANALYSIS_CALLS, ge=1, le=MAX_ANALYSIS_CALLS)
    policy: ProviderInputPolicy | None = None
    preview_receipts: dict[str, str] = Field(default_factory=dict, max_length=MAX_ITEMS)
    retry_ids: dict[str, str] = Field(default_factory=dict, max_length=MAX_ITEMS)


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
    budget_limit: int | None = None
    budget_used: int = 0
    budget_remaining: int | None = None
    items: list[PreviewItemData] = Field(default_factory=list, max_length=MAX_ITEMS)


class PreviewItemData(BaseModel):
    vacancy_id: str
    provider: str
    model: str
    provider_plan_hash: str
    cache_hit: bool
    expected_initial_attempts: int
    expected_max_attempts: int
    receipt: str | None
    receipt_expires_at: int | None
    privacy_mode: str
    what_is_sent: list[str]
    what_is_not_sent: list[str]
    dynamic_payload: dict[str, Any]
    cache_reuse_predicate: str
    budget_limit: int | None
    budget_used: int
    budget_remaining: int | None


PreviewData.model_rebuild()


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


def _preview(
    session: Session,
    vacancy_ids: list[str],
    session_id: str | None,
    *,
    policy: ProviderInputPolicy,
    receipt_signer: ReceiptSigner | None,
) -> PreviewData:
    unique = list(dict.fromkeys(vacancy_ids))
    vacancies = session.execute(select(Vacancy).where(Vacancy.id.in_(unique))).scalars().all()
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
    eligible = sum(1 for vacancy in vacancies if not vacancy.archived)
    # Preview compiles the same canonical plan used by direct Full V4.  It
    # remains provider-free and does not mutate applications, queue rows, or
    # budget state.  Missing engine packages are represented as uncached plans
    # and are rejected only at execute time by the normal Full V4 gate.
    service = AnalysisService(session, receipt_signer=receipt_signer)
    preview_items: list[PreviewItemData] = []
    for vacancy in vacancies:
        if vacancy.archived:
            continue
        preview = service.get_preview(
            _compiler_input(vacancy),
            AnalysisOptions(
                provider=policy.provider,
                model=policy.model,
                privacy_mode=policy.privacy_mode,
                policy=policy,
                operation_kind='vacancy_analysis',
            ),
            vacancy_id=vacancy.id,
            require_package=False,
        )
        preview_items.append(
            PreviewItemData(
                vacancy_id=vacancy.id,
                provider=preview.provider,
                model=preview.model,
                provider_plan_hash=preview.provider_plan_hash,
                cache_hit=preview.cache_hit,
                expected_initial_attempts=preview.expected_initial_attempts,
                expected_max_attempts=preview.expected_max_attempts,
                receipt=preview.receipt,
                receipt_expires_at=preview.receipt_expires_at,
                privacy_mode=preview.privacy_mode,
                what_is_sent=preview.what_is_sent,
                what_is_not_sent=preview.what_is_not_sent,
                dynamic_payload=preview.dynamic_payload,
                cache_reuse_predicate=preview.cache_reuse_predicate,
                budget_limit=preview.budget_limit,
                budget_used=preview.budget_used,
                budget_remaining=preview.budget_remaining,
            )
        )
    cached = sum(1 for item in preview_items if item.cache_hit)
    expected_calls = sum(item.expected_initial_attempts for item in preview_items)
    budget_used = preview_items[0].budget_used if preview_items else 0
    budget_limit = policy.daily_request_limit
    return PreviewData(
        session_id=session_id,
        selected=len(vacancy_ids),
        already_stage_a=0,
        cached_v4=cached,
        need_full_v4=max(0, eligible - cached),
        valid_letters=len(letters_by_app),
        likely_letter_work=max(0, eligible - len(letters_by_app)),
        archived_or_ineligible=len(vacancy_ids) - eligible,
        expected_provider_calls=expected_calls,
        budget_limit=budget_limit,
        budget_used=budget_used,
        budget_remaining=max(0, budget_limit - budget_used),
        items=preview_items,
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


def _batch_session_id(
    vacancy_ids: list[str],
    preview: PreviewData,
    policy: ProviderInputPolicy,
) -> str:
    """Return a deterministic identity for one reviewed R5 batch.

    Receipt nonces and timestamps are deliberately excluded.  The canonical
    plan hashes and selected subject IDs are the semantic identity, so a
    retried confirmation reuses the same ApplicationSession while a changed
    vacancy/provider/privacy plan gets a different session.
    """
    plan_by_vacancy = {item.vacancy_id: item.provider_plan_hash for item in preview.items}
    material = {
        'version': 'fix3-r5-session-v1',
        'vacancy_ids': sorted(set(vacancy_ids)),
        'plans': sorted(plan_by_vacancy.items()),
        'policy_fingerprint': _policy_fingerprint(policy),
    }
    digest = hashlib.sha256(
        json.dumps(material, sort_keys=True, separators=(',', ':')).encode('utf-8')
    ).hexdigest()
    return f'r5_{digest}'


def _verify_batch_receipts(
    preview: PreviewData,
    policy: ProviderInputPolicy,
    receipt_signer: ReceiptSigner | None,
    supplied_receipts: dict[str, str],
) -> None:
    """Verify every active item's receipt before creating the batch session."""
    if receipt_signer is None:
        raise HTTPException(
            status_code=503,
            detail='RECEIPT_SIGNING_KEY_UNAVAILABLE',
        )
    for item in preview.items:
        receipt = supplied_receipts.get(item.vacancy_id)
        if not receipt:
            raise HTTPException(
                status_code=422,
                detail='PREVIEW_RECEIPT_REQUIRED',
            )
        try:
            receipt_signer.verify(
                receipt,
                kind='v4_analysis',
                provider_plan_hash=item.provider_plan_hash,
                subject_ids={'vacancy_id': item.vacancy_id},
                provider=item.provider,
                model=item.model,
                privacy_policy_fingerprint=_policy_fingerprint(policy),
            )
        except ReceiptKeyUnavailableError as exc:
            raise HTTPException(
                status_code=503,
                detail='RECEIPT_SIGNING_KEY_UNAVAILABLE',
            ) from exc
        except ReceiptVerificationError as exc:
            # Keep the public response bounded and never expose signed claims.
            code = getattr(exc, 'args', ['PREVIEW_RECEIPT_INVALID'])[0]
            raise HTTPException(status_code=409, detail=str(code)) from exc


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
    policy = body.policy or ProviderInputPolicy(
        ai_enabled=False,
        provider='openai',
        privacy_mode='strict',
        daily_request_limit=0,
        cache_enabled=False,
    )
    return PreviewResponse(
        data=_preview(
            session,
            body.vacancy_ids,
            None,
            policy=policy,
            receipt_signer=getattr(request.app.state, 'receipt_signer', None),
        ),
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
    if not body.confirmation:
        raise HTTPException(
            status_code=409,
            detail='Explicit confirmation is required before creating an application session',
        )
    if body.policy is None:
        raise HTTPException(status_code=403, detail='PROVIDER_POLICY_REQUIRED')
    if not body.policy.execution_ready:
        raise HTTPException(status_code=403, detail='AI_PERMISSION_REQUIRED')
    vacancies = (
        session.execute(select(Vacancy).where(Vacancy.id.in_(body.vacancy_ids))).scalars().all()
    )
    by_id = {row.id: row for row in vacancies}
    if len(by_id) != len(body.vacancy_ids):
        raise HTTPException(status_code=404, detail='One or more vacancies not found')

    # Confirmation is bound to the same current plan/receipts that Execute
    # will verify.  This keeps a retried confirmation from creating a second
    # session and makes plan changes produce a new semantic session identity.
    preview = _preview(
        session,
        body.vacancy_ids,
        None,
        policy=body.policy,
        receipt_signer=getattr(request.app.state, 'receipt_signer', None),
    )
    _verify_batch_receipts(
        preview,
        body.policy,
        getattr(request.app.state, 'receipt_signer', None),
        body.preview_receipts,
    )
    session_id = _batch_session_id(body.vacancy_ids, preview, body.policy)
    existing = session.get(ApplicationSession, session_id)
    if existing is not None:
        return SessionResponse(
            data=_session_data(existing),
            meta={'request_id': str(request.state.request_id)},
        )

    item_session = ApplicationSession(
        id=session_id, status='active', started_at=utcnow(), completed_at=None
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
    try:
        session.flush()
        session.refresh(item_session)
        session.commit()
    except IntegrityError:
        # The deterministic primary key is the SQLite-safe single-flight
        # primitive for session creation.  A concurrent winner owns the row;
        # return it instead of creating a duplicate session.
        session.rollback()
        existing = session.get(ApplicationSession, session_id)
        if existing is None:
            raise
        return SessionResponse(
            data=_session_data(existing),
            meta={'request_id': str(request.state.request_id)},
        )
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
    if body.policy is None:
        raise HTTPException(status_code=403, detail='PROVIDER_POLICY_REQUIRED')
    if not body.policy.execution_ready:
        raise HTTPException(status_code=403, detail='AI_PERMISSION_REQUIRED')
    # Bind execution to the deterministic session identity created from the
    # reviewed batch plans.  A new plan/policy must create a new session rather
    # than silently changing the meaning of an existing queue.
    session_vacancy_ids = [item.vacancy_id for item in item_session.items]
    current_preview = _preview(
        session,
        session_vacancy_ids,
        session_id,
        policy=body.policy,
        receipt_signer=getattr(request.app.state, 'receipt_signer', None),
    )
    if _batch_session_id(session_vacancy_ids, current_preview, body.policy) != session_id:
        raise HTTPException(
            status_code=409,
            detail='PREVIEW_RECEIPT_STALE',
        )
    candidate_ids = [
        item.id for item in item_session.items if item.queue_state == 'NEEDS_ANALYSIS'
    ][: body.max_items]
    service = AnalysisService(
        session,
        receipt_signer=getattr(request.app.state, 'receipt_signer', None),
    )
    for item_id in candidate_ids:
        # Atomic queue claim.  A second confirmation request sees zero updated
        # rows and cannot execute the same item concurrently.
        claim_result = session.execute(
            update(ApplicationSessionItem)
            .where(
                ApplicationSessionItem.id == item_id,
                ApplicationSessionItem.queue_state == 'NEEDS_ANALYSIS',
            )
            .values(
                queue_state='ANALYZING',
                started_at=utcnow(),
                revision=ApplicationSessionItem.revision + 1,
            )
        )
        claimed = int(getattr(claim_result, 'rowcount', 0) or 0)
        session.commit()
        if claimed != 1:
            continue
        item = session.get(ApplicationSessionItem, item_id)
        if item is None:
            continue
        vacancy = session.get(Vacancy, item.vacancy_id)
        if vacancy is None or vacancy.archived:
            item.queue_state = 'DEFERRED'
            item.skip_reason = 'archived'
            item.completed_at = utcnow()
            session.commit()
            continue
        item.queue_state = 'ANALYZING'
        item.started_at = utcnow()
        session.commit()
        try:
            if vacancy.source == 'hh' and not vacancy_is_analysis_ready(vacancy):
                raise ValueError('VACANCY_DESCRIPTION_INSUFFICIENT')
            result = service.analyze(
                vacancy.id,
                _compiler_input(vacancy),
                AnalysisOptions(
                    provider=body.policy.provider,
                    model=body.policy.model,
                    privacy_mode=body.policy.privacy_mode,
                    policy=body.policy,
                    confirmation=True,
                    preview_receipt=body.preview_receipts.get(vacancy.id),
                    retry_id=body.retry_ids.get(vacancy.id),
                    daily_request_limit=body.policy.daily_request_limit,
                ),
            )
            item.analysis_run_id = result.run_id
            if any('OUTCOME_UNKNOWN' in error for error in result.validation_errors):
                # A timeout/network ambiguity is not a successful analysis and
                # must never be presented as ready or automatically retried.
                item.queue_state = 'FAILED'
                item.error_message = 'PROVIDER_OUTCOME_UNKNOWN'
            elif any('AI_BUDGET_EXCEEDED' in error for error in result.validation_errors):
                # A bounded repair may be skipped when the atomic budget is
                # exhausted; keep the reviewed item resumable.
                item.queue_state = 'NEEDS_ANALYSIS'
                item.error_message = 'AI_BUDGET_EXCEEDED'
            elif result.status == 'invalid':
                # Preserve the distinction between an inspectable invalid
                # result and a ready-for-manual-apply result.
                item.queue_state = 'NEEDS_REVIEW'
                item.error_message = 'ANALYSIS_INVALID'
            elif result.status != 'success':
                item.queue_state = 'FAILED'
                item.error_message = 'ANALYSIS_FAILED'
            else:
                decision = (
                    result.structured_result.score.decision
                    if result.structured_result and result.structured_result.score
                    else None
                )
                item.queue_state = (
                    'SKIPPED'
                    if str(decision).lower() in {'skip', 'dont_spend_time', "don't_spend_time"}
                    else 'READY_FOR_MANUAL_APPLY'
                )
                item.error_message = None
            item.completed_at = utcnow()
        except ProviderExecutionGateError as error:
            # Budget exhaustion and a definitely pre-dispatch readiness failure
            # leave the item resumable without pretending that it ran.  Stale
            # or invalid authorization is terminal for this reviewed session;
            # the user must preview again.
            item.queue_state = (
                'NEEDS_ANALYSIS'
                if error.code in {'AI_BUDGET_EXCEEDED', 'PROVIDER_NOT_READY'}
                else 'FAILED'
            )
            item.error_message = error.code
        except EnginePackageUnavailableError as error:
            item.queue_state = 'FAILED'
            item.error_message = getattr(error, 'code', str(error))
        except Exception as error:  # keep one failed item from corrupting the queue
            item.queue_state = 'FAILED'
            item.error_message = f'ANALYSIS_FAILED: {type(error).__name__}'
        session.commit()
    session.refresh(item_session)
    terminal_states = {
        'SKIPPED',
        'READY_FOR_MANUAL_APPLY',
        'APPLIED_CONFIRMED',
        'FAILED',
        'DEFERRED',
        'NEEDS_REVIEW',
    }
    if item_session.items and all(
        item.queue_state in terminal_states for item in item_session.items
    ):
        item_session.status = 'completed'
        item_session.completed_at = utcnow()
        session.commit()
    session.refresh(item_session)
    return SessionResponse(
        data=_session_data(item_session), meta={'request_id': str(request.state.request_id)}
    )
