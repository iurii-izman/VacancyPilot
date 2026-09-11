"""AOPS-10 authenticated profile and manual sync API tests."""

from __future__ import annotations

import threading

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import SearchProfile, Vacancy
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


def test_sync_scope_rejects_duplicates_and_caps_all_enabled_profiles(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    first = SearchProfile(name='First', query_json='{"text":"first"}', enabled=True, schedule=None)
    db_session.add(first)
    db_session.commit()
    db_session.refresh(first)

    duplicate = client_with_db.post(
        '/api/v1/hh/sync/vacancies',
        headers=headers,
        json={'profile_ids': [first.id, first.id]},
    )
    assert duplicate.status_code == 422
    assert duplicate.json()['error']['code'] == 'HH_SYNC_SCOPE_DUPLICATE'

    db_session.add_all(
        [
            SearchProfile(
                name=f'Profile {index}',
                query_json='{"text":"bounded"}',
                enabled=True,
                schedule=None,
            )
            for index in range(50)
        ]
    )
    db_session.commit()

    capped = client_with_db.post(
        '/api/v1/hh/sync/vacancies',
        headers=headers,
        json={'all_enabled': True},
    )
    assert capped.status_code == 422
    assert capped.json()['error']['code'] == 'HH_SYNC_PROFILE_LIMIT'


def test_sync_scope_rejects_explicit_profile_lists_over_limit(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    response = client_with_db.post(
        '/api/v1/hh/sync/vacancies',
        headers=headers,
        json={'profile_ids': [f'profile-{index}' for index in range(51)]},
    )
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'HH_SYNC_PROFILE_LIMIT'


def test_identical_sync_scope_is_single_flighted(
    client_with_db: TestClient, db_session: Session, monkeypatch
) -> None:
    headers = _auth(db_session)
    profile = SearchProfile(
        name='Single flight', query_json='{"text":"single-flight"}', enabled=True, schedule=None
    )
    db_session.add(profile)
    db_session.commit()
    db_session.refresh(profile)
    entered = threading.Event()
    release = threading.Event()
    calls: list[tuple[int, int]] = []

    class FakeHHClient:
        def search_vacancies(self, query, *, page, per_page):
            calls.append((page, per_page))
            if per_page == 1:
                entered.set()
                assert release.wait(timeout=2)
            return HHPage.model_validate(
                {'found': 0, 'items': [], 'page': page, 'pages': 0, 'per_page': per_page}
            )

    monkeypatch.setattr('app.api.hh.HHApiClient', FakeHHClient)
    first_result: dict[str, object] = {}

    def run_first() -> None:
        first_result['response'] = client_with_db.post(
            '/api/v1/hh/sync/vacancies',
            headers=headers,
            json={'profile_ids': [profile.id]},
        )

    worker = threading.Thread(target=run_first)
    worker.start()
    assert entered.wait(timeout=2)
    duplicate = client_with_db.post(
        '/api/v1/hh/sync/vacancies',
        headers=headers,
        json={'profile_ids': [profile.id]},
    )
    release.set()
    worker.join(timeout=3)

    assert duplicate.status_code == 409
    assert duplicate.json()['error']['code'] == 'HH_SYNC_IN_PROGRESS'
    assert first_result['response'].status_code == 200  # type: ignore[union-attr]
    assert calls == [(0, 1)]


def test_sync_marks_aggregate_item_limit_explicitly(
    client_with_db: TestClient, db_session: Session, monkeypatch
) -> None:
    headers = _auth(db_session)
    profiles = [
        SearchProfile(
            name=f'Bounded {index}',
            query_json=f'{{"text":"bounded-{index}"}}',
            enabled=True,
            schedule=None,
        )
        for index in range(5)
    ]
    db_session.add_all(profiles)
    db_session.commit()
    for profile in profiles:
        db_session.refresh(profile)

    class FakeHHClient:
        def search_vacancies(self, query, *, page, per_page):
            if per_page == 1:
                return HHPage.model_validate(
                    {'found': 500, 'items': [], 'page': 0, 'pages': 5, 'per_page': 1}
                )
            prefix = query['text']
            items = [
                {
                    'id': f'{prefix}-{page}-{index}',
                    'name': 'Bounded role',
                    'alternate_url': f'https://hh.ru/vacancy/{prefix}-{page}-{index}',
                    'employer': {'id': 'bounded-employer', 'name': 'Bounded Co'},
                    'area': {'id': 'bounded-area', 'name': 'Chisinau'},
                    'description': '<p>Bounded</p>',
                }
                for index in range(100)
            ]
            return HHPage.model_validate(
                {'found': 500, 'items': items, 'page': page, 'pages': 5, 'per_page': 100}
            )

    monkeypatch.setattr('app.api.hh.HHApiClient', FakeHHClient)
    response = client_with_db.post(
        '/api/v1/hh/sync/vacancies',
        headers=headers,
        json={'all_enabled': True},
    )
    assert response.status_code == 200
    result = response.json()['data']
    assert result['items_seen'] == 2_000
    assert result['truncated'] is True
    assert result['limit_reached'] is True
    assert result['status'] == 'partial'
    assert {'code': 'HH_SYNC_ITEM_LIMIT', 'profile_id': profiles[-1].id} in result['errors']


def test_selected_vacancy_hydration_updates_full_text_without_application(
    client_with_db: TestClient, db_session: Session, monkeypatch
) -> None:
    headers = _auth(db_session)
    created = client_with_db.post(
        '/api/v1/vacancies/intake',
        headers=headers,
        json={
            'schema_version': 1,
            'source': 'hh',
            'source_vacancy_id': '136022615',
            'title': 'Search result',
            'description': '',
            'skills': [],
        },
    )
    vacancy_id = created.json()['data']['vacancy_id']
    calls = []

    class FakeHHClient:
        def vacancy(self, source_id):
            calls.append(source_id)
            return {
                'id': source_id,
                'name': 'Full role',
                'description': '<p>' + ('Requirement. ' * 25) + '</p>',
                'key_skills': [{'name': 'Python'}],
            }

    monkeypatch.setattr('app.api.vacancies.HHApiClient', FakeHHClient)
    response = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/hydrate', headers=headers, json={}
    )
    assert response.status_code == 200
    assert calls == ['136022615']
    assert len(response.json()['data']['description']) > 200
    assert db_session.query(Vacancy).count() == 1
    assert db_session.execute(text('SELECT COUNT(*) FROM applications')).scalar_one() == 0
