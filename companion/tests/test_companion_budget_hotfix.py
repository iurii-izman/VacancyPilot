"""Regression coverage for durable Companion budget-denial settlement."""

from __future__ import annotations

import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.analysis.coordinator import (
    ProviderCoordinator,
    build_operation_key,
)
from app.analysis.models import ProviderInputPolicy
from app.analysis.provider import FakeProvider, _default_fake_response
from app.db.engine import get_session_factory
from app.db.models import Application, ProviderAttempt, ProviderExecution
from app.security.auth import hash_client_token
from app.security.pairing import generate_client_token

TOKEN = generate_client_token()
ENGINE_FIXTURES = Path(__file__).resolve().parent / 'engine_fixtures' / 'valid-minimal'


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


def _headers() -> dict[str, str]:
    return {'X-VacancyPilot-Client': TOKEN}


def _register_token(token: str, session: Session) -> None:
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


def _policy(**overrides: object) -> dict[str, object]:
    value = ProviderInputPolicy(
        ai_enabled=True,
        provider='openai',
        privacy_mode='standard',
        allow_full_description_to_ai=True,
        allow_resume_highlights_to_ai=False,
        redact_contacts=True,
        daily_request_limit=10,
        cache_enabled=False,
    ).model_dump()
    value.update(overrides)
    return value


def _ingest(client: TestClient, source_id: str = 'budget-hotfix-vacancy') -> str:
    response = client.post(
        '/api/v1/vacancies/intake',
        json={
            'schema_version': 1,
            'source': 'test_source',
            'source_vacancy_id': source_id,
            'title': 'Python Developer',
            'company_name': 'Synthetic Co',
            'description': 'A long enough synthetic vacancy description for analysis.',
            'skills': ['Python', 'FastAPI'],
        },
        headers=_headers(),
    )
    assert response.status_code == 200, response.text
    return response.json()['data']['vacancy_id']


def _operation(label: str) -> tuple[str, dict[str, object]]:
    plan_hash = label * 64
    key = build_operation_key(
        operation_kind='v4_analysis',
        subject_ids={'vacancy_id': label},
        provider_plan_hash=plan_hash,
    )
    return key, {
        'operation_key': key,
        'operation_kind': 'v4_analysis',
        'subject_key': label,
        'provider_plan_hash': plan_hash,
        'provider': 'fake',
        'model': 'fake-model',
    }


def _claim(coordinator: ProviderCoordinator, label: str):
    _key, kwargs = _operation(label)
    return coordinator.claim_operation(**kwargs)


def _fresh_execution(engine: Engine, execution_id: str | None = None) -> ProviderExecution:
    factory = get_session_factory(engine)
    with factory() as session:
        query = select(ProviderExecution)
        if execution_id is not None:
            query = query.where(ProviderExecution.id == execution_id)
        return session.execute(query).scalar_one()


def _fresh_attempts(engine: Engine, execution_id: str) -> list[ProviderAttempt]:
    factory = get_session_factory(engine)
    with factory() as session:
        return list(
            session.execute(
                select(ProviderAttempt)
                .where(ProviderAttempt.execution_id == execution_id)
                .order_by(ProviderAttempt.attempt_number)
            ).scalars()
        )


@pytest.mark.parametrize(
    ('daily_limit', 'consume_slot'),
    [(0, False), (1, True)],
    ids=['zero-limit', 'exhausted-positive-limit'],
)
def test_budget_denial_commits_state_from_a_new_session(
    db_engine: Engine,
    daily_limit: int,
    consume_slot: bool,
) -> None:
    coordinator = ProviderCoordinator(db_engine)
    if consume_slot:
        consumed = _claim(coordinator, 's')
        allowed = coordinator.reserve_and_mark_dispatching(
            execution_id=consumed.execution_id,
            owner_token=consumed.owner_token,
            scope='companion',
            day_key='2026-09-10',
            daily_limit=1,
            attempt_number=1,
        )
        assert allowed.allowed is True

    key, kwargs = _operation('a')
    claim = coordinator.claim_operation(**kwargs)
    denied = coordinator.reserve_and_mark_dispatching(
        execution_id=claim.execution_id,
        owner_token=claim.owner_token,
        scope='companion',
        day_key='2026-09-10',
        daily_limit=daily_limit,
        attempt_number=1,
    )

    assert denied.allowed is False
    assert denied.attempt_id is None
    assert denied.reason == 'AI_BUDGET_EXCEEDED'

    persisted = _fresh_execution(db_engine, claim.execution_id)
    assert persisted.state == 'budget_blocked'
    assert persisted.error_category == 'AI_BUDGET_EXCEEDED'
    assert persisted.attempt_count == 0
    assert _fresh_attempts(db_engine, claim.execution_id) == []

    terminal = coordinator.wait_for_terminal(operation_key=key, timeout_seconds=0)
    assert terminal is not None
    assert terminal.state == 'budget_blocked'
    assert terminal.error_category == 'AI_BUDGET_EXCEEDED'


