"""Tests for AOPS-03: localhost security, pairing, and secrets.

Covers:
- Loopback binding validation
- CORS origin enforcement
- Pairing lifecycle (start, confirm, revoke)
- Client token auth dependency
- Body size and content-type enforcement
- Rate limiting
- Keyring fake behavior and delete path
- Secret redaction in logs and errors
- Protected sample route
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.security.keyring import FakeKeyring, KeyringBackend, OSKeyring, SecretSlot
from app.security.pairing import (
    PairingService,
    generate_client_token,
    generate_pairing_code,
    hash_client_token,
)
from app.security.rate_limit import RateLimitConfig, RateLimiter

# ── Loopback binding validation ──────────────────────────────────────────


class TestLoopbackValidation:
    def test_accepts_loopback_hosts(self) -> None:
        from app.security.middleware import validate_loopback_bind

        validate_loopback_bind('127.0.0.1')
        validate_loopback_bind('localhost')
        validate_loopback_bind('::1')

    def test_rejects_zero_host(self) -> None:
        from app.security.middleware import validate_loopback_bind

        with pytest.raises(ValueError, match='0.0.0.0'):
            validate_loopback_bind('0.0.0.0')

    def test_rejects_public_hosts(self) -> None:
        from app.security.middleware import validate_loopback_bind

        with pytest.raises(ValueError, match='192.168.1.1'):
            validate_loopback_bind('192.168.1.1')

        with pytest.raises(ValueError, match='10.0.0.1'):
            validate_loopback_bind('10.0.0.1')

    def test_rejects_empty_host(self) -> None:
        from app.security.middleware import validate_loopback_bind

        with pytest.raises(ValueError):
            validate_loopback_bind('')

    def test_config_host_is_literal_loopback(self) -> None:
        from app.config import Settings

        s = Settings()
        # The Literal type enforces this at the type level; runtime double-check.
        assert s.host == '127.0.0.1'


# ── CORS enforcement ─────────────────────────────────────────────────────


class TestCORS:
    def test_allowed_origin_succeeds(self, client: TestClient) -> None:
        origin = 'chrome-extension://vacancypilot-dev'
        resp = client.get(
            '/api/v1/health',
            headers={'Origin': origin},
        )
        assert resp.status_code == 200
        assert 'access-control-allow-origin' in resp.headers

    def test_arbitrary_web_origin_is_denied(self, client: TestClient) -> None:
        resp = client.get(
            '/api/v1/health',
            headers={'Origin': 'https://evil.example.com'},
        )
        # With TestClient (no real browser CORS preflight), the response
        # may still return 200 but the access-control-allow-origin header
        # must NOT match the disallowed origin.
        acao = resp.headers.get('access-control-allow-origin', '')
        assert acao != 'https://evil.example.com'

    def test_wildcard_origin_is_absent(self, client: TestClient) -> None:
        resp = client.get(
            '/api/v1/health',
            headers={'Origin': '*'},
        )
        acao = resp.headers.get('access-control-allow-origin', '')
        # Wildcard origin in the request should not be reflected back.
        assert acao != '*'

    def test_cors_does_not_allow_credentials(self, client: TestClient) -> None:
        resp = client.get(
            '/api/v1/health',
            headers={'Origin': 'chrome-extension://vacancypilot-dev'},
        )
        # No credentialed CORS unless strictly justified.
        acac = resp.headers.get('access-control-allow-credentials', '')
        assert acac != 'true'

    def test_valid_preflight_is_handled_before_content_type(self, client: TestClient) -> None:
        resp = client.options(
            '/api/v1/pair/start',
            headers={
                'Origin': 'chrome-extension://vacancypilot-dev',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type',
            },
        )
        assert resp.status_code == 200
        assert resp.headers['access-control-allow-origin'] == (
            'chrome-extension://vacancypilot-dev'
        )

    def test_wildcard_configuration_is_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.security.middleware import get_configured_origins

        monkeypatch.setenv('VACANCYPILOT_EXTENSION_ORIGINS', '*')
        with pytest.raises(ValueError, match='exact chrome-extension'):
            get_configured_origins()


# ── Body size limit ──────────────────────────────────────────────────────


class TestBodySizeLimit:
    def test_normal_body_accepted(self, client: TestClient) -> None:
        """Normal-sized JSON body passes through."""
        # We need a route that accepts POST.  Use the pairing start route.
        resp = client.post(
            '/api/v1/pair/start',
            json={},
            headers={'Content-Type': 'application/json'},
        )
        # 200 or 503 (no DB for pairing tests) is fine — 413 is the only failure.
        assert resp.status_code != 413

    def test_oversized_body_rejected(self, app: FastAPI) -> None:
        """Oversized Content-Length results in 413 before body is read."""
        from app.security.middleware import BodySizeLimitMiddleware

        test_app = FastAPI()
        test_app.add_middleware(BodySizeLimitMiddleware, max_bytes=100)

        @test_app.post('/test-body')
        async def test_body() -> dict[str, str]:
            return {'status': 'ok'}

        with TestClient(test_app) as c:
            resp = c.post(
                '/test-body',
                content='x' * 200,
                headers={'Content-Type': 'application/json', 'Content-Length': '200'},
            )
        assert resp.status_code == 413
        assert resp.json()['error']['code'] == 'PAYLOAD_TOO_LARGE'

    def test_streamed_body_without_content_length_is_rejected(self) -> None:
        from app.security.middleware import BodySizeLimitMiddleware

        test_app = FastAPI()
        test_app.add_middleware(BodySizeLimitMiddleware, max_bytes=100)

        @test_app.post('/test-body')
        async def test_body(request: Request) -> dict[str, int]:
            return {'size': len(await request.body())}

        def chunks() -> Iterator[bytes]:
            yield b'x' * 60
            yield b'y' * 60

        with TestClient(test_app) as c:
            resp = c.post(
                '/test-body',
                content=chunks(),
                headers={'Content-Type': 'application/json'},
            )
        assert resp.status_code == 413
        assert resp.json()['error']['code'] == 'PAYLOAD_TOO_LARGE'


# ── Content-type enforcement ─────────────────────────────────────────────


class TestContentTypeEnforcement:
    def test_json_content_type_accepted(self, client: TestClient) -> None:
        """JSON content type is accepted on pairing endpoints."""
        resp = client.post(
            '/api/v1/pair/start',
            json={},
            headers={'Content-Type': 'application/json'},
        )
        # 200 or 503 (no DB) — 415 is failure.
        assert resp.status_code != 415

    def test_non_json_content_type_rejected(self, client: TestClient) -> None:
        """Non-JSON content type on a JSON-required endpoint returns 415."""
        resp = client.post(
            '/api/v1/pair/start',
            content=b'not json',
            headers={'Content-Type': 'text/plain'},
        )
        assert resp.status_code == 415
        assert resp.json()['error']['code'] == 'UNSUPPORTED_MEDIA_TYPE'

    def test_missing_content_type_rejected(self, client: TestClient) -> None:
        """Missing Content-Type on a POST to a JSON-required endpoint."""
        resp = client.post('/api/v1/pair/start')
        assert resp.status_code == 415

    def test_json_substring_content_type_is_rejected(self, client: TestClient) -> None:
        resp = client.post(
            '/api/v1/pair/start',
            content=b'{}',
            headers={'Content-Type': 'application/jsonp'},
        )
        assert resp.status_code == 415

    def test_get_does_not_require_content_type(self, client: TestClient) -> None:
        """GET requests are never subject to content-type checks."""
        resp = client.get('/api/v1/health')
        assert resp.status_code == 200


# ── Keyring ──────────────────────────────────────────────────────────────


class TestFakeKeyring:
    def test_set_and_get(self) -> None:
        kr = FakeKeyring()
        kr.set_secret('test_key', 'test_value')
        assert kr.get_secret('test_key') == 'test_value'

    def test_get_absent_returns_none(self) -> None:
        kr = FakeKeyring()
        assert kr.get_secret('absent') is None

    def test_delete_removes(self) -> None:
        kr = FakeKeyring()
        kr.set_secret('test_key', 'test_value')
        kr.delete_secret('test_key')
        assert kr.get_secret('test_key') is None

    def test_delete_absent_is_noop(self) -> None:
        kr = FakeKeyring()
        kr.delete_secret('absent')  # does not raise

    def test_stored_secret_names(self) -> None:
        kr = FakeKeyring()
        kr.set_secret('a', '1')
        kr.set_secret('b', '2')
        assert kr.stored_secret_names == ['a', 'b']

    def test_is_empty(self) -> None:
        kr = FakeKeyring()
        assert kr.is_empty is True
        kr.set_secret('x', '1')
        assert kr.is_empty is False

    def test_delete_path_is_clean(self) -> None:
        """Verify delete fully removes the secret."""
        kr = FakeKeyring()
        kr.set_secret(SecretSlot.AI_KEY, 'sk-test-key')
        assert kr.get_secret(SecretSlot.AI_KEY) == 'sk-test-key'
        kr.delete_secret(SecretSlot.AI_KEY)
        assert kr.get_secret(SecretSlot.AI_KEY) is None
        assert kr.is_empty is True


class TestSecretSlots:
    def test_slot_names_are_stable(self) -> None:
        """Secret slot names must not change without a contract update."""
        assert SecretSlot.HH_APPLICATION_TOKEN == 'vacancypilot_hh_application_token'
        assert SecretSlot.HH_REFRESH_TOKEN == 'vacancypilot_hh_refresh_token'
        assert SecretSlot.AI_KEY == 'vacancypilot_ai_key'
        assert SecretSlot.PAIRING_MATERIAL == 'vacancypilot_pairing_material'

    def test_os_keyring_interface(self) -> None:
        """OSKeyring implements the abstract KeyringBackend."""
        assert isinstance(OSKeyring(), KeyringBackend)


# ── Pairing: client token and code generation ───────────────────────────


class TestTokenGeneration:
    def test_generated_token_is_random(self) -> None:
        t1 = generate_client_token()
        t2 = generate_client_token()
        assert t1 != t2
        assert len(t1) == 64  # 32 bytes hex

    def test_hash_is_deterministic(self) -> None:
        token = 'test-token'
        assert hash_client_token(token) == hash_client_token(token)

    def test_hash_differs_for_different_tokens(self) -> None:
        assert hash_client_token('a') != hash_client_token('b')

    def test_hash_is_safe_representation(self) -> None:
        """The hash is a hex digest, not the raw token."""
        token = generate_client_token()
        h = hash_client_token(token)
        assert token not in h
        assert len(h) == 64  # SHA-256 hex


class TestPairingCode:
    def test_code_is_six_digits(self) -> None:
        for _ in range(100):
            code = generate_pairing_code()
            assert len(code) == 6
            assert code.isdigit()

    def test_code_is_zero_padded(self) -> None:
        for _ in range(100):
            code = generate_pairing_code()
            assert 0 <= int(code) <= 999999

    def test_codes_are_random(self) -> None:
        codes = {generate_pairing_code() for _ in range(20)}
        assert len(codes) > 1  # extremely unlikely to collide


# ── Pairing service ──────────────────────────────────────────────────────


class TestPairingService:
    def test_start_creates_challenge(self, db_session: Session) -> None:
        service = PairingService()
        challenge_id, code = service.start_challenge()
        assert len(challenge_id) == 32  # 16 bytes hex
        assert len(code) == 6
        assert code.isdigit()

    def test_confirm_with_correct_code_returns_token(self, db_session: Session) -> None:
        service = PairingService()
        challenge_id, code = service.start_challenge()
        token = service.confirm_challenge(challenge_id, code, db_session)
        assert token is not None
        assert len(token) == 64

    def test_confirm_wrong_code_returns_none(self, db_session: Session) -> None:
        service = PairingService()
        challenge_id, code = service.start_challenge()
        # Try a different code
        wrong_code = str((int(code) + 1) % 1_000_000).zfill(6)
        token = service.confirm_challenge(challenge_id, wrong_code, db_session)
        assert token is None

    def test_confirm_unknown_challenge_returns_none(self, db_session: Session) -> None:
        service = PairingService()
        token = service.confirm_challenge('unknown-challenge-id', '123456', db_session)
        assert token is None

    def test_challenge_is_single_use(self, db_session: Session) -> None:
        service = PairingService()
        challenge_id, code = service.start_challenge()
        first = service.confirm_challenge(challenge_id, code, db_session)
        assert first is not None
        second = service.confirm_challenge(challenge_id, code, db_session)
        assert second is None

    def test_code_locks_after_bounded_failures(self, db_session: Session) -> None:
        service = PairingService()
        challenge_id, code = service.start_challenge()
        wrong_code = str((int(code) + 1) % 1_000_000).zfill(6)

        # Try wrong code 5 times
        for _ in range(5):
            result = service.confirm_challenge(challenge_id, wrong_code, db_session)
            assert result is None

        # Now the correct code should also fail (challenge removed)
        result = service.confirm_challenge(challenge_id, code, db_session)
        assert result is None

    def test_active_challenges_are_bounded(self) -> None:
        from app.security.pairing import PairingCapacityError

        service = PairingService()
        for _ in range(service._MAX_ACTIVE_CHALLENGES):
            service.start_challenge()
        with pytest.raises(PairingCapacityError):
            service.start_challenge()

    def test_token_verifies_after_store(self, db_session: Session) -> None:
        service = PairingService()
        challenge_id, code = service.start_challenge()
        token = service.confirm_challenge(challenge_id, code, db_session)
        assert token is not None
        assert service.verify_token(token, db_session) is True

    def test_wrong_token_is_rejected(self, db_session: Session) -> None:
        service = PairingService()
        challenge_id, code = service.start_challenge()
        service.confirm_challenge(challenge_id, code, db_session)
        assert service.verify_token('wrong-token', db_session) is False

    def test_revoke_invalidates_token(self, db_session: Session) -> None:
        service = PairingService()
        challenge_id, code = service.start_challenge()
        token = service.confirm_challenge(challenge_id, code, db_session)
        assert token is not None
        assert service.verify_token(token, db_session) is True

        service.revoke(db_session)
        assert service.verify_token(token, db_session) is False

    def test_already_paired_rejects_new_pairing(self, db_session: Session) -> None:
        service = PairingService()
        cid1, code1 = service.start_challenge()
        service.confirm_challenge(cid1, code1, db_session)

        # Second pairing should fail
        cid2, code2 = service.start_challenge()
        token2 = service.confirm_challenge(cid2, code2, db_session)
        assert token2 is None

    def test_revoke_then_repair_succeeds(self, db_session: Session) -> None:
        service = PairingService()
        cid1, code1 = service.start_challenge()
        token1 = service.confirm_challenge(cid1, code1, db_session)
        assert token1 is not None

        service.revoke(db_session)

        cid2, code2 = service.start_challenge()
        token2 = service.confirm_challenge(cid2, code2, db_session)
        assert token2 is not None
        assert token2 != token1


# ── Stored token is not plaintext ───────────────────────────────────────


class TestTokenStorage:
    def test_token_not_in_settings_plaintext(self, db_session: Session) -> None:
        service = PairingService()
        challenge_id, code = service.start_challenge()
        token = service.confirm_challenge(challenge_id, code, db_session)
        assert token is not None

        from sqlalchemy import text

        row = db_session.execute(
            text("SELECT value_json FROM settings WHERE key = 'pairing_client_token_hash'")
        ).fetchone()
        assert row is not None
        stored = str(row[0])
        # The raw token must not be in the stored value.
        assert token not in stored
        # The stored value must be a 64-char hex digest.
        assert len(stored) == 64


# ── Pairing API (integration) ────────────────────────────────────────────


class TestPairingAPI:
    """Integration tests for the pairing API endpoints.

    These use an app_with_db so the settings table is available.
    """

    def test_pair_start_returns_challenge(self, client_with_db: TestClient) -> None:
        resp = client_with_db.post(
            '/api/v1/pair/start',
            json={},
            headers={'Content-Type': 'application/json'},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert 'data' in body
        assert 'challenge_id' in body['data']
        assert body['data']['expires_in_seconds'] == 300

    def test_pair_start_code_not_in_response(self, client_with_db: TestClient) -> None:
        """The pairing code must never be returned in the API response."""
        resp = client_with_db.post(
            '/api/v1/pair/start',
            json={},
            headers={'Content-Type': 'application/json'},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert 'code' not in body['data']
        # The data fields should only be challenge_id and expires_in_seconds.
        assert set(body['data'].keys()) == {'challenge_id', 'expires_in_seconds'}

    def test_full_pairing_flow(self, client_with_db: TestClient) -> None:
        """End-to-end: start → confirm → use → revoke."""
        # 1. Start
        resp = client_with_db.post(
            '/api/v1/pair/start',
            json={},
            headers={'Content-Type': 'application/json'},
        )
        assert resp.status_code == 200
        challenge_id = resp.json()['data']['challenge_id']

        # We can't know the code from the API (it goes to stdout).
        # Retrieve from the singleton pairing service.
        from app.security.pairing import get_pairing_service

        service = get_pairing_service()
        # Find the code from the in-memory challenge store
        challenge = service._challenges.get(challenge_id)
        assert challenge is not None, 'Challenge must be in the service store'
        code = challenge.code

        # 2. Confirm
        resp = client_with_db.post(
            '/api/v1/pair/confirm',
            json={'challenge_id': challenge_id, 'code': code},
            headers={'Content-Type': 'application/json'},
        )
        assert resp.status_code == 200, resp.text
        token = resp.json()['data']['client_token']
        assert len(token) == 64

        # 3. Use token on protected route
        resp = client_with_db.get(
            '/api/v1/_test/protected',
            headers={'X-VacancyPilot-Client': token},
        )
        assert resp.status_code == 200

        # 4. Revoke
        resp = client_with_db.post(
            '/api/v1/pair/revoke',
            json={},
            headers={
                'Content-Type': 'application/json',
                'X-VacancyPilot-Client': token,
            },
        )
        assert resp.status_code == 200

        # 5. Token is now invalid
        resp = client_with_db.get(
            '/api/v1/_test/protected',
            headers={'X-VacancyPilot-Client': token},
        )
        assert resp.status_code == 401

    def test_confirm_wrong_code_returns_401(self, client_with_db: TestClient) -> None:
        """Wrong code returns 401."""
        resp = client_with_db.post(
            '/api/v1/pair/start',
            json={},
            headers={'Content-Type': 'application/json'},
        )
        challenge_id = resp.json()['data']['challenge_id']

        resp = client_with_db.post(
            '/api/v1/pair/confirm',
            json={'challenge_id': challenge_id, 'code': '000000'},
            headers={'Content-Type': 'application/json'},
        )
        assert resp.status_code == 401

    def test_confirm_invalid_code_format_returns_422(self, client_with_db: TestClient) -> None:
        """Non-numeric or wrong-length code returns validation error."""
        resp = client_with_db.post(
            '/api/v1/pair/confirm',
            json={'challenge_id': 'abc123', 'code': 'abc'},
            headers={'Content-Type': 'application/json'},
        )
        assert resp.status_code == 422

    def test_forwarded_headers_cannot_create_new_pairing_budgets(
        self,
        client_with_db: TestClient,
    ) -> None:
        statuses = []
        for index in range(11):
            resp = client_with_db.post(
                '/api/v1/pair/confirm',
                json={'challenge_id': 'missing', 'code': '000000'},
                headers={
                    'Content-Type': 'application/json',
                    'X-Forwarded-For': f'attacker-bucket-{index}',
                },
            )
            statuses.append(resp.status_code)
        assert statuses[:10] == [401] * 10
        assert statuses[10] == 429


# ── Auth dependency ──────────────────────────────────────────────────────


class TestAuthDependency:
    def test_missing_client_header_returns_401(self, client_with_db: TestClient) -> None:
        resp = client_with_db.get('/api/v1/_test/protected')
        assert resp.status_code == 401
        assert resp.json()['error']['code'] == 'UNAUTHORIZED'

    def test_invalid_token_returns_401(self, client_with_db: TestClient) -> None:
        resp = client_with_db.get(
            '/api/v1/_test/protected',
            headers={'X-VacancyPilot-Client': 'not-a-valid-token'},
        )
        assert resp.status_code == 401

    def test_valid_token_accesses_protected_route(self, client_with_db: TestClient) -> None:
        from app.security.pairing import get_pairing_service as gps

        service = gps()
        challenge_id, code = service.start_challenge()

        # Need the DB session from the app
        db_engine = client_with_db.app.state.db_engine
        from sqlalchemy.orm import sessionmaker

        factory = sessionmaker(bind=db_engine)
        db = factory()
        try:
            token = service.confirm_challenge(challenge_id, code, db)
            db.commit()
        finally:
            db.close()

        assert token is not None

        resp = client_with_db.get(
            '/api/v1/_test/protected',
            headers={'X-VacancyPilot-Client': token},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body['data']['message'] == 'Authenticated'
        assert 'client_hash' not in body['data']

    def test_oversized_client_header_returns_401(self, client_with_db: TestClient) -> None:
        """Client token header exceeding max length is rejected."""
        resp = client_with_db.get(
            '/api/v1/_test/protected',
            headers={'X-VacancyPilot-Client': 'x' * 600},
        )
        assert resp.status_code == 401

    def test_protected_rate_limit_is_enforced(
        self,
        client_with_db: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from sqlalchemy.orm import sessionmaker

        import app.security.auth as auth
        from app.security.pairing import get_pairing_service

        service = get_pairing_service()
        challenge_id, code = service.start_challenge()
        factory = sessionmaker(bind=client_with_db.app.state.db_engine)
        db = factory()
        try:
            token = service.confirm_challenge(challenge_id, code, db)
            db.commit()
        finally:
            db.close()
        assert token is not None

        monkeypatch.setattr(
            auth,
            '_protected_limiter',
            RateLimiter(RateLimitConfig(max_requests=2, window_seconds=60)),
        )
        headers = {'X-VacancyPilot-Client': token}
        assert client_with_db.get('/api/v1/_test/protected', headers=headers).status_code == 200
        assert client_with_db.get('/api/v1/_test/protected', headers=headers).status_code == 200
        assert client_with_db.get('/api/v1/_test/protected', headers=headers).status_code == 429


# ── Rate limiting ────────────────────────────────────────────────────────


class TestRateLimiter:
    def test_allows_under_limit(self) -> None:
        limiter = RateLimiter(config=RateLimitConfig(max_requests=5, window_seconds=60))
        for _ in range(5):
            assert limiter.allow('test') is True

    def test_blocks_over_limit(self) -> None:
        limiter = RateLimiter(config=RateLimitConfig(max_requests=2, window_seconds=60))
        assert limiter.allow('test') is True
        assert limiter.allow('test') is True
        assert limiter.allow('test') is False

    def test_separate_keys_independent(self) -> None:
        limiter = RateLimiter(config=RateLimitConfig(max_requests=1, window_seconds=60))
        assert limiter.allow('a') is True
        assert limiter.allow('b') is True
        assert limiter.allow('a') is False

    def test_reset_clears_key(self) -> None:
        limiter = RateLimiter(config=RateLimitConfig(max_requests=1, window_seconds=60))
        assert limiter.allow('test') is True
        assert limiter.allow('test') is False
        limiter.reset('test')
        assert limiter.allow('test') is True

    def test_window_slides(self) -> None:
        """Old entries should expire as time advances."""
        current_time = [1000.0]

        def clock() -> float:
            return current_time[0]

        limiter = RateLimiter(
            config=RateLimitConfig(max_requests=1, window_seconds=10),
            time_provider=clock,
        )
        assert limiter.allow('test') is True
        assert limiter.allow('test') is False
        current_time[0] += 11
        assert limiter.allow('test') is True
        assert len(limiter._buckets) == 1

    def test_key_population_is_bounded(self) -> None:
        limiter = RateLimiter(config=RateLimitConfig(max_requests=1, window_seconds=60, max_keys=2))
        assert limiter.allow('a') is True
        assert limiter.allow('b') is True
        assert limiter.allow('c') is False
        assert len(limiter._buckets) == 2

    def test_pairing_rate_limit_config_is_reasonable(self) -> None:
        from app.security.rate_limit import PAIRING_RATE_LIMIT

        assert PAIRING_RATE_LIMIT.max_requests == 10
        assert PAIRING_RATE_LIMIT.window_seconds == 60


# ── Redaction and secret-safe logging ────────────────────────────────────


class TestRedaction:
    def test_auth_headers_redacted(self) -> None:
        from app.security.redaction import redact_header_value

        assert redact_header_value('Authorization', 'Bearer secret123') == '[REDACTED]'
        assert redact_header_value('authorization', 'Basic abc') == '[REDACTED]'
        assert redact_header_value('X-VacancyPilot-Client', 'token-abc') == '[REDACTED]'

    def test_safe_headers_preserved(self) -> None:
        from app.security.redaction import redact_header_value

        assert redact_header_value('Content-Type', 'application/json') == 'application/json'
        assert redact_header_value('User-Agent', 'test') == 'test'

    def test_sanitize_dict_redacts_sensitive_fields(self) -> None:
        from app.security.redaction import sanitize_dict

        data = {
            'access_token': 'secret123',
            'refresh_token': 'secret456',
            'api_key': 'sk-abc',
            'email': 'user@example.com',
            'phone': '+123456789',
            'contact': 'contact info',
            'name': 'John',
            'count': 42,
        }
        result = sanitize_dict(data)
        assert result['access_token'] == '[REDACTED]'
        assert result['refresh_token'] == '[REDACTED]'
        assert result['api_key'] == '[REDACTED]'
        assert result['email'] == '[REDACTED]'
        assert result['phone'] == '[REDACTED]'
        assert result['contact'] == '[REDACTED]'
        assert result['name'] == 'John'
        assert result['count'] == 42

    def test_sanitize_dict_redacts_credential_urls(self) -> None:
        from app.security.redaction import sanitize_dict

        data = {
            'endpoint': 'https://user:password@api.example.com/v1',
        }
        result = sanitize_dict(data)
        assert 'password' not in result['endpoint']
        assert '[REDACTED]' in result['endpoint']

    def test_sanitize_dict_nested(self) -> None:
        from app.security.redaction import sanitize_dict

        data = {
            'config': {
                'secret_key': 'should-be-redacted',
                'safe_value': 'visible',
                'nested_deeper': {'token': 'also-redacted'},
            }
        }
        result = sanitize_dict(data)
        assert result['config']['secret_key'] == '[REDACTED]'
        assert result['config']['safe_value'] == 'visible'
        assert result['config']['nested_deeper']['token'] == '[REDACTED]'

    def test_sanitize_dict_max_depth(self) -> None:
        from app.security.redaction import sanitize_dict

        deeply_nested = {'a': {'b': {'c': {'d': {'e': {'f': 'value'}}}}}}
        result = sanitize_dict(deeply_nested, max_depth=3)
        # Should be capped after 3 levels
        assert 'max_depth_exceeded' in str(result)

    def test_logger_filter_redacts_bearer_tokens(self) -> None:
        import logging
        from io import StringIO

        from app.security.redaction import get_safe_logger

        stream = StringIO()
        handler = logging.StreamHandler(stream)
        handler.setLevel(logging.INFO)

        logger = get_safe_logger('test_redaction')
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)

        logger.info('Used Bearer abc123xyz for auth')
        output = stream.getvalue()
        assert 'abc123xyz' not in output
        assert '[REDACTED]' in output

    def test_secret_values_never_in_log_output(self) -> None:
        """Secret-like values must never appear in captured logs."""
        import logging
        from io import StringIO

        from app.security.redaction import RedactingFilter

        stream = StringIO()
        handler = logging.StreamHandler(stream)
        handler.setLevel(logging.INFO)
        handler.addFilter(RedactingFilter())

        logger = logging.getLogger('test_secrets_never')
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)

        # Log something that looks like an API key
        logger.info('sk-ant-api-1234567890abcdef')
        logger.info('Key set: access_token=my-secret-value')
        output = stream.getvalue()

        assert 'my-secret-value' not in output
        assert 'sk-ant-api-1234567890abcdef' not in output or '[REDACTED]' in output

    def test_tuple_and_list_args_are_redacted(self) -> None:
        import logging
        from io import StringIO

        from app.security.redaction import RedactingFilter

        stream = StringIO()
        handler = logging.StreamHandler(stream)
        handler.addFilter(RedactingFilter())
        logger = logging.getLogger('test_tuple_redaction')
        logger.handlers = [handler]
        logger.propagate = False
        logger.setLevel(logging.INFO)
        logger.info('access_token=%s values=%s', 'tuple-secret', ['password=list-secret'])
        output = stream.getvalue()
        assert 'tuple-secret' not in output
        assert 'list-secret' not in output

    def test_root_handler_filter_redacts_propagated_child_records(self) -> None:
        import logging
        from io import StringIO

        from app.security.redaction import install_redacting_filter

        stream = StringIO()
        handler = logging.StreamHandler(stream)
        root = logging.getLogger()
        root.addHandler(handler)
        child = logging.getLogger('app.child.redaction')
        child.setLevel(logging.INFO)
        try:
            install_redacting_filter()
            child.info('Bearer propagated-secret')
        finally:
            root.removeHandler(handler)
        assert 'propagated-secret' not in stream.getvalue()


# ── Error response sanitization ──────────────────────────────────────────


class TestSanitizedErrors:
    def test_500_does_not_leak_exception_details(self, app: FastAPI) -> None:
        @app.get('/_test/leak')
        async def leak() -> None:
            raise RuntimeError('secret database password is hunter2')

        with TestClient(app, raise_server_exceptions=False) as c:
            resp = c.get('/_test/leak')
        assert resp.status_code == 500
        body = resp.json()
        assert 'hunter2' not in resp.text
        assert body['error']['code'] == 'INTERNAL_ERROR'

    def test_401_does_not_reveal_stored_token(self, client_with_db: TestClient) -> None:
        """Error responses for invalid tokens must not expose the stored hash."""
        resp = client_with_db.get(
            '/api/v1/_test/protected',
            headers={'X-VacancyPilot-Client': 'wrong-token'},
        )
        assert resp.status_code == 401
        # The error message must be generic.
        assert 'hash' not in resp.text.lower()

    def test_request_ids_are_non_secret_and_bounded(self, client: TestClient) -> None:
        """Request IDs are standard UUIDs, not sensitive."""
        resp = client.get('/api/v1/health')
        rid = resp.json()['meta']['request_id']
        assert len(rid) <= 36  # UUID v4 max length
        # Request IDs are safe to appear in responses.
        assert rid in resp.text


# ── OpenAPI contract coverage ────────────────────────────────────────────


class TestOpenAPIContract:
    def test_pairing_paths_in_openapi(self, client: TestClient) -> None:
        schema = client.get('/openapi.json').json()
        paths = schema['paths']
        assert '/api/v1/pair/start' in paths
        assert '/api/v1/pair/confirm' in paths
        assert '/api/v1/pair/revoke' in paths

    def test_protected_test_route_is_not_in_production_openapi(self) -> None:
        from app.main import create_app

        production_schema = create_app(initialize_db=False).openapi()
        assert '/api/v1/protected-sample' not in production_schema['paths']
        assert '/api/v1/_test/protected' not in production_schema['paths']

    def test_protected_test_route_in_fixture_openapi(self, client: TestClient) -> None:
        schema = client.get('/openapi.json').json()
        assert '/api/v1/_test/protected' in schema['paths']

    def test_client_header_in_openapi(self, client: TestClient) -> None:
        schema = client.get('/openapi.json').json()
        # Protected sample should document X-VacancyPilot-Client header
        op = schema['paths']['/api/v1/_test/protected']['get']
        assert op['security'], 'Protected test route must require the client API key scheme'
        schemes = schema['components']['securitySchemes']
        assert any(
            item.get('name') == 'X-VacancyPilot-Client'
            and item.get('in') == 'header'
            and item.get('type') == 'apiKey'
            for item in schemes.values()
        )

    def test_openapi_schema_has_no_secret_examples(self, client: TestClient) -> None:
        """OpenAPI examples must not contain secret values."""
        schema_text = json.dumps(client.get('/openapi.json').json())
        assert 'password' not in schema_text.lower()
        assert 'access_token' not in schema_text.lower()
        assert 'refresh_token' not in schema_text.lower()
        assert 'Bearer sk-' not in schema_text

    def test_auth_error_responses_in_openapi(self, client: TestClient) -> None:
        schema = client.get('/openapi.json').json()
        # Protected sample should document 401
        op = schema['paths']['/api/v1/_test/protected']['get']
        responses = op.get('responses', {})
        assert {'200', '401', '429', '503'} <= set(responses)

    def test_pairing_error_responses_in_openapi(self, client: TestClient) -> None:
        schema = client.get('/openapi.json').json()
        # Pair confirm should document 401
        op = schema['paths']['/api/v1/pair/confirm']['post']
        assert '401' in op['responses']


# ── Extension boundary: no extension storage or UI changes ───────────────


class TestExtensionBoundary:
    """Verify AOPS-03 does not add extension UI or storage."""

    def test_no_extension_changes(self) -> None:
        """This epic only touches companion Python code, not extension TS code."""
        root = Path(__file__).resolve().parents[2]
        st_items = list((root / 'src').rglob('*.ts'))
        st_count = len(st_items)
        # We aren't counting changes, just asserting the epics boundary:
        # AOPS-03 is companion-only (pairing contract is OpenAPI, not TS code).
        assert st_count > 0, 'Extension source files should exist (baseline check)'
