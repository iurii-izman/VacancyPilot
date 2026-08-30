"""Local-only HH OAuth PKCE lifecycle with documented refresh semantics."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import threading
import time
from collections.abc import Callable
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
    """Own OAuth state and token bundle inside the companion process/keyring."""

    AUTHORIZE_URL = 'https://hh.ru/oauth/authorize'
    TOKEN_URL = 'https://api.hh.ru/token'
    PENDING_TTL = 300
    CLOCK: Callable[[], float] = time.time

    def __init__(
        self,
        *,
        keyring: KeyringBackend | None = None,
        transport: httpx.BaseTransport | None = None,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._keyring = keyring or OSKeyring()
        self._transport = transport
        self._clock = clock or self.CLOCK
        self._pending: dict[str, PendingOAuth] = {}
        self._access_token: str | None = None
        self._expires_at = 0.0
        self._lock = threading.Lock()
        self._restore_bundle()

    def status(self) -> dict[str, Any]:
        bundle = self._read_bundle()
        configured = bool(
            settings.hh_client_id.strip()
            and settings.hh_redirect_uri.strip()
            and self._keyring.get_secret(SecretSlot.HH_CLIENT_SECRET)
        )
        return {
            'oauth_app_configured': configured,
            'refresh_token_configured': bool(bundle and bundle.get('refresh_token')),
            'connected': bool(bundle and bundle.get('access_token')),
            'token_in_memory': bool(self._access_token),
            'access_token_valid': self._has_valid_access_token(),
        }

    def start(self) -> dict[str, Any]:
        self._require_app_config()
        state = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(64)
        self._pending[state] = PendingOAuth(state, verifier, self._clock() + self.PENDING_TTL)
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
        if pending is None or pending.expires_at <= self._clock():
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
        self._adopt_tokens(payload, require_refresh=True)
        return {'connected': True, 'expires_in': payload.get('expires_in')}

    def disconnect(self) -> None:
        with self._lock:
            self._access_token = None
            self._expires_at = 0.0
            self._pending.clear()
            self._keyring.delete_secret(SecretSlot.HH_OAUTH_TOKEN_BUNDLE)
            self._keyring.delete_secret(SecretSlot.HH_REFRESH_TOKEN)

    def access_token(self) -> str:
        if self._has_valid_access_token():
            return self._access_token or ''
        with self._lock:
            if self._has_valid_access_token():
                return self._access_token or ''
            bundle = self._read_bundle()
            refresh = bundle.get('refresh_token') if bundle else None
            if not isinstance(refresh, str) or not refresh:
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
            self._adopt_tokens(payload, require_refresh=True)
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
        if (
            settings.hh_client_id.strip() == ''
            or settings.hh_redirect_uri.strip() != 'http://127.0.0.1:8765/api/v1/hh/auth/callback'
        ):
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

    def _adopt_tokens(self, payload: dict[str, Any], *, require_refresh: bool) -> None:
        access_token = payload.get('access_token')
        refresh_token = payload.get('refresh_token')
        if not isinstance(access_token, str) or not access_token:
            raise HHApiError('HH_OAUTH_TOKEN_INVALID')
        if require_refresh and (not isinstance(refresh_token, str) or not refresh_token):
            raise HHApiError('HH_OAUTH_REFRESH_TOKEN_MISSING')
        expires_in = payload.get('expires_in', 3600)
        if not isinstance(expires_in, (int, float)) or expires_in <= 0:
            raise HHApiError('HH_OAUTH_EXPIRY_INVALID')
        expires_at = self._clock() + max(1, float(expires_in))
        bundle = json.dumps(
            {
                'access_token': access_token,
                'refresh_token': refresh_token,
                'expires_at': expires_at,
            },
            separators=(',', ':'),
        )
        # One keyring write atomically replaces the credential bundle. The
        # in-memory projection is updated only after the write succeeds.
        self._keyring.set_secret(SecretSlot.HH_OAUTH_TOKEN_BUNDLE, bundle)
        self._access_token = access_token
        self._expires_at = expires_at

    def _read_bundle(self) -> dict[str, Any] | None:
        raw = self._keyring.get_secret(SecretSlot.HH_OAUTH_TOKEN_BUNDLE)
        if not raw:
            return None
        try:
            bundle = json.loads(raw)
        except (TypeError, ValueError):
            return None
        return bundle if isinstance(bundle, dict) else None

    def _restore_bundle(self) -> None:
        bundle = self._read_bundle()
        if not bundle:
            return
        access_token = bundle.get('access_token')
        expires_at = bundle.get('expires_at')
        if isinstance(access_token, str) and isinstance(expires_at, (int, float)):
            self._access_token = access_token
            self._expires_at = float(expires_at)

    def _has_valid_access_token(self) -> bool:
        return bool(self._access_token and self._expires_at > self._clock())


_oauth_service = HHOAuthService()


def get_oauth_service() -> HHOAuthService:
    return _oauth_service
