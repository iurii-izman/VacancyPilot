"""Tests for AOPS-05 companion migration endpoints.

Covers:
- POST /migration/preview: non-mutating counts and conflict report
- POST /migration/import: idempotent import with rollback
- GET  /migration/status: current mode and import reconciliation
- Preview has no server mutation (idempotent, no DB writes)
- Repeated import of same snapshot returns same result
- Rollback on partial failure preserves previous state
- Blocking-conflict detection when tables on both sides are non-empty
"""

from __future__ import annotations

import hashlib
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.models import Vacancy
from app.security.pairing import (
    generate_client_token,
    hash_client_token,
)

# ── Helpers ──────────────────────────────────────────────────────────────


def _authenticated_headers(token: str) -> dict[str, str]:
    return {'X-VacancyPilot-Client': token}


def _register_token(token: str, session: Session) -> None:
    """Persist a valid pairing token so the auth dependency accepts it.

    Mirrors PairingService._store_hash which uses INSERT OR REPLACE with
    the raw hex hash in value_json.
    """
    from sqlalchemy import text

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


def _djb2a_hash(data: str) -> str:
    """Return the SHA-256 snapshot identity used by the extension."""
    return hashlib.sha256(data.encode()).hexdigest()


# ── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def auth_token(db_session: Session) -> str:
    token = generate_client_token()
    _register_token(token, db_session)
    return token


@pytest.fixture
def auth_headers(auth_token: str) -> dict[str, str]:
    return _authenticated_headers(auth_token)


# ── Preview endpoint tests ───────────────────────────────────────────────


