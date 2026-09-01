"""Official HH public vacancy search, profiles, and manual sync."""

from __future__ import annotations

import json
import webbrowser
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import new_uuid
from app.db.models import HHAccount, HHSyncRun, SearchProfile, VacancySearchProfileHit
from app.db.session import get_db_session_long
from app.domain.triage import TriageConfig, TriageVacancy, triage_vacancy
from app.domain.vacancy_intake import VacancyIntakeService
from app.hh.client import HHApiClient
from app.hh.errors import HHApiError, HHConfigurationError
from app.hh.models import HHSearchProfileInput, HHSearchProfilePatch, HHSearchQuery
from app.hh.normalize import normalize_vacancy
from app.hh.oauth import get_oauth_service
from app.security.auth import ClientTokenDep
from app.security.keyring import OSKeyring, SecretSlot

router = APIRouter(tags=['hh'])
PER_PAGE = 100


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _db(db: Session | None) -> Session:
    if db is None:
        raise HTTPException(status_code=503, detail='Database unavailable')
    return db


def _meta(request: Request) -> dict[str, str]:
    return {'request_id': str(request.state.request_id)}


def _profile_out(row: SearchProfile) -> dict[str, Any]:
    return {
        'id': row.id,
        'name': row.name,
        'query': json.loads(row.query_json),
        'enabled': row.enabled,
        'last_run_at': row.last_run_at,
        'revision': row.revision,
        'created_at': row.created_at,
        'updated_at': row.updated_at,
    }


class ProfileListResponse(BaseModel):
    data: list[dict[str, Any]]
    meta: dict[str, Any]


class ProfileResponse(BaseModel):
    data: dict[str, Any]
    meta: dict[str, str]


class VacancySyncRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    profile_ids: list[str] | None = Field(default=None, max_length=50)
    triage: dict[str, Any] | None = None


class SyncResponse(BaseModel):
    data: dict[str, Any]
    meta: dict[str, str]


@router.get('/integrations/hh/status', response_model=dict[str, Any])
def hh_status(request: Request, client_identity: ClientTokenDep) -> dict[str, Any]:
    del client_identity
    configured = bool(OSKeyring().get_secret(SecretSlot.HH_APPLICATION_TOKEN))
    oauth = get_oauth_service().status()
    return {
        'data': {
            'application_token_configured': configured,
            'public_api_available': configured,
            'user_oauth_connected': oauth['connected'],
            'oauth_app_configured': oauth['oauth_app_configured'],
            'refresh_token_configured': oauth['refresh_token_configured'],
            'last_public_sync_at': None,
            'last_error_code': None,
        },
        'meta': _meta(request),
    }


@router.post('/hh/auth/start', response_model=dict[str, Any])
def oauth_start(request: Request, client_identity: ClientTokenDep) -> dict[str, Any]:
    del client_identity
    try:
        data = get_oauth_service().start()
    except HHConfigurationError as exc:
        raise HTTPException(status_code=503, detail=exc.code) from exc
    webbrowser.open(data['authorization_url'], new=2)
    return {'data': data, 'meta': _meta(request)}


@router.get('/hh/auth/callback', response_class=HTMLResponse, include_in_schema=False)
def oauth_callback_browser(
    request: Request, state: str = '', code: str = '', error: str = ''
) -> HTMLResponse:
    """Handle HH's top-level browser redirect without client-token headers."""
    del request
    if error or not state or not code:
        return HTMLResponse(
            '<h1>VacancyPilot HH authorization failed</h1><p>You may close this window.</p>',
            status_code=400,
        )
    try:
        get_oauth_service().callback(state=state, code=code)
    except HHApiError:
        return HTMLResponse(
            '<h1>VacancyPilot HH authorization failed</h1><p>You may close this window.</p>',
            status_code=400,
        )
    return HTMLResponse('<h1>VacancyPilot HH connected</h1><p>You may close this window.</p>')