def test_full_v4_initial_budget_denial_is_durable_and_same_key_does_not_wait(
    client_with_db: TestClient,
    db_engine: Engine,
    db_session: Session,
    valid_engine: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del valid_engine
    _register_token(TOKEN, db_session)
    vacancy_id = _ingest(client_with_db, 'budget-hotfix-full-v4')
    reviewed = _policy(daily_request_limit=0)
    preview = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze?preview=true',
        json={'policy': reviewed},
        headers=_headers(),
    )
    assert preview.status_code == 200, preview.text
    receipt = preview.json()['data']['receipt']
    provider = FakeProvider()
    monkeypatch.setattr('app.analysis.service.create_provider', lambda *a, **k: provider)

    body = {
        'force': True,
        'confirmation': True,
        'preview_receipt': receipt,
        'policy': reviewed,
    }
    first = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze',
        json=body,
        headers=_headers(),
    )
    assert first.status_code == 429, first.text
    assert first.json()['error']['code'] == 'AI_BUDGET_EXCEEDED'
    assert provider.call_count == 0

    persisted = _fresh_execution(db_engine)
    assert persisted.state == 'budget_blocked'
    assert persisted.error_category == 'AI_BUDGET_EXCEEDED'
    assert _fresh_attempts(db_engine, persisted.id) == []

    def fail_if_waited(*_args: object, **_kwargs: object) -> None:
        raise AssertionError('budget_blocked must not enter the in-flight waiter')

    monkeypatch.setattr(
        'app.analysis.coordinator.ProviderCoordinator.wait_for_terminal', fail_if_waited
    )
    second = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze',
        json=body,
        headers=_headers(),
    )
    assert second.status_code == 429, second.text
    assert second.json()['error']['code'] == 'AI_BUDGET_EXCEEDED'
    assert provider.call_count == 0


