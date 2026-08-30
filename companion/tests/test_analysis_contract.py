"""AOPS-08 runtime contract tests — R1 recovery acceptance.

Covers the behaviors required by the R1 runtime contract that the original
recovered suite did not prove:

- engine availability gating (missing/invalid package blocks Full V4 analysis,
  Stage A deterministic triage stays available);
- deterministic validator behaviors (unknown evidence ID, score cap violation,
  malformed provider JSON);
- provider failure modes (timeout) and bounded repair retry (second failure);
- persistence (engine run + evidence usage, engine_hash recorded);
- auth boundary and privacy (run detail does not leak raw output/letter).

All tests are hermetic: the engine package root is isolated per test and
populated with the synthetic valid-minimal fixture — no dependency on a
locally installed real package.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.analysis.provider import FakeProvider, _default_fake_response
from app.security.auth import hash_client_token
from app.security.pairing import generate_client_token

TOKEN = generate_client_token()

_ENGINE_FIXTURES = Path(__file__).resolve().parent / 'engine_fixtures' / 'valid-minimal'


def _headers() -> dict[str, str]:
    return {'X-VacancyPilot-Client': TOKEN}


def _register_token(token: str, session: Session) -> None:
    token_hash = hash_client_token(token)
    now = '2026-08-05T10:00:00Z'
    session.execute(
        text(
            'INSERT OR REPLACE INTO settings '
            '(key, value_json, revision, created_at, updated_at) '
            'VALUES (:key, :value, 1, :now, :now)'
        ),
        {'key': 'pairing_client_token_hash', 'value': token_hash, 'now': now},
    )
    session.commit()


def _ingest_vacancy(client: TestClient, source_id: str = 'contract_vacancy') -> dict:
    body = {
        'schema_version': 1,
        'source': 'test_source',
        'source_vacancy_id': source_id,
        'title': 'Python Developer',
        'company_name': 'Test Corp',
        'salary_min': 150000,
        'salary_max': 200000,
        'currency': 'USD',
        'work_mode': 'remote',
        'experience': '5+ years',
        'description': 'We are looking for a Python developer with FastAPI experience.',
        'skills': ['Python', 'FastAPI', 'SQL'],
    }
    resp = client.post('/api/v1/vacancies/intake', json=body, headers=_headers())
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture()
def engine_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Isolate the engine package root per test (hermetic, no local state)."""
    root = tmp_path / 'engine'
    root.mkdir()
    monkeypatch.setattr('app.analysis.service.resolve_engine_package_root', lambda: root)
    return root


@pytest.fixture()
def valid_engine(engine_root: Path) -> Path:
    """Install the synthetic valid-minimal package into the isolated root."""
    shutil.copytree(_ENGINE_FIXTURES, engine_root / 'current')
    return engine_root


