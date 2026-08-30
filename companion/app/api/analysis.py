"""V4 analysis routes — AOPS-08.

POST /api/v1/vacancies/{id}/analyze  — preview & execute V4 analysis
GET  /api/v1/engine/runs/{run_id}     — retrieve a persisted engine run
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.analysis.models import (
    AnalysisRunResult,
    AnalyzeData,
    AnalyzeRequest,
    AnalyzeResponse,
    EngineRunDetailResponse,
    EngineRunItem,
    PreviewResponse,
)
from app.analysis.service import AnalysisOptions, AnalysisService, EnginePackageUnavailableError
from app.db.models import Vacancy
from app.db.session import get_db_session_long
from app.security.auth import ClientTokenDep

router = APIRouter(tags=['analysis'])


def _request_id(request: Request) -> str:
    return str(request.state.request_id)


def _require_db(db: Session | None) -> Session:
    if db is None:
        raise HTTPException(status_code=503, detail='Database unavailable')
    return db


def _run_result_to_data(result: AnalysisRunResult, cached: bool = False) -> AnalyzeData:
    """Convert an AnalysisRunResult to the API response data model."""
    score = result.structured_result.score if result.structured_result else None
    return AnalyzeData(
        run_id=result.run_id,
        vacancy_id=result.vacancy_id,
        status=result.status,
        repair_status=result.repair_status,
        ready=result.ready,
        score=score.final if score else None,
        decision=score.decision if score else None,
        confidence=score.confidence if score else None,
        cover_letter=(result.structured_result.cover_letter if result.structured_result else None),
        recruiter_risks=(
            list(result.structured_result.recruiter_risks) if result.structured_result else []
        ),
        validation_errors=result.validation_errors,
        token_input=result.token_input,
        token_output=result.token_output,
        estimated_cost_usd=result.estimated_cost_usd,
        cached=cached,
        created_at=result.created_at,
    )


# ── POST /vacancies/{vacancy_id}/analyze ─────────────────────────────────


@router.post(
    '/vacancies/{vacancy_id}/analyze',
    response_model=AnalyzeResponse | PreviewResponse,
    summary='Analyze a vacancy with the V4 engine',
    description=(
        'Compiles evidence, calls the configured LLM provider, validates the '
        'output, and persists an engine run.  Supports preview-only mode.'
    ),
)
def vacancy_analyze(
    request: Request,
    vacancy_id: str,
    body: AnalyzeRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
    preview: bool = Query(default=False, description='When true, only generate a payload preview'),
) -> AnalyzeResponse | PreviewResponse:
    """Run V4 evidence-aware analysis for a stored vacancy.

    Set ``preview=true`` to get a payload preview without calling the
    provider.  Otherwise the analysis executes and a provider call is made
    (subject to the input-hash cache).
    """
    del client_identity
    session = _require_db(db)

    try:
        vacancy = session.get(Vacancy, vacancy_id)
    except Exception:
        session.rollback()
        raise
    if vacancy is None:
        raise HTTPException(status_code=404, detail='Vacancy not found')

    # Build the PromptCompilerInput from stored vacancy
    import json

    skills: list[str] = []
    if vacancy.skills_json:
        try:
            parsed = json.loads(vacancy.skills_json)
            if isinstance(parsed, list):
                skills = [str(s) for s in parsed]
        except json.JSONDecodeError:
            pass

    from app.analysis.models import PromptCompilerInput

    compiler_input = PromptCompilerInput(
        title=vacancy.title,
        company_name=vacancy.company_name,
        salary_raw=_format_salary(vacancy),
        city=None,  # city is in snapshot payload — consider adding later
        work_mode=vacancy.work_mode,
        experience_raw=vacancy.experience,
        skills=skills,
        description_clean=vacancy.description or '',
        selected_claim_ids=body.claim_ids,
        selected_case_ids=body.case_ids,
        selected_portfolio_id=body.portfolio_id,
        privacy_mode=body.privacy_mode,
        language=body.language,
    )

    options = AnalysisOptions(
        provider=body.provider,
        model=body.model,
        force=body.force,
        privacy_mode=body.privacy_mode,
        language=body.language,
        claim_ids=body.claim_ids,
        case_ids=body.case_ids,
        portfolio_id=body.portfolio_id,
    )

    service = AnalysisService(session)

    if preview:
        try:
            preview_result = service.get_preview(compiler_input, options)
        except EnginePackageUnavailableError:
            session.rollback()
            raise
        return PreviewResponse(
            data=preview_result,
            meta={'request_id': _request_id(request)},
        )

    try:
        result = service.analyze(vacancy_id, compiler_input, options)
        session.commit()
    except EnginePackageUnavailableError:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise

    return AnalyzeResponse(
        data=_run_result_to_data(result),
        meta={'request_id': _request_id(request)},
    )


# ── GET /engine/runs/{run_id} ────────────────────────────────────────────


@router.get(
    '/engine/runs/{run_id}',
    response_model=EngineRunDetailResponse,
    summary='Get a persisted engine run',
    description='Returns the full detail of a single engine run by ID.',
)
def engine_run_detail(
    request: Request,
    run_id: str,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> EngineRunDetailResponse:
    """Retrieve a persisted engine run with score, decision, and status."""
    del client_identity
    session = _require_db(db)

    service = AnalysisService(session)
    try:
        result = service.get_run(run_id)
    except Exception:
        session.rollback()
        raise

    if result is None:
        raise HTTPException(status_code=404, detail='Engine run not found')

    score = result.structured_result.score if result.structured_result else None

    return EngineRunDetailResponse(
        data=EngineRunItem(
            run_id=result.run_id,
            vacancy_id=result.vacancy_id,
            status=result.status,
            repair_status=result.repair_status,
            ready=result.ready,
            score=score.final if score else None,
            decision=score.decision if score else None,
            engine_version=result.engine_version,
            provider=result.provider,
            model=result.model,
            input_hash=result.input_hash,
            created_at=result.created_at,
        ),
        meta={'request_id': _request_id(request)},
    )


# ── Helpers ──────────────────────────────────────────────────────────────


def _format_salary(vacancy: Vacancy) -> str | None:
    """Format salary fields into a human-readable string."""
    parts: list[str] = []
    if vacancy.salary_min is not None:
        parts.append(str(int(vacancy.salary_min)))
    if vacancy.salary_max is not None:
        parts.append(str(int(vacancy.salary_max)))
    if not parts:
        return None
    result = ' – '.join(parts)
    if vacancy.currency:
        result = f'{result} {vacancy.currency}'
    return result