def test_r5_budget_denial_leaves_item_resumable_without_application(
    client_with_db: TestClient,
    db_engine: Engine,
    db_session: Session,
    valid_engine: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del valid_engine
    _register_token(TOKEN, db_session)
    vacancy_id = _ingest(client_with_db, 'budget-hotfix-r5')
    reviewed = _policy(daily_request_limit=0)
    preview = client_with_db.post(
        '/api/v1/application-sessions/preview',
        json={'vacancy_ids': [vacancy_id], 'policy': reviewed},
        headers=_headers(),
    )
    assert preview.status_code == 200, preview.text
    receipt = preview.json()['data']['items'][0]['receipt']
    create = client_with_db.post(
        '/api/v1/application-sessions',
        json={
            'vacancy_ids': [vacancy_id],
            'confirmation': True,
            'policy': reviewed,
            'preview_receipts': {vacancy_id: receipt},
        },
        headers=_headers(),
    )
    assert create.status_code == 201, create.text
    session_id = create.json()['data']['id']

    provider = FakeProvider()
    monkeypatch.setattr('app.analysis.service.create_provider', lambda *a, **k: provider)
    execute = client_with_db.post(
        f'/api/v1/application-sessions/{session_id}/execute',
        json={
            'confirmation': True,
            'policy': reviewed,
            'preview_receipts': {vacancy_id: receipt},
        },
        headers=_headers(),
    )
    assert execute.status_code == 200, execute.text
    item = execute.json()['data']['items'][0]
    assert item['queue_state'] == 'NEEDS_ANALYSIS'
    assert item['error_message'] == 'AI_BUDGET_EXCEEDED'
    assert item['analysis_run_id'] is None
    assert provider.call_count == 0

    persisted = _fresh_execution(db_engine)
    assert persisted.state == 'budget_blocked'
    assert persisted.error_category == 'AI_BUDGET_EXCEEDED'
    assert _fresh_attempts(db_engine, persisted.id) == []
    factory = get_session_factory(db_engine)
    with factory() as session:
        assert (
            session.scalar(select(Application).where(Application.vacancy_id == vacancy_id)) is None
        )


def test_repair_budget_denial_is_durable_and_does_not_replay_initial_call(
    client_with_db: TestClient,
    db_engine: Engine,
    db_session: Session,
    valid_engine: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del valid_engine
    _register_token(TOKEN, db_session)
    vacancy_id = _ingest(client_with_db, 'budget-hotfix-repair')
    reviewed = _policy(daily_request_limit=1)
    preview = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze?preview=true',
        json={'policy': reviewed},
        headers=_headers(),
    )
    assert preview.status_code == 200, preview.text
    receipt = preview.json()['data']['receipt']
    invalid = _default_fake_response()
    invalid['evidence_map'][0]['claim_id'] = 'NOT-IN-INDEX'
    provider = FakeProvider(response=invalid)
    monkeypatch.setattr('app.analysis.service.create_provider', lambda *a, **k: provider)
    body = {
        'force': True,
        'confirmation': True,
        'preview_receipt': receipt,
        'policy': reviewed,
    }

    first = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze',
        json=body,
        headers=_headers(),
    )
    assert first.status_code == 200, first.text
    data = first.json()['data']
    assert data['status'] == 'invalid'
    assert 'AI_BUDGET_EXCEEDED' in data['validation_errors']
    assert provider.call_count == 1
    assert provider.repair_count == 0

    persisted = _fresh_execution(db_engine)
    attempts = _fresh_attempts(db_engine, persisted.id)
    assert persisted.state == 'budget_blocked'
    assert persisted.error_category == 'AI_BUDGET_EXCEEDED'
    assert persisted.attempt_count == 1
    assert len(attempts) == 1
    assert attempts[0].attempt_number == 1
    assert attempts[0].state == 'consumed'

    def fail_if_waited(*_args: object, **_kwargs: object) -> None:
        raise AssertionError('budget_blocked must not enter the in-flight waiter')

    monkeypatch.setattr(
        'app.analysis.coordinator.ProviderCoordinator.wait_for_terminal', fail_if_waited
    )
    second = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze',
        json=body,
        headers=_headers(),
    )
    assert second.status_code == 429, second.text
    assert second.json()['error']['code'] == 'AI_BUDGET_EXCEEDED'
    assert provider.call_count == 1
    assert provider.repair_count == 0
    assert len(_fresh_attempts(db_engine, persisted.id)) == 1


def test_concurrent_same_key_initial_denial_converges_without_wait_timeout(
    client_with_db: TestClient,
    db_engine: Engine,
    db_session: Session,
    valid_engine: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del valid_engine
    _register_token(TOKEN, db_session)
    vacancy_id = _ingest(client_with_db, 'budget-hotfix-concurrent')
    reviewed = _policy(daily_request_limit=0)
    preview = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze?preview=true',
        json={'policy': reviewed},
        headers=_headers(),
    )
    assert preview.status_code == 200, preview.text
    body = {
        'force': True,
        'confirmation': True,
        'preview_receipt': preview.json()['data']['receipt'],
        'policy': reviewed,
    }
    provider = FakeProvider()
    monkeypatch.setattr('app.analysis.service.create_provider', lambda *a, **k: provider)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(
                client_with_db.post,
                f'/api/v1/vacancies/{vacancy_id}/analyze',
                json=body,
                headers=_headers(),
            )
            for _ in range(2)
        ]
        responses = [future.result(timeout=5) for future in futures]

    assert [response.status_code for response in responses] == [429, 429]
    assert all(response.json()['error']['code'] == 'AI_BUDGET_EXCEEDED' for response in responses)
    assert provider.call_count == 0
    with get_session_factory(db_engine)() as session:
        executions = session.scalars(select(ProviderExecution)).all()
        assert len(executions) == 1
        assert executions[0].state == 'budget_blocked'
        assert executions[0].error_category == 'AI_BUDGET_EXCEEDED'
        assert session.scalar(select(ProviderAttempt)) is None
