from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.config import settings
from app.hh.errors import HHApiError, HHConfigurationError
from app.hh.oauth import HHOAuthService, pkce_challenge
from app.security.keyring import FakeKeyring, SecretSlot


def test_pkce_challenge_matches_rfc7636_vector() -> None:
    verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    assert pkce_challenge(verifier) == 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'


def test_start_requires_registered_oauth_application(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'hh_client_id', '')
    monkeypatch.setattr(settings, 'hh_redirect_uri', '')
    service = HHOAuthService(keyring=FakeKeyring())
    with pytest.raises(HHConfigurationError) as exc:
        service.start()
    assert exc.value.code == 'HH_OAUTH_APP_CREDENTIALS_REQUIRED'


def test_callback_consumes_state_and_persists_only_refresh_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, 'hh_client_id', 'client-id')
    monkeypatch.setattr(settings, 'hh_redirect_uri', 'http://127.0.0.1:8765/oauth/callback')
    keyring = FakeKeyring()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == 'https://api.hh.ru/token'
        assert b'client_secret=secret' in request.content
        assert b'code_verifier=' in request.content
        return httpx.Response(
            200,
            json={
                'access_token': 'memory-token',
                'refresh_token': 'refresh-token',
                'expires_in': 3600,
            },
        )

    keyring.set_secret(SecretSlot.HH_CLIENT_SECRET, 'secret')
    service = HHOAuthService(keyring=keyring, transport=httpx.MockTransport(handler))
    started = service.start()
    query = parse_qs(urlparse(started['authorization_url']).query)
    assert 'code_verifier' not in query
    assert query['code_challenge_method'] == ['S256']

    assert service.callback(state=started['state'], code='one-time-code')['connected'] is True
    assert keyring.get_secret(SecretSlot.HH_REFRESH_TOKEN) == 'refresh-token'
    assert service.access_token() == 'memory-token'
    with pytest.raises(HHApiError) as exc:
        service.callback(state=started['state'], code='replay')
    assert exc.value.code == 'HH_OAUTH_STATE_INVALID'
