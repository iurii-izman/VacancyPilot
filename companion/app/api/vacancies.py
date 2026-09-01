"""Vacancy intake, list, detail and triage routes — AOPS-06.

All routes are authenticated with ``ClientTokenDep`` and follow the v1
envelope (``data`` + ``meta.request_id``).  Intake is idempotent by
``(source, source_vacancy_id)`` plus a request idempotency key; triage is
deterministic no-LLM Stage A.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Vacancy, VacancySearchProfileHit, VacancySnapshot
from app.db.session import get_db_session_long
from app.domain.triage import (
    TriageConfig,
    TriageVacancy,
    triage_vacancy,
)
from app.domain.vacancy_intake import (
    IdempotencyConflictError,
    VacancyIntakeService,
    normalize_intake,
)
from app.security.auth import ClientTokenDep

router = APIRouter(tags=['vacancies'])

SOURCE_PATTERN = r'^[a-zA-Z][a-zA-Z0-9_-]{0,31}$'
VERSION_PATTERN = r'^[0-9]+(?:[.-][0-9A-Za-z-]+)*$'


def _request_id(request: Request) -> str:
    return str(request.state.request_id)


def _require_db(db: Session | None) -> Session:
    if db is None:
        raise HTTPException(status_code=503, detail='Database unavailable')
    return db


def _vacancy_to_dict(vacancy: Vacancy) -> dict[str, Any]:
    skills: list[str] = []
    if vacancy.skills_json:
        try:
            parsed = json.loads(vacancy.skills_json)
            if isinstance(parsed, list):
                skills = [str(s) for s in parsed]
        except ValueError:
            skills = []
    return {
        'id': vacancy.id,
        'source': vacancy.source,
        'source_vacancy_id': vacancy.source_vacancy_id,
        'url': vacancy.url,
        'title': vacancy.title,
        'company_id': vacancy.company_id,
        'company_name': vacancy.company_name,
        'salary_min': vacancy.salary_min,
        'salary_max': vacancy.salary_max,
        'currency': vacancy.currency,
        'work_mode': vacancy.work_mode,
        'experience': vacancy.experience,
        'description': vacancy.description,
        'skills': skills,
        'first_seen_at': vacancy.first_seen_at,
        'last_seen_at': vacancy.last_seen_at,
        'updated_at': vacancy.updated_at,
        'archived': vacancy.archived,
        'revision': vacancy.revision,
        'description_hash': vacancy.description_hash,
    }


def _vacancy_to_triage_view(vacancy: Vacancy, city: str | None, seen_before: bool) -> TriageVacancy:
    skills: list[str] = []
    if vacancy.skills_json:
        try:
            parsed = json.loads(vacancy.skills_json)
            if isinstance(parsed, list):
                skills = [str(s) for s in parsed]
        except ValueError:
            skills = []
    return TriageVacancy(
        source=vacancy.source,
        source_vacancy_id=vacancy.source_vacancy_id,
        title=vacancy.title,
        company_name=vacancy.company_name,
        work_mode=vacancy.work_mode,
        city=city,
        experience_raw=vacancy.experience,
        description=vacancy.description,
        skills=tuple(skills),
        salary_min=vacancy.salary_min,
        salary_max=vacancy.salary_max,
        currency=vacancy.currency,
        archived=vacancy.archived,
        seen_before=seen_before,
    )


def _latest_city(session: Session, vacancy_id: str) -> str | None:
    """Read ``city`` from the latest snapshot payload (no vacancies column)."""
    snapshot = session.execute(
        select(VacancySnapshot)
        .where(VacancySnapshot.vacancy_id == vacancy_id)
        .order_by(VacancySnapshot.captured_at.desc(), VacancySnapshot.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    if snapshot is None or not snapshot.payload_json:
        return None
    try:
        payload = json.loads(snapshot.payload_json)
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    inner = payload.get('payload')
    if isinstance(inner, dict):
        city = inner.get('city')
        return str(city) if isinstance(city, str) and city.strip() else None
    return None


# ── Request/response schemas ──────────────────────────────────────────────


class VacancyIntakeV1(BaseModel):
    model_config = ConfigDict(extra='forbid')

    schema_version: Literal[1]
    source: str = Field(max_length=32, pattern=SOURCE_PATTERN)
    # Absent source IDs are allowed: normalize_intake derives a deterministic
    # fallback identity only when the ID is truly absent.
    source_vacancy_id: str = Field(default='', max_length=128)
    url: str | None = Field(default=None, max_length=2048)
    title: str | None = Field(default=None, max_length=500)
    company_id: str | None = Field(default=None, max_length=500)
    company_name: str | None = Field(default=None, max_length=500)
    salary_min: float | None = None
    salary_max: float | None = None
    currency: str | None = Field(default=None, max_length=16)
    work_mode: Literal['remote', 'hybrid', 'office', 'unknown'] | None = None
    city: str | None = Field(default=None, max_length=200)
    experience: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=12000)
    skills: list[str] = Field(default_factory=list, max_length=20)
    captured_at: str | None = Field(default=None, max_length=64)
    capture_source: str | None = Field(default=None, max_length=32)
    parser_version: str | None = Field(default=None, max_length=32, pattern=VERSION_PATTERN)

    @field_validator('skills')
    @classmethod
    def _strip_skills(cls, values: list[str]) -> list[str]:
        return [v for v in (str(v).strip() for v in values) if v]

    @field_validator('title')
    @classmethod
    def _title_required(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError('title must not be empty')
        return value


class IntakeData(BaseModel):
    result: Literal['created', 'updated', 'unchanged']
    vacancy_id: str
    revision: int
    first_seen_at: str
    last_seen_at: str
    snapshot_id: str | None
    duplicate: bool
    description_hash: str


class IntakeResponse(BaseModel):
    data: IntakeData
    meta: dict[str, str]


class VacancyItem(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str
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
    experience: str | None
    description: str | None
    skills: list[str]
    first_seen_at: str
    last_seen_at: str
    updated_at: str
    archived: bool
    revision: int
    description_hash: str | None


class VacancyListMeta(BaseModel):
    request_id: str
    total: int
    limit: int
    offset: int


class VacancyListResponse(BaseModel):
    data: list[VacancyItem]
    meta: VacancyListMeta


class VacancyDetailResponse(BaseModel):
    data: VacancyItem
    meta: dict[str, str]


class TriageRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    target_titles: list[str] = Field(default_factory=list, max_length=20)
    role_family: str | None = Field(default=None, max_length=120)
    must_have_skills: list[str] = Field(default_factory=list, max_length=40)
    nice_to_have_skills: list[str] = Field(default_factory=list, max_length=40)
    salary_expectation_min: float | None = None
    experience_years: float | None = Field(default=None, ge=0, le=60)
    seniority: Literal['junior', 'middle', 'senior', 'lead', 'principal'] | None = None
    preferred_work_modes: list[str] = Field(default_factory=list, max_length=4)
    preferred_cities: list[str] = Field(default_factory=list, max_length=20)
    remote_only: bool = False
    office_required: bool = False
    location_eligible: bool | None = None
    blocked_companies: list[str] = Field(default_factory=list, max_length=20)


class RiskFlagOut(BaseModel):
    code: str
    severity: str
    message: str
    evidence: str | None


class HardGateOut(BaseModel):
    code: str
    status: str
    explanation: str


class ScoreComponentOut(BaseModel):
    code: str
    score: int
    max: int
    reasons: list[str]


class TriageData(BaseModel):
    vacancy_id: str
    revision: int
    verdict: str
    recommendation: str
    score: int
    engine: str
    hard_gates: list[HardGateOut]
    components: list[ScoreComponentOut]
    risk_flags: list[RiskFlagOut]
    fit_reasons: list[str]
    caps_applied: list[str]


class TriageResponse(BaseModel):
    data: TriageData
    meta: dict[str, str]


# ── Routes ────────────────────────────────────────────────────────────────


@router.post('/vacancies/intake', response_model=IntakeResponse)
def vacancy_intake(
    request: Request,
    body: VacancyIntakeV1,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> IntakeResponse:
    """Idempotently capture a normalized vacancy into the companion."""
    del client_identity
    session = _require_db(db)
    idempotency_key = request.headers.get('X-VacancyPilot-Idempotency-Key')
    if idempotency_key is not None and not idempotency_key.strip():
        raise HTTPException(status_code=400, detail='Idempotency key must not be empty')
    if idempotency_key is not None and len(idempotency_key) > 128:
        raise HTTPException(status_code=400, detail='Idempotency key is too long')
    explicit_key = idempotency_key is not None

    try:
        normalized = normalize_intake(body.model_dump())
        if not explicit_key:
            # Content-derived default: a true retry (identical payload) reuses
            # the key and is deduplicated, while a content change produces a
            # distinct key so a new snapshot can be appended.
            idempotency_key = f'{body.source}:{body.source_vacancy_id}:{normalized.content_hash}'
        assert idempotency_key is not None, 'intake always has an idempotency key'
        service = VacancyIntakeService(session)
        result = service.intake(normalized, idempotency_key)
        session.commit()
    except IdempotencyConflictError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail=str(error)) from error
    except Exception:
        session.rollback()
        raise

    return IntakeResponse(
        data=IntakeData(
            result=result.result,
            vacancy_id=result.vacancy_id,
            revision=result.revision,
            first_seen_at=result.first_seen_at,
            last_seen_at=result.last_seen_at,
            snapshot_id=result.snapshot_id,
            duplicate=result.result == 'unchanged',
            description_hash=normalized.content_hash,
        ),
        meta={'request_id': _request_id(request)},
    )


@router.get('/vacancies', response_model=VacancyListResponse)
def vacancy_list(
    request: Request,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    source: str | None = Query(default=None, max_length=32, pattern=SOURCE_PATTERN),
    work_mode: Literal['remote', 'hybrid', 'office', 'unknown'] | None = None,
    archived: bool | None = None,
    updated_after: str | None = Query(default=None, max_length=64),
    search_profile_id: str | None = Query(default=None, max_length=128),
) -> VacancyListResponse:
    """List vacancies with bounded server-side filters and stable pagination."""
    del client_identity
    session = _require_db(db)
    try:
        filters = []
        if source is not None:
            filters.append(Vacancy.source == source)
        if work_mode is not None:
            filters.append(Vacancy.work_mode == work_mode)
        if archived is not None:
            filters.append(Vacancy.archived == archived)
        if updated_after is not None:
            filters.append(Vacancy.updated_at > updated_after)
        vacancy_query = select(Vacancy).where(*filters)
        if search_profile_id is not None:
            vacancy_query = vacancy_query.join(
                VacancySearchProfileHit,
                VacancySearchProfileHit.vacancy_id == Vacancy.id,
            ).where(VacancySearchProfileHit.search_profile_id == search_profile_id)
        total = session.execute(
            select(func.count()).select_from(vacancy_query.subquery())
        ).scalar_one()
        rows = (
            session.execute(
                vacancy_query.order_by(Vacancy.last_seen_at.desc(), Vacancy.id.desc())
                .limit(limit)
                .offset(offset)
            )
            .scalars()
            .all()
        )
    except Exception:
        session.rollback()
        raise
    return VacancyListResponse(
        data=[VacancyItem(**_vacancy_to_dict(v)) for v in rows],
        meta=VacancyListMeta(
            request_id=_request_id(request),
            total=int(total or 0),
            limit=limit,
            offset=offset,
        ),
    )


@router.get('/vacancies/{vacancy_id}', response_model=VacancyDetailResponse)
def vacancy_detail(
    request: Request,
    vacancy_id: str,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> VacancyDetailResponse:
    """Return a single vacancy by internal id."""
    del client_identity
    session = _require_db(db)
    try:
        vacancy = session.get(Vacancy, vacancy_id)
    except Exception:
        session.rollback()
        raise
    if vacancy is None:
        raise HTTPException(status_code=404, detail='Vacancy not found')
    return VacancyDetailResponse(
        data=VacancyItem(**_vacancy_to_dict(vacancy)),
        meta={'request_id': _request_id(request)},
    )


@router.post('/vacancies/{vacancy_id}/triage', response_model=TriageResponse)
def vacancy_triage(
    request: Request,
    vacancy_id: str,
    body: TriageRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> TriageResponse:
    """Run deterministic no-LLM Stage A triage for a stored vacancy."""
    del client_identity
    session = _require_db(db)
    try:
        vacancy = session.get(Vacancy, vacancy_id)
    except Exception:
        session.rollback()
        raise
    if vacancy is None:
        raise HTTPException(status_code=404, detail='Vacancy not found')

    try:
        snapshot_count = session.execute(
            select(func.count())
            .select_from(VacancySnapshot)
            .where(VacancySnapshot.vacancy_id == vacancy_id)
        ).scalar_one()
        seen_before = int(snapshot_count or 0) > 1 or vacancy.first_seen_at != vacancy.last_seen_at
        city = _latest_city(session, vacancy_id)
    except Exception:
        session.rollback()
        raise

    config = TriageConfig(
        target_titles=tuple(body.target_titles),
        role_family=body.role_family,
        must_have_skills=tuple(body.must_have_skills),
        nice_to_have_skills=tuple(body.nice_to_have_skills),
        salary_expectation_min=body.salary_expectation_min,
        experience_years=body.experience_years,
        seniority=body.seniority,
        preferred_work_modes=tuple(body.preferred_work_modes),
        preferred_cities=tuple(body.preferred_cities),
        remote_only=body.remote_only,
        office_required=body.office_required,
        location_eligible=body.location_eligible,
        blocked_companies=tuple(body.blocked_companies),
    )
    result = triage_vacancy(_vacancy_to_triage_view(vacancy, city, seen_before), config)

    return TriageResponse(
        data=TriageData(
            vacancy_id=vacancy.id,
            revision=vacancy.revision,
            verdict=result.verdict,
            recommendation=result.recommendation,
            score=result.score,
            engine=result.engine,
            hard_gates=[HardGateOut(**g.__dict__) for g in result.hard_gates],
            components=[
                ScoreComponentOut(
                    code=c.key,
                    score=c.score,
                    max=c.max,
                    reasons=list(c.reasons),
                )
                for c in result.components
            ],
            risk_flags=[RiskFlagOut(**f.__dict__) for f in result.risk_flags],
            fit_reasons=list(result.fit_reasons),
            caps_applied=list(result.caps_applied),
        ),
        meta={'request_id': _request_id(request)},
    )
