"""V4 analysis service — AOPS-08.

Orchestrates the full analysis pipeline:
1. Load engine package and knowledge index
2. Compile the prompt
3. Check input-hash cache
4. Call provider (explicit user action required)
5. Parse and validate structured result
6. Run deterministic literal validators
7. One repair retry if needed
8. Persist engine run + evidence usage transactionally
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analysis.compiler import compile_prompt
from app.analysis.models import (
    AnalysisRequest,
    AnalysisRunResult,
    CompiledPrompt,
    PayloadPreview,
    PromptCompilerInput,
    ProviderResponse,
    ProviderStatus,
    RepairStatus,
    V4StructuredResult,
)
from app.analysis.provider import (
    LLMProvider,
    _estimate_openai_cost,
    create_provider,
)
from app.analysis.validators import validate_structured_result
from app.config import resolve_engine_package_root
from app.db.base import utcnow
from app.db.models import EngineRun, EvidenceUsage
from app.engine.index import KnowledgeIndex, build_knowledge_index
from app.engine.installer import get_active_package
from app.engine.models import LoadedEnginePackage
from app.engine.package import _safe_read


@dataclass
class AnalysisOptions:
    """Options for a single analysis run."""

    provider: str = 'openai'
    model: str | None = None
    force: bool = False
    privacy_mode: str = 'standard'
    language: str = 'ru'
    claim_ids: list[str] = field(default_factory=list)
    case_ids: list[str] = field(default_factory=list)
    portfolio_id: str | None = None


class EnginePackageUnavailableError(RuntimeError):
    """Raised when Full V4 analysis is attempted without a valid engine package.

    The message contains only sanitized, non-private information (error codes
    and filenames) — never candidate content.
    """


class AnalysisService:
    """Orchestrate the full V4 vacancy analysis pipeline."""

    def __init__(self, session: Session) -> None:
        self._session = session

    # ── Public API ────────────────────────────────────────────────────────

    def analyze(
        self,
        vacancy_id: str,
        compiler_input: PromptCompilerInput,
        options: AnalysisOptions,
    ) -> AnalysisRunResult:
        """Run the full analysis pipeline and persist the result."""
        package = self._require_package()
        index = self._build_index(package)

        compiled = compile_prompt(
            compiler_input,
            index,
            package,
            provider=options.provider,
            model=options.model,
            privacy_mode=options.privacy_mode,
            language=options.language,
        )

        if not options.force:
            cached = self._check_cache(compiled)
            if cached is not None:
                return cached

        provider = create_provider(options.provider, model=options.model)

        run_result = self._run_analysis(
            vacancy_id=vacancy_id,
            compiled=compiled,
            provider=provider,
            index=index,
            language=options.language,
        )

        if run_result.status == 'invalid':
            if run_result.structured_result is not None:
                run_result = self._attempt_repair(
                    run_result=run_result,
                    compiled=compiled,
                    provider=provider,
                    index=index,
                    language=options.language,
                )
            else:
                run_result = self._attempt_schema_repair(
                    run_result=run_result,
                    compiled=compiled,
                    provider=provider,
                    index=index,
                    language=options.language,
                )

        return run_result

    def get_run(self, run_id: str) -> AnalysisRunResult | None:
        """Retrieve a persisted engine run by ID."""
        run = self._session.get(EngineRun, run_id)
        if run is None:
            return None
        return self._to_run_result(run)

    def get_preview(
        self,
        compiler_input: PromptCompilerInput,
        options: AnalysisOptions,
    ) -> PayloadPreview:
        """Generate a payload preview without executing the provider."""
        package = self._require_package()
        index = self._build_index(package)
        compiled = compile_prompt(
            compiler_input,
            index,
            package,
            provider=options.provider,
            model=options.model,
            privacy_mode=options.privacy_mode,
            language=options.language,
        )
        cached = self._check_cache(compiled)
        return PayloadPreview(
            provider=options.provider,
            model=options.model or 'gpt-4o',
            token_estimate=compiled.token_estimate,
            estimated_cost_usd=_estimate_openai_cost(
                options.model or 'gpt-4o', compiled.token_estimate, 0
            ),
            prompt_version=compiled.prompt_version,
            input_hash=compiled.input_hash,
            cache_hit=cached is not None,
            privacy_mode=options.privacy_mode,
            language=options.language,
            what_is_sent=_build_preview_sent_list(compiler_input, options.privacy_mode),
            what_is_not_sent=_build_preview_not_sent_list(options.privacy_mode),
        )

    # ── Internal helpers ──────────────────────────────────────────────────

    def _load_package(self) -> LoadedEnginePackage | None:
        try:
            target_root = resolve_engine_package_root()
            return get_active_package(target_root)
        except Exception:
            return None

    def _require_package(self) -> LoadedEnginePackage:
        """Return the active engine package or raise.

        Full V4 analysis MUST be blocked when the engine package is missing
        or invalid — there is no generic LLM fallback. Stage A deterministic
        triage does not go through this service and remains available.
        """
        package = self._load_package()
        if package is None:
            raise EnginePackageUnavailableError(
                'ENGINE_PACKAGE_MISSING: no engine package is installed. '
                'Install a valid V4 package to use Full V4 Analysis.'
            )
        if not package.valid:
            summaries = '; '.join(e.safe_summary() for e in package.validation_errors[:5])
            raise EnginePackageUnavailableError(
                f'ENGINE_PACKAGE_INVALID: the installed engine package failed '
                f'validation ({summaries}). Reinstall a valid V4 package.'
            )
        return package

    def _build_index(self, package: LoadedEnginePackage | None) -> KnowledgeIndex | None:
        if package is None or not package.valid:
            return None
        try:
            target_root = resolve_engine_package_root()
            current_dir = target_root / 'current'
            file_texts: dict[str, str] = {}
            for record in package.files:
                fpath = current_dir / record.relative_path
                try:
                    raw = _safe_read(fpath)
                    file_texts[record.filename] = raw.decode('utf-8')
                except Exception:
                    continue
            if file_texts:
                return build_knowledge_index(package, file_texts)
        except Exception:
            pass
        return None

    def _check_cache(self, compiled: CompiledPrompt) -> AnalysisRunResult | None:
        stmt = (
            select(EngineRun)
            .where(
                EngineRun.input_hash == compiled.input_hash,
                EngineRun.engine_version == compiled.engine_version,
                EngineRun.provider == compiled.provider,
                EngineRun.model == compiled.model,
                EngineRun.prompt_version == compiled.prompt_version,
                EngineRun.status == 'success',
            )
            .order_by(EngineRun.created_at.desc())
            .limit(1)
        )
        cached = self._session.execute(stmt).scalar_one_or_none()
        if cached is not None:
            return self._to_run_result(cached)
        return None

    def _run_analysis(
        self,
        *,
        vacancy_id: str,
        compiled: CompiledPrompt,
        provider: LLMProvider,
        index: KnowledgeIndex | None,
        language: str,
    ) -> AnalysisRunResult:
        request = AnalysisRequest(
            system_prompt=compiled.system_prompt,
            user_prompt=compiled.user_prompt,
            output_schema=compiled.output_schema,
            model=compiled.model,
            provider=compiled.provider,
        )

        try:
            response = asyncio.run(provider.analyze_vacancy(request))
        except Exception as exc:
            run = self._persist_run(
                vacancy_id=vacancy_id,
                compiled=compiled,
                status='error',
                repair_status='invalid',
                raw_output='',
                structured_result=None,
                validation_errors=[f'PROVIDER_ERROR: {exc}'],
                provider_meta=None,
            )
            return self._to_run_result(run)

        return self._process_provider_response(
            vacancy_id=vacancy_id,
            compiled=compiled,
            response=response,
            index=index,
            language=language,
        )

    def _attempt_repair(
        self,
        *,
        run_result: AnalysisRunResult,
        compiled: CompiledPrompt,
        provider: LLMProvider,
        index: KnowledgeIndex | None,
        language: str,
    ) -> AnalysisRunResult:
        if run_result.structured_result is None:
            return run_result

        original_dict = run_result.structured_result.model_dump()

        request = AnalysisRequest(
            system_prompt=compiled.system_prompt,
            user_prompt=compiled.user_prompt,
            output_schema=compiled.output_schema,
            model=compiled.model,
            provider=compiled.provider,
        )

        try:
            response = asyncio.run(
                provider.repair_output(request, run_result.validation_errors, original_dict)
            )
        except Exception:
            return run_result  # Repair failed — keep original invalid result

        if response.error:
            return run_result  # Repair failed — keep original invalid result

        return self._process_provider_response(
            vacancy_id=run_result.vacancy_id,
            compiled=compiled,
            response=response,
            index=index,
            language=language,
            is_repair=True,
        )

    def _attempt_schema_repair(
        self,
        *,
        run_result: AnalysisRunResult,
        compiled: CompiledPrompt,
        provider: LLMProvider,
        index: KnowledgeIndex | None,
        language: str,
    ) -> AnalysisRunResult:
        """Repair a JSON object that failed Pydantic/schema validation once.

        Schema-invalid output used to bypass the controlled repair path because
        it could not be materialized as ``V4StructuredResult``.  A JSON object
        is still a safe repair input: the provider receives its own output and
        sanitized validator errors, while deterministic validation remains the
        only source of acceptance.
        """
        if not run_result.raw_output:
            return run_result
        try:
            original = json.loads(run_result.raw_output)
        except json.JSONDecodeError:
            return run_result
        if not isinstance(original, dict):
            return run_result

        request = AnalysisRequest(
            system_prompt=compiled.system_prompt,
            user_prompt=compiled.user_prompt,
            output_schema=compiled.output_schema,
            model=compiled.model,
            provider=compiled.provider,
        )
        try:
            response = asyncio.run(
                provider.repair_output(request, run_result.validation_errors, original)
            )
        except Exception:
            return run_result
        if response.error:
            return run_result
        return self._process_provider_response(
            vacancy_id=run_result.vacancy_id,
            compiled=compiled,
            response=response,
            index=index,
            language=language,
            is_repair=True,
        )

    def _process_provider_response(
        self,
        *,
        vacancy_id: str,
        compiled: CompiledPrompt,
        response: ProviderResponse,
        index: KnowledgeIndex | None,
        language: str,
        is_repair: bool = False,
    ) -> AnalysisRunResult:
        """Parse, validate, and persist a provider response."""
        if response.error:
            run = self._persist_run(
                vacancy_id=vacancy_id,
                compiled=compiled,
                status='error',
                repair_status='invalid',
                raw_output=response.raw_text,
                structured_result=None,
                validation_errors=[response.error],
                provider_meta=response.meta,
            )
            return self._to_run_result(run)

        structured, parse_errors = self._parse_response(response.raw_text)
        if structured is None:
            structured = None  # keep Optional typing explicit
        if parse_errors:
            run = self._persist_run(
                vacancy_id=vacancy_id,
                compiled=compiled,
                status='invalid',
                repair_status='invalid',
                raw_output=response.raw_text,
                structured_result=None,
                validation_errors=parse_errors,
                provider_meta=response.meta,
            )
            return self._to_run_result(run)

        assert structured is not None, '_parse_response returns errors when result is None'
        english_required = language == 'en'
        validation_errors = validate_structured_result(
            structured,
            index=index,
            english_required=english_required,
        )

        if validation_errors:
            status: ProviderStatus = 'invalid'
            repair_status: RepairStatus = 'invalid'
        else:
            status = 'success'
            repair_status = 'repaired' if is_repair else 'valid'

        run = self._persist_run(
            vacancy_id=vacancy_id,
            compiled=compiled,
            status=status,
            repair_status=repair_status,
            raw_output=response.raw_text,
            structured_result=structured,
            validation_errors=validation_errors,
            provider_meta=response.meta,
        )
        return self._to_run_result(run)

    def _parse_response(self, raw_text: str) -> tuple[V4StructuredResult | None, list[str]]:
        errors: list[str] = []
        text = raw_text.strip()
        if text.startswith('```'):
            first_newline = text.find('\n')
            if first_newline >= 0:
                text = text[first_newline + 1 :]
            if text.rstrip().endswith('```'):
                text = text.rstrip()[:-3].rstrip()

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            return None, [f'JSON_PARSE_ERROR: {exc}']

        if not isinstance(parsed, dict):
            return None, ['SCHEMA_ERROR: response is not a JSON object']

        required_keys = [
            'vacancy_identity',
            'eligibility',
            'central_requirements',
            'evidence_map',
            'score',
            'strategy',
            'cover_letter',
            'recruiter_risks',
            'interview_prep',
            'qa',
        ]
        missing = [k for k in required_keys if k not in parsed]
        if missing:
            errors.append(f'SCHEMA_ERROR: missing required keys: {missing}')

        try:
            result = V4StructuredResult(**parsed)
            return result, errors
        except PydanticValidationError as exc:
            for err in exc.errors():
                loc = '.'.join(str(p) for p in err.get('loc', []))
                msg = err.get('msg', '')
                errors.append(f'SCHEMA_VALIDATION[{loc}]: {msg}')
            return None, errors

    def _persist_run(
        self,
        *,
        vacancy_id: str,
        compiled: CompiledPrompt,
        status: ProviderStatus,
        repair_status: RepairStatus,
        raw_output: str,
        structured_result: V4StructuredResult | None,
        validation_errors: list[str],
        provider_meta: Any,
    ) -> EngineRun:
        now = utcnow()
        validated_json = None
        if structured_result is not None:
            validated_json = json.dumps(structured_result.model_dump(), ensure_ascii=False)

        run = EngineRun(
            vacancy_id=vacancy_id,
            engine_version=compiled.engine_version,
            engine_hash=compiled.engine_hash,
            provider=compiled.provider,
            model=compiled.model,
            prompt_version=compiled.prompt_version,
            input_hash=compiled.input_hash,
            raw_output=raw_output if raw_output else None,
            validated_output=validated_json,
            status=status,
            validation_errors_json=json.dumps(validation_errors) if validation_errors else None,
            token_input=provider_meta.token_input if provider_meta else None,
            token_output=provider_meta.token_output if provider_meta else None,
            estimated_cost=provider_meta.estimated_cost_usd if provider_meta else None,
            created_at=now,
        )
        self._session.add(run)
        self._session.flush()

        if structured_result is not None:
            for entry in structured_result.evidence_map:
                eu = EvidenceUsage(
                    engine_run_id=run.id,
                    requirement=f'requirement_{entry.requirement_index}',
                    evidence_level=entry.evidence_level,
                    claim_id=entry.claim_id,
                    case_id=entry.case_id,
                    portfolio_id=entry.portfolio_id,
                    allowed_wording=entry.allowed_wording,
                )
                self._session.add(eu)
            self._session.flush()

        return run

    def _to_run_result(self, run: EngineRun) -> AnalysisRunResult:
        structured = None
        if run.validated_output:
            try:
                parsed = json.loads(run.validated_output)
                structured = V4StructuredResult(**parsed)
            except Exception:
                pass

        validation_errors: list[str] = []
        if run.validation_errors_json:
            try:
                validation_errors = json.loads(run.validation_errors_json)
            except Exception:
                validation_errors = []

        repair_status: RepairStatus = 'valid'
        if run.status == 'invalid':
            repair_status = 'invalid'
        elif run.status == 'success' and run.validation_errors_json:
            # Distinguish repaired from originally-valid by checking if the
            # validation_errors_json is non-empty but the status is success
            # (this happens when the original run was invalid, repaired, and now
            # the repair persisted — but our _persist_run clears errors on
            # repair success. If it's success with errors, it was valid from
            # the start, so repair_status='valid'.)
            repair_status = 'valid'

        model_val = run.model or run.provider or 'gpt-4o'

        return AnalysisRunResult(
            run_id=run.id,
            vacancy_id=run.vacancy_id,
            status=run.status,  # type: ignore[arg-type]
            repair_status=repair_status,
            engine_version=run.engine_version,
            engine_hash=run.engine_hash,
            provider=run.provider,
            model=model_val,
            prompt_version=run.prompt_version,
            input_hash=run.input_hash,
            structured_result=structured,
            raw_output=run.raw_output,
            validation_errors=validation_errors,
            token_input=run.token_input,
            token_output=run.token_output,
            estimated_cost_usd=run.estimated_cost,
            created_at=run.created_at,
        )


# ── Helpers ─────────────────────────────────────────────────────────────────


def _build_preview_sent_list(input_data: PromptCompilerInput, privacy_mode: str) -> list[str]:
    sent = [f'Title: {input_data.title}']
    if input_data.company_name:
        sent.append(f'Company: {input_data.company_name}')
    if input_data.salary_raw:
        sent.append(f'Salary: {input_data.salary_raw}')
    if input_data.city:
        sent.append(f'City: {input_data.city}')
    if input_data.work_mode:
        sent.append(f'Work mode: {input_data.work_mode}')
    sent.append(f'Skills ({len(input_data.skills)} items)')
    if privacy_mode != 'strict' and input_data.description_clean:
        sent.append(f'Description ({len(input_data.description_clean)} chars)')
    sent.append(f'Selected claims: {len(input_data.selected_claim_ids)}')
    sent.append(f'Selected cases: {len(input_data.selected_case_ids)}')
    if input_data.selected_portfolio_id:
        sent.append(f'Portfolio: {input_data.selected_portfolio_id}')
    if input_data.project_instructions:
        sent.append(f'Project Instructions ({len(input_data.project_instructions)} chars)')
    return sent


def _build_preview_not_sent_list(privacy_mode: str) -> list[str]:
    not_sent = [
        'Full HTML of vacancy page',
        'Cookies and browser session data',
        'Personal notes or history',
        'API key (sent via secure header)',
        'Other vacancies in database',
    ]
    if privacy_mode == 'strict':
        not_sent.append('Full vacancy description (Strict Privacy mode)')
    return not_sent
