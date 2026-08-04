"""Tests for AOPS-06 companion vacancy intake and triage endpoints.

Covers:
- POST /vacancies/intake: idempotent upsert by (source, source_vacancy_id),
  first/last-seen semantics, one snapshot per actual change, content-derived
  idempotency keys, deterministic fallback identity, 422 on forbidden fields.
- GET  /vacancies and GET /vacancies/{id}: pagination, ordering, 404.
- POST /vacancies/{id}/triage: deterministic no-LLM Stage A — hard gates,
  NEEDS_INPUT, score components, caps, risk flags.
- Auth: every route requires a valid client token.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.security.pairing import (
    generate_client_token,
    hash_client_token,
)
from tests.vacancy_fixtures import (
    FIXTURE_DESCRIPTION_CHANGED,
    FIXTURE_MANUAL_SOURCE,
    FIXTURE_MISSING_COMPANY,
    FIXTURE_MISSING_SALARY,
    FIXTURE_OFFICE_REQUIRED_HARD_FAIL,
    FIXTURE_OVERSIZED_DESCRIPTION,
    FIXTURE_REMOTE_ANYWHERE,
    FIXTURE_REMOTE_RESTRICTED_UNRESOLVED,
    FIXTURE_SAME_TWICE,
)

# ── Helpers ──────────────────────────────────────────────────────────────


def _authenticated_headers(token: str) -> dict[str, str]:
    return {'X-VacancyPilot-Client': token}


def _register_token(token: str, session: Session) -> None:
    """Persist a valid pairing token so the auth dependency accepts it."""
    token_hash = hash_client_token(token)
    now = '2026-08-04T10:00:00Z'
    session.execute(
        text(
            'INSERT OR REPLACE INTO settings '
            '(key, value_json, revision, created_at, updated_at) '
            'VALUES (:key, :value, 1, :now, :now)'
        ),
        {
            'key': 'pairing_client_token_hash',
            'value': token_hash,
            'now': now,
        },
    )
    session.commit()


def _base_vacancy() -> dict[str, object]:
    return {
        'schema_version': 1,
        'source': 'hh',
        'source_vacancy_id': 'v-100',
        'url': 'https://hh.ru/vacancy/12345',
        'title': 'Senior Frontend Engineer',
        'company_id': 'comp-1',
        'company_name': 'Acme Corp',
        'salary_min': 250000,
        'salary_max': 350000,
        'currency': 'RUB',
        'work_mode': 'remote',
        'city': 'Москва',
        'experience': '3–6 лет',
        'description': (
            'Разработка frontend-приложений на React и TypeScript. '
            'Работа с командой дизайнеров и бэкенд-разработчиков. '
            'Участие в code review.'
        ),
        'skills': ['React', 'TypeScript', 'Redux'],
        'captured_at': '2026-08-04T10:00:00Z',
        'capture_source': 'extension:0.3.1',
        'parser_version': '0.3.1',
    }


def _intake(
    client: TestClient,
    body: dict[str, object],
    headers: dict[str, str],
    idem_key: str | None = None,
) -> object:
    kwargs = {}
    if idem_key is not None:
        kwargs['headers'] = {**headers, 'X-VacancyPilot-Idempotency-Key': idem_key}
    else:
        kwargs['headers'] = headers
    resp = client.post('/api/v1/vacancies/intake', json=body, **kwargs)
    assert resp.status_code == 200, resp.text
    return resp.json()['data']


# ── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def auth_token(db_session: Session) -> str:
    token = generate_client_token()
    _register_token(token, db_session)
    return token


@pytest.fixture
def auth_headers(auth_token: str) -> dict[str, str]:
    return _authenticated_headers(auth_token)


# ── Intake endpoint ──────────────────────────────────────────────────────


class TestIntakeIdempotency:
    def test_create_then_duplicate_is_unchanged(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        body = _base_vacancy()
        first = _intake(client_with_db, body, auth_headers)
        second = _intake(client_with_db, body, auth_headers)

        assert first['result'] == 'created'
        assert second['result'] == 'unchanged'
        assert second['duplicate'] is True
        assert second['vacancy_id'] == first['vacancy_id']
        assert second['revision'] == first['revision'] == 1
        assert second['first_seen_at'] == first['first_seen_at']

    def test_content_change_bumps_revision_and_snapshots_once(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        body = _base_vacancy()
        first = _intake(client_with_db, body, auth_headers)

        changed = {**body, 'title': 'Senior Frontend Engineer (React)'}
        updated = _intake(client_with_db, changed, auth_headers)
        duplicate = _intake(client_with_db, changed, auth_headers)

        assert first['revision'] == 1
        assert updated['result'] == 'updated'
        assert updated['revision'] == 2
        assert updated['vacancy_id'] == first['vacancy_id']
        assert updated['first_seen_at'] == first['first_seen_at']
        assert duplicate['result'] == 'unchanged'
        assert duplicate['revision'] == 2

        # Exactly one vacancy row for the natural key.
        total = client_with_db.get('/api/v1/vacancies', headers=auth_headers).json()['meta'][
            'total'
        ]
        assert total == 1
        detail = client_with_db.get(
            f'/api/v1/vacancies/{updated["vacancy_id"]}',
            headers=auth_headers,
        ).json()['data']
        assert detail['revision'] == 2

    def test_whitespace_only_change_is_unchanged(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        body = _base_vacancy()
        first = _intake(client_with_db, body, auth_headers)
        # Formatting-only description change must not create a new snapshot.
        padded = {**body, 'description': f'  {body["description"]}\n\n '}
        second = _intake(client_with_db, padded, auth_headers)
        assert second['result'] == 'unchanged'
        assert second['revision'] == first['revision'] == 1

    def test_explicit_idempotency_key_rejects_different_payload(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        body = _base_vacancy()
        first = _intake(client_with_db, body, auth_headers, idem_key='client-key-1')
        # Reusing a key for different normalized content is a caller conflict,
        # never a silent replay of stale data.
        changed = {**body, 'title': 'Different Title'}
        response = client_with_db.post(
            '/api/v1/vacancies/intake',
            json=changed,
            headers={**auth_headers, 'X-VacancyPilot-Idempotency-Key': 'client-key-1'},
        )
        assert response.status_code == 409
        assert first['revision'] == 1

        detail = client_with_db.get(
            f'/api/v1/vacancies/{first["vacancy_id"]}', headers=auth_headers
        ).json()['data']
        assert detail['revision'] == 1

    def test_fallback_identity_when_source_id_absent(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        body = _base_vacancy()
        del body['source_vacancy_id']
        first = _intake(client_with_db, body, auth_headers)
        second = _intake(client_with_db, body, auth_headers)

        assert first['result'] == 'created'
        assert second['result'] == 'unchanged'
        assert second['vacancy_id'] == first['vacancy_id']
        # The deterministic fallback identity lands in source_vacancy_id.
        detail = client_with_db.get(
            f'/api/v1/vacancies/{first["vacancy_id"]}',
            headers=auth_headers,
        ).json()['data']
        assert detail['source_vacancy_id'].startswith('fallback_')

    def test_same_fallback_content_different_source_does_not_collide(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        body = _base_vacancy()
        del body['source_vacancy_id']
        body['source'] = 'hh'
        first = _intake(client_with_db, body, auth_headers)
        body['source'] = 'manual'
        second = _intake(client_with_db, body, auth_headers)

        assert first['result'] == 'created'
        assert second['result'] == 'created'
        assert second['vacancy_id'] != first['vacancy_id']

    def test_update_clears_fields_when_null(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        body = _base_vacancy()
        _intake(client_with_db, body, auth_headers)
        body['company_name'] = None
        body['salary_min'] = None
        body['salary_max'] = None
        updated = _intake(client_with_db, body, auth_headers)

        assert updated['result'] == 'updated'
        assert updated['revision'] == 2
        detail = client_with_db.get(
            f'/api/v1/vacancies/{updated["vacancy_id"]}',
            headers=auth_headers,
        ).json()['data']
        assert detail['company_name'] is None
        assert detail['salary_min'] is None
        assert detail['salary_max'] is None

    def test_intake_rejects_forbidden_fields(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        body = _base_vacancy()
        body['cookie'] = 'session=abc'  # never stored
        body['dom_html'] = '<div>...</div>'
        body['session_token'] = 'secret'
        resp = client_with_db.post('/api/v1/vacancies/intake', json=body, headers=auth_headers)
        assert resp.status_code == 422

    def test_intake_requires_auth(self, client_with_db: TestClient) -> None:
        resp = client_with_db.post('/api/v1/vacancies/intake', json=_base_vacancy())
        assert resp.status_code == 401


# ── List / detail endpoints ──────────────────────────────────────────────


class TestVacancyList:
    def test_list_returns_all_and_is_sorted(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        a = _base_vacancy()
        a['source_vacancy_id'] = 'v-a'
        b = _base_vacancy()
        b['source_vacancy_id'] = 'v-b'
        _intake(client_with_db, a, auth_headers)
        _intake(client_with_db, b, auth_headers)

        resp = client_with_db.get('/api/v1/vacancies', headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()['data']
        assert resp.json()['meta']['total'] == 2
        # Both vacancies present, ordered newest-first by last_seen_at.
        ids = {item['source_vacancy_id'] for item in data}
        assert ids == {'v-a', 'v-b'}
        seen = [item['last_seen_at'] for item in data]
        assert seen == sorted(seen, reverse=True)

    def test_list_pagination(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        for i in range(3):
            body = _base_vacancy()
            body['source_vacancy_id'] = f'v-{i}'
            _intake(client_with_db, body, auth_headers)

        resp = client_with_db.get(
            '/api/v1/vacancies',
            params={'limit': 2, 'offset': 1},
            headers=auth_headers,
        )
        data = resp.json()['data']
        meta = resp.json()['meta']
        assert len(data) == 2
        assert meta['total'] == 3
        assert meta['limit'] == 2
        assert meta['offset'] == 1

    def test_list_requires_auth(self, client_with_db: TestClient) -> None:
        assert client_with_db.get('/api/v1/vacancies').status_code == 401

    def test_detail_returns_normalized_fields(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, _base_vacancy(), auth_headers)
        resp = client_with_db.get(
            f'/api/v1/vacancies/{created["vacancy_id"]}',
            headers=auth_headers,
        )
        assert resp.status_code == 200
        item = resp.json()['data']
        assert item['source'] == 'hh'
        assert item['source_vacancy_id'] == 'v-100'
        assert item['work_mode'] == 'remote'
        assert item['skills'] == ['React', 'TypeScript', 'Redux']
        assert item['revision'] == 1

    def test_detail_404(self, client_with_db: TestClient, auth_headers: dict[str, str]) -> None:
        resp = client_with_db.get('/api/v1/vacancies/nope', headers=auth_headers)
        assert resp.status_code == 404


# ── Triage endpoint ──────────────────────────────────────────────────────


class TestTriage:
    def _triage(
        self,
        client: TestClient,
        vacancy_id: str,
        headers: dict[str, str],
        body: dict[str, object] | None = None,
    ) -> object:
        resp = client.post(
            f'/api/v1/vacancies/{vacancy_id}/triage',
            json=body or {},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        return resp.json()['data']

    def test_pass_verdict_for_good_match(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, _base_vacancy(), auth_headers)
        triage = self._triage(
            client_with_db,
            created['vacancy_id'],
            auth_headers,
            {
                'target_titles': ['Frontend Engineer', 'Frontend Developer'],
                'role_family': 'frontend',
                'must_have_skills': ['React', 'TypeScript'],
                'salary_expectation_min': 200000,
                'experience_years': 4,
                'preferred_work_modes': ['remote', 'hybrid'],
                'preferred_cities': ['Москва'],
                'remote_only': True,
                'location_eligible': True,
            },
        )
        assert triage['engine'] == 'stage-a-no-llm-v1'
        assert triage['verdict'] == 'pass'
        assert triage['recommendation'] in ('apply', 'consider', 'skip')
        assert triage['score'] >= 50
        # Components mirror the extension weights exactly.
        maxes = {c['code']: c['max'] for c in triage['components']}
        assert maxes == {
            'title_match': 20,
            'must_have_skills': 25,
            'nice_to_have_skills': 10,
            'experience_fit': 15,
            'work_mode_location': 10,
            'salary_fit': 10,
            'company_preference': 5,
            'language_schedule_misc': 5,
        }
        # All hard gates resolve.
        gates = {g['code']: g['status'] for g in triage['hard_gates']}
        assert gates['remote_only'] == 'pass'
        assert gates['eligibility'] == 'pass'
        assert 'fail' not in gates.values()

    def test_remote_only_office_fails(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        body = _base_vacancy()
        body['work_mode'] = 'office'
        created = _intake(client_with_db, body, auth_headers)
        triage = self._triage(
            client_with_db,
            created['vacancy_id'],
            auth_headers,
            {'remote_only': True, 'location_eligible': True},
        )
        assert triage['verdict'] == 'skip'
        assert triage['recommendation'] == 'skip'
        gate = next(g for g in triage['hard_gates'] if g['code'] == 'remote_only')
        assert gate['status'] == 'fail'
        # Skip-before-cap: remote-only fail dominates any score cap.
        assert triage['score'] <= 100

    def test_needs_input_when_eligibility_unresolved(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        body = _base_vacancy()
        body['city'] = None
        created = _intake(client_with_db, body, auth_headers)
        triage = self._triage(
            client_with_db,
            created['vacancy_id'],
            auth_headers,
            {'location_eligible': False},
        )
        assert triage['verdict'] == 'needs_input'
        assert triage['recommendation'] == 'needs_input'
        gate = next(g for g in triage['hard_gates'] if g['code'] == 'eligibility')
        assert gate['status'] == 'needs_input'

    def test_eligibility_fail_with_city(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, _base_vacancy(), auth_headers)
        triage = self._triage(
            client_with_db,
            created['vacancy_id'],
            auth_headers,
            {'location_eligible': False},
        )
        assert triage['verdict'] == 'skip'
        gate = next(g for g in triage['hard_gates'] if g['code'] == 'eligibility')
        assert gate['status'] == 'fail'

    def test_blocked_company_is_critical_and_skip(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, _base_vacancy(), auth_headers)
        triage = self._triage(
            client_with_db,
            created['vacancy_id'],
            auth_headers,
            {'blocked_companies': ['acme corp']},
        )
        assert triage['verdict'] == 'skip'
        assert triage['recommendation'] == 'skip'
        flag = next(f for f in triage['risk_flags'] if f['code'] == 'company_blacklist')
        assert flag['severity'] == 'critical'
        assert triage['caps_applied'] != []
        # Company score is zero when blocked.
        comp = next(c for c in triage['components'] if c['code'] == 'company_preference')
        assert comp['score'] == 0

    def test_missing_core_skill_caps_score(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, _base_vacancy(), auth_headers)
        triage = self._triage(
            client_with_db,
            created['vacancy_id'],
            auth_headers,
            {'must_have_skills': ['React', 'TypeScript', 'Go', 'Kubernetes']},
        )
        # Missing ≥ half of required skills triggers the missing_core_skill cap.
        flag = next(
            (f for f in triage['risk_flags'] if f['code'] == 'missing_core_skill'),
            None,
        )
        assert flag is not None
        assert flag['severity'] == 'high'
        assert triage['score'] <= 70

    def test_triage_requires_auth(self, client_with_db: TestClient) -> None:
        resp = client_with_db.post('/api/v1/vacancies/xyz/triage', json={})
        assert resp.status_code == 401

    def test_triage_404(self, client_with_db: TestClient, auth_headers: dict[str, str]) -> None:
        resp = client_with_db.post('/api/v1/vacancies/nope/triage', json={}, headers=auth_headers)
        assert resp.status_code == 404

    def test_deterministic_score(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, _base_vacancy(), auth_headers)
        request = {
            'target_titles': ['Frontend Engineer'],
            'must_have_skills': ['React', 'TypeScript'],
            'salary_expectation_min': 200000,
            'experience_years': 4,
            'preferred_work_modes': ['remote'],
            'location_eligible': True,
        }
        first = self._triage(client_with_db, created['vacancy_id'], auth_headers, request)
        second = self._triage(client_with_db, created['vacancy_id'], auth_headers, request)
        assert first == second


# ── Snapshot append-only guarantees ──────────────────────────────────────


class TestSnapshotGuarantees:
    def test_snapshot_count_equals_number_of_changes(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        body = _base_vacancy()
        results = []
        for title in ['Title A', 'Title B', 'Title B', 'Title C']:
            body['title'] = title
            results.append(_intake(client_with_db, body, auth_headers)['result'])
        assert results == ['created', 'updated', 'unchanged', 'updated']

        from sqlalchemy import func, select
        from sqlalchemy.orm import sessionmaker

        from app.db.models import Vacancy, VacancySnapshot

        factory = sessionmaker(bind=client_with_db.app.state.db_engine)
        with factory() as s:
            vacancy = s.execute(select(Vacancy)).scalar_one()
            snap_count = s.execute(
                select(func.count())
                .select_from(VacancySnapshot)
                .where(VacancySnapshot.vacancy_id == vacancy.id)
            ).scalar_one()
        assert snap_count == 3
        assert vacancy.revision == 3


# ── Sanitized fixture scenarios ───────────────────────────────────────────


class TestSanitizedFixtureScenarios:
    def test_same_vacancy_captured_twice_is_a_duplicate(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        first = _intake(client_with_db, FIXTURE_SAME_TWICE, auth_headers)
        second = _intake(client_with_db, FIXTURE_SAME_TWICE, auth_headers)
        assert first['result'] == 'created'
        assert second['result'] == 'unchanged'
        assert second['duplicate'] is True
        assert second['vacancy_id'] == first['vacancy_id']

    def test_description_change_snapshots_once(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        first = _intake(client_with_db, FIXTURE_SAME_TWICE, auth_headers)
        updated = _intake(client_with_db, FIXTURE_DESCRIPTION_CHANGED, auth_headers)
        assert updated['result'] == 'updated'
        assert updated['revision'] == 2
        assert updated['vacancy_id'] == first['vacancy_id']
        # New snapshot for the content change.
        detail = client_with_db.get(
            f'/api/v1/vacancies/{updated["vacancy_id"]}',
            headers=auth_headers,
        ).json()['data']
        assert detail['description'] == FIXTURE_DESCRIPTION_CHANGED['description']

    def test_missing_company_is_stored_as_null(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, FIXTURE_MISSING_COMPANY, auth_headers)
        detail = client_with_db.get(
            f'/api/v1/vacancies/{created["vacancy_id"]}',
            headers=auth_headers,
        ).json()['data']
        assert detail['company_id'] is None
        assert detail['company_name'] is None

    def test_missing_salary_triage_does_not_invent_one(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, FIXTURE_MISSING_SALARY, auth_headers)
        resp = client_with_db.post(
            f'/api/v1/vacancies/{created["vacancy_id"]}/triage',
            json={'salary_expectation_min': 200000, 'location_eligible': True},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()['data']
        # Salary unknown → neutral signal, no invented figure.
        comp = next(c for c in data['components'] if c['code'] == 'salary_fit')
        assert comp['score'] == 5  # weight 10 * 0.5 neutral
        assert any(f['code'] == 'salary_unknown' for f in data['risk_flags'])

    def test_remote_anywhere_passes_remote_only_gate(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, FIXTURE_REMOTE_ANYWHERE, auth_headers)
        resp = client_with_db.post(
            f'/api/v1/vacancies/{created["vacancy_id"]}/triage',
            json={'remote_only': True, 'location_eligible': True},
            headers=auth_headers,
        )
        data = resp.json()['data']
        gate = next(g for g in data['hard_gates'] if g['code'] == 'remote_only')
        assert gate['status'] == 'pass'
        assert data['verdict'] in ('pass', 'needs_input')

    def test_remote_restricted_unresolved_eligibility_needs_input(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, FIXTURE_REMOTE_RESTRICTED_UNRESOLVED, auth_headers)
        resp = client_with_db.post(
            f'/api/v1/vacancies/{created["vacancy_id"]}/triage',
            json={'remote_only': True, 'location_eligible': False},
            headers=auth_headers,
        )
        data = resp.json()['data']
        assert data['verdict'] == 'needs_input'
        assert data['recommendation'] == 'needs_input'

    def test_office_required_remote_is_hard_fail(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, FIXTURE_OFFICE_REQUIRED_HARD_FAIL, auth_headers)
        resp = client_with_db.post(
            f'/api/v1/vacancies/{created["vacancy_id"]}/triage',
            json={'office_required': True, 'location_eligible': True},
            headers=auth_headers,
        )
        data = resp.json()['data']
        gate = next(g for g in data['hard_gates'] if g['code'] == 'work_format')
        assert gate['status'] == 'fail'
        assert data['verdict'] == 'skip'

    def test_oversized_description_is_rejected(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        resp = client_with_db.post(
            '/api/v1/vacancies/intake',
            json=FIXTURE_OVERSIZED_DESCRIPTION,
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_manual_source_creates_separate_vacancy(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        created = _intake(client_with_db, FIXTURE_MANUAL_SOURCE, auth_headers)
        assert created['result'] == 'created'
        detail = client_with_db.get(
            f'/api/v1/vacancies/{created["vacancy_id"]}',
            headers=auth_headers,
        ).json()['data']
        assert detail['source'] == 'manual'
        assert detail['source_vacancy_id'] == 'manual-1'
