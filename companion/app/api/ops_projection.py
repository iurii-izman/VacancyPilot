"""Authoritative, read-only Ops work-item projection.

The extension has two deliberately different UI authorities.  Standalone UI
reads Dexie domain records; Ops UI reads this projection from Companion
SQLite.  This module is a query/read-model boundary only: it does not write
domain state, call HH, call a provider, or persist another copy of a vacancy.

``view=vacancies`` is the Inbox/card shape (one row per vacancy),
``view=applications`` is the Pipeline shape (one row per Application), and
``view=summary`` returns only complete, server-calculated counters for Today.
All three shapes are served by the same bounded endpoint so the browser never
has to perform per-vacancy joins or page-local filtering.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import Float, and_, case, cast, exists, func, not_, or_, select
from sqlalchemy.orm import Session, aliased

from app.api.vacancies import _require_db
from app.db.models import (
    Application,
    EngineRun,
    FollowUp,
    SearchProfile,
    Vacancy,
    VacancySearchProfileHit,
    VacancySnapshot,
)
from app.db.session import get_db_session_long
from app.domain.vacancy_hydration import vacancy_is_analysis_ready
from app.domain.workflow import STATUS_ALIASES, WorkflowError, followup_state, normalize_status
from app.security.auth import ClientTokenDep

router = APIRouter(tags=['ops-read-model'])

SOURCE_PATTERN = r'^[a-zA-Z][a-zA-Z0-9_-]{0,31}$'
OPEN_FOLLOWUP_STATUSES = {'pending', 'scheduled', 'snoozed'}
ANALYSIS_STATES = {'not_analyzed', 'running', 'ready', 'invalid', 'failed'}
SCORE_BANDS = {'high', 'mid', 'low'}
DECISIONS = {'apply', 'consider', 'skip', 'needs_input'}


def _stored_statuses(value: str) -> list[str]:
    """Return canonical and legacy storage values for one UI status."""
    normalized = normalize_status(value)
    aliases = [alias for alias, target in STATUS_ALIASES.items() if target == normalized]
    return [normalized, *aliases]


def _request_id(request: Request) -> str:
    return str(request.state.request_id)


class OpsVacancy(BaseModel):
    model_config = ConfigDict(extra='forbid')

    # Companion and HH identities are intentionally separate fields.
    vacancy_id: str
    hh_vacancy_id: str
    source: str
    source_url: str | None
    title: str
    company_id: str | None
    company_name: str | None
    salary_min: float | None
    salary_max: float | None
    currency: str | None
    city: str | None
    work_mode: str | None
    experience: str | None
    description: str | None
    description_hash: str | None
    skills: list[str]
    published_at: str | None
    first_seen_at: str
    last_seen_at: str
    updated_at: str
    archived: bool
    revision: int
    hydration_state: Literal['full', 'partial']


class OpsApplication(BaseModel):
    model_config = ConfigDict(extra='forbid')

    application_id: str
    vacancy_id: str
    status: str
    decision: str | None
    score: float | None
    confidence: float | None
    applied_at: str | None
    next_action_at: str | None
    revision: int
    created_at: str
    updated_at: str


class OpsAnalysis(BaseModel):
    model_config = ConfigDict(extra='forbid')

    run_id: str | None
    state: Literal['not_analyzed', 'running', 'ready', 'invalid', 'failed']
    status: str | None
    repair_status: str | None
    ready: bool
    score: int | None
    decision: str | None
    confidence: str | None
    created_at: str | None


class OpsFollowUp(BaseModel):
    model_config = ConfigDict(extra='forbid')

    follow_up_id: str
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


class OpsProvenanceHit(BaseModel):
    model_config = ConfigDict(extra='forbid')

    search_profile_id: str
    search_profile_name: str
    first_seen_at: str
    last_seen_at: str
    hit_count: int


class OpsProvenance(BaseModel):
    model_config = ConfigDict(extra='forbid')

    hits: list[OpsProvenanceHit]


class OpsAvailability(BaseModel):
    """Availability of the joined authoritative sources.

    The current implementation reads all sources in one SQLite transaction,
    so a database/query failure makes the whole request unavailable rather
    than fabricating an empty child collection.  The per-source fields keep
    that contract explicit for future transport-level partial responses.
    """

    model_config = ConfigDict(extra='forbid')

    application: Literal['available', 'unavailable']
    analysis: Literal['available', 'unavailable']
    follow_up: Literal['available', 'unavailable']
    provenance: Literal['available', 'unavailable']


class OpsWorkItem(BaseModel):
    model_config = ConfigDict(extra='forbid')

    authority: Literal['ops']
    vacancy_state: Literal['active', 'archived']
    vacancy: OpsVacancy
    applications: list[OpsApplication]
    # none is intentionally different from the real Application status new.
    application_state: str
    analysis: OpsAnalysis
    analysis_state: Literal['not_analyzed', 'running', 'ready', 'invalid', 'failed']
    follow_ups: list[OpsFollowUp]
    follow_up_state: str
    active_follow_up_count: int
    provenance: OpsProvenance
    availability: OpsAvailability


class OpsSummary(BaseModel):
    model_config = ConfigDict(extra='forbid')

    vacancies_total: int
    vacancies_without_application: int
    applications_total: int
    analysis_not_analyzed: int
    analysis_running: int
    analysis_ready: int
    analysis_invalid: int
    analysis_failed: int
    ready_to_review: int
    followups_due: int


class OpsWorkItemMeta(BaseModel):
    model_config = ConfigDict(extra='forbid')

    request_id: str
    total: int
    limit: int
    offset: int
    view: Literal['vacancies', 'applications', 'summary']
    summary: OpsSummary


class OpsWorkItemResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')

    data: list[OpsWorkItem]
    meta: OpsWorkItemMeta


def _skills(vacancy: Vacancy) -> list[str]:
    if not vacancy.skills_json:
        return []
    try:
        parsed = json.loads(vacancy.skills_json)
    except (TypeError, ValueError):
        return []
    return [str(item) for item in parsed] if isinstance(parsed, list) else []


def _latest_engine_runs(session: Session, vacancy_ids: list[str]) -> dict[str, EngineRun]:
    if not vacancy_ids:
        return {}
    ranked = (
        select(
            EngineRun,
            func.row_number()
            .over(
                partition_by=EngineRun.vacancy_id,
                order_by=(EngineRun.created_at.desc(), EngineRun.id.desc()),
            )
            .label('row_number'),
        )
        .where(EngineRun.vacancy_id.in_(vacancy_ids))
        .subquery()
    )
    latest = aliased(EngineRun, ranked)
    rows = session.execute(select(latest).where(ranked.c.row_number == 1)).scalars().all()
    return {run.vacancy_id: run for run in rows}


def _latest_snapshot_payloads(session: Session, vacancy_ids: list[str]) -> dict[str, str | None]:
    if not vacancy_ids:
        return {}
    ranked = (
        select(
            VacancySnapshot.vacancy_id,
            VacancySnapshot.payload_json,
            func.row_number()
            .over(
                partition_by=VacancySnapshot.vacancy_id,
                order_by=(VacancySnapshot.captured_at.desc(), VacancySnapshot.id.desc()),
            )
            .label('row_number'),
        )
        .where(VacancySnapshot.vacancy_id.in_(vacancy_ids))
        .subquery()
    )
    rows = session.execute(
        select(ranked.c.vacancy_id, ranked.c.payload_json).where(ranked.c.row_number == 1)
    ).all()
    return {str(vacancy_id): payload for vacancy_id, payload in rows}


def _city_from_payload(payload_json: str | None) -> str | None:
    if not payload_json:
        return None
    try:
        payload = json.loads(payload_json)
    except (TypeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    inner = payload.get('payload')
    if not isinstance(inner, dict):
        return None
    city = inner.get('city')
    return city.strip() if isinstance(city, str) and city.strip() else None


def _vacancy_data(vacancy: Vacancy, city: str | None) -> OpsVacancy:
    return OpsVacancy(
        vacancy_id=vacancy.id,
        hh_vacancy_id=vacancy.source_vacancy_id,
        source=vacancy.source,
        source_url=vacancy.url,
        title=vacancy.title,
        company_id=vacancy.company_id,
        company_name=vacancy.company_name,
        salary_min=vacancy.salary_min,
        salary_max=vacancy.salary_max,
        currency=vacancy.currency,
        city=city,
        work_mode=vacancy.work_mode,
        experience=vacancy.experience,
        description=vacancy.description,
        description_hash=vacancy.description_hash,
        skills=_skills(vacancy),
        # The current schema has first/last-seen timestamps, not an HH
        # publication timestamp.  Preserve the distinction as null.
        published_at=None,
        first_seen_at=vacancy.first_seen_at,
        last_seen_at=vacancy.last_seen_at,
        updated_at=vacancy.updated_at,
        archived=vacancy.archived,
        revision=vacancy.revision,
        hydration_state='full' if vacancy_is_analysis_ready(vacancy) else 'partial',
    )


def _application_data(application: Application) -> OpsApplication:
    return OpsApplication(
        application_id=application.id,
        vacancy_id=application.vacancy_id,
        status=normalize_status(application.status),
        decision=application.decision,
        score=application.score,
        confidence=application.confidence,
        applied_at=application.applied_at,
        next_action_at=application.next_action_at,
        revision=application.revision,
        created_at=application.created_at,
        updated_at=application.updated_at,
    )


def _analysis_data(run: EngineRun | None) -> OpsAnalysis:
    if run is None:
        return OpsAnalysis(
            run_id=None,
            state='not_analyzed',
            status=None,
            repair_status=None,
            ready=False,
            score=None,
            decision=None,
            confidence=None,
            created_at=None,
        )

    structured: dict[str, Any] | None = None
    if run.validated_output:
        try:
            parsed = json.loads(run.validated_output)
            if isinstance(parsed, dict) and isinstance(parsed.get('score'), dict):
                structured = parsed
        except (TypeError, ValueError):
            structured = None

    ready = run.status == 'success' and structured is not None
    if run.status in {'pending', 'running'}:
        state: Literal['running', 'ready', 'invalid', 'failed'] = 'running'
    elif run.status == 'error':
        state = 'failed'
    elif run.status == 'invalid' or not ready:
        state = 'invalid'
    else:
        state = 'ready'

    score = structured.get('score') if structured else None
    return OpsAnalysis(
        run_id=run.id,
        state=state,
        status=run.status,
        repair_status='valid' if ready else 'invalid',
        ready=ready,
        score=(
            score.get('final')
            if ready and isinstance(score, dict) and isinstance(score.get('final'), int)
            else None
        ),
        decision=(
            score.get('decision')
            if isinstance(score, dict) and isinstance(score.get('decision'), str) and ready
            else None
        ),
        confidence=(
            score.get('confidence')
            if isinstance(score, dict) and isinstance(score.get('confidence'), str) and ready
            else None
        ),
        created_at=run.created_at,
    )


def _followup_data(item: FollowUp) -> OpsFollowUp:
    return OpsFollowUp(
        follow_up_id=item.id,
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


def _provenance_data(
    hits: list[tuple[VacancySearchProfileHit, str]],
) -> OpsProvenance:
    return OpsProvenance(
        hits=[
            OpsProvenanceHit(
                search_profile_id=hit.search_profile_id,
                search_profile_name=name,
                first_seen_at=hit.first_seen_at,
                last_seen_at=hit.last_seen_at,
                hit_count=hit.hit_count,
            )
            for hit, name in sorted(hits, key=lambda pair: (pair[1].casefold(), pair[0].id))
        ]
    )


def _application_state(applications: list[Application]) -> str:
    if not applications:
        return 'none'
    if len(applications) > 1:
        return 'multiple'
    return normalize_status(applications[0].status)


def _followup_state(followups: list[FollowUp]) -> tuple[str, int]:
    active = [item for item in followups if item.status in OPEN_FOLLOWUP_STATUSES]
    if not active:
        return 'none', 0
    if len(active) > 1:
        return 'multiple', len(active)
    return followup_state(active[0].due_at, active[0].status), 1


def _work_item(
    vacancy: Vacancy,
    city: str | None,
    applications: list[Application],
    run: EngineRun | None,
    followups: list[FollowUp],
    hits: list[tuple[VacancySearchProfileHit, str]],
) -> OpsWorkItem:
    analysis = _analysis_data(run)
    follow_state, active_count = _followup_state(followups)
    return OpsWorkItem(
        authority='ops',
        vacancy_state='archived' if vacancy.archived else 'active',
        vacancy=_vacancy_data(vacancy, city),
        applications=[_application_data(item) for item in applications],
        application_state=_application_state(applications),
        analysis=analysis,
        analysis_state=analysis.state,
        follow_ups=[_followup_data(item) for item in followups],
        follow_up_state=follow_state,
        active_follow_up_count=active_count,
        provenance=_provenance_data(hits),
        availability=OpsAvailability(
            application='available',
            analysis='available',
            follow_up='available',
            provenance='available',
        ),
    )


def _latest_runs_subquery() -> Any:
    return select(
        EngineRun.vacancy_id,
        EngineRun.status,
        EngineRun.validated_output,
        func.row_number()
        .over(
            partition_by=EngineRun.vacancy_id,
            order_by=(EngineRun.created_at.desc(), EngineRun.id.desc()),
        )
        .label('row_number'),
    ).subquery('latest_ops_engine_runs')


def _latest_run_scalar(latest_runs: Any, column: str) -> Any:
    return (
        select(getattr(latest_runs.c, column))
        .where(latest_runs.c.vacancy_id == Vacancy.id, latest_runs.c.row_number == 1)
        .correlate(Vacancy)
        .scalar_subquery()
    )


def _valid_analysis_row_condition(latest_runs: Any) -> Any:
    """Return the SQL predicate matching the Python analysis decoder.

    EngineRun status alone is not enough: a successful row with malformed or
    structurally incomplete JSON is an invalid analysis, not a ready score.
    ``CASE`` keeps SQLite's JSON functions away from malformed payloads.
    """
    validated_output = latest_runs.c.validated_output
    score_type = case(
        (
            func.json_valid(validated_output) == 1,
            func.json_type(validated_output, '$.score'),
        ),
        else_=None,
    )
    return and_(
        latest_runs.c.status == 'success',
        validated_output.is_not(None),
        score_type == 'object',
    )


def _analysis_condition(latest_runs: Any, analysis_state: str | None) -> Any | None:
    if not analysis_state or analysis_state == 'all':
        return None
    if analysis_state == 'not_analyzed':
        return not_(
            exists(select(1).select_from(EngineRun).where(EngineRun.vacancy_id == Vacancy.id))
        )
    if analysis_state not in ANALYSIS_STATES:
        raise HTTPException(status_code=422, detail='Unsupported analysis_state')
    latest_status = latest_runs.c.status
    valid_ready = _valid_analysis_row_condition(latest_runs)
    if analysis_state == 'running':
        state_condition = latest_status.in_(['pending', 'running'])
    elif analysis_state == 'ready':
        state_condition = valid_ready
    elif analysis_state == 'invalid':
        state_condition = or_(
            latest_status == 'invalid',
            and_(
                latest_status == 'success',
                case((valid_ready, 1), else_=0) == 0,
            ),
        )
    else:
        state_condition = latest_status == 'error'
    return exists(
        select(1)
        .select_from(latest_runs)
        .where(
            latest_runs.c.vacancy_id == Vacancy.id,
            latest_runs.c.row_number == 1,
            state_condition,
        )
    )


def _score_expression(latest_runs: Any) -> Any:
    validated_output = _latest_run_scalar(latest_runs, 'validated_output')
    safe_output = case(
        (func.json_valid(validated_output) == 1, validated_output),
        else_=None,
    )
    safe_final = case(
        (
            func.json_type(safe_output, '$.score.final').in_(['integer', 'real']),
            func.json_extract(safe_output, '$.score.final'),
        ),
        else_=None,
    )
    raw_score = cast(safe_final, Float)
    return case(
        (
            and_(_latest_run_scalar(latest_runs, 'status') == 'success', safe_final.is_not(None)),
            raw_score,
        ),
        else_=None,
    )


def _vacancy_conditions(
    *,
    latest_runs: Any,
    source: str | None,
    work_mode: str | None,
    archived: bool | None,
    updated_after: str | None,
    search_profile_id: str | None,
    query: str | None,
    vacancy_id: str | None,
    source_vacancy_id: str | None,
    application_status: str | None,
    analysis_state: str | None,
    score_band: str | None,
    decision: str | None,
) -> list[Any]:
    conditions: list[Any] = []
    if source is not None:
        conditions.append(Vacancy.source == source)
    if work_mode is not None:
        conditions.append(
            Vacancy.work_mode.is_(None)
            if work_mode == 'unknown'
            else Vacancy.work_mode == work_mode
        )
    if archived is not None:
        conditions.append(Vacancy.archived == archived)
    if updated_after is not None:
        conditions.append(Vacancy.updated_at > updated_after)
    if vacancy_id is not None:
        conditions.append(Vacancy.id == vacancy_id)
    if source_vacancy_id is not None:
        conditions.append(Vacancy.source_vacancy_id == source_vacancy_id)
    if query:
        pattern = f'%{query}%'
        conditions.append(or_(Vacancy.title.ilike(pattern), Vacancy.company_name.ilike(pattern)))
    if search_profile_id is not None:
        conditions.append(
            exists(
                select(1)
                .select_from(VacancySearchProfileHit)
                .where(
                    VacancySearchProfileHit.vacancy_id == Vacancy.id,
                    VacancySearchProfileHit.search_profile_id == search_profile_id,
                )
            )
        )
    if application_status is not None:
        if application_status.casefold() == 'none':
            conditions.append(
                not_(
                    exists(
                        select(1)
                        .select_from(Application)
                        .where(Application.vacancy_id == Vacancy.id)
                    )
                )
            )
        else:
            try:
                normalized = normalize_status(application_status)
            except WorkflowError as error:
                raise HTTPException(status_code=422, detail=str(error)) from error
            conditions.append(
                exists(
                    select(1)
                    .select_from(Application)
                    .where(
                        Application.vacancy_id == Vacancy.id,
                        Application.status.in_(_stored_statuses(normalized)),
                    )
                )
            )
    analysis_filter = _analysis_condition(latest_runs, analysis_state)
    if analysis_filter is not None:
        conditions.append(analysis_filter)
    if score_band is not None and score_band != 'all':
        if score_band not in SCORE_BANDS:
            raise HTTPException(status_code=422, detail='Unsupported score_band')
        score = _score_expression(latest_runs)
        if score_band == 'high':
            conditions.append(score >= 70)
        elif score_band == 'mid':
            conditions.append(and_(score >= 50, score < 70))
        else:
            conditions.append(score < 50)
    if decision is not None and decision != 'all':
        normalized_decision = decision.casefold()
        if normalized_decision not in DECISIONS:
            raise HTTPException(status_code=422, detail='Unsupported decision')
        validated_output = _latest_run_scalar(latest_runs, 'validated_output')
        safe_output = case(
            (func.json_valid(validated_output) == 1, validated_output),
            else_=None,
        )
        conditions.append(
            and_(
                _latest_run_scalar(latest_runs, 'status') == 'success',
                func.json_type(safe_output, '$.score') == 'object',
                func.json_extract(safe_output, '$.score.decision') == normalized_decision,
            )
        )
    return conditions


def _count_vacancies(session: Session, conditions: list[Any]) -> int:
    query = select(func.count()).select_from(select(Vacancy.id).where(*conditions).subquery())
    return int(session.execute(query).scalar_one() or 0)


def _summary(session: Session, conditions: list[Any], latest_runs: Any) -> OpsSummary:
    base_ids = select(Vacancy.id).where(*conditions)

    def count_with(extra: Any) -> int:
        return int(
            session.execute(
                select(func.count()).select_from(
                    select(Vacancy.id).where(*conditions, extra).subquery()
                )
            ).scalar_one()
            or 0
        )

    without_application = not_(
        exists(select(1).select_from(Application).where(Application.vacancy_id == Vacancy.id))
    )
    no_analysis = not_(
        exists(select(1).select_from(EngineRun).where(EngineRun.vacancy_id == Vacancy.id))
    )
    running = exists(
        select(1)
        .select_from(latest_runs)
        .where(
            latest_runs.c.vacancy_id == Vacancy.id,
            latest_runs.c.row_number == 1,
            latest_runs.c.status.in_(['pending', 'running']),
        )
    )
    ready = exists(
        select(1)
        .select_from(latest_runs)
        .where(
            latest_runs.c.vacancy_id == Vacancy.id,
            latest_runs.c.row_number == 1,
            _valid_analysis_row_condition(latest_runs),
        )
    )
    invalid = exists(
        select(1)
        .select_from(latest_runs)
        .where(
            latest_runs.c.vacancy_id == Vacancy.id,
            latest_runs.c.row_number == 1,
            or_(
                latest_runs.c.status == 'invalid',
                and_(
                    latest_runs.c.status == 'success',
                    case(
                        (_valid_analysis_row_condition(latest_runs), 1),
                        else_=0,
                    )
                    == 0,
                ),
            ),
        )
    )
    failed = exists(
        select(1)
        .select_from(latest_runs)
        .where(
            latest_runs.c.vacancy_id == Vacancy.id,
            latest_runs.c.row_number == 1,
            latest_runs.c.status == 'error',
        )
    )
    active_followup = (
        select(func.count())
        .select_from(FollowUp)
        .join(Application, Application.id == FollowUp.application_id)
        .where(
            Application.vacancy_id.in_(base_ids),
            FollowUp.status.in_(OPEN_FOLLOWUP_STATUSES),
            FollowUp.due_at.is_not(None),
        )
    )
    app_count = session.execute(
        select(func.count()).select_from(Application).where(Application.vacancy_id.in_(base_ids))
    ).scalar_one()
    return OpsSummary(
        vacancies_total=_count_vacancies(session, conditions),
        vacancies_without_application=count_with(without_application),
        applications_total=int(app_count or 0),
        analysis_not_analyzed=count_with(no_analysis),
        analysis_running=count_with(running),
        analysis_ready=count_with(ready),
        analysis_invalid=count_with(invalid),
        analysis_failed=count_with(failed),
        ready_to_review=count_with(and_(ready, without_application)),
        followups_due=int(session.execute(active_followup).scalar_one() or 0),
    )


def _load_related(
    session: Session,
    vacancies: list[Vacancy],
    applications: list[Application] | None = None,
) -> list[OpsWorkItem]:
    vacancy_ids = [vacancy.id for vacancy in vacancies]
    if applications is None:
        application_rows = list(
            session.execute(
                select(Application)
                .where(Application.vacancy_id.in_(vacancy_ids))
                .order_by(Application.updated_at.desc(), Application.id.desc())
            )
            .scalars()
            .all()
        )
    else:
        application_rows = applications
    application_ids = [item.id for item in application_rows]
    followup_rows = (
        session.execute(
            select(FollowUp)
            .where(FollowUp.application_id.in_(application_ids))
            .order_by(FollowUp.due_at.asc(), FollowUp.id.asc())
        )
        .scalars()
        .all()
        if application_ids
        else []
    )
    followups_by_app: dict[str, list[FollowUp]] = {}
    for item in followup_rows:
        followups_by_app.setdefault(item.application_id, []).append(item)
    followups_by_vacancy: dict[str, list[FollowUp]] = {}
    for application_row in application_rows:
        followups_by_vacancy.setdefault(application_row.vacancy_id, []).extend(
            followups_by_app.get(application_row.id, [])
        )

    hit_rows = (
        session.execute(
            select(VacancySearchProfileHit, SearchProfile.name)
            .join(SearchProfile, SearchProfile.id == VacancySearchProfileHit.search_profile_id)
            .where(VacancySearchProfileHit.vacancy_id.in_(vacancy_ids))
        ).all()
        if vacancy_ids
        else []
    )
    hits_by_vacancy: dict[str, list[tuple[VacancySearchProfileHit, str]]] = {}
    for hit, name in hit_rows:
        hits_by_vacancy.setdefault(hit.vacancy_id, []).append((hit, name))

    latest_runs = _latest_engine_runs(session, vacancy_ids)
    snapshot_payloads = _latest_snapshot_payloads(session, vacancy_ids)
    apps_by_vacancy: dict[str, list[Application]] = {}
    for application_row in application_rows:
        apps_by_vacancy.setdefault(application_row.vacancy_id, []).append(application_row)

    return [
        _work_item(
            vacancy,
            _city_from_payload(snapshot_payloads.get(vacancy.id)),
            apps_by_vacancy.get(vacancy.id, []),
            latest_runs.get(vacancy.id),
            followups_by_vacancy.get(vacancy.id, []),
            hits_by_vacancy.get(vacancy.id, []),
        )
        for vacancy in vacancies
    ]


@router.get('/ops/work-items', response_model=OpsWorkItemResponse)
def ops_work_items(
    request: Request,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
    view: Literal['vacancies', 'applications', 'summary'] = Query(default='vacancies'),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    source: str | None = Query(default=None, max_length=32, pattern=SOURCE_PATTERN),
    work_mode: Literal['remote', 'hybrid', 'office', 'unknown'] | None = None,
    archived: bool | None = None,
    updated_after: str | None = Query(default=None, max_length=64),
    search_profile_id: str | None = Query(default=None, max_length=128),
    query: str | None = Query(default=None, max_length=200),
    vacancy_id: str | None = Query(default=None, max_length=128),
    source_vacancy_id: str | None = Query(default=None, max_length=128),
    application_status: str | None = Query(default=None, max_length=32),
    analysis_state: str | None = Query(default=None, max_length=32),
    score_band: str | None = Query(default=None, max_length=32),
    decision: str | None = Query(default=None, max_length=32),
    sort: Literal['updated_at', 'score'] = Query(default='updated_at'),
    direction: Literal['asc', 'desc'] = Query(default='desc'),
) -> OpsWorkItemResponse:
    """Return the current authoritative Ops work-item projection.

    The endpoint performs a fixed number of set-based SQLite queries.  It is
    intentionally read-only and never calls HH or an analysis provider.
    """
    del client_identity
    session = _require_db(db)
    latest_runs = _latest_runs_subquery()
    conditions = _vacancy_conditions(
        latest_runs=latest_runs,
        source=source,
        work_mode=work_mode,
        archived=archived,
        updated_after=updated_after,
        search_profile_id=search_profile_id,
        query=query,
        vacancy_id=vacancy_id,
        source_vacancy_id=source_vacancy_id,
        application_status=application_status,
        analysis_state=analysis_state,
        score_band=score_band,
        decision=decision,
    )

    try:
        summary = _summary(session, conditions, latest_runs)
        if view == 'summary':
            return OpsWorkItemResponse(
                data=[],
                meta=OpsWorkItemMeta(
                    request_id=_request_id(request),
                    total=summary.vacancies_total,
                    limit=limit,
                    offset=offset,
                    view=view,
                    summary=summary,
                ),
            )

        if view == 'vacancies':
            vacancy_query = select(Vacancy).where(*conditions)
            if sort == 'score':
                score_expression = _score_expression(latest_runs)
                order = (
                    score_expression.asc().nulls_last()
                    if direction == 'asc'
                    else score_expression.desc().nulls_last()
                )
            else:
                order = (
                    Vacancy.updated_at.asc() if direction == 'asc' else Vacancy.updated_at.desc()
                )
            vacancy_query = vacancy_query.order_by(
                order,
                Vacancy.id.asc() if direction == 'asc' else Vacancy.id.desc(),
            )
            vacancies = list(
                session.execute(vacancy_query.limit(limit).offset(offset)).scalars().all()
            )
            work_items = _load_related(session, vacancies)
        else:
            if application_status is not None and application_status.casefold() == 'none':
                applications: list[Application] = []
            else:
                application_query = (
                    select(Application)
                    .join(Vacancy, Vacancy.id == Application.vacancy_id)
                    .where(*conditions)
                )
                if application_status:
                    application_query = application_query.where(
                        Application.status.in_(_stored_statuses(application_status))
                    )
                if sort == 'score':
                    score_expression = _score_expression(latest_runs)
                    order = (
                        score_expression.asc().nulls_last()
                        if direction == 'asc'
                        else score_expression.desc().nulls_last()
                    )
                    application_query = application_query.order_by(order)
                else:
                    application_query = application_query.order_by(
                        Application.updated_at.asc()
                        if direction == 'asc'
                        else Application.updated_at.desc()
                    )
                application_query = application_query.order_by(
                    Application.id.asc() if direction == 'asc' else Application.id.desc()
                )
                applications = list(
                    session.execute(application_query.limit(limit).offset(offset)).scalars().all()
                )
            vacancy_ids = list(dict.fromkeys(item.vacancy_id for item in applications))
            vacancies_by_id = {
                vacancy.id: vacancy
                for vacancy in (
                    session.execute(select(Vacancy).where(Vacancy.id.in_(vacancy_ids)))
                    .scalars()
                    .all()
                    if vacancy_ids
                    else []
                )
            }
            ordered_vacancies = list(
                dict.fromkeys(vacancies_by_id[item.vacancy_id] for item in applications)
            )
            work_items = _load_related(session, ordered_vacancies, applications)
            # ``_load_related`` returns one vacancy row per parent.  Pipeline
            # must instead retain one row per Application, including multiple
            # applications attached to the same vacancy.
            by_vacancy: dict[str, OpsWorkItem] = {}
            for item in work_items:
                by_vacancy.setdefault(item.vacancy.vacancy_id, item)
            work_items = []
            for application in applications:
                parent = by_vacancy[application.vacancy_id]
                app_data = _application_data(application)
                work_items.append(
                    parent.model_copy(
                        update={
                            'applications': [app_data],
                            'application_state': app_data.status,
                            'follow_ups': [
                                item
                                for item in parent.follow_ups
                                if item.application_id == application.id
                            ],
                            'follow_up_state': (
                                'multiple'
                                if sum(
                                    item.application_id == application.id
                                    and item.status in OPEN_FOLLOWUP_STATUSES
                                    for item in parent.follow_ups
                                )
                                > 1
                                else next(
                                    (
                                        item.derived_state
                                        for item in parent.follow_ups
                                        if item.application_id == application.id
                                        and item.status in OPEN_FOLLOWUP_STATUSES
                                    ),
                                    'none',
                                )
                            ),
                            'active_follow_up_count': sum(
                                item.application_id == application.id
                                and item.status in OPEN_FOLLOWUP_STATUSES
                                for item in parent.follow_ups
                            ),
                        }
                    )
                )

        return OpsWorkItemResponse(
            data=work_items,
            meta=OpsWorkItemMeta(
                request_id=_request_id(request),
                total=(
                    summary.vacancies_total if view == 'vacancies' else summary.applications_total
                ),
                limit=limit,
                offset=offset,
                view=view,
                summary=summary,
            ),
        )
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
