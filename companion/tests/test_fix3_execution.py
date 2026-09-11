"""Focused Fix 3 authorization, privacy and receipt coverage."""

from __future__ import annotations

import shutil
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.analysis.models import ProviderInputPolicy
from app.analysis.provider import FakeProvider
from app.security.auth import hash_client_token
from app.security.pairing import generate_client_token
from app.security.receipts import (
    ReceiptKeyUnavailableError,
    ReceiptSigner,
    ReceiptVerificationError,
)

TOKEN = generate_client_token()
ENGINE_FIXTURES = Path(__file__).resolve().parent / 'engine_fixtures' / 'valid-minimal'


def headers() -> dict[str, str]:
    return {'X-VacancyPilot-Client': TOKEN}


def register_token(token: str, session: Session) -> None:
    session.execute(
        text(
            'INSERT OR REPLACE INTO settings '
            '(key, value_json, revision, created_at, updated_at) '
            'VALUES (:key, :value, 1, :now, :now)'
        ),
        {
            'key': 'pairing_client_token_hash',
            'value': hash_client_token(token),
            'now': '2026-08-05T10:00:00Z',
        },
    )
    session.commit()


def policy(**overrides: object) -> dict[str, object]:
    value = ProviderInputPolicy(
        ai_enabled=True,
        provider='openai',
        privacy_mode='standard',
        allow_full_description_to_ai=True,
        allow_resume_highlights_to_ai=False,
        redact_contacts=True,
        daily_request_limit=10,
        cache_enabled=True,
    ).model_dump()
    value.update(overrides)
    return value


def ingest(client: TestClient) -> str:
    response = client.post(
        '/api/v1/vacancies/intake',
        json={
            'schema_version': 1,
            'source': 'test_source',
            'source_vacancy_id': 'fix3-auth-vacancy',
            'title': 'Python Developer',
            'company_name': 'Synthetic Co',
            'description': 'A long enough synthetic vacancy description for analysis.',
            'skills': ['Python', 'FastAPI'],
        },
        headers=headers(),
    )
    assert response.status_code == 200, response.text
    return response.json()['data']['vacancy_id']


@pytest.fixture()
def engine_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / 'engine'
    root.mkdir()
    monkeypatch.setattr('app.analysis.service.resolve_engine_package_root', lambda: root)
    return root


@pytest.fixture()
def valid_engine(engine_root: Path) -> Path:
    shutil.copytree(ENGINE_FIXTURES, engine_root / 'current')
    return engine_root


def test_receipt_mac_expiry_and_stale_claims() -> None:
    now = [1_000.0]
    signer = ReceiptSigner(b'fix3-test-key', time_provider=lambda: now[0], ttl_seconds=60)
    receipt = signer.issue(
        kind='v4_analysis',
        provider_plan_hash='a' * 64,
        subject_ids={'vacancy_id': 'vacancy-1'},
        provider='openai',
        model='gpt-4o',
        privacy_policy_fingerprint='b' * 64,
    )
    assert receipt is not None
    claims = signer.verify(
        receipt,
        kind='v4_analysis',
        provider_plan_hash='a' * 64,
        subject_ids={'vacancy_id': 'vacancy-1'},
        provider='openai',
        model='gpt-4o',
        privacy_policy_fingerprint='b' * 64,
    )
    assert claims.provider_plan_hash == 'a' * 64

    with pytest.raises(ReceiptVerificationError, match='PREVIEW_RECEIPT_INVALID'):
        signer.verify(
            receipt[:-1] + ('A' if receipt[-1] != 'A' else 'B'),
            kind='v4_analysis',
            provider_plan_hash='a' * 64,
            subject_ids={'vacancy_id': 'vacancy-1'},
            provider='openai',
            model='gpt-4o',
            privacy_policy_fingerprint='b' * 64,
        )

    with pytest.raises(ReceiptVerificationError, match='PREVIEW_RECEIPT_STALE'):
        signer.verify(
            receipt,
            kind='v4_analysis',
            provider_plan_hash='c' * 64,
            subject_ids={'vacancy_id': 'vacancy-1'},
            provider='openai',
            model='gpt-4o',
            privacy_policy_fingerprint='b' * 64,
        )

    now[0] = 1_061.0
    with pytest.raises(ReceiptVerificationError, match='PREVIEW_RECEIPT_EXPIRED'):
        signer.verify(
            receipt,
            kind='v4_analysis',
            provider_plan_hash='a' * 64,
            subject_ids={'vacancy_id': 'vacancy-1'},
            provider='openai',
            model='gpt-4o',
            privacy_policy_fingerprint='b' * 64,
        )

    unavailable = ReceiptSigner()
    assert (
        unavailable.issue(
            kind='v4_analysis',
            provider_plan_hash='a' * 64,
            subject_ids={'vacancy_id': 'vacancy-1'},
            provider='openai',
            model='gpt-4o',
            privacy_policy_fingerprint='b' * 64,
        )
        is None
    )
    with pytest.raises(ReceiptKeyUnavailableError):
        unavailable.verify(
            receipt,
            kind='v4_analysis',
            provider_plan_hash='a' * 64,
            subject_ids={'vacancy_id': 'vacancy-1'},
            provider='openai',
            model='gpt-4o',
            privacy_policy_fingerprint='b' * 64,
        )


