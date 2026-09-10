"""OPS-AUTH-001 regression coverage for the authoritative Ops read model."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import (
    Application,
    EngineRun,
    FollowUp,
    SearchProfile,
    Vacancy,
    VacancySearchProfileHit,
    VacancySnapshot,
)
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
            'now': '2026-09-01T00:00:00Z',
        },
    )
    session.commit()
    return {'X-VacancyPilot-Client': token}


def _vacancy(
    session: Session,
    vacancy_id: str,
    source_id: str,
    *,
    updated_at: str,
    description: str | None = None,
    archived: bool = False,
) -> Vacancy:
    vacancy = Vacancy(
        id=vacancy_id,
        source='hh',
        source_vacancy_id=source_id,
        url=f'https://hh.ru/vacancy/{source_id}',
        title=f'Role {source_id}',
        company_id=f'company-{source_id}',
        company_name=f'Company {source_id}',
        salary_min=1000,
        salary_max=2000,
        currency='EUR',
        work_mode='remote',
        experience='middle',
        description=description,
        description_hash=f'hash-{source_id}',
        skills_json=json.dumps(['Python', 'TypeScript']),
        first_seen_at=updated_at,
        last_seen_at=updated_at,
        updated_at=updated_at,
        archived=archived,
        revision=2,
    )
    session.add(vacancy)
    return vacancy


def _run(
    session: Session,
    vacancy_id: str,
    run_id: str,
    *,
    status: str,
    created_at: str,
    final: int | None = None,
    decision: str | None = None,
) -> EngineRun:
    output = (
        json.dumps(
            {
                'score': {
                    'final': final,
                    'decision': decision,
                    'confidence': 'high',
                }
            }
        )
        if final is not None or decision is not None
        else None
    )
    run = EngineRun(
        id=run_id,
        vacancy_id=vacancy_id,
        engine_version='v4-test',
        engine_hash='hash',
        provider='test',
        model='test',
        prompt_version='test',
        input_hash='x' * 64,
        raw_output=None,
        validated_output=output,
        status=status,
        validation_errors_json=None,
        token_input=None,
        token_output=None,
        estimated_cost=None,
        created_at=created_at,
    )
    session.add(run)
    return run


def test_vacancy_projection_preserves_absence_and_distinct_ids(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    vacancy = _vacancy(
        db_session,
        'companion-vacancy-only',
        'hh-vacancy-only',
        updated_at='2026-09-01T01:00:00Z',
        description=None,
    )
    db_session.add(
        VacancySnapshot(
            vacancy_id=vacancy.id,
            description_hash='snapshot-hash',
            payload_json=json.dumps({'payload': {'city': 'Chisinau'}}),
            captured_at='2026-09-01T01:00:00Z',
            capture_source='test',
        )
    )
    db_session.commit()

    response = client_with_db.get(
        '/api/v1/ops/work-items?view=vacancies&archived=false', headers=headers
    )
    assert response.status_code == 200, response.text
    item = response.json()['data'][0]
    assert item['authority'] == 'ops'
    assert item['vacancy']['vacancy_id'] == 'companion-vacancy-only'
    assert item['vacancy']['hh_vacancy_id'] == 'hh-vacancy-only'
    assert item['vacancy']['city'] == 'Chisinau'
    assert item['application_state'] == 'none'
    assert item['applications'] == []
    assert item['analysis_state'] == 'not_analyzed'
    assert item['analysis']['score'] is None
    assert item['analysis']['decision'] is None
    assert item['follow_up_state'] == 'none'
    assert item['provenance']['hits'] == []
    assert item['vacancy']['hydration_state'] == 'partial'


def test_projection_uses_latest_invalid_run_without_falling_back_to_previous_score(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    vacancy = _vacancy(
        db_session,
        'companion-vacancy-invalid',
        'hh-vacancy-invalid',
        updated_at='2026-09-01T02:00:00Z',
        description='x' * 220,
    )
    _run(
        db_session,
        vacancy.id,
        'run-valid-old',
        status='success',
        created_at='2026-09-01T02:01:00Z',
        final=88,
        decision='apply',
    )
    _run(
        db_session,
        vacancy.id,
        'run-invalid-new',
        status='invalid',
        created_at='2026-09-01T02:02:00Z',
    )
    db_session.commit()

    response = client_with_db.get('/api/v1/ops/work-items?archived=false', headers=headers)
    assert response.status_code == 200, response.text
    analysis = response.json()['data'][0]['analysis']
    assert analysis['run_id'] == 'run-invalid-new'
    assert analysis['state'] == 'invalid'
    assert analysis['ready'] is False
    assert analysis['score'] is None
    assert analysis['decision'] is None


def test_malformed_success_run_is_invalid_for_filters_and_summary(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    vacancy = _vacancy(
        db_session,
        'companion-vacancy-malformed',
        'hh-vacancy-malformed',
        updated_at='2026-09-01T02:30:00Z',
        description='x' * 220,
    )
    db_session.add(
        EngineRun(
            id='run-malformed-success',
            vacancy_id=vacancy.id,
            engine_version='v4-test',
            engine_hash='hash',
            provider='test',
            model='test',
            prompt_version='test',
            input_hash='x' * 64,
            raw_output=None,
            validated_output='{not-json',
            status='success',
            validation_errors_json=None,
            token_input=None,
            token_output=None,
            estimated_cost=None,
            created_at='2026-09-01T02:31:00Z',
        )
    )
    db_session.commit()

    response = client_with_db.get('/api/v1/ops/work-items?archived=false', headers=headers)
    assert response.status_code == 200, response.text
    item = response.json()['data'][0]
    assert item['analysis_state'] == 'invalid'
    assert item['analysis']['score'] is None
    assert item['analysis']['decision'] is None
    assert response.json()['meta']['summary']['analysis_invalid'] == 1
    assert response.json()['meta']['summary']['analysis_ready'] == 0

    ready = client_with_db.get(
        '/api/v1/ops/work-items?archived=false&analysis_state=ready', headers=headers
    )
    invalid = client_with_db.get(
        '/api/v1/ops/work-items?archived=false&analysis_state=invalid', headers=headers
    )
    assert ready.status_code == 200, ready.text
    assert invalid.status_code == 200, invalid.text
    assert ready.json()['meta']['total'] == 0
    assert invalid.json()['meta']['total'] == 1


def test_pipeline_is_one_item_per_application_and_keeps_multiple_followups_linked(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    vacancy = _vacancy(
        db_session,
        'companion-vacancy-multi',
        'hh-vacancy-multi',
        updated_at='2026-09-01T03:00:00Z',
        description='x' * 220,
    )
    first = Application(
        id='application-one',
        vacancy_id=vacancy.id,
        status='applied',
        applied_at='2026-09-01T03:01:00Z',
        created_at='2026-09-01T03:01:00Z',
        updated_at='2026-09-01T03:01:00Z',
    )
    second = Application(
        id='application-two',
        vacancy_id=vacancy.id,
        status='interview',
        created_at='2026-09-01T03:02:00Z',
        updated_at='2026-09-01T03:02:00Z',
    )
    db_session.add_all([first, second])
    db_session.add_all(
        [
            FollowUp(
                id='followup-one',
                application_id=first.id,
                reason='first',
                due_at='2026-09-02T00:00:00Z',
                status='pending',
                created_at='2026-09-01T03:03:00Z',
                updated_at='2026-09-01T03:03:00Z',
            ),
            FollowUp(
                id='followup-two',
                application_id=first.id,
                reason='second',
                due_at='2026-09-03T00:00:00Z',
                status='scheduled',
                created_at='2026-09-01T03:04:00Z',
                updated_at='2026-09-01T03:04:00Z',
            ),
        ]
    )
    db_session.commit()

    inbox = client_with_db.get('/api/v1/ops/work-items?archived=false', headers=headers)
    assert inbox.status_code == 200, inbox.text
    inbox_item = inbox.json()['data'][0]
    assert inbox_item['application_state'] == 'multiple'
    assert {item['application_id'] for item in inbox_item['applications']} == {
        first.id,
        second.id,
    }
    assert inbox_item['follow_up_state'] == 'multiple'
    assert inbox_item['active_follow_up_count'] == 2

    pipeline = client_with_db.get(
        '/api/v1/ops/work-items?view=applications&archived=false', headers=headers
    )
    assert pipeline.status_code == 200, pipeline.text
    rows = pipeline.json()['data']
    assert len(rows) == 2
    assert [row['applications'][0]['application_id'] for row in rows] == [second.id, first.id]
    assert all(row['vacancy']['hh_vacancy_id'] == 'hh-vacancy-multi' for row in rows)
    first_pipeline = next(
        row for row in rows if row['applications'][0]['application_id'] == first.id
    )
    assert {item['follow_up_id'] for item in first_pipeline['follow_ups']} == {
        'followup-one',
        'followup-two',
    }


def test_provenance_filter_deduplicates_and_summary_is_global(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    profile_one = SearchProfile(
        id='profile-one',
        name='Backend',
        query_json='{}',
        enabled=True,
        schedule=None,
        last_run_at=None,
        created_at='2026-09-01T00:00:00Z',
        updated_at='2026-09-01T00:00:00Z',
    )
    profile_two = SearchProfile(
        id='profile-two',
        name='Remote',
        query_json='{}',
        enabled=True,
        schedule=None,
        last_run_at=None,
        created_at='2026-09-01T00:00:00Z',
        updated_at='2026-09-01T00:00:00Z',
    )
    first = _vacancy(
        db_session,
        'companion-vacancy-profile-1',
        'hh-profile-1',
        updated_at='2026-09-01T04:01:00Z',
        description='x' * 220,
    )
    second = _vacancy(
        db_session,
        'companion-vacancy-profile-2',
        'hh-profile-2',
        updated_at='2026-09-01T04:02:00Z',
        description='x' * 220,
    )
    third = _vacancy(
        db_session,
        'companion-vacancy-profile-3',
        'hh-profile-3',
        updated_at='2026-09-01T04:03:00Z',
        description='x' * 220,
    )
    db_session.add_all([profile_one, profile_two])
    db_session.add_all(
        [
            VacancySearchProfileHit(
                vacancy_id=first.id,
                search_profile_id=profile_one.id,
                first_seen_at='2026-09-01T04:01:00Z',
                last_seen_at='2026-09-01T04:01:00Z',
                hit_count=2,
            ),
            VacancySearchProfileHit(
                vacancy_id=first.id,
                search_profile_id=profile_two.id,
                first_seen_at='2026-09-01T04:01:00Z',
                last_seen_at='2026-09-01T04:01:00Z',
                hit_count=1,
            ),
            VacancySearchProfileHit(
                vacancy_id=second.id,
                search_profile_id=profile_one.id,
                first_seen_at='2026-09-01T04:02:00Z',
                last_seen_at='2026-09-01T04:02:00Z',
                hit_count=1,
            ),
        ]
    )
    # Third vacancy intentionally has no profile hit but keeps the global
    # count larger than the first page.
    db_session.add(third)
    db_session.commit()

    filtered = client_with_db.get(
        '/api/v1/ops/work-items?archived=false&search_profile_id=profile-one&limit=1&offset=0',
        headers=headers,
    )
    assert filtered.status_code == 200, filtered.text
    body = filtered.json()
    assert body['meta']['total'] == 2
    assert len(body['data']) == 1

    all_rows = client_with_db.get(
        '/api/v1/ops/work-items?archived=false&limit=100&sort=score', headers=headers
    )
    assert all_rows.status_code == 200, all_rows.text
    first_item = next(
        item for item in all_rows.json()['data'] if item['vacancy']['vacancy_id'] == first.id
    )
    assert {hit['search_profile_id'] for hit in first_item['provenance']['hits']} == {
        profile_one.id,
        profile_two.id,
    }
    summary = client_with_db.get(
        '/api/v1/ops/work-items?view=summary&archived=false&limit=1', headers=headers
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()['meta']['summary']['vacancies_total'] == 3
    assert summary.json()['meta']['summary']['vacancies_without_application'] == 3


def test_filters_and_sorting_apply_before_pagination_and_keep_null_score_out(
    client_with_db: TestClient, db_session: Session
) -> None:
    headers = _auth(db_session)
    high = _vacancy(
        db_session,
        'companion-vacancy-high',
        'hh-vacancy-high',
        updated_at='2026-09-01T05:01:00Z',
        description='x' * 220,
    )
    mid = _vacancy(
        db_session,
        'companion-vacancy-mid',
        'hh-vacancy-mid',
        updated_at='2026-09-01T05:02:00Z',
        description='x' * 220,
    )
    low = _vacancy(
        db_session,
        'companion-vacancy-low',
        'hh-vacancy-low',
        updated_at='2026-09-01T05:03:00Z',
        description='x' * 220,
    )
    no_score = _vacancy(
        db_session,
        'companion-vacancy-no-score',
        'hh-vacancy-no-score',
        updated_at='2026-09-01T05:04:00Z',
        description='x' * 220,
    )
    _run(
        db_session,
        high.id,
        'run-filter-high',
        status='success',
        created_at='2026-09-01T05:11:00Z',
        final=90,
        decision='apply',
    )
    _run(
        db_session,
        mid.id,
        'run-filter-mid',
        status='success',
        created_at='2026-09-01T05:12:00Z',
        final=70,
        decision='consider',
    )
    _run(
        db_session,
        low.id,
        'run-filter-low',
        status='success',
        created_at='2026-09-01T05:13:00Z',
        final=40,
        decision='skip',
    )
    db_session.commit()

    first_page = client_with_db.get(
        '/api/v1/ops/work-items?archived=false&score_band=high&sort=score'
        '&direction=desc&limit=1&offset=0',
        headers=headers,
    )
    second_page = client_with_db.get(
        '/api/v1/ops/work-items?archived=false&score_band=high&sort=score'
        '&direction=desc&limit=1&offset=1',
        headers=headers,
    )
    assert first_page.status_code == 200, first_page.text
    assert second_page.status_code == 200, second_page.text
    assert first_page.json()['meta']['total'] == 2
    assert first_page.json()['data'][0]['vacancy']['vacancy_id'] == high.id
    assert second_page.json()['data'][0]['vacancy']['vacancy_id'] == mid.id
    assert all(
        item['vacancy']['vacancy_id'] != no_score.id
        for item in first_page.json()['data'] + second_page.json()['data']
    )

    decision = client_with_db.get(
        '/api/v1/ops/work-items?archived=false&decision=apply', headers=headers
    )
    assert decision.status_code == 200, decision.text
    assert decision.json()['meta']['total'] == 1
    assert decision.json()['data'][0]['vacancy']['vacancy_id'] == high.id
