"""AOPS-10 authenticated profile and manual sync API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.hh.models import HHPage
from app.security.pairing import generate_client_token, hash_client_token


def test_browser_oauth_callback_is_loopback_page_without_client_header(
    client: TestClient,
) -> None:
    response = client.get('/api/v1/hh/auth/callback?error=access_denied')
    assert response.status_code == 400
    assert 'authorization failed' in response.text.lower()
    assert response.headers['content-type'].startswith('text/html')


def _auth(db: Session) -> dict[str, str]:
    token = generate_client_token()
    db.execute(
        text(
            'INSERT OR REPLACE INTO settings '
            '(key, value_json, revision, created_at, updated_at) '
            'VALUES (:key, :value, 1, :now, :now)'
        ),
        {
            'key': 'pairing_client_token_hash',
            'value': hash_client_token(token),
            'now': '2026-08-30T00:00:00Z',
        },
    )
    db.commit()
    return {'X-VacancyPilot-Client': token}


def test_search_profiles_crud_and_stale_revision(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    response = client_with_db.post(
        '/api/v1/hh/search-profiles',
        headers=headers,
        json={'name': 'Python remote', 'query': {'text': 'python'}, 'enabled': True},
    )
    assert response.status_code == 201
    profile = response.json()['data']
    assert profile['query']['schema_version'] == 1
    assert 'token' not in response.text.lower()

    listed = client_with_db.get('/api/v1/hh/search-profiles', headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()['data']) == 1

    stale = client_with_db.patch(
        f'/api/v1/hh/search-profiles/{profile["id"]}',
        headers=headers,
        json={'revision': 99, 'enabled': False},
    )
    assert stale.status_code == 409


def test_vacancy_sync_reuses_intake_and_records_safe_audit(
    client_with_db: TestClient, db_session: Session, monkeypatch
) -> None:
    headers = _auth(db_session)
    created = client_with_db.post(
        '/api/v1/hh/search-profiles',
        headers=headers,
        json={'name': 'Backend', 'query': {'text': 'backend'}, 'enabled': True},
    )
    profile_id = created.json()['data']['id']

    class FakeHHClient:
        def search_vacancies(self, query, *, page, per_page):
            assert query == {'text': 'backend'}
            assert page == 0
            assert per_page in (1, 100)
            return HHPage.model_validate(
                {
                    'items': [
                        {
                            'id': 'hh-1',
                            'name': 'Backend Engineer',
                            'alternate_url': 'https://hh.ru/vacancy/hh-1',
                            'employer': {'id': 'e-1', 'name': 'Example'},
                            'area': {'id': 'a-1', 'name': 'Chisinau'},
                            'description': '<p>Python</p>',
                        },
                        {
                            'id': 'hh-2',
                            'name': 'Backend Platform Engineer',
                            'alternate_url': 'https://hh.ru/vacancy/hh-2',
                            'employer': {'id': 'e-1', 'name': 'Example'},
                            'area': {'id': 'a-1', 'name': 'Chisinau'},
                            'description': '<p>Python and SQLite</p>',
                        },
                    ],
                    'page': 0,
                    'pages': 1,
                    'per_page': 100,
                    'found': 2,
                }
            )

    monkeypatch.setattr('app.api.hh.HHApiClient', FakeHHClient)
    response = client_with_db.post(
        '/api/v1/hh/sync/vacancies', headers=headers, json={'profile_ids': [profile_id]}
    )
    assert response.status_code == 200
    result = response.json()['data']
    assert result['status'] == 'success'
    assert result['vacancies_created'] == 2
    assert result['snapshots_created'] == 2

    response2 = client_with_db.post(
        '/api/v1/hh/sync/vacancies', headers=headers, json={'profile_ids': [profile_id]}
    )
    assert response2.json()['data']['vacancies_unchanged'] == 2
    assert response2.json()['data']['snapshots_created'] == 0
    audit = db_session.execute(text('SELECT result_json FROM hh_sync_runs')).scalars().all()
    assert len(audit) == 2
    assert all('Bearer' not in (item or '') for item in audit)


def test_preview_returns_found_without_persistence(
    client_with_db: TestClient, db_session: Session, monkeypatch
) -> None:
    headers = _auth(db_session)
    created = client_with_db.post(
        '/api/v1/hh/search-profiles',
        headers=headers,
        json={
            'name': 'Title only',
            'query': {
                'text': 'аналитик',
                'search_field': ['name'],
                'period': 14,
                'schedule': ['remote'],
            },
        },
    )
    profile_id = created.json()['data']['id']
    calls = []

    class FakeHHClient:
        def search_vacancies(self, query, *, page, per_page):
            calls.append((query, page, per_page))
            return HHPage.model_validate(
                {'found': 84, 'items': [], 'page': 0, 'pages': 1, 'per_page': 1}
            )

    monkeypatch.setattr('app.api.hh.HHApiClient', FakeHHClient)
    before = db_session.execute(text('SELECT COUNT(*) FROM vacancies')).scalar_one()
    response = client_with_db.post(
        f'/api/v1/hh/search-profiles/{profile_id}/preview', headers=headers, json={}
    )
    assert response.status_code == 200
    assert response.json()['data']['found'] == 84
    assert response.json()['data']['classification'] == 'GOOD'
    assert calls == [
        ({'text': 'аналитик', 'schedule': ['remote'], 'search_field': ['name'], 'period': 14}, 0, 1)
    ]
    assert db_session.execute(text('SELECT COUNT(*) FROM vacancies')).scalar_one() == before
    assert db_session.execute(text('SELECT COUNT(*) FROM hh_sync_runs')).scalar_one() == 0


def test_too_broad_profile_is_not_ingested(
    client_with_db: TestClient, db_session: Session, monkeypatch
) -> None:
    headers = _auth(db_session)
    created = client_with_db.post(
        '/api/v1/hh/search-profiles',
        headers=headers,
        json={'name': 'Broad', 'query': {'text': 'ai'}},
    )
    profile_id = created.json()['data']['id']
    calls = []

    class FakeHHClient:
        def search_vacancies(self, query, *, page, per_page):
            calls.append((page, per_page))
            return HHPage.model_validate(
                {
                    'found': 2000,
                    'items': [{'id': 'must-not-persist'}],
                    'page': 0,
                    'pages': 20,
                    'per_page': per_page,
                }
            )

    monkeypatch.setattr('app.api.hh.HHApiClient', FakeHHClient)
    response = client_with_db.post(
        '/api/v1/hh/sync/vacancies', headers=headers, json={'profile_ids': [profile_id]}
    )
    data = response.json()['data']
    assert response.status_code == 200
    assert data['too_broad'] == 1
    assert data['profiles'][0]['error'] == 'HH_QUERY_TOO_BROAD'
    assert data['items_seen'] == 0
    assert calls == [(0, 1)]
    assert db_session.execute(text('SELECT COUNT(*) FROM vacancies')).scalar_one() == 0
