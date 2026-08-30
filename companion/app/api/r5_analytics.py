"""R5-B read-only descriptive conversion and throughput metrics."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime
from statistics import median
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.vacancies import _require_db
from app.db.models import (
    Application,
    ApplicationEvent,
    ApplicationSession,
    ApplicationSessionItem,
    EngineRun,
    SearchProfile,
    Vacancy,
    VacancySearchProfileHit,
)
from app.db.session import get_db_session_long
from app.security.auth import ClientTokenDep

router = APIRouter(tags=['analytics'])
APPLIED = 'applied'
RESPONSE_STATUSES = {'hr_replied', 'interview', 'test_task', 'offer'}
INTERVIEW_STATUSES = {'interview', 'test_task', 'offer'}


class Breakdown(BaseModel):
    key: str
    sample_size: int
    applied: int
    responses: int
    response_rate: float | None
    interviews: int
    interview_rate: float | None


class AnalyticsData(BaseModel):
    state: str
    applications_applied: int
    responses: int
    response_rate: float | None
    interviews: int
    interview_rate: float | None
    offers: int
    pending: int
    median_response_hours: float | None
    response_time_sample: int
    sessions: int
    completed_items: int
    session_elapsed_hours: float | None
    median_processing_minutes: float | None
    v4_input_tokens: int
    v4_output_tokens: int
    estimated_cost_usd: float | None
    estimated_cost_per_applied_usd: float | None
    cached_run_count: int | None
    breakdowns: dict[str, list[Breakdown]]
    note: str = 'Observed in current sample; not evidence of causation.'


class AnalyticsResponse(BaseModel):
    data: AnalyticsData
    meta: dict[str, Any]


def _hours(start: str | None, end: str | None) -> float | None:
    if not start or not end:
        return None
    try:
        a = datetime.fromisoformat(start.replace('Z', '+00:00')).astimezone(UTC)
        b = datetime.fromisoformat(end.replace('Z', '+00:00')).astimezone(UTC)
        return max(0.0, (b - a).total_seconds() / 3600)
    except ValueError:
        return None


def _rate(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _band(score: float | None) -> str:
    if score is None:
        return 'unknown'
    if score >= 70:
        return '70_plus'
    if score >= 50:
        return '50_to_69'
    return 'below_50'


@router.get('/analytics/application-summary', response_model=AnalyticsResponse)
def application_summary(
    request: Request,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
    date_from: str | None = Query(default=None, max_length=64),
    date_to: str | None = Query(default=None, max_length=64),
    source: str | None = Query(default=None, max_length=32),
    role_family: str | None = Query(default=None, max_length=64),
    search_profile_id: str | None = Query(default=None, max_length=128),
    score_band: str | None = Query(default=None, max_length=32),
) -> AnalyticsResponse:
    del client_identity
    session = _require_db(db)
    apps = session.execute(select(Application).join(Vacancy)).scalars().all()
    if source or role_family or search_profile_id:
        allowed_vacancy_ids: set[str] | None = None
        if search_profile_id:
            allowed_vacancy_ids = {
                row[0]
                for row in session.execute(
                    select(VacancySearchProfileHit.vacancy_id).where(
                        VacancySearchProfileHit.search_profile_id == search_profile_id
                    )
                )
            }
        apps = [
            app
            for app in apps
            if (not source or app.vacancy.source == source)
            and (not role_family or app.vacancy.role_family == role_family)
            and (allowed_vacancy_ids is None or app.vacancy_id in allowed_vacancy_ids)
        ]
    if score_band:
        apps = [app for app in apps if _band(app.score) == score_band]
    if date_from:
        apps = [app for app in apps if (app.applied_at or '') >= date_from]
    if date_to:
        apps = [app for app in apps if (app.applied_at or '') <= date_to]
    app_ids = [app.id for app in apps]
    events = (
        session.execute(
            select(ApplicationEvent).where(ApplicationEvent.application_id.in_(app_ids))
        )
        .scalars()
        .all()
        if app_ids
        else []
    )
    by_app: dict[str, list[ApplicationEvent]] = defaultdict(list)
    for event in events:
        by_app[event.application_id].append(event)
    applied = [
        app
        for app in apps
        if app.status != 'new'
        and app.applied_at is not None
        and any(e.event_type == 'application_confirmed' for e in by_app[app.id])
    ]
    response_times: list[float] = []
    responses = interviews = offers = 0
    for app in applied:
        status = app.status
        if status in RESPONSE_STATUSES:
            responses += 1
        if status in INTERVIEW_STATUSES:
            interviews += 1
        if status == 'offer':
            offers += 1
        response_events = [
            e
            for e in by_app[app.id]
            if e.event_type == 'status_changed' and _event_to(e) in RESPONSE_STATUSES
        ]
        if response_events:
            delta = _hours(app.applied_at, min(e.occurred_at for e in response_events))
            if delta is not None:
                response_times.append(delta)
    pending = len(applied) - responses
    runs = (
        session.execute(
            select(EngineRun).where(EngineRun.vacancy_id.in_([app.vacancy_id for app in apps]))
        )
        .scalars()
        .all()
        if apps
        else []
    )
    tokens_in = sum(run.token_input or 0 for run in runs)
    tokens_out = sum(run.token_output or 0 for run in runs)
    costs = [run.estimated_cost for run in runs if run.estimated_cost is not None]
    sessions = session.execute(select(ApplicationSession)).scalars().all()
    completed_items = sum(
        1
        for item in session.execute(select(ApplicationSessionItem)).scalars().all()
        if item.queue_state in {'READY_FOR_MANUAL_APPLY', 'APPLIED_CONFIRMED'}
    )
    elapsed = [
        _hours(item_session.started_at, item_session.completed_at)
        for item_session in sessions
        if item_session.completed_at
    ]
    processing: list[float] = []
    for item in session.execute(select(ApplicationSessionItem)).scalars().all():
        duration = _hours(item.started_at, item.completed_at)
        if duration is not None:
            processing.append(duration * 60)
    breakdowns: dict[str, list[Breakdown]] = {}
    for dimension, key_fn in {
        'score_band': lambda a: _band(a.score),
        'role_family': lambda a: a.vacancy.role_family or 'unknown',
        'source': lambda a: a.vacancy.source,
    }.items():
        groups: dict[str, list[Application]] = defaultdict(list)
        for app in applied:
            groups[key_fn(app)].append(app)
        breakdowns[dimension] = [
            Breakdown(
                key=key,
                sample_size=len(group),
                applied=len(group),
                responses=sum(a.status in RESPONSE_STATUSES for a in group),
                response_rate=_rate(sum(a.status in RESPONSE_STATUSES for a in group), len(group)),
                interviews=sum(a.status in INTERVIEW_STATUSES for a in group),
                interview_rate=_rate(
                    sum(a.status in INTERVIEW_STATUSES for a in group), len(group)
                ),
            )
            for key, group in sorted(groups.items())
        ]
    # A vacancy may be attributed to multiple profiles. This is an explicit
    # attribution breakdown, while the funnel above counts each application once.
    profile_rows = (
        session.execute(
            select(VacancySearchProfileHit, SearchProfile.name)
            .join(SearchProfile, SearchProfile.id == VacancySearchProfileHit.search_profile_id)
            .where(VacancySearchProfileHit.vacancy_id.in_([app.vacancy_id for app in applied]))
        ).all()
        if applied
        else []
    )
    profile_groups: dict[str, list[Application]] = defaultdict(list)
    app_by_vacancy = {app.vacancy_id: app for app in applied}
    for hit, name in profile_rows:
        profile_app = app_by_vacancy.get(hit.vacancy_id)
        if profile_app is not None:
            profile_groups[name].append(profile_app)
    breakdowns['search_profile'] = [
        Breakdown(
            key=key,
            sample_size=len(group),
            applied=len(group),
            responses=sum(a.status in RESPONSE_STATUSES for a in group),
            response_rate=_rate(sum(a.status in RESPONSE_STATUSES for a in group), len(group)),
            interviews=sum(a.status in INTERVIEW_STATUSES for a in group),
            interview_rate=_rate(sum(a.status in INTERVIEW_STATUSES for a in group), len(group)),
        )
        for key, group in sorted(profile_groups.items())
    ]
    state = (
        'NO_DATA'
        if not applied
        else ('SMALL_SAMPLE' if len(applied) < 5 else 'SUFFICIENT_FOR_DESCRIPTIVE_VIEW')
    )
    total_cost = round(sum(costs), 8) if costs and len(costs) == len(runs) else None
    return AnalyticsResponse(
        data=AnalyticsData(
            state=state,
            applications_applied=len(applied),
            responses=responses,
            response_rate=_rate(responses, len(applied)),
            interviews=interviews,
            interview_rate=_rate(interviews, len(applied)),
            offers=offers,
            pending=pending,
            median_response_hours=round(float(median(response_times)), 2)
            if response_times
            else None,
            response_time_sample=len(response_times),
            sessions=len(sessions),
            completed_items=completed_items,
            session_elapsed_hours=round(float(median([x for x in elapsed if x is not None])), 2)
            if any(x is not None for x in elapsed)
            else None,
            median_processing_minutes=round(float(median(processing)), 2) if processing else None,
            v4_input_tokens=tokens_in,
            v4_output_tokens=tokens_out,
            estimated_cost_usd=total_cost,
            estimated_cost_per_applied_usd=round(total_cost / len(applied), 8)
            if total_cost is not None and applied
            else None,
            cached_run_count=None,
            breakdowns=breakdowns,
        ),
        meta={'request_id': str(request.state.request_id)},
    )


def _event_to(event: ApplicationEvent) -> str | None:
    if not event.payload_json:
        return None
    try:
        payload = json.loads(event.payload_json)
        return payload.get('to_status') if isinstance(payload, dict) else None
    except json.JSONDecodeError:
        return None
