"""AOPS-10 official client and normalization safety tests."""

from __future__ import annotations

import httpx
import pytest

from app.hh.client import HHApiClient
from app.hh.errors import HHApiError
from app.hh.normalize import normalize_vacancy
from app.security.keyring import FakeKeyring, SecretSlot


def _client(handler):
    keyring = FakeKeyring()
    keyring.set_secret(SecretSlot.HH_APPLICATION_TOKEN, 'test-token')
    return HHApiClient(keyring=keyring, transport=httpx.MockTransport(handler))


def test_client_sends_official_headers_and_bounded_query() -> None:
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.headers)
        assert request.url.host == 'api.hh.ru'
        assert request.url.params['page'] == '0'
        assert request.url.params['per_page'] == '100'
        return httpx.Response(200, json={'items': [], 'page': 0, 'pages': 0, 'per_page': 100})

    _client(handler).search_vacancies({'text': 'python'}, page=0, per_page=100)
    assert seen['authorization'] == 'Bearer test-token'
    assert seen['user-agent'].startswith('VacancyPilot/')
    assert seen['hh-user-agent'].startswith('VacancyPilot/')


def test_client_retries_429_and_tolerates_additive_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            return httpx.Response(429, headers={'Retry-After': '999'})
        return httpx.Response(
            200, json={'items': [], 'page': 0, 'pages': 1, 'per_page': 100, 'future': {'x': 1}}
        )

    monkeypatch.setattr('app.hh.client.time.sleep', lambda _: None)
    result = _client(handler).search_vacancies({}, page=0, per_page=100)
    assert attempts == 3
    assert result.items == []


def test_client_maps_http_errors_without_body_or_token() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={'description': 'Bearer test-token leaked upstream'})

    with pytest.raises(HHApiError) as raised:
        _client(handler).search_vacancies({}, page=0, per_page=1)
    assert raised.value.code == 'HH_FORBIDDEN'
    assert 'token' not in str(raised.value).lower()


def test_client_rejects_unbounded_pagination() -> None:
    with pytest.raises(HHApiError, match='HH_PAGINATION_LIMIT'):
        _client(lambda _: httpx.Response(200, json={})).search_vacancies({}, page=20, per_page=101)


def test_normalization_sanitizes_html_and_preserves_identity() -> None:
    normalized = normalize_vacancy(
        {
            'id': '123',
            'name': 'Backend <b>Engineer</b>',
            'alternate_url': 'https://hh.ru/vacancy/123',
            'employer': {'id': '9', 'name': 'Example'},
            'area': {'id': '1', 'name': 'Chisinau'},
            'description': '<p>Build &amp; test</p>',
            'key_skills': [{'name': 'Python'}, {'name': 'Python'}],
        }
    )
    assert normalized.source == 'hh'
    assert normalized.source_vacancy_id == '123'
    assert normalized.description == 'Build & test'
    assert normalized.skills == ('Python',)
    assert '<' not in normalized.title
