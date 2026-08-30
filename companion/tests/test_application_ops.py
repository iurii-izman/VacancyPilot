"""AOPS-13 transition, event and follow-up API coverage."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import Vacancy
from app.security.pairing import generate_client_token, hash_client_token


def _auth(session: Session) -> dict[str, str]:
    token = generate_client_token()
    session.execute(
        text(
            'INSERT INTO settings (key, value_json, revision, created_at, updated_at) '
            'VALUES (:key, :value, 1, :now, :now)'
        ),
        {
            'key': 'pairing_client_token_hash',
            'value': hash_client_token(token),
            'now': '2026-08-30T00:00:00Z',
        },
    )
    session.commit()
    return {'X-VacancyPilot-Client': token}


def _vacancy(session: Session) -> Vacancy:
    vacancy = Vacancy(
        source='hh',
        source_vacancy_id='aops13-test',
        title='Python Engineer',
        company_name='Synthetic Co',
        work_mode='remote',
        description='A synthetic vacancy',
        first_seen_at='2026-08-30T00:00:00Z',
        last_seen_at='2026-08-30T00:00:00Z',
        updated_at='2026-08-30T00:00:00Z',
    )
    session.add(vacancy)
    session.commit()
    return vacancy


def _application(
    client: TestClient, session: Session, headers: dict[str, str]
) -> dict[str, object]:
    vacancy = _vacancy(session)
    response = client.post('/api/v1/applications', json={'vacancy_id': vacancy.id}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()['data']


def test_status_transition_and_applied_invariant(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    app = _application(client_with_db, db_session, headers)
    app_id = app['id']
    response = client_with_db.patch(
        f'/api/v1/applications/{app_id}',
        json={'expected_revision': 1, 'status': 'analyzed'},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()['data']['status'] == 'analyzed'
    stale = client_with_db.patch(
        f'/api/v1/applications/{app_id}',
        json={
            'expected_revision': 1,
            'status': 'applied',
            'confirmation': True,
            'application_without_letter': True,
            'reason': 'application_without_letter',
        },
        headers=headers,
    )
    assert stale.status_code == 409
    applied = client_with_db.patch(
        f'/api/v1/applications/{app_id}',
        json={
            'expected_revision': 2,
            'status': 'applied',
            'confirmation': True,
            'application_without_letter': True,
            'reason': 'application_without_letter',
        },
        headers=headers,
    )
    assert applied.status_code == 200
    assert applied.json()['data']['status'] == 'applied'


def test_application_creation_cannot_bypass_applied_confirmation(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    vacancy = _vacancy(db_session)
    response = client_with_db.post(
        '/api/v1/applications',
        json={'vacancy_id': vacancy.id, 'status': 'applied'},
        headers=headers,
    )
    assert response.status_code == 409


def test_informational_hh_event_does_not_change_status_and_is_idempotent(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    app = _application(client_with_db, db_session, headers)
    payload = {
        'event_type': 'HH_EMPLOYER_VIEWED',
        'source': 'hh_sync',
        'idempotency_key': 'hh-event-1',
        'payload': {'signal': 'viewed'},
    }
    first = client_with_db.post(
        f'/api/v1/applications/{app["id"]}/events', json=payload, headers=headers
    )
    second = client_with_db.post(
        f'/api/v1/applications/{app["id"]}/events', json=payload, headers=headers
    )
    assert first.status_code == second.status_code == 200
    assert first.json()['data']['id'] == second.json()['data']['id']
    listed = client_with_db.get(f'/api/v1/applications/{app["id"]}/events', headers=headers)
    assert listed.status_code == 200
    assert any(event['source'] == 'hh_sync' for event in listed.json()['data'])
    applications = client_with_db.get('/api/v1/applications', headers=headers).json()['data']
    assert applications[0]['status'] == 'saved'


def test_followup_lifecycle_and_offline_draft(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    app = _application(client_with_db, db_session, headers)
    due = (datetime.now(UTC) - timedelta(days=1)).isoformat().replace('+00:00', 'Z')
    created = client_with_db.post(
        '/api/v1/followups',
        json={'application_id': app['id'], 'reason': 'explicit_user_reminder', 'due_at': due},
        headers=headers,
    )
    assert created.status_code == 200
    item = created.json()['data']
    assert item['derived_state'] == 'overdue'
    generated = client_with_db.post(
        f'/api/v1/followups/{item["id"]}/generate', json={'expected_revision': 1}, headers=headers
    )
    assert generated.status_code == 200
    assert 'Python Engineer' in generated.json()['data']['draft_text']
    assert generated.json()['data']['sent_at'] is None
    completed = client_with_db.patch(
        f'/api/v1/followups/{item["id"]}',
        json={'expected_revision': 2, 'status': 'completed'},
        headers=headers,
    )
    assert completed.status_code == 200
    assert completed.json()['data']['status'] == 'completed'


def test_followup_state_filters_apply_before_pagination(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    app = _application(client_with_db, db_session, headers)
    future = (datetime.now(UTC) + timedelta(days=2)).isoformat().replace('+00:00', 'Z')
    overdue = (datetime.now(UTC) - timedelta(days=2)).isoformat().replace('+00:00', 'Z')
    for due_at, reason in ((future, 'future'), (overdue, 'past')):
        response = client_with_db.post(
            '/api/v1/followups',
            json={'application_id': app['id'], 'reason': reason, 'due_at': due_at},
            headers=headers,
        )
        assert response.status_code == 200
    upcoming = client_with_db.get(
        '/api/v1/followups?state=upcoming&limit=1&offset=0', headers=headers
    )
    assert upcoming.status_code == 200
    assert upcoming.json()['meta']['total'] == 1
    assert upcoming.json()['data'][0]['reason'] == 'future'
