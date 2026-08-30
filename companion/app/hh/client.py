"""Bounded, official-only HH public API client."""

from __future__ import annotations

import json
import logging
import random
import time
from typing import Any
from urllib.parse import urljoin

import httpx

from app.hh.errors import HHApiError, HHConfigurationError
from app.hh.models import HHPage
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
        self, *, keyring: Any | None = None, transport: httpx.BaseTransport | None = None
    ) -> None:
        self._keyring = keyring or OSKeyring()
        self._transport = transport

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


def _retry_after(value: str | None) -> float:
    try:
        return min(max(float(value or 0), 0.0), 2.0)
    except ValueError:
        return 0.2 + random.random() * 0.1


def _status_code(status: int) -> str:
    return {
        400: 'HH_BAD_REQUEST',
        401: 'HH_UNAUTHORIZED',
        403: 'HH_FORBIDDEN',
        404: 'HH_NOT_FOUND',
        429: 'HH_RATE_LIMITED',
    }.get(status, f'HH_HTTP_{status}')
