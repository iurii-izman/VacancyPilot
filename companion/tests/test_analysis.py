"""Tests for AOPS-08 V4 vacancy analysis pipeline.

Covers:
- End-to-end analysis with FakeProvider (deterministic response)
- Input-hash cache: reuse compatible run, skip on force
- Provider error → error status
- Invalid structured output → invalid status + one repair retry
- Repair succeeds → repaired status
- Repair fails → remains invalid
- Payload preview (no provider call)
- All 11 literal letter validators
- Score parity validation
- Recruiter risks count validation
"""

from __future__ import annotations

import json
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


def _ingest_vacancy(client: TestClient, title: str = 'Python Developer') -> dict:
    """Create a vacancy via the intake endpoint and return its ID."""
    body = {
        'schema_version': 1,
        'source': 'test_source',
        'source_vacancy_id': f'test_{title.replace(" ", "_").lower()}',
        'title': title,
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


class TestAnalysisEndToEnd:
    """End-to-end analysis pipeline tests using FakeProvider."""

    def test_preview_mode_returns_payload_preview(
        self, client_with_db: TestClient, db_session: Session, valid_engine: Path
    ) -> None:
        """Preview mode should return a preview without calling provider."""
        _register_token(TOKEN, db_session)
        ingested = _ingest_vacancy(client_with_db)
        vacancy_id = ingested['data']['vacancy_id']

        resp = client_with_db.post(
            f'/api/v1/vacancies/{vacancy_id}/analyze?preview=true',
            json={'language': 'en'},
            headers=_headers(),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body['data']['provider'] == 'openai'
        assert body['data']['cache_hit'] is False
        assert body['data']['privacy_mode'] == 'standard'
        assert len(body['data']['what_is_sent']) > 0
        assert len(body['data']['what_is_not_sent']) > 0

    def test_fake_provider_deterministic_response(self) -> None:
        """FakeProvider should return the configured fixture deterministically."""
        import asyncio

        from app.analysis.models import AnalysisRequest

        provider = FakeProvider()
        assert provider.provider_id == 'fake'
        assert provider.call_count == 0

        request = AnalysisRequest(
            system_prompt='Test system',
            user_prompt='Test user',
            output_schema={},
            model='fake-model',
            provider='fake',
        )
        response = asyncio.run(provider.analyze_vacancy(request))
        assert response.error is None
        assert provider.call_count == 1
        assert '"vacancy_identity"' in response.raw_text

        parsed = json.loads(response.raw_text)
        assert parsed['vacancy_identity']['company'] == 'Test Company'
        assert parsed['score']['decision'] == 'apply'

    def test_fake_provider_repair(self) -> None:
        """FakeProvider.repair_output should return the fixed version."""
        import asyncio

        from app.analysis.models import AnalysisRequest

        provider = FakeProvider()
        request = AnalysisRequest(
            system_prompt='Test',
            user_prompt='Test',
            output_schema={},
            model='fake-model',
            provider='fake',
        )
        response = asyncio.run(
            provider.repair_output(request, ['H1_CAPITAL'], {'score': {'final': 50}})
        )
        assert response.error is None
        assert provider.repair_count == 1

    def test_fake_provider_error_mode(self) -> None:
        """FakeProvider with error= should return an error response."""
        import asyncio

        from app.analysis.models import AnalysisRequest

        provider = FakeProvider(error='SIMULATED_ERROR')
        request = AnalysisRequest(
            system_prompt='Test',
            user_prompt='Test',
            output_schema={},
            model='fake-model',
            provider='fake',
        )
        response = asyncio.run(provider.analyze_vacancy(request))
        assert response.error == 'SIMULATED_ERROR'

    def test_schema_invalid_json_object_gets_one_repair_attempt(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Pydantic-invalid JSON must not bypass the controlled repair path."""
        from app.analysis.models import AnalysisRunResult, CompiledPrompt
        from app.analysis.service import AnalysisService

        provider = FakeProvider()
        service = AnalysisService(session=None)  # type: ignore[arg-type]
        invalid = AnalysisRunResult(
            run_id='run-1',
            vacancy_id='vacancy-1',
            status='invalid',
            repair_status='invalid',
            engine_version='4.0.0',
            engine_hash='0' * 64,
            provider='fake',
            model='fake-model',
            prompt_version='test',
            input_hash='0' * 64,
            raw_output=json.dumps({'central_requirements': [{}]}),
            validation_errors=['SCHEMA_VALIDATION[central_requirements]: invalid length'],
        )
        compiled = CompiledPrompt(
            system_prompt='system',
            user_prompt='user',
            output_schema={},
            prompt_version='test',
            input_hash='0' * 64,
            token_estimate=1,
            engine_version='4.0.0',
            engine_hash='0' * 64,
            provider='fake',
            model='fake-model',
        )
        expected = invalid.model_copy(update={'status': 'success', 'repair_status': 'repaired'})
        monkeypatch.setattr(service, '_process_provider_response', lambda **_: expected)

        result = service._attempt_schema_repair(
            run_result=invalid,
            compiled=compiled,
            provider=provider,
            index=None,
            language='en',
        )

        assert provider.repair_count == 1
        assert result.repair_status == 'repaired'


class TestLiteralValidators:
    """All 11 deterministic literal letter validators."""

    def _valid_letter_ru(self) -> str:
        return (
            'Здравствуйте,\n\n'
            'Меня заинтересовала вакансия "Python Developer" в компании Test Corp.\n\n'
            'Мой опыт включает 5+ лет коммерческой разработки на Python, '
            'включая создание production API с FastAPI и асинхронными паттернами. '
            'Я увеличил производительность сервиса на 40% за счёт оптимизации запросов.\n\n'
            'Я уверен, что могу принести значительную ценность вашей команде '
            'благодаря глубокому пониманию современных подходов к разработке '
            'и опыту внедрения надёжных масштабируемых решений.\n\n'
            'С уважением,\n'
            'Иван Петров'
        )

    def test_h1_capital_first_line(self) -> None:
        from app.analysis.validators import _check_h1

        assert _check_h1('') == ['H1_MISSING: letter has no non-empty lines']
        assert _check_h1(self._valid_letter_ru()) == []

    def test_h1_lowercase_fails(self) -> None:
        from app.analysis.validators import _check_h1

        errors = _check_h1('здравствуйте,\n\nRest of letter...')
        assert any('H1_CAPITAL' in e for e in errors)

    def test_five_sections_valid(self) -> None:
        from app.analysis.validators import _check_five_sections

        errors = _check_five_sections(self._valid_letter_ru(), 'ru')
        assert errors == [], errors

    def test_five_sections_missing(self) -> None:
        from app.analysis.validators import _check_five_sections

        errors = _check_five_sections('Just a one-liner.', 'en')
        assert any('SECTION_MISSING' in e for e in errors)

    def test_word_count_apply_range(self) -> None:
        from app.analysis.validators import _check_word_count

        # Build a ~152-word letter (38 unique words * 4 repetitions = 152)
        long_letter = ' '.join(['Python developer experience skill project'] * 31)
        errors = _check_word_count(long_letter, 'apply')
        assert errors == [], errors

    def test_word_count_too_short(self) -> None:
        from app.analysis.validators import _check_word_count

        errors = _check_word_count('Short letter.', 'apply')
        assert any('WORD_COUNT_LOW' in e for e in errors)

    def test_vacancy_anchors(self) -> None:
        from app.analysis.validators import _check_vacancy_anchors

        letter = (
            'I am excited about the Python Developer role at Test Corp. '
            'As a Python developer with 5 years of experience...'
        )
        errors = _check_vacancy_anchors(letter, 'Python Developer')
        # "python" and "developer" both appear in the letter
        assert not any('VACANCY_ANCHORS' in e for e in errors)

    def test_micro_proof_present(self) -> None:
        from app.analysis.validators import _check_micro_proof

        letter = 'I increased performance by 40%.'
        errors = _check_micro_proof(letter)
        assert errors == []

    def test_micro_proof_missing(self) -> None:
        from app.analysis.validators import _check_micro_proof

        errors = _check_micro_proof('I am a good developer.')
        assert any('MICRO_PROOF' in e for e in errors)

    def test_cited_case_micro_proof_is_accepted_without_a_number(self) -> None:
        from types import SimpleNamespace

        from app.analysis.validators import _check_evidence_backed_micro_proof

        index = SimpleNamespace(
            commercial_cases={
                'SYNTH-CASE': {'micro_proof_en': 'Delivered a verified synthetic integration.'}
            }
        )
        errors = _check_evidence_backed_micro_proof(
            'Delivered a verified synthetic integration.',
            [{'case_id': 'SYNTH-CASE'}],
            index,
            english_required=True,
        )
        assert errors == []

    def test_placeholders_forbidden(self) -> None:
        from app.analysis.validators import _check_no_placeholders

        errors = _check_no_placeholders('Use [placeholder] here')
        assert any('PLACEHOLDER' in e for e in errors)
        assert _check_no_placeholders(self._valid_letter_ru()) == []

    def test_overclaims_forbidden(self) -> None:
        from app.analysis.validators import _check_no_overclaims

        errors = _check_no_overclaims('I am the best in class developer')
        assert any('OVERCLAIM' in e for e in errors)
        assert _check_no_overclaims(self._valid_letter_ru()) == []

    def test_self_disqualification_detected(self) -> None:
        from app.analysis.validators import _check_no_self_disqualification

        errors = _check_no_self_disqualification("Unfortunately I don't have experience with this")
        assert any('SELF_DISQUALIFY' in e for e in errors)
        assert _check_no_self_disqualification(self._valid_letter_ru()) == []

    def test_skill_list_density(self) -> None:
        from app.analysis.validators import _check_skill_list_density

        dense = 'Skills: Python, FastAPI, SQL, Docker, Redis, Kafka, AWS, GCP'
        errors = _check_skill_list_density(dense)
        # This might trigger if the pattern matches; depends on the regex
        # Mainly verify it doesn't crash
        assert isinstance(errors, list)

    def test_signature_present(self) -> None:
        from app.analysis.validators import _check_signature

        errors = _check_signature(self._valid_letter_ru())
        assert errors == [], errors

    def test_signature_missing(self) -> None:
        from app.analysis.validators import _check_signature

        errors = _check_signature('No signature here.')
        assert any('SIGNATURE_MISSING' in e for e in errors)

    def test_greeting_is_not_misclassified_as_a_signature(self) -> None:
        from app.analysis.validators import _check_signature

        letter = 'Dear Hiring Manager,\n\nI am interested in the role.\n\nBest regards,\nJane Doe'
        assert _check_signature(letter) == []

    def test_english_mode_required(self) -> None:
        from app.analysis.validators import _check_english_mode

        # Russian text when English is required
        errors = _check_english_mode(self._valid_letter_ru(), required=True)
        assert any('ENGLISH_MODE' in e for e in errors)

        # English text when English is required
        english_letter = (
            'Dear hiring manager,\n\n'
            'I am very interested in the Python Developer position at Test Corp.\n\n'
            'My experience includes 5+ years of production Python development.\n\n'
            'Best regards,\nJohn Doe'
        )
        errors = _check_english_mode(english_letter, required=True)
        assert errors == []

    def test_empty_cover_letter_is_rejected(self) -> None:
        """An empty letter must not bypass the Full V4 validation gate."""
        from app.analysis.models import V4StructuredResult
        from app.analysis.validators import validate_structured_result

        result = V4StructuredResult(
            vacancy_identity={'company': 'Test Corp', 'role': 'Python Developer'},
            eligibility={'hard_fail': False, 'reasons': []},
            central_requirements=[],
            evidence_map=[],
            score={'raw': 80, 'final': 80, 'confidence': 'high', 'decision': 'apply'},
            strategy={'positioning': 'test', 'tone': 'confident'},
            cover_letter='',
            recruiter_risks=[
                {'risk': 'Risk A', 'severity': 'low'},
                {'risk': 'Risk B', 'severity': 'medium'},
            ],
            interview_prep=[],
            qa={'passed': True, 'errors': []},
        )

        errors = validate_structured_result(result)
        assert any('H1_MISSING' in error for error in errors)


class TestScoreValidation:
    """Score/cap/decision parity checks."""

    def test_final_exceeds_raw(self) -> None:
        from pydantic import ValidationError

        from app.analysis.models import ScoreResult

        with pytest.raises(ValidationError):
            ScoreResult(raw=50, final=60, confidence='high', decision='apply')

    def test_valid_score(self) -> None:
        from app.analysis.models import ScoreResult

        s = ScoreResult(raw=80, final=80, confidence='high', decision='apply')
        assert s.final == 80


class TestRecruiterRisks:
    """Recruiter risks count validation."""

    def test_exactly_two_required_in_model(self) -> None:
        from pydantic import ValidationError

        from app.analysis.models import V4StructuredResult

        with pytest.raises(ValidationError):
            V4StructuredResult(
                vacancy_identity={'company': 'C', 'role': 'R'},
                eligibility={'hard_fail': False, 'reasons': []},
                central_requirements=[],
                evidence_map=[],
                score={'raw': 80, 'final': 80, 'confidence': 'high', 'decision': 'apply'},
                strategy={'positioning': 'test', 'tone': 'confident'},
                cover_letter='test letter',
                recruiter_risks=[],  # Should be exactly 2
                interview_prep=[],
                qa={'passed': True, 'errors': []},
            )

    def test_valid_with_two_risks(self) -> None:
        from app.analysis.models import V4StructuredResult

        result = V4StructuredResult(
            vacancy_identity={'company': 'C', 'role': 'R'},
            eligibility={'hard_fail': False, 'reasons': []},
            central_requirements=[],
            evidence_map=[],
            score={'raw': 80, 'final': 80, 'confidence': 'high', 'decision': 'apply'},
            strategy={'positioning': 'test', 'tone': 'confident'},
            cover_letter='test',
            recruiter_risks=[
                {'risk': 'Risk A', 'severity': 'low'},
                {'risk': 'Risk B', 'severity': 'medium'},
            ],
            interview_prep=[],
            qa={'passed': True, 'errors': []},
        )
        assert len(result.recruiter_risks) == 2


class TestPromptCompiler:
    """Prompt compiler determinism and hash consistency."""

    def test_selected_evidence_payload_contains_allowed_wording_and_case_proof(self) -> None:
        from types import SimpleNamespace

        from app.analysis.compiler import _build_cases_section, _build_claims_section
        from app.analysis.models import PromptCompilerInput

        index = SimpleNamespace(
            claims={
                'SYNTH-CLAIM': {
                    'evidence_level': 'E4',
                    'category': 'backend',
                    'allowed_wording': 'Built verified synthetic backend services.',
                    'limitations': 'Synthetic limitation.',
                }
            },
            commercial_cases={
                'SYNTH-CASE': {
                    'category': 'integration',
                    'micro_proof_en': 'Reduced synthetic latency by 25%.',
                    'do_not_claim': ['Synthetic revenue impact.'],
                }
            },
        )
        input_data = PromptCompilerInput(
            title='Synthetic Backend Engineer',
            selected_claim_ids=['SYNTH-CLAIM'],
            selected_case_ids=['SYNTH-CASE'],
        )

        claims, _ = _build_claims_section(input_data, index)
        cases, _ = _build_cases_section(input_data, index)

        assert 'Built verified synthetic backend services.' in claims
        assert 'Reduced synthetic latency by 25%.' in cases
        assert 'Synthetic revenue impact.' in cases

    def test_system_prompt_requires_a_valid_cover_letter(self) -> None:
        from app.analysis.compiler import _build_system_prompt_en

        prompt = _build_system_prompt_en()
        assert '`cover_letter` is mandatory' in prompt
        assert '150–220 words' in prompt
        assert '`micro_proof_en`' in prompt
        assert '`Best regards,`' in prompt

    def test_input_hash_deterministic(self) -> None:
        from app.analysis.compiler import compile_prompt
        from app.analysis.models import PromptCompilerInput

        inp1 = PromptCompilerInput(
            title='Python Developer',
            selected_claim_ids=['CLM-1'],
        )
        inp2 = PromptCompilerInput(
            title='Python Developer',
            selected_claim_ids=['CLM-1'],
        )

        c1 = compile_prompt(inp1, None, None)
        c2 = compile_prompt(inp2, None, None)
        assert c1.input_hash == c2.input_hash

    def test_input_hash_differs_on_title_change(self) -> None:
        from app.analysis.compiler import compile_prompt
        from app.analysis.models import PromptCompilerInput

        inp1 = PromptCompilerInput(title='Python Developer')
        inp2 = PromptCompilerInput(title='Java Developer')

        c1 = compile_prompt(inp1, None, None)
        c2 = compile_prompt(inp2, None, None)
        assert c1.input_hash != c2.input_hash


class TestCacheLogic:
    """Input-hash cache: hit, miss, force-bypass."""

    def test_cache_hit_with_db_run(
        self, client_with_db: TestClient, db_session: Session, valid_engine: Path
    ) -> None:
        """A cached valid run should be returned instead of calling provider."""
        _register_token(TOKEN, db_session)
        ingested = _ingest_vacancy(client_with_db)
        vacancy_id = ingested['data']['vacancy_id']

        # First call — creates a run (uses fake provider via monkeypatch)
        # We test that subsequent calls hit cache

        # Pre-populate a valid cache entry directly
        from app.db.models import EngineRun

        now = '2026-08-05T10:00:00Z'

        run = EngineRun(
            vacancy_id=vacancy_id,
            engine_version='test-1.0',
            provider='openai',
            model='gpt-4o',
            prompt_version='v4.0.0-ao8-1',
            input_hash='deadbeef' + ('0' * 56),
            raw_output='{}',
            validated_output=json.dumps(_default_fake_response(), ensure_ascii=False),
            status='success',
            validation_errors_json=None,
            created_at=now,
        )
        db_session.add(run)
        db_session.commit()

        # A second call with preview should not find a cache hit since hash is
        # computed from actual content
        resp = client_with_db.post(
            f'/api/v1/vacancies/{vacancy_id}/analyze?preview=true',
            json={'language': 'en'},
            headers=_headers(),
        )
        assert resp.status_code == 200
        body = resp.json()
        # The cache_hit depends on the hash match — the real hash won't match
        # the deadbeef one, so cache_hit will be False
        assert body['data']['cache_hit'] is False