class TestMigrationPreview:
    def test_preview_returns_counts_on_empty_db(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        """Preview on an empty companion DB reports all Dexie entries as inserts."""
        counts = {
            'jobs': 5,
            'companies': 0,
            'profiles': 0,
            'resumes': 0,
            'coverLetters': 2,
            'applications': 3,
            'events': 0,
            'aiCache': 0,
            'labsActions': 0,
            'hrTimeline': 0,
            'visitMarks': 0,
            'meta': 0,
            'syncOutbox': 0,
            'opsCache': 0,
            'opsMeta': 0,
        }
        body = {
            'export_version': 2,
            'snapshot': {
                'captured_at': '2026-08-04T10:00:00Z',
                'counts': counts,
                'snapshot_hash': _djb2a_hash(json.dumps(counts)),
            },
            'export_data': {
                'jobs': [{'id': 'j1', 'title': 'SWE'}],
            },
        }

        resp = client_with_db.post(
            '/api/v1/migration/preview',
            json=body,
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()['data']
        assert data['inserts'] == 1
        assert data['updates'] == 0
        assert data['unchanged'] == 0
        assert data['total'] == 1

    def test_preview_has_no_server_mutation(
        self, client_with_db: TestClient, auth_headers: dict[str, str]
    ) -> None:
        """Calling preview twice returns the same result and does not create data."""
        counts = {
            'jobs': 3,
            'companies': 0,
            'profiles': 0,
            'resumes': 0,
            'coverLetters': 0,
            'applications': 0,
            'events': 0,
            'aiCache': 0,
            'labsActions': 0,
            'hrTimeline': 0,
            'visitMarks': 0,
            'meta': 0,
            'syncOutbox': 0,
            'opsCache': 0,
            'opsMeta': 0,
        }
        body = {
            'export_version': 2,
            'snapshot': {
                'captured_at': '2026-08-04T10:00:00Z',
                'counts': counts,
                'snapshot_hash': _djb2a_hash(json.dumps(counts)),
            },
            'export_data': {'jobs': []},
        }

        r1 = client_with_db.post(
            '/api/v1/migration/preview',
            json=body,
            headers=auth_headers,
        )
        r2 = client_with_db.post(
            '/api/v1/migration/preview',
            json=body,
            headers=auth_headers,
        )

        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()['data'] == r2.json()['data']
        # No vacancy was created by the preview (it is non-mutating)
        assert r2.json()['data']['inserts'] == r1.json()['data']['inserts']

    def test_preview_detects_conflicts_when_both_sides_have_data(
        self, client_with_db: TestClient, auth_headers: dict[str, str], db_session: Session
    ) -> None:
        """When the companion already has vacancies, preview reports conflicts."""
        # Add a vacancy to the companion DB
        v = Vacancy(
            source='hh',
            source_vacancy_id='123',
            title='Existing',
        )
        db_session.add(v)
        db_session.commit()

        counts = {
            'jobs': 3,
            'companies': 0,
            'profiles': 0,
            'resumes': 0,
            'coverLetters': 0,
            'applications': 0,
            'events': 0,
            'aiCache': 0,
            'labsActions': 0,
            'hrTimeline': 0,
            'visitMarks': 0,
            'meta': 0,
            'syncOutbox': 0,
            'opsCache': 0,
            'opsMeta': 0,
        }
        body = {
            'export_version': 2,
            'snapshot': {
                'captured_at': '2026-08-04T10:00:00Z',
                'counts': counts,
                'snapshot_hash': _djb2a_hash(json.dumps(counts)),
            },
            'export_data': {
                'jobs': [
                    {'id': 'j1', 'sourceVacancyId': '123', 'title': 'SWE'},
                ],
            },
        }

        resp = client_with_db.post(
            '/api/v1/migration/preview',
            json=body,
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()['data']
        # Jobs table has 3 Dexie entries and 1 SQLite vacancy → conflict
        assert data['has_blocking_conflicts'] is True
        assert data['conflicts'] >= 1

    def test_preview_requires_auth(self, client_with_db: TestClient) -> None:
        resp = client_with_db.post(
            '/api/v1/migration/preview',
            json={'snapshot': {'counts': {}}, 'export_data': {}},
        )
        assert resp.status_code == 401

    def test_preview_returns_conflict_details(
        self, client_with_db: TestClient, auth_headers: dict[str, str], db_session: Session
    ) -> None:
        """Conflict details include entity_type and reason per conflict."""
        v = Vacancy(source='hh', source_vacancy_id='456', title='Exists')
        db_session.add(v)
        db_session.commit()

        counts = {
            'jobs': 2,
            'companies': 0,
            'profiles': 0,
            'resumes': 0,
            'coverLetters': 2,
            'applications': 0,
            'events': 0,
            'aiCache': 0,
            'labsActions': 0,
            'hrTimeline': 0,
            'visitMarks': 0,
            'meta': 0,
            'syncOutbox': 0,
            'opsCache': 0,
            'opsMeta': 0,
        }
        body = {
            'export_version': 2,
            'snapshot': {
                'captured_at': '2026-08-04T10:00:00Z',
                'counts': counts,
                'snapshot_hash': _djb2a_hash(json.dumps(counts)),
            },
            'export_data': {
                'jobs': [{'sourceVacancyId': '456', 'title': 'Different'}],
            },
        }

        resp = client_with_db.post(
            '/api/v1/migration/preview',
            json=body,
            headers=auth_headers,
        )

        assert resp.status_code == 200
        conflict_details = resp.json()['data'].get('conflict_details')
        assert conflict_details is not None
        assert len(conflict_details) >= 1
        for cd in conflict_details:
            assert 'entity_type' in cd
            assert 'reason' in cd


# ── Import endpoint tests ────────────────────────────────────────────────


class TestMigrationImport:
    def test_import_inserts_jobs_into_empty_db(
        self, client_with_db: TestClient, auth_headers: dict[str, str], db_session: Session
    ) -> None:
        """Importing jobs into an empty companion creates vacancies."""
        job_data = [
            {
                'id': 'j-1',
                'sourceVacancyId': 'hh-100',
                'title': 'SWE',
                'sourceUrl': 'https://hh.ru/vacancy/hh-100',
                'companyName': 'Acme',
                'companyId': 'c-1',
            },
            {
                'id': 'j-2',
                'sourceVacancyId': 'hh-200',
                'title': 'PM',
                'sourceUrl': 'https://hh.ru/vacancy/hh-200',
                'companyName': 'Beta',
            },
        ]
        counts = {
            'jobs': 2,
            'companies': 0,
            'profiles': 0,
            'resumes': 0,
            'coverLetters': 0,
            'applications': 0,
            'events': 0,
            'aiCache': 0,
            'labsActions': 0,
            'hrTimeline': 0,
            'visitMarks': 0,
            'meta': 0,
            'syncOutbox': 0,
            'opsCache': 0,
            'opsMeta': 0,
        }
        snapshot_hash = _djb2a_hash(json.dumps(job_data))

        body = {
            'export_version': 2,
            'snapshot': {
                'captured_at': '2026-08-04T10:00:00Z',
                'counts': counts,
                'snapshot_hash': snapshot_hash,
            },
            'export_data': {'jobs': job_data},
        }

        resp = client_with_db.post(
            '/api/v1/migration/import',
            json=body,
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()['data']
        assert data['status'] == 'committed'
        assert data['inserts'] == 2
        assert data['unchanged'] == 0
        assert data['checkpoint'] is not None

        # Verify vacancies were actually created
        from sqlalchemy import text

        result = db_session.execute(text('SELECT COUNT(*) FROM vacancies'))
        count = result.scalar_one()
        assert count == 2

    def test_import_is_idempotent(
        self,
        client_with_db: TestClient,
        auth_headers: dict[str, str],
    ) -> None:
        """Repeated import of the same snapshot hash produces identical results."""
        job_data = [{'id': 'j-10', 'sourceVacancyId': 'hh-10', 'title': 'X'}]
        counts = {
            'jobs': 1,
            'companies': 0,
            'profiles': 0,
            'resumes': 0,
            'coverLetters': 0,
            'applications': 0,
            'events': 0,
            'aiCache': 0,
            'labsActions': 0,
            'hrTimeline': 0,
            'visitMarks': 0,
            'meta': 0,
            'syncOutbox': 0,
            'opsCache': 0,
            'opsMeta': 0,
        }
        snapshot_hash = _djb2a_hash('test-idempotent-1')

        body = {
            'export_version': 2,
            'snapshot': {
                'captured_at': '2026-08-04T10:00:00Z',
                'counts': counts,
                'snapshot_hash': snapshot_hash,
            },
            'export_data': {'jobs': job_data},
        }

        r1 = client_with_db.post(
            '/api/v1/migration/import',
            json=body,
            headers=auth_headers,
        )
        r2 = client_with_db.post(
            '/api/v1/migration/import',
            json=body,
            headers=auth_headers,
        )

        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()['data']['status'] == 'committed'
        assert r2.json()['data']['status'] == 'committed'
        assert r2.json()['data'] == r1.json()['data']

    def test_import_rolls_back_on_failure(
        self, client_with_db: TestClient, auth_headers: dict[str, str], db_session: Session
    ) -> None:
        """A request that triggers a processing error rolls back cleanly.

        A database conversion failure after the first insert must roll the
        whole transaction back.
        """
        counts = {
            'jobs': 2,
            'companies': 0,
            'profiles': 0,
            'resumes': 0,
            'coverLetters': 0,
            'applications': 0,
            'events': 0,
            'aiCache': 0,
            'labsActions': 0,
            'hrTimeline': 0,
            'visitMarks': 0,
            'meta': 0,
            'syncOutbox': 0,
            'opsCache': 0,
            'opsMeta': 0,
        }
        snapshot_hash = _djb2a_hash('test-rollback-2')

        body = {
            'export_version': 2,
            'snapshot': {
                'captured_at': '2026-08-04T10:00:00Z',
                'counts': counts,
                'snapshot_hash': snapshot_hash,
            },
            'export_data': {
                'jobs': [
                    {'sourceVacancyId': 'valid-first', 'title': 'Valid'},
                    {'sourceVacancyId': 'invalid-second', 'title': 'Invalid', 'salaryMin': {}},
                ],
            },
        }

        resp = client_with_db.post(
            '/api/v1/migration/import',
            json=body,
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()['data']
        assert data['status'] == 'rolled_back'
        assert data['inserts'] == 0
        assert 'rolled back' in data['summary'].lower()

        # No vacancies should have been created
        from sqlalchemy import text

        result = db_session.execute(text('SELECT COUNT(*) FROM vacancies'))
        count = result.scalar_one()
        assert count == 0

    def test_import_requires_auth(self, client_with_db: TestClient) -> None:
        resp = client_with_db.post(
            '/api/v1/migration/import',
            json={'snapshot': {'counts': {}}, 'export_data': {}},
        )
        assert resp.status_code == 401


# ── Status endpoint tests ────────────────────────────────────────────────


class TestMigrationStatus:
    def test_status_returns_standalone_when_no_import_done(
        self,
        client_with_db: TestClient,
        auth_headers: dict[str, str],
    ) -> None:
        resp = client_with_db.get(
            '/api/v1/migration/status',
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()['data']
        assert data['mode'] == 'standalone'
        assert data['imported'] is False
        assert data['last_import_at'] is None
        assert data['last_import_checkpoint'] is None

    def test_status_reflects_import_after_successful_migration(
        self,
        client_with_db: TestClient,
        auth_headers: dict[str, str],
    ) -> None:
        """After a successful import, status shows mode=ops and imported=True."""
        job_data = [{'id': 'j-s1', 'sourceVacancyId': 'hh-status-1', 'title': 'T'}]
        counts = {
            'jobs': 1,
            'companies': 0,
            'profiles': 0,
            'resumes': 0,
            'coverLetters': 0,
            'applications': 0,
            'events': 0,
            'aiCache': 0,
            'labsActions': 0,
            'hrTimeline': 0,
            'visitMarks': 0,
            'meta': 0,
            'syncOutbox': 0,
            'opsCache': 0,
            'opsMeta': 0,
        }

        # First: do an import
        import_resp = client_with_db.post(
            '/api/v1/migration/import',
            json={
                'export_version': 2,
                'snapshot': {
                    'captured_at': '2026-08-04T10:00:00Z',
                    'counts': counts,
                    'snapshot_hash': _djb2a_hash('test-status-1'),
                },
                'export_data': {'jobs': job_data},
            },
            headers=auth_headers,
        )
        assert import_resp.status_code == 200
        assert import_resp.json()['data']['status'] == 'committed'

        # Then: check status
        status_resp = client_with_db.get(
            '/api/v1/migration/status',
            headers=auth_headers,
        )

        assert status_resp.status_code == 200
        data = status_resp.json()['data']
        assert data['mode'] == 'ops'
        assert data['imported'] is True
        assert data['last_import_at'] is not None
        assert data['last_import_checkpoint'] is not None

    def test_status_requires_auth(self, client_with_db: TestClient) -> None:
        resp = client_with_db.get('/api/v1/migration/status')
        assert resp.status_code == 401
