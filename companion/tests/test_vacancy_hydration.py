"""Focused regression coverage for lazy full HH vacancy hydration."""

from __future__ import annotations

import json

from app.db.models import SearchProfile, Vacancy, VacancySearchProfileHit, VacancySnapshot
from app.domain.vacancy_hydration import hydrate_vacancy


class FakeHHClient:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.calls = 0

    def vacancy(self, vacancy_id: str) -> dict:
        self.calls += 1
        assert vacancy_id == '136022615'
        return self.payload


def test_full_detail_enriches_same_canonical_vacancy_and_is_idempotent(db_session) -> None:
    row = Vacancy(
        source='hh',
        source_vacancy_id='136022615',
        title='Search title',
        description='',
        description_hash='',
        skills_json='[]',
        first_seen_at='2026-09-02T00:00:00Z',
        last_seen_at='2026-09-02T00:00:00Z',
        updated_at='2026-09-02T00:00:00Z',
        revision=1,
    )
    db_session.add(row)
    db_session.flush()
    db_session.add(SearchProfile(id='profile-1', name='Profile', query_json='{}'))
    db_session.add(VacancySearchProfileHit(vacancy_id=row.id, search_profile_id='profile-1'))
    db_session.commit()
    payload = {
        'id': '136022615',
        'name': 'Full role',
        'alternate_url': 'https://hh.ru/vacancy/136022615',
        'employer': {'id': 'company-1', 'name': 'Company'},
        'area': {'id': '1', 'name': 'Chisinau'},
        'experience': {'id': 'between1And3', 'name': '1–3 years'},
        'work_format': [{'id': 'REMOTE', 'name': 'Remote'}],
        'description': '<p>' + ('Detailed requirement. ' * 20) + '</p>',
        'key_skills': [{'name': 'Python'}, {'name': 'FastAPI'}],
    }
    client = FakeHHClient(payload)
    first = hydrate_vacancy(db_session, row, client=client)
    db_session.commit()
    snapshot_count = db_session.query(VacancySnapshot).count()
    second = hydrate_vacancy(db_session, first.vacancy, client=client)
    db_session.commit()

    assert client.calls == 2
    assert first.vacancy.id == row.id == second.vacancy.id
    assert len(second.vacancy.description or '') > 200
    assert second.vacancy.work_mode == 'remote'
    assert json.loads(second.vacancy.skills_json) == ['Python', 'FastAPI']
    assert db_session.query(VacancySnapshot).count() == snapshot_count
    assert db_session.query(VacancySearchProfileHit).count() == 1
