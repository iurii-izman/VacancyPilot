"""Bounded, official-only HH public API client."""

from __future__ import annotations

import json
import logging
import random
import re
import time
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from app.hh.errors import HHApiError, HHConfigurationError
from app.hh.models import HHPage
from app.hh.oauth import HHOAuthService
from app.security.keyring import OSKeyring, SecretSlot

logger = logging.getLogger(__name__)


class HHApiClient:
    BASE_URL = 'https://api.hh.ru/'
    MAX_PER_PAGE = 100
    MAX_RESULTS = 2000
    MAX_RETRIES = 2
    TIMEOUT = 10.0
    ALLOWED_QUERY_KEYS = frozenset(
        {
            'text',
            'area',
            'experience',
            'employment',
            'schedule',
            'salary',
            'only_with_salary',
            'professional_role',
            'search_field',
            'period',
            'order_by',
        }
    )

    def __init__(
        self,
        *,
        keyring: Any | None = None,
        transport: httpx.BaseTransport | None = None,
        oauth: HHOAuthService | None = None,
    ) -> None:
        self._keyring = keyring or OSKeyring()
        self._transport = transport
        self._oauth = oauth

    @staticmethod
    def user_agent() -> str:
        return 'VacancyPilot/0.1 (local-first HH copilot; api-feedback@hh.ru)'

    def search_vacancies(self, query: dict[str, Any], *, page: int, per_page: int) -> HHPage:
        if page < 0 or page > 1999 or per_page < 1 or per_page > self.MAX_PER_PAGE:
            raise HHApiError('HH_PAGINATION_LIMIT')
        if any(key not in self.ALLOWED_QUERY_KEYS for key in query):
            raise HHApiError('HH_QUERY_PARAMETER_FORBIDDEN')
        params = {key: value for key, value in query.items() if value not in (None, '', [], False)}
        params.update(page=page, per_page=per_page)
        return HHPage.model_validate(self._request('GET', '/vacancies', params=params))

    def _request(
        self, method: str, path: str, *, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        if method != 'GET':
            raise HHApiError('HH_WRITE_METHOD_FORBIDDEN')
        token = self._keyring.get_secret(SecretSlot.HH_APPLICATION_TOKEN)
        if not token:
            raise HHConfigurationError()
        headers = {
            'Authorization': f'Bearer {token}',
            'User-Agent': self.user_agent(),
            'HH-User-Agent': self.user_agent(),
            'Accept': 'application/json',
        }
        url = urljoin(self.BASE_URL, path.lstrip('/'))
        for attempt in range(self.MAX_RETRIES + 1):
            try:
                with httpx.Client(
                    timeout=self.TIMEOUT, transport=self._transport, follow_redirects=False
                ) as client:
                    response = client.request(method, url, params=params, headers=headers)
            except httpx.RequestError as exc:
                if attempt >= self.MAX_RETRIES:
                    logger.warning('HH request failed code=HH_NETWORK_ERROR')
                    raise HHApiError('HH_NETWORK_ERROR') from exc
                time.sleep(0.05 * (attempt + 1))
                continue
            if (
                response.status_code == 429 or 500 <= response.status_code <= 599
            ) and attempt < self.MAX_RETRIES:
                delay = (
                    _retry_after(response.headers.get('Retry-After'))
                    if response.status_code == 429
                    else 0.1 * (attempt + 1)
                )
                time.sleep(delay)
                continue
            if response.status_code >= 400:
                raise HHApiError(_status_code(response.status_code), response.status_code)
            try:
                payload = response.json()
            except (ValueError, json.JSONDecodeError) as exc:
                raise HHApiError('HH_INVALID_JSON', response.status_code) from exc
            if not isinstance(payload, dict):
                raise HHApiError('HH_INVALID_JSON', response.status_code)
            return payload
        raise HHApiError('HH_RETRY_EXHAUSTED')

    def _oauth_request(
        self, path: str, *, params: dict[str, Any] | None = None
    ) -> dict[str, Any] | list[Any]:
        if self._oauth is None:
            raise HHConfigurationError('HH OAuth user authorization is not configured')
        headers = {
            'Authorization': f'Bearer {self._oauth.access_token()}',
            'User-Agent': self.user_agent(),
            'HH-User-Agent': self.user_agent(),
            'Accept': 'application/json',
        }
        try:
            with httpx.Client(
                timeout=self.TIMEOUT, transport=self._transport, follow_redirects=False
            ) as client:
                response = client.get(
                    urljoin(self.BASE_URL, path.lstrip('/')), params=params, headers=headers
                )
        except httpx.RequestError as exc:
            raise HHApiError('HH_NETWORK_ERROR') from exc
        if response.status_code >= 400:
            raise HHApiError(_status_code(response.status_code), response.status_code)
        try:
            payload = response.json()
        except ValueError as exc:
            raise HHApiError('HH_INVALID_JSON', response.status_code) from exc
        if not isinstance(payload, (dict, list)):
            raise HHApiError('HH_INVALID_JSON', response.status_code)
        return payload

    def applicant_resumes(self) -> dict[str, Any] | list[Any]:
        return self._oauth_request('/resumes/mine')

    def current_user(self) -> dict[str, Any] | list[Any]:
        return self._oauth_request('/me')

    def negotiations(self, *, status: str | None = None) -> dict[str, Any] | list[Any]:
        return self._oauth_request('/negotiations', params={'status': status} if status else None)

    def negotiation(self, negotiation_id: str) -> dict[str, Any] | list[Any]:
        _validate_resource_id(negotiation_id)
        return self._oauth_request(f'/negotiations/{negotiation_id}')

    def negotiation_messages(self, negotiation_id: str) -> dict[str, Any] | list[Any]:
        _validate_resource_id(negotiation_id)
        return self._oauth_request(f'/negotiations/{negotiation_id}/messages')

    def discover_capabilities(self) -> dict[str, Any]:
        """Probe account and optional applicant reads without blind retries."""
        account = self.current_user()
        if not isinstance(account, dict):
            raise HHApiError('HH_ACCOUNT_PAYLOAD_INVALID')
        result: dict[str, Any] = {
            'account': {
                'status': 'AVAILABLE',
                'auth_type': account.get('auth_type'),
                'is_applicant': account.get('is_applicant'),
                'is_employer': account.get('is_employer'),
                'resumes_url_present': isinstance(account.get('resumes_url'), str),
                'negotiations_url_present': isinstance(account.get('negotiations_url'), str),
            },
            'resumes': self._probe_capability(
                _official_resource_path(account.get('resumes_url'), '/resumes/mine')
            ),
            'negotiations': self._probe_capability(
                _official_resource_path(account.get('negotiations_url'), '/negotiations')
            ),
            'write_actions': 'FORBIDDEN_BY_PRODUCT',
        }
        return result

    def _probe_capability(self, path: str) -> dict[str, Any]:
        try:
            payload = self._oauth_request(path)
        except HHApiError as exc:
            if exc.status_code == 403:
                return {'status': 'DENIED_BY_HH', 'http_status': 403, 'error_code': exc.code}
            if exc.status_code == 401:
                raise HHApiError('HH_OAUTH_AUTHENTICATION_FAILED', exc.status_code) from exc
            return {'status': 'ERROR', 'error_code': exc.code}
        items = payload.get('items', []) if isinstance(payload, dict) else payload
        return {
            'status': 'AVAILABLE',
            'items_count': len(items) if isinstance(items, list) else 0,
        }


def _retry_after(value: str | None) -> float:
    try:
        return min(max(float(value or 0), 0.0), 2.0)
    except ValueError:
        return 0.2 + random.random() * 0.1


def _validate_resource_id(value: str) -> None:
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value):
        raise HHApiError('HH_RESOURCE_ID_INVALID')


def _official_resource_path(value: Any, fallback: str) -> str:
    """Accept only canonical paths returned by /me on the official API host."""
    if not isinstance(value, str):
        return fallback
    parsed = urlparse(value)
    if (
        parsed.scheme != 'https'
        or parsed.netloc != 'api.hh.ru'
        or parsed.params
        or parsed.query
        or parsed.fragment
        or parsed.path not in {'/resumes/mine', '/negotiations'}
    ):
        raise HHApiError('HH_RESOURCE_URL_INVALID')
    return parsed.path


def _status_code(status: int) -> str:
    return {
        400: 'HH_BAD_REQUEST',
        401: 'HH_UNAUTHORIZED',
        403: 'HH_FORBIDDEN',
        404: 'HH_NOT_FOUND',
        429: 'HH_RATE_LIMITED',
    }.get(status, f'HH_HTTP_{status}')
