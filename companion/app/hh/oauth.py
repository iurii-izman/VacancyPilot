"""Local-only HH OAuth PKCE lifecycle with read-only applicant access."""

from __future__ import annotations

import base64
import hashlib
import secrets
import threading
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import settings
from app.hh.errors import HHApiError, HHConfigurationError
from app.security.keyring import KeyringBackend, OSKeyring, SecretSlot


@dataclass(frozen=True)
class PendingOAuth:
    state: str
    verifier: str
    expires_at: float


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')


class HHOAuthService:
    """Owns OAuth state and access tokens inside the companion process only."""

    AUTHORIZE_URL = 'https://hh.ru/oauth/authorize'
    TOKEN_URL = 'https://api.hh.ru/token'
    API_URL = 'https://api.hh.ru/'
    PENDING_TTL = 300

    def __init__(
        self, *, keyring: KeyringBackend | None = None, transport: httpx.BaseTransport | None = None
    ) -> None:
        self._keyring = keyring or OSKeyring()
        self._transport = transport
        self._pending: dict[str, PendingOAuth] = {}
        self._access_token: str | None = None
        self._expires_at = 0.0
        self._lock = threading.Lock()

    def status(self) -> dict[str, Any]:
        refresh = bool(self._keyring.get_secret(SecretSlot.HH_REFRESH_TOKEN))
        return {
            'oauth_app_configured': bool(
                settings.hh_client_id.strip()
                and settings.hh_redirect_uri.strip()
                and self._keyring.get_secret(SecretSlot.HH_CLIENT_SECRET)
            ),
            'refresh_token_configured': refresh,
            'connected': bool(self._access_token or refresh),
            'token_in_memory': bool(self._access_token),
        }

    def start(self) -> dict[str, Any]:
        self._require_app_config()
        state = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(64)
        self._pending[state] = PendingOAuth(state, verifier, time.time() + self.PENDING_TTL)
        query = urlencode(
            {
                'response_type': 'code',
                'client_id': settings.hh_client_id.strip(),
                'redirect_uri': settings.hh_redirect_uri.strip(),
                'state': state,
                'code_challenge': pkce_challenge(verifier),
                'code_challenge_method': 'S256',
            }
        )
        return {
            'authorization_url': f'{self.AUTHORIZE_URL}?{query}',
            'state': state,
            'expires_in': self.PENDING_TTL,
        }

    def callback(self, *, state: str, code: str) -> dict[str, Any]:
        pending = self._pending.pop(state, None)
        if pending is None or pending.expires_at <= time.time():
            raise HHApiError('HH_OAUTH_STATE_INVALID')
        if not code or len(code) > 4096:
            raise HHApiError('HH_OAUTH_CODE_INVALID')
        self._require_app_config()
        payload = self._token_request(
            {
                'grant_type': 'authorization_code',
                'client_id': settings.hh_client_id.strip(),
                'client_secret': self._client_secret(),
                'redirect_uri': settings.hh_redirect_uri.strip(),
                'code': code,
                'code_verifier': pending.verifier,
            }
        )
        self._accept_tokens(payload)
        return {'connected': True, 'expires_in': payload.get('expires_in')}

    def disconnect(self) -> None:
        self._access_token = None
        self._expires_at = 0.0
        self._keyring.delete_secret(SecretSlot.HH_REFRESH_TOKEN)

    def access_token(self) -> str:
        with self._lock:
            if self._access_token and self._expires_at > time.time() + 30:
                return self._access_token
            refresh = self._keyring.get_secret(SecretSlot.HH_REFRESH_TOKEN)
            if not refresh:
                raise HHConfigurationError(
                    'HH OAuth user authorization is not configured',
                    'HH_OAUTH_USER_AUTHORIZATION_REQUIRED',
                )
            self._require_app_config()
            payload = self._token_request(
                {
                    'grant_type': 'refresh_token',
                    'client_id': settings.hh_client_id.strip(),
                    'client_secret': self._client_secret(),
                    'refresh_token': refresh,
                }
            )
            self._accept_tokens(payload)
            return self._access_token or ''

    def _client_secret(self) -> str:
        secret = self._keyring.get_secret(SecretSlot.HH_CLIENT_SECRET)
        if not secret:
            raise HHConfigurationError(
                'HH OAuth application credentials are not configured',
                'HH_OAUTH_APP_CREDENTIALS_REQUIRED',
            )
        return secret

    @staticmethod
    def _require_app_config() -> None:
        if not settings.hh_client_id.strip() or not settings.hh_redirect_uri.strip():
            raise HHConfigurationError(
                'HH OAuth application credentials are not configured',
                'HH_OAUTH_APP_CREDENTIALS_REQUIRED',
            )

    def _token_request(self, form: dict[str, str]) -> dict[str, Any]:
        try:
            with httpx.Client(
                timeout=10.0, transport=self._transport, follow_redirects=False
            ) as client:
                response = client.post(
                    self.TOKEN_URL,
                    data=form,
                    headers={
                        'Accept': 'application/json',
                        'User-Agent': 'VacancyPilot/0.1 (local-first HH copilot)',
                    },
                )
        except httpx.RequestError as exc:
            raise HHApiError('HH_NETWORK_ERROR') from exc
        if response.status_code >= 400:
            raise HHApiError('HH_OAUTH_TOKEN_REJECTED', response.status_code)
        try:
            payload = response.json()
        except ValueError as exc:
            raise HHApiError('HH_INVALID_JSON', response.status_code) from exc
        if not isinstance(payload, dict) or not isinstance(payload.get('access_token'), str):
            raise HHApiError('HH_OAUTH_TOKEN_INVALID', response.status_code)
        return payload

    def _accept_tokens(self, payload: dict[str, Any]) -> None:
        self._access_token = str(payload['access_token'])
        self._expires_at = time.time() + max(60, int(payload.get('expires_in', 3600)))
        refresh = payload.get('refresh_token')
        if isinstance(refresh, str) and refresh:
            self._keyring.set_secret(SecretSlot.HH_REFRESH_TOKEN, refresh)


_oauth_service = HHOAuthService()


def get_oauth_service() -> HHOAuthService:
    return _oauth_service
