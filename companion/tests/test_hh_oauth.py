from __future__ import annotations

import threading
import time
from urllib.parse import parse_qs, parse_qsl, urlparse

import httpx
import pytest

from app.config import settings
from app.hh.errors import HHApiError, HHConfigurationError
from app.hh.oauth import HHOAuthService, pkce_challenge
from app.security.keyring import FakeKeyring, SecretSlot


class FakeClock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def configure_oauth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'hh_client_id', 'client-id')
    monkeypatch.setattr(
        settings,
        'hh_redirect_uri',
        'http://127.0.0.1:8765/api/v1/hh/auth/callback',
    )


def test_pkce_challenge_matches_rfc7636_vector() -> None:
    verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    assert pkce_challenge(verifier) == 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'


def test_start_requires_exact_registered_redirect(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'hh_client_id', 'client-id')
    monkeypatch.setattr(settings, 'hh_redirect_uri', 'https://oauth.pstmn.io/v1/callback')
    keyring = FakeKeyring()
    keyring.set_secret(SecretSlot.HH_CLIENT_SECRET, 'secret')
    with pytest.raises(HHConfigurationError) as exc:
        HHOAuthService(keyring=keyring).start()
    assert exc.value.code == 'HH_OAUTH_APP_CREDENTIALS_REQUIRED'


def test_authorization_persists_bundle_and_reuses_valid_access_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_oauth(monkeypatch)
    clock = FakeClock()
    keyring = FakeKeyring()
    keyring.set_secret(SecretSlot.HH_CLIENT_SECRET, 'secret')
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        form = dict(parse_qsl(request.content.decode()))
        assert form['grant_type'] == 'authorization_code'
        assert form['client_secret'] == 'secret'
        assert form['code_verifier']
        return httpx.Response(
            200,
            json={'access_token': 'access-1', 'refresh_token': 'refresh-1', 'expires_in': 60},
        )

    service = HHOAuthService(keyring=keyring, transport=httpx.MockTransport(handler), clock=clock)
    started = service.start()
    query = parse_qs(urlparse(started['authorization_url']).query)
    assert query['redirect_uri'] == ['http://127.0.0.1:8765/api/v1/hh/auth/callback']
    assert 'code_verifier' not in query
    service.callback(state=started['state'], code='one-time-code')
    assert service.access_token() == 'access-1'
    assert calls == 1
    assert keyring.get_secret(SecretSlot.HH_OAUTH_TOKEN_BUNDLE)


def test_companion_restart_restores_valid_access_token_without_refresh(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_oauth(monkeypatch)
    clock = FakeClock()
    keyring = FakeKeyring()
    keyring.set_secret(SecretSlot.HH_CLIENT_SECRET, 'secret')
    keyring.set_secret(
        SecretSlot.HH_OAUTH_TOKEN_BUNDLE,
        '{"access_token":"access-1","refresh_token":"refresh-1","expires_at":1060}',
    )

    def fail_if_called(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f'unexpected HTTP request: {request.url}')

    service = HHOAuthService(
        keyring=keyring, transport=httpx.MockTransport(fail_if_called), clock=clock
    )
    assert service.access_token() == 'access-1'


def test_refresh_occurs_only_after_expiry_and_rotates_bundle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_oauth(monkeypatch)
    clock = FakeClock()
    keyring = FakeKeyring()
    keyring.set_secret(SecretSlot.HH_CLIENT_SECRET, 'secret')
    keyring.set_secret(
        SecretSlot.HH_OAUTH_TOKEN_BUNDLE,
        '{"access_token":"access-1","refresh_token":"refresh-1","expires_at":1060}',
    )
    grants: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        form = dict(parse_qsl(request.content.decode()))
        grants.append(form['grant_type'])
        assert form['refresh_token'] == 'refresh-1'
        return httpx.Response(
            200,
            json={'access_token': 'access-2', 'refresh_token': 'refresh-2', 'expires_in': 60},
        )

    service = HHOAuthService(keyring=keyring, transport=httpx.MockTransport(handler), clock=clock)
    assert service.access_token() == 'access-1'
    assert grants == []
    clock.advance(61)
    assert service.access_token() == 'access-2'
    assert grants == ['refresh_token']
    assert 'refresh-2' in (keyring.get_secret(SecretSlot.HH_OAUTH_TOKEN_BUNDLE) or '')


def test_refresh_failure_preserves_existing_bundle(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_oauth(monkeypatch)
    clock = FakeClock()
    keyring = FakeKeyring()
    keyring.set_secret(SecretSlot.HH_CLIENT_SECRET, 'secret')
    original = '{"access_token":"access-1","refresh_token":"refresh-1","expires_at":1060}'
    keyring.set_secret(SecretSlot.HH_OAUTH_TOKEN_BUNDLE, original)
    service = HHOAuthService(
        keyring=keyring,
        transport=httpx.MockTransport(lambda request: httpx.Response(400)),
        clock=clock,
    )
    clock.advance(61)
    with pytest.raises(HHApiError) as exc:
        service.access_token()
    assert exc.value.code == 'HH_OAUTH_TOKEN_REJECTED'
    assert keyring.get_secret(SecretSlot.HH_OAUTH_TOKEN_BUNDLE) == original


def test_concurrent_expired_access_coalesces_refresh(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_oauth(monkeypatch)
    clock = FakeClock()
    keyring = FakeKeyring()
    keyring.set_secret(SecretSlot.HH_CLIENT_SECRET, 'secret')
    keyring.set_secret(
        SecretSlot.HH_OAUTH_TOKEN_BUNDLE,
        '{"access_token":"access-1","refresh_token":"refresh-1","expires_at":1060}',
    )
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        time.sleep(0.02)
        return httpx.Response(
            200,
            json={'access_token': 'access-2', 'refresh_token': 'refresh-2', 'expires_in': 60},
        )

    service = HHOAuthService(keyring=keyring, transport=httpx.MockTransport(handler), clock=clock)
    clock.advance(61)
    results: list[str] = []
    threads = [
        threading.Thread(target=lambda: results.append(service.access_token())) for _ in range(4)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert results == ['access-2'] * 4
    assert calls == 1


def test_disconnect_cleans_bundle_refresh_and_pending_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_oauth(monkeypatch)
    keyring = FakeKeyring()
    keyring.set_secret(
        SecretSlot.HH_OAUTH_TOKEN_BUNDLE,
        '{"access_token":"access-1","refresh_token":"refresh-1","expires_at":1060}',
    )
    service = HHOAuthService(keyring=keyring, clock=FakeClock())
    service.start()
    service.disconnect()
    assert keyring.get_secret(SecretSlot.HH_OAUTH_TOKEN_BUNDLE) is None
    assert keyring.get_secret(SecretSlot.HH_REFRESH_TOKEN) is None
    assert service.status()['connected'] is False