@router.get('/hh/capabilities', response_model=dict[str, Any])
def hh_capabilities(
    request: Request,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> dict[str, Any]:
    del client_identity
    try:
        capabilities = HHApiClient(oauth=get_oauth_service()).discover_capabilities()
    except HHConfigurationError as exc:
        raise HTTPException(status_code=503, detail=exc.code) from exc
    except HHApiError as exc:
        code = 'HH_OAUTH_AUTHENTICATION_FAILED' if exc.status_code == 401 else exc.code
        raise HTTPException(status_code=503, detail=code) from exc
    _persist_capabilities(db, capabilities)
    return {
        'data': capabilities,
        'meta': _meta(request),
    }


@router.post('/hh/auth/disconnect', response_model=dict[str, Any])
def oauth_disconnect(request: Request, client_identity: ClientTokenDep) -> dict[str, Any]:
    del client_identity
    get_oauth_service().disconnect()
    return {'data': {'connected': False}, 'meta': _meta(request)}


@router.post('/hh/sync/applicant', response_model=dict[str, Any])
@router.post('/hh/sync/resumes', response_model=dict[str, Any])
@router.post('/hh/sync/negotiations', response_model=dict[str, Any])
def sync_applicant(
    request: Request,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> dict[str, Any]:
    """Read-only applicant projection; no HH mutation and no raw payload storage."""
    del client_identity
    client = HHApiClient(oauth=get_oauth_service())
    try:
        capabilities = client.discover_capabilities()
    except HHConfigurationError as exc:
        raise HTTPException(status_code=503, detail=exc.code) from exc
    except HHApiError as exc:
        code = 'HH_OAUTH_AUTHENTICATION_FAILED' if exc.status_code == 401 else exc.code
        raise HTTPException(status_code=503, detail=code) from exc
    _persist_capabilities(db, capabilities, sync=True)
    result = {
        'capabilities': capabilities,
        'resumes': _safe_capability_result(capabilities['resumes']),
        'negotiations': _safe_capability_result(capabilities['negotiations']),
        'status': (
            'partial'
            if any(
                value['status'] in {'DENIED_BY_HH', 'ERROR'}
                for value in (capabilities['resumes'], capabilities['negotiations'])
            )
            else 'success'
        ),
    }
    return {
        'data': result,
        'meta': _meta(request),
    }


def _safe_capability_result(value: dict[str, Any]) -> dict[str, Any]:
    """Expose capability state and counts, never an upstream payload."""
    allowed = ('status', 'http_status', 'error_code', 'items_count')
    return {key: value[key] for key in allowed if key in value}


def _persist_capabilities(
    db: Session | None, capabilities: dict[str, Any], *, sync: bool = False
) -> None:
    """Persist only capability metadata and a safe append-only sync audit."""
    if db is None:
        return
    account = db.execute(select(HHAccount).order_by(HHAccount.created_at.asc())).scalars().first()
    if account is None:
        account = HHAccount()
        db.add(account)
    account.connected = capabilities['account']['status'] == 'AVAILABLE'
    account.capabilities_json = json.dumps(capabilities, separators=(',', ':'))
    account.last_sync_at = _now()
    account.revision = (account.revision or 0) + 1
    if sync:
        states = (capabilities['resumes'], capabilities['negotiations'])
        status = 'partial' if any(item['status'] != 'AVAILABLE' for item in states) else 'success'
        db.add(
            HHSyncRun(
                id=new_uuid(),
                sync_type='applicant_capabilities',
                status=status,
                items_seen=sum(item.get('items_count', 0) for item in states),
                items_created=0,
                items_updated=0,
                error_summary=json.dumps(
                    [item.get('error_code') for item in states if item.get('error_code')]
                )
                or None,
                result_json=json.dumps(capabilities, separators=(',', ':')),
                started_at=_now(),
                finished_at=_now(),
            )
        )
    db.commit()


@router.get('/hh/search-profiles', response_model=ProfileListResponse)
def list_profiles(
    request: Request,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> ProfileListResponse:
    del client_identity
    rows = (
        _db(db)
        .execute(select(SearchProfile).order_by(SearchProfile.created_at.asc()))
        .scalars()
        .all()
    )
    return ProfileListResponse(
        data=[_profile_out(row) for row in rows], meta={**_meta(request), 'count': len(rows)}
    )


@router.post('/hh/search-profiles', response_model=ProfileResponse, status_code=201)
def create_profile(
    request: Request,
    body: HHSearchProfileInput,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> ProfileResponse:
    del client_identity
    session = _db(db)
    row = SearchProfile(
        name=body.name.strip(),
        query_json=body.query.model_dump_json(),
        enabled=body.enabled,
        schedule=None,
    )
    session.add(row)
    session.commit()
    return ProfileResponse(data=_profile_out(row), meta=_meta(request))


@router.patch('/hh/search-profiles/{profile_id}', response_model=ProfileResponse)
def update_profile(
    request: Request,
    profile_id: str,
    body: HHSearchProfilePatch,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> ProfileResponse:
    del client_identity
    session = _db(db)
    row = session.get(SearchProfile, profile_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Profile not found')
    if row.revision != body.revision:
        raise HTTPException(status_code=409, detail='Profile revision is stale')
    if body.name is not None:
        row.name = body.name.strip()
    if body.query is not None:
        row.query_json = body.query.model_dump_json()
    if body.enabled is not None:
        row.enabled = body.enabled
    row.revision += 1
    row.updated_at = _now()
    session.commit()
    return ProfileResponse(data=_profile_out(row), meta=_meta(request))


def _triage_if_requested(normalized: Any, config: dict[str, Any] | None) -> bool:
    if not config:
        return False
    result = triage_vacancy(
        TriageVacancy(
            source=normalized.source,
            source_vacancy_id=normalized.source_vacancy_id,
            title=normalized.title,
            company_name=normalized.company_name,
            work_mode=normalized.work_mode,
            city=normalized.city,
            experience_raw=normalized.experience,
            description=normalized.description,
            skills=normalized.skills,
            salary_min=normalized.salary_min,
            salary_max=normalized.salary_max,
            currency=normalized.currency,
            archived=False,
            seen_before=False,
        ),
        TriageConfig(
            **{
                key: value
                for key, value in config.items()
                if key in TriageConfig.__dataclass_fields__
            }
        ),
    )
    return result.engine == 'stage_a'


@router.post('/hh/sync/vacancies', response_model=SyncResponse)
def sync_vacancies(
    request: Request,
    body: VacancySyncRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> SyncResponse:
    del client_identity
    session = _db(db)
    statement = select(SearchProfile).where(SearchProfile.enabled.is_(True))
    if body.profile_ids is not None:
        statement = statement.where(SearchProfile.id.in_(body.profile_ids))
    profiles = session.execute(statement.order_by(SearchProfile.created_at.asc())).scalars().all()
    result: dict[str, Any] = {
        'sync_run_id': '',
        'profiles_attempted': len(profiles),
        'pages_fetched': 0,
        'items_seen': 0,
        'vacancies_created': 0,
        'vacancies_updated': 0,
        'vacancies_unchanged': 0,
        'snapshots_created': 0,
        'triaged': 0,
        'rate_limited': 0,
        'errors': [],
        'started_at': _now(),
        'finished_at': None,
        'status': 'running',
    }
    result['sync_run_id'] = new_uuid()
    touched_hits: list[VacancySearchProfileHit] = []
    client = HHApiClient()
    for profile in profiles:
        try:
            # ``schema_version`` is storage metadata, not an HH API query
            # parameter.  Re-validate at this boundary and serialize only
            # the allowlisted query fields before calling the client.
            query = HHSearchQuery.model_validate(json.loads(profile.query_json)).model_dump(
                exclude_none=True, exclude_defaults=True
            )
            max_pages = 2000 // PER_PAGE
            for page, _ in enumerate(range(max_pages)):
                response = client.search_vacancies(query, page=page, per_page=PER_PAGE)
                result['pages_fetched'] += 1
                items = response.items
                result['items_seen'] += len(items)
                for item in items:
                    normalized = normalize_vacancy(item)
                    intake = VacancyIntakeService(session).intake(
                        normalized,
                        f'hh:{profile.id}:{normalized.source_vacancy_id}:{normalized.content_hash}',
                    )
                    # Preserve multi-profile discovery provenance without
                    # duplicating the canonical vacancy row.
                    hit = session.execute(
                        select(VacancySearchProfileHit).where(
                            VacancySearchProfileHit.vacancy_id == intake.vacancy_id,
                            VacancySearchProfileHit.search_profile_id == profile.id,
                        )
                    ).scalar_one_or_none()
                    if hit is None:
                        hit = VacancySearchProfileHit(
                            vacancy_id=intake.vacancy_id,
                            search_profile_id=profile.id,
                            # The append-only audit row is inserted after
                            # item processing; attach the run ID below.
                            last_sync_run_id=None,
                        )
                        session.add(hit)
                    else:
                        hit.last_seen_at = _now()
                        hit.hit_count += 1
                    # Resolve the run FK only after the final audit row is
                    # pending, so intake's intermediate flushes remain valid.
                    touched_hits.append(hit)
                    result_key = f'vacancies_{intake.result}'
                    result[result_key] += 1
                    if intake.snapshot_id and intake.result in ('created', 'updated'):
                        result['snapshots_created'] += 1
                    if _triage_if_requested(normalized, body.triage):
                        result['triaged'] += 1
                if not items or page + 1 >= response.pages or page + 1 >= max_pages:
                    break
            profile.last_run_at = _now()
            profile.updated_at = _now()
        except HHApiError as exc:
            if exc.code == 'HH_RATE_LIMITED':
                result['rate_limited'] += 1
            result['errors'].append({'profile_id': profile.id, 'code': exc.code})
        except (ValueError, TypeError, json.JSONDecodeError):
            result['errors'].append(
                {'profile_id': profile.id, 'code': 'HH_PROFILE_OR_PAYLOAD_INVALID'}
            )
    result['finished_at'] = _now()
    result['status'] = (
        'error'
        if not profiles and result['errors']
        else ('partial' if result['errors'] else 'success')
    )
    audit = HHSyncRun(
        id=result['sync_run_id'],
        sync_type='public_vacancies',
        status=result['status'],
        items_seen=result['items_seen'],
        items_created=result['vacancies_created'],
        items_updated=result['vacancies_updated'],
        error_summary=json.dumps(result['errors']) if result['errors'] else None,
        result_json=json.dumps(result),
        started_at=result['started_at'],
        finished_at=result['finished_at'],
    )
    session.add(audit)
    for hit in touched_hits:
        hit.last_sync_run_id = result['sync_run_id']
    session.commit()
    return SyncResponse(data=result, meta=_meta(request))