def test_missing_policy_blocks_before_provider(
    client_with_db: TestClient,
    db_session: Session,
    valid_engine: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_token(TOKEN, db_session)
    vacancy_id = ingest(client_with_db)
    provider_calls = 0

    def fail_provider(*_args: object, **_kwargs: object) -> object:
        nonlocal provider_calls
        provider_calls += 1
        raise AssertionError('provider must not be created')

    monkeypatch.setattr('app.analysis.service.create_provider', fail_provider)
    response = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze',
        json={'confirmation': True, 'preview_receipt': 'not-used'},
        headers=headers(),
    )
    assert response.status_code == 403
    assert provider_calls == 0


def test_ai_disabled_policy_blocks_new_provider_attempt(
    client_with_db: TestClient,
    db_session: Session,
    valid_engine: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_token(TOKEN, db_session)
    vacancy_id = ingest(client_with_db)
    disabled = policy(ai_enabled=False, allow_full_description_to_ai=False)
    preview = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze?preview=true',
        json={'policy': disabled},
        headers=headers(),
    )
    assert preview.status_code == 200, preview.text
    receipt = preview.json()['data']['receipt']
    provider_calls = 0

    def fail_provider(*_args: object, **_kwargs: object) -> object:
        nonlocal provider_calls
        provider_calls += 1
        raise AssertionError('provider must not be created')

    monkeypatch.setattr('app.analysis.service.create_provider', fail_provider)
    response = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze',
        json={
            'confirmation': True,
            'preview_receipt': receipt,
            'policy': disabled,
        },
        headers=headers(),
    )
    assert response.status_code == 403
    assert provider_calls == 0


def test_privacy_policy_change_stales_receipt_before_provider(
    client_with_db: TestClient,
    db_session: Session,
    valid_engine: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_token(TOKEN, db_session)
    vacancy_id = ingest(client_with_db)
    reviewed = policy()
    preview = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze?preview=true',
        json={'policy': reviewed},
        headers=headers(),
    )
    assert preview.status_code == 200, preview.text
    provider_calls = 0

    def fail_provider(*_args: object, **_kwargs: object) -> object:
        nonlocal provider_calls
        provider_calls += 1
        raise AssertionError('stale receipt must block provider')

    monkeypatch.setattr('app.analysis.service.create_provider', fail_provider)
    changed = policy(redact_contacts=False)
    response = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze',
        json={
            'confirmation': True,
            'preview_receipt': preview.json()['data']['receipt'],
            'policy': changed,
        },
        headers=headers(),
    )
    assert response.status_code == 409
    assert provider_calls == 0