def _analyze(
    client_with_db: TestClient,
    vacancy_id: str,
    monkeypatch: pytest.MonkeyPatch,
    provider: FakeProvider,
) -> dict:
    monkeypatch.setattr('app.analysis.service.create_provider', lambda *a, **k: provider)
    resp = client_with_db.post(
        f'/api/v1/vacancies/{vacancy_id}/analyze',
        json={'force': True},
        headers=_headers(),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()['data']


# ── Engine availability gating ───────────────────────────────────────────


class TestEngineAvailabilityGating:
    """Full V4 analysis MUST be blocked without a valid engine package."""

    def test_missing_engine_blocks_analysis(
        self, client_with_db: TestClient, db_session: Session, engine_root: Path
    ) -> None:
        _register_token(TOKEN, db_session)
        vacancy_id = _ingest_vacancy(client_with_db)['data']['vacancy_id']

        resp = client_with_db.post(
            f'/api/v1/vacancies/{vacancy_id}/analyze', json={}, headers=_headers()
        )
        assert resp.status_code == 409, resp.text
        assert 'ENGINE_PACKAGE_MISSING' in resp.json()['error']['message']

    def test_missing_engine_blocks_preview(
        self, client_with_db: TestClient, db_session: Session, engine_root: Path
    ) -> None:
        _register_token(TOKEN, db_session)
        vacancy_id = _ingest_vacancy(client_with_db)['data']['vacancy_id']

        resp = client_with_db.post(
            f'/api/v1/vacancies/{vacancy_id}/analyze?preview=true',
            json={},
            headers=_headers(),
        )
        assert resp.status_code == 409
        assert 'ENGINE_PACKAGE_MISSING' in resp.json()['error']['message']

    def test_invalid_engine_blocks_analysis(
        self, client_with_db: TestClient, db_session: Session, valid_engine: Path
    ) -> None:
        target = valid_engine / 'current' / 'active' / '01_candidate_claims.md'
        target.write_text(
            target.read_text(encoding='utf-8') + '\n<!-- tampered -->\n',
            encoding='utf-8',
        )

        _register_token(TOKEN, db_session)
        vacancy_id = _ingest_vacancy(client_with_db)['data']['vacancy_id']

        resp = client_with_db.post(
            f'/api/v1/vacancies/{vacancy_id}/analyze', json={}, headers=_headers()
        )
        assert resp.status_code == 409, resp.text
        assert 'ENGINE_PACKAGE_INVALID' in resp.json()['error']['message']

    def test_stage_a_triage_works_without_engine(
        self, client_with_db: TestClient, db_session: Session, engine_root: Path
    ) -> None:
        """Deterministic triage (intake) must not require the V4 package."""
        _register_token(TOKEN, db_session)
        resp = client_with_db.post(
            '/api/v1/vacancies/intake',
            json={
                'schema_version': 1,
                'source': 'test_source',
                'source_vacancy_id': 'no_engine_triage',
                'title': 'Analyst',
                'company_name': 'Test Corp',
                'description': 'CRM analysis role.',
                'skills': ['CRM'],
            },
            headers=_headers(),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()['data']
        assert data['result'] in ('created', 'duplicate')
        assert data['vacancy_id']


# ── Validation and reliability behaviors ────────────────────────────────


class TestValidationAndReliability:
    """Deterministic validators, provider failure modes, persistence."""

    def test_unknown_evidence_id_rejected(
        self,
        client_with_db: TestClient,
        db_session: Session,
        valid_engine: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _register_token(TOKEN, db_session)
        vacancy_id = _ingest_vacancy(client_with_db)['data']['vacancy_id']

        bad = _default_fake_response()
        bad['evidence_map'][0]['claim_id'] = 'NOT-IN-INDEX'
        data = _analyze(client_with_db, vacancy_id, monkeypatch, FakeProvider(response=bad))

        assert data['status'] == 'invalid'
        assert data['ready'] is False
        assert any('UNSUPPORTED_CLAIM' in e for e in data['validation_errors'])

    def test_score_cap_violation_rejected(
        self,
        client_with_db: TestClient,
        db_session: Session,
        valid_engine: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _register_token(TOKEN, db_session)
        vacancy_id = _ingest_vacancy(client_with_db)['data']['vacancy_id']

        bad = _default_fake_response()
        bad['score'] = {
            'raw': 85,
            'caps': [{'rule_id': 'CAP-1', 'reason': 'test cap', 'max_score': 50}],
            'final': 85,
            'confidence': 'high',
            'decision': 'apply',
        }
        data = _analyze(client_with_db, vacancy_id, monkeypatch, FakeProvider(response=bad))

        assert data['status'] == 'invalid'
        # The cap math is enforced at two deterministic layers: the Pydantic
        # ScoreResult model (SCHEMA_VALIDATION) and the literal validator
        # (SCORE_CAP_PARITY). Either rejection proves the gate.
        assert any(
            'SCORE_CAP_PARITY' in e or 'SCHEMA_VALIDATION' in e for e in data['validation_errors']
        )

    def test_malformed_provider_json_rejected(
        self,
        client_with_db: TestClient,
        db_session: Session,
        valid_engine: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _register_token(TOKEN, db_session)
        vacancy_id = _ingest_vacancy(client_with_db)['data']['vacancy_id']

        data = _analyze(
            client_with_db,
            vacancy_id,
            monkeypatch,
            FakeProvider(response={'unexpected': 'shape'}),
        )

        assert data['status'] == 'invalid'
        assert data['ready'] is False
        assert data['validation_errors'], 'schema errors must be surfaced'

    def test_provider_timeout_persisted_as_error(
        self,
        client_with_db: TestClient,
        db_session: Session,
        valid_engine: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _register_token(TOKEN, db_session)
        vacancy_id = _ingest_vacancy(client_with_db)['data']['vacancy_id']

        provider = FakeProvider(error='PROVIDER_TIMEOUT: OpenAI API request timed out')
        data = _analyze(client_with_db, vacancy_id, monkeypatch, provider)

        assert data['status'] == 'error'
        assert data['ready'] is False

    def test_repair_second_failure_stays_invalid(
        self,
        client_with_db: TestClient,
        db_session: Session,
        valid_engine: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _register_token(TOKEN, db_session)
        vacancy_id = _ingest_vacancy(client_with_db)['data']['vacancy_id']

        bad = _default_fake_response()
        bad['evidence_map'][0]['claim_id'] = 'NOT-IN-INDEX'
        provider = FakeProvider(response=bad)
        # FakeProvider.repair_output returns the same broken payload, so the
        # single repair retry also fails and the run stays invalid.
        data = _analyze(client_with_db, vacancy_id, monkeypatch, provider)

        assert data['status'] == 'invalid'
        assert data['repair_status'] == 'invalid'
        assert data['ready'] is False
        assert provider.repair_count == 1, 'exactly one repair retry'

    def test_engine_run_and_evidence_usage_persisted(
        self,
        client_with_db: TestClient,
        db_session: Session,
        valid_engine: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.db.models import EngineRun, EvidenceUsage

        _register_token(TOKEN, db_session)
        vacancy_id = _ingest_vacancy(client_with_db)['data']['vacancy_id']

        data = _analyze(client_with_db, vacancy_id, monkeypatch, FakeProvider())

        assert data['status'] == 'success'
        run = db_session.get(EngineRun, data['run_id'])
        assert run is not None
        assert run.engine_hash != ''
        assert run.raw_output is not None
        usages = db_session.query(EvidenceUsage).filter(EvidenceUsage.engine_run_id == run.id).all()
        assert len(usages) == 2
        assert {u.evidence_level for u in usages} == {'E4', 'E3'}

    def test_analyze_requires_auth(
        self, client_with_db: TestClient, db_session: Session, valid_engine: Path
    ) -> None:
        _register_token(TOKEN, db_session)
        vacancy_id = _ingest_vacancy(client_with_db)['data']['vacancy_id']

        resp = client_with_db.post(f'/api/v1/vacancies/{vacancy_id}/analyze', json={})
        assert resp.status_code == 401

    def test_run_detail_does_not_leak_raw_output(
        self,
        client_with_db: TestClient,
        db_session: Session,
        valid_engine: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _register_token(TOKEN, db_session)
        vacancy_id = _ingest_vacancy(client_with_db)['data']['vacancy_id']

        data = _analyze(client_with_db, vacancy_id, monkeypatch, FakeProvider())

        resp = client_with_db.get(f'/api/v1/engine/runs/{data["run_id"]}', headers=_headers())
        assert resp.status_code == 200
        payload = resp.text
        assert 'raw_output' not in payload
        assert 'cover_letter' not in payload
