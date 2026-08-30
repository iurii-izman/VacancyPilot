"""AOPS-09 lifecycle, bridge, and deterministic-diff contract tests."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.domain.repositories import ApplicationRepository, CoverLetterRepository, VacancyRepository
from app.letters.diff import compute_letter_diff
from app.security.pairing import generate_client_token, hash_client_token


def _headers(session: Session) -> dict[str, str]:
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


def _application(session: Session) -> str:
    vacancy = VacancyRepository(session).upsert(
        source='fixture',
        source_vacancy_id='aops09-safe',
        title='Senior Python Engineer',
        description='Build reliable Python services for a local-first product.',
    )
    return ApplicationRepository(session).create(vacancy_id=vacancy.id).id


def test_edited_and_final_do_not_overwrite_generated_snapshot(db_session: Session) -> None:
    application_id = _application(db_session)
    letter = CoverLetterRepository(db_session).create(application_id=application_id)
    repo = CoverLetterRepository(db_session)
    repo.add_version(
        cover_letter_id=letter.id,
        version_type='generated',
        body_text='Generated snapshot',
        expected_revision=1,
    )
    repo.add_version(
        cover_letter_id=letter.id,
        version_type='user_draft',
        body_text='Edited snapshot',
        expected_revision=2,
    )
    repo.add_version(
        cover_letter_id=letter.id,
        version_type='final',
        body_text='Final snapshot',
        expected_revision=3,
    )
    assert letter.generated_text == 'Generated snapshot'
    assert letter.is_final is True
    assert [item.version_type for item in repo.list_versions(letter.id)] == [
        'generated',
        'user_draft',
        'final',
    ]


def test_sent_snapshot_is_explicit_and_blocks_second_sent(db_session: Session) -> None:
    application_id = _application(db_session)
    repo = CoverLetterRepository(db_session)
    letter = repo.create(application_id=application_id)
    repo.add_version(
        cover_letter_id=letter.id,
        version_type='generated',
        body_text='Generated',
        expected_revision=1,
    )
    repo.add_version(
        cover_letter_id=letter.id,
        version_type='sent',
        body_text='Actually sent',
        expected_revision=2,
    )
    assert letter.sent_text == 'Actually sent'
    try:
        repo.add_version(
            cover_letter_id=letter.id,
            version_type='sent',
            body_text='Replacement',
            expected_revision=3,
        )
    except ValueError as error:
        assert 'immutable' in str(error)
    else:  # pragma: no cover - protects the policy itself
        raise AssertionError('second sent snapshot must be rejected')


def test_diff_metrics_are_deterministic() -> None:
    first = compute_letter_diff('Hello team\nRegards', 'Hello product team\nBest regards')
    second = compute_letter_diff('Hello team\nRegards', 'Hello product team\nBest regards')
    assert first == second
    assert first.generated_words == 3
    assert first.sent_words == 5
    assert first.words_added == 2
    assert first.words_removed == 0
    assert first.opening_changed is True
    assert first.closing_changed is True


def test_bridge_request_is_stable_and_has_no_secret_or_private_path(
    client_with_db: TestClient, db_session: Session
) -> None:
    application_id = _application(db_session)
    headers = _headers(db_session)
    path = f'/api/v1/applications/{application_id}/letters/bridge-request'
    first = client_with_db.post(path, json={}, headers=headers)
    second = client_with_db.post(path, json={}, headers=headers)
    assert first.status_code == 200
    assert first.json()['data'] == second.json()['data']
    request_text = first.json()['data']['request_text'].lower()
    assert 'api key' not in request_text
    assert 'workoutreachhh' not in request_text


def test_malformed_bridge_import_is_rejected_without_persistence(
    client_with_db: TestClient, db_session: Session
) -> None:
    application_id = _application(db_session)
    headers = _headers(db_session)
    bridge = client_with_db.post(
        f'/api/v1/applications/{application_id}/letters/bridge-request', json={}, headers=headers
    ).json()['data']
    response = client_with_db.post(
        f'/api/v1/applications/{application_id}/letters/import',
        json={
            'bridge_request_id': bridge['bridge_request_id'],
            'vacancy_hash': bridge['vacancy_hash'],
            'response_text': 'not a five section V4 response',
        },
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'IMPORT_INVALID'
    assert CoverLetterRepository(db_session).get_by_id('does-not-exist') is None
