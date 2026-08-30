"""Capability discovery and degraded applicant-sync acceptance tests."""

from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import HHAccount, HHSyncRun
from app.hh.client import HHApiClient
from app.hh.errors import HHApiError
from app.security.pairing import generate_client_token, hash_client_token


class _OAuth:
    def access_token(self) -> str:
        return 'access-token-for-test'


def _handler(calls: list[httpx.Request]):
    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.method == 'GET'
        if request.url.path == '/me':
            return httpx.Response(
                200,
                json={
                    'auth_type': 'applicant',
                    'is_applicant': True,
                    'is_employer': False,
                    'resumes_url': 'https://api.hh.ru/resumes/mine',
                    'negotiations_url': 'https://api.hh.ru/negotiations',
                },
            )
        return httpx.Response(403, json={'errors': [{'type': 'forbidden'}]})

    return handle


def test_optional_403_is_denied_without_retry_or_write() -> None:
    calls: list[httpx.Request] = []
    client = HHApiClient(oauth=_OAuth(), transport=httpx.MockTransport(_handler(calls)))

    result = client.discover_capabilities()

    assert result['account']['status'] == 'AVAILABLE'
    assert result['account']['auth_type'] == 'applicant'
    assert result['resumes']['status'] == 'DENIED_BY_HH'
    assert result['negotiations']['status'] == 'DENIED_BY_HH'
    assert result['resumes']['http_status'] == 403
    assert [request.url.path for request in calls] == ['/me', '/resumes/mine', '/negotiations']
    assert all(request.method == 'GET' for request in calls)


def test_canonical_urls_are_allowlisted_and_invalid_hosts_rejected() -> None:
    calls: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.path == '/me':
            return httpx.Response(
                200,
                json={
                    'auth_type': 'applicant',
                    'is_applicant': True,
                    'is_employer': False,
                    'resumes_url': 'https://api.hh.ru/resumes/mine',
                    'negotiations_url': 'https://api.hh.ru/negotiations',
                },
            )
        return httpx.Response(200, json={'items': []})

    result = HHApiClient(
        oauth=_OAuth(), transport=httpx.MockTransport(handle)
    ).discover_capabilities()
    assert result['resumes']['status'] == 'AVAILABLE'
    assert [request.url.path for request in calls] == ['/me', '/resumes/mine', '/negotiations']

    def invalid(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                'auth_type': 'applicant',
                'is_applicant': True,
                'is_employer': False,
                'resumes_url': 'https://evil.example/resumes/mine',
            },
        )

    with pytest.raises(HHApiError, match='HH_RESOURCE_URL_INVALID'):
        HHApiClient(oauth=_OAuth(), transport=httpx.MockTransport(invalid)).discover_capabilities()


def test_authentication_failure_is_distinct_from_capability_denial() -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={'errors': [{'type': 'unauthorized'}]})

    with pytest.raises(HHApiError) as caught:
        HHApiClient(oauth=_OAuth(), transport=httpx.MockTransport(handle)).discover_capabilities()
    assert caught.value.status_code == 401
    assert caught.value.code == 'HH_UNAUTHORIZED'


def _auth(db: Session) -> dict[str, str]:
    token = generate_client_token()
    db.execute(
        text(
            'INSERT OR REPLACE INTO settings '
            '(key, value_json, revision, created_at, updated_at) '
            'VALUES (:key, :value, 1, :now, :now)'
        ),
        {
            'key': 'pairing_client_token_hash',
            'value': hash_client_token(token),
            'now': '2026-08-30T00:00:00Z',
        },
    )
    db.commit()
    return {'X-VacancyPilot-Client': token}


def test_sync_returns_safe_denials_and_persists_capability_state(
    client_with_db: TestClient, db_session: Session, monkeypatch
) -> None:
    capabilities = {
        'account': {
            'status': 'AVAILABLE',
            'auth_type': 'applicant',
            'is_applicant': True,
            'is_employer': False,
            'resumes_url_present': True,
            'negotiations_url_present': True,
        },
        'resumes': {
            'status': 'DENIED_BY_HH',
            'http_status': 403,
            'error_code': 'HH_FORBIDDEN',
        },
        'negotiations': {
            'status': 'DENIED_BY_HH',
            'http_status': 403,
            'error_code': 'HH_FORBIDDEN',
        },
        'write_actions': 'FORBIDDEN_BY_PRODUCT',
    }

    class FakeClient:
        def __init__(self, **kwargs):
            del kwargs

        def discover_capabilities(self):
            return capabilities

    monkeypatch.setattr('app.api.hh.HHApiClient', FakeClient)
    response = client_with_db.post('/api/v1/hh/sync/applicant', headers=_auth(db_session), json={})

    assert response.status_code == 200
    body = response.json()['data']
    assert body['status'] == 'partial'
    assert body['resumes'] == {
        'status': 'DENIED_BY_HH',
        'http_status': 403,
        'error_code': 'HH_FORBIDDEN',
    }
    assert body['negotiations']['status'] == 'DENIED_BY_HH'
    assert 'token' not in response.text.lower()
    account = db_session.execute(select(HHAccount)).scalar_one()
    assert json.loads(account.capabilities_json or '{}')['resumes']['status'] == 'DENIED_BY_HH'
    assert db_session.execute(select(HHSyncRun)).scalar_one().status == 'partial'
