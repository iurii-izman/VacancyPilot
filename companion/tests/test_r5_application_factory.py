"""R5 deterministic safety coverage: selection, preview and queue persistence."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.analysis.models import ProviderInputPolicy
from app.db.models import Application, ApplicationSession, ApplicationSessionItem, Vacancy
from app.security.pairing import generate_client_token, hash_client_token


def auth(session: Session) -> dict[str, str]:
    token = generate_client_token()
    session.execute(
        text(
            'INSERT INTO settings (key, value_json, revision, created_at, updated_at) '
            "VALUES ('pairing_client_token_hash', :v, 1, :n, :n)"
        ),
        {'v': hash_client_token(token), 'n': '2026-08-31T00:00:00Z'},
    )
    session.commit()
    return {'X-VacancyPilot-Client': token}


def vacancy(session: Session, source_id: str, archived: bool = False) -> Vacancy:
    row = Vacancy(
        source='hh',
        source_vacancy_id=source_id,
        title=source_id,
        archived=archived,
        first_seen_at='2026-08-31T00:00:00Z',
        last_seen_at='2026-08-31T00:00:00Z',
        updated_at='2026-08-31T00:00:00Z',
    )
    session.add(row)
    session.commit()
    return row


def policy() -> dict[str, object]:
    return ProviderInputPolicy(
        ai_enabled=True,
        provider='openai',
        privacy_mode='strict',
        allow_full_description_to_ai=False,
        allow_resume_highlights_to_ai=False,
        daily_request_limit=10,
        cache_enabled=True,
    ).model_dump()


def test_application_factory_preview_has_no_application_side_effects(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = auth(db_session)
    row = vacancy(db_session, 'r5-preview')
    before = (
        db_session.query(Application).count(),
        db_session.query(ApplicationSession).count(),
        db_session.query(ApplicationSessionItem).count(),
    )
    response = client_with_db.post(
        '/api/v1/application-sessions/preview', json={'vacancy_ids': [row.id]}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()['data']['expected_provider_calls'] == 1
    assert db_session.query(type(row)).count() == 1
    assert (
        db_session.query(Application).count(),
        db_session.query(ApplicationSession).count(),
        db_session.query(ApplicationSessionItem).count(),
    ) == before
    assert db_session.query(Application).filter(Application.status == 'applied').count() == 0


def test_selection_rejects_duplicates_and_execute_requires_confirmation(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = auth(db_session)
    row = vacancy(db_session, 'r5-duplicate')
    duplicate = client_with_db.post(
        '/api/v1/application-sessions', json={'vacancy_ids': [row.id, row.id]}, headers=headers
    )
    assert duplicate.status_code == 422
    created = client_with_db.post(
        '/api/v1/application-sessions',
        json={'vacancy_ids': [row.id], 'policy': policy()},
        headers=headers,
    )
    assert created.status_code == 409

    preview = client_with_db.post(
        '/api/v1/application-sessions/preview',
        json={'vacancy_ids': [row.id], 'policy': policy()},
        headers=headers,
    )
    assert preview.status_code == 200
    receipt = preview.json()['data']['items'][0]['receipt']
    create_body = {
        'vacancy_ids': [row.id],
        'confirmation': True,
        'policy': policy(),
        'preview_receipts': {row.id: receipt},
    }
    created = client_with_db.post('/api/v1/application-sessions', json=create_body, headers=headers)
    assert created.status_code == 201
    session_id = created.json()['data']['id']
    repeated = client_with_db.post(
        '/api/v1/application-sessions', json=create_body, headers=headers
    )
    assert repeated.status_code == 201
    assert repeated.json()['data']['id'] == session_id
    blocked = client_with_db.post(
        f'/api/v1/application-sessions/{session_id}/execute', json={}, headers=headers
    )
    assert blocked.status_code == 409
    loaded = client_with_db.get(f'/api/v1/application-sessions/{session_id}', headers=headers)
    assert loaded.status_code == 200
    assert loaded.json()['data']['items'][0]['queue_state'] == 'NEEDS_ANALYSIS'