def test_concurrent_identical_full_v4_requests_share_one_provider_attempt(
    client_with_db: TestClient,
    db_session: Session,
    valid_engine: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_token(TOKEN, db_session)
    vacancy_id = ingest(client_with_db)
    reviewed = policy()
    preview = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze?preview=true',
        json={'policy': reviewed},
        headers=headers(),
    )
    assert preview.status_code == 200, preview.text

    started = threading.Event()
    release = threading.Event()

    class BlockingProvider(FakeProvider):
        async def analyze_vacancy(self, request):  # type: ignore[no-untyped-def]
            started.set()
            assert release.wait(5), 'test provider barrier was not released'
            return await super().analyze_vacancy(request)

    provider = BlockingProvider()
    monkeypatch.setattr('app.analysis.service.create_provider', lambda *args, **kwargs: provider)
    body = {
        'confirmation': True,
        'preview_receipt': preview.json()['data']['receipt'],
        'policy': reviewed,
        'force': True,
    }

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(
            client_with_db.post,
            f'/api/v1/vacancies/{vacancy_id}/analyze',
            json=body,
            headers=headers(),
        )
        assert started.wait(5), 'the first provider owner did not reach dispatch'
        second = executor.submit(
            client_with_db.post,
            f'/api/v1/vacancies/{vacancy_id}/analyze',
            json=body,
            headers=headers(),
        )
        release.set()
        first_response = first.result(timeout=10)
        second_response = second.result(timeout=10)

    assert first_response.status_code == 200, first_response.text
    assert second_response.status_code == 200, second_response.text
    assert provider.call_count == 1

    from app.db.models import EngineRun, ProviderAttempt, ProviderExecution

    db_session.rollback()
    assert db_session.query(ProviderExecution).count() == 1
    assert db_session.query(ProviderAttempt).count() == 1
    assert db_session.query(EngineRun).count() == 1


def test_direct_full_v4_and_application_factory_share_execution_coordination(
    client_with_db: TestClient,
    db_session: Session,
    valid_engine: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_token(TOKEN, db_session)
    vacancy_id = ingest(client_with_db)
    reviewed = policy()
    direct_preview = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze?preview=true',
        json={'policy': reviewed},
        headers=headers(),
    )
    batch_preview = client_with_db.post(
        '/api/v1/application-sessions/preview',
        json={'vacancy_ids': [vacancy_id], 'policy': reviewed},
        headers=headers(),
    )
    assert direct_preview.status_code == 200, direct_preview.text
    assert batch_preview.status_code == 200, batch_preview.text
    assert (
        direct_preview.json()['data']['provider_plan_hash']
        == batch_preview.json()['data']['items'][0]['provider_plan_hash']
    )
    direct_receipt = direct_preview.json()['data']['receipt']
    batch_receipt = batch_preview.json()['data']['items'][0]['receipt']
    assert direct_receipt and batch_receipt

    created = client_with_db.post(
        '/api/v1/application-sessions',
        json={
            'vacancy_ids': [vacancy_id],
            'confirmation': True,
            'policy': reviewed,
            'preview_receipts': {vacancy_id: batch_preview.json()['data']['items'][0]['receipt']},
        },
        headers=headers(),
    )
    assert created.status_code == 201, created.text
    session_id = created.json()['data']['id']

    started = threading.Event()
    release = threading.Event()

    class BlockingProvider(FakeProvider):
        async def analyze_vacancy(self, request):  # type: ignore[no-untyped-def]
            started.set()
            assert release.wait(5), 'test provider barrier was not released'
            return await super().analyze_vacancy(request)

    provider = BlockingProvider()
    monkeypatch.setattr('app.analysis.service.create_provider', lambda *args, **kwargs: provider)
    direct_body = {
        'confirmation': True,
        'preview_receipt': direct_receipt,
        'policy': reviewed,
        'force': True,
    }
    batch_body = {
        'confirmation': True,
        'policy': reviewed,
        'preview_receipts': {vacancy_id: batch_preview.json()['data']['items'][0]['receipt']},
    }

    with ThreadPoolExecutor(max_workers=2) as executor:
        direct = executor.submit(
            client_with_db.post,
            f'/api/v1/vacancies/{vacancy_id}/analyze',
            json=direct_body,
            headers=headers(),
        )
        assert started.wait(5), 'direct Full V4 did not reach dispatch'
        batch = executor.submit(
            client_with_db.post,
            f'/api/v1/application-sessions/{session_id}/execute',
            json=batch_body,
            headers=headers(),
        )
        release.set()
        direct_response = direct.result(timeout=10)
        batch_response = batch.result(timeout=10)

    assert direct_response.status_code == 200, direct_response.text
    assert batch_response.status_code == 200, batch_response.text
    assert provider.call_count == 1

    from app.db.models import ApplicationSession, EngineRun, ProviderAttempt, ProviderExecution

    db_session.rollback()
    assert db_session.query(ApplicationSession).count() == 1
    assert db_session.query(ProviderExecution).count() == 1
    assert db_session.query(ProviderAttempt).count() == 1
    assert db_session.query(EngineRun).count() == 1
