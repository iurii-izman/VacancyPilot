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

from app.analysis.compiler import _policy_fingerprint, compile_prompt
from app.analysis.coordinator import (
    ProviderBudgetExceededError,
    ProviderCoordinator,
    ProviderOperationInFlightError,
    ProviderOutcomeUnknownError,
    build_operation_key,
)
from app.analysis.models import (
    AnalysisRequest,
    AnalysisRunResult,
    CompiledPrompt,
    PayloadPreview,
    PromptCompilerInput,
    ProviderInputPolicy,
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
from app.security.receipts import (
    PreviewReceiptClaims,
    ReceiptKeyUnavailableError,
    ReceiptSigner,
    ReceiptVerificationError,
)


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
    policy: ProviderInputPolicy | None = None
    confirmation: bool = False
    preview_receipt: str | None = None
    retry_id: str | None = None
    daily_request_limit: int = 10
    operation_kind: str = 'vacancy_analysis'


class ProviderExecutionGateError(RuntimeError):
    """A safe, machine-readable failure before a provider attempt."""

    def __init__(self, code: str, message: str, status_code: int = 409) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class EnginePackageUnavailableError(RuntimeError):
    """Raised when Full V4 analysis is attempted without a valid engine package.

    The message contains only sanitized, non-private information (error codes
    and filenames) — never candidate content.
    """


class AnalysisService:
    """Orchestrate the full V4 vacancy analysis pipeline."""

    def __init__(
        self,
        session: Session,
        *,
        receipt_signer: ReceiptSigner | None = None,
    ) -> None:
        self._session = session
        # The signer is injected by the application factory after Companion
        # bootstrap.  A missing signer is intentionally observable at
        # execution time; Preview must not initialize or write keyring state.
        self._receipt_signer = receipt_signer

    # ── Public API ────────────────────────────────────────────────────────

    def analyze(
        self,
        vacancy_id: str,
        compiler_input: PromptCompilerInput,
        options: AnalysisOptions,
    ) -> AnalysisRunResult:
        """Run the full analysis pipeline and persist the result."""
        policy = self._effective_execution_policy(options)
        package = self._require_package()
        index = self._build_index(package)

        compiled = compile_prompt(
            compiler_input,
            index,
            package,
            provider=options.provider,
            model=options.model,
            privacy_mode=policy.privacy_mode,
            language=options.language,
            policy=policy,
            subject_ids={'vacancy_id': vacancy_id},
            operation_kind=options.operation_kind,
        )

        self._verify_execution_gate(compiled, options, vacancy_id, policy)

        # An explicit product-owned retry is a new semantic operation and
        # must be allowed to consume a fresh provider-attempt slot.  Ordinary
        # duplicate confirmations still reuse the exact compatible cache/run.
        if not options.force and not options.retry_id and policy.cache_enabled:
            cached = self._check_cache(compiled)
            if cached is not None:
                return cached

        # The coordinator owns its own short ``BEGIN IMMEDIATE`` transaction.
        # End the compiler/cache read transaction before opening it.
        self._session.rollback()

        operation_key = build_operation_key(
            operation_kind=compiled.operation_kind,
            subject_ids=compiled.subject_ids,
            provider_plan_hash=compiled.provider_plan_hash,
            retry_id=options.retry_id,
        )
        coordinator = ProviderCoordinator(self._session)
        try:
            claim = coordinator.claim_operation(
                operation_key=operation_key,
                operation_kind=compiled.operation_kind,
                subject_key=vacancy_id,
                provider_plan_hash=compiled.provider_plan_hash,
                provider=compiled.provider,
                model=compiled.model,
            )
        except ProviderBudgetExceededError as exc:
            raise ProviderExecutionGateError('AI_BUDGET_EXCEEDED', str(exc), 429) from exc
        except ProviderOutcomeUnknownError as exc:
            raise ProviderExecutionGateError('PROVIDER_OUTCOME_UNKNOWN', str(exc), 409) from exc
        except ProviderOperationInFlightError as exc:
            terminal = coordinator.wait_for_terminal(operation_key=operation_key)
            if terminal is not None and terminal.run_id:
                duplicate_result = self.get_run(terminal.run_id)
                if duplicate_result is not None:
                    return duplicate_result
                raise ProviderExecutionGateError(
                    'PROVIDER_RESULT_UNAVAILABLE',
                    'Stored provider result is unavailable',
                    409,
                ) from exc
            if terminal is not None and terminal.state == 'outcome_unknown':
                raise ProviderExecutionGateError(
                    'PROVIDER_OUTCOME_UNKNOWN',
                    'The previous provider outcome is unknown; automatic retry is disabled.',
                    409,
                ) from exc
            if terminal is not None and terminal.state == 'budget_blocked':
                raise ProviderExecutionGateError(
                    'AI_BUDGET_EXCEEDED',
                    'The current provider-attempt budget is exhausted.',
                    429,
                ) from exc
            if terminal is not None and terminal.state == 'failed_before_dispatch':
                try:
                    claim = coordinator.claim_operation(
                        operation_key=operation_key,
                        operation_kind=compiled.operation_kind,
                        subject_key=vacancy_id,
                        provider_plan_hash=compiled.provider_plan_hash,
                        provider=compiled.provider,
                        model=compiled.model,
                    )
                except ProviderOperationInFlightError as retry_exc:
                    raise ProviderExecutionGateError(
                        'PROVIDER_OPERATION_IN_FLIGHT',
                        str(retry_exc),
                        409,
                    ) from retry_exc
            else:
                raise ProviderExecutionGateError(
                    'PROVIDER_OPERATION_IN_FLIGHT',
                    str(exc),
                    409,
                ) from exc

        if claim.run_id:
            cached_result = self.get_run(claim.run_id)
            if cached_result is not None:
                return cached_result
            raise ProviderExecutionGateError(
                'PROVIDER_RESULT_UNAVAILABLE', 'Stored provider result is unavailable', 409
            )
        if not claim.claimed or not claim.owner_token:
            # A previously dispatched failure is terminal for this semantic
            # operation.  Explicit retry_id creates a new operation key.
            raise ProviderExecutionGateError(
                claim.error_category or 'PROVIDER_OPERATION_COMPLETE',
                'This semantic provider operation has already completed.',
                409,
            )

        try:
            provider = create_provider(options.provider, model=options.model)
            provider.preflight()
        except Exception as exc:
            coordinator.release_before_dispatch(
                execution_id=claim.execution_id,
                owner_token=claim.owner_token,
                reason='PROVIDER_NOT_READY',
            )
            raise ProviderExecutionGateError(
                'PROVIDER_NOT_READY',
                'The configured provider is not ready; no provider attempt was made.',
                503,
            ) from exc

        try:
            attempt = coordinator.reserve_and_mark_dispatching(
                execution_id=claim.execution_id,
                owner_token=claim.owner_token,
                scope='companion',
                day_key=_day_key(),
                daily_limit=policy.daily_request_limit,
                attempt_number=1,
            )
        except ProviderBudgetExceededError as exc:
            raise ProviderExecutionGateError('AI_BUDGET_EXCEEDED', str(exc), 429) from exc

        run_result = self._run_analysis(
            vacancy_id=vacancy_id,
            compiled=compiled,
            provider=provider,
            index=index,
            language=options.language,
            coordinator=coordinator,
            execution_id=claim.execution_id,
            owner_token=claim.owner_token,
            attempt_number=attempt.attempt_number,
            operation_key=operation_key,
        )

        if run_result.status == 'invalid':
            coordinator.mark_repairing(
                execution_id=claim.execution_id,
                owner_token=claim.owner_token,
            )
            if run_result.structured_result is not None:
                run_result = self._attempt_repair(
                    run_result=run_result,
                    compiled=compiled,
                    provider=provider,
                    index=index,
                    language=options.language,
                    coordinator=coordinator,
                    execution_id=claim.execution_id,
                    owner_token=claim.owner_token,
                    operation_key=operation_key,
                    daily_request_limit=policy.daily_request_limit,
                )
            else:
                run_result = self._attempt_schema_repair(
                    run_result=run_result,
                    compiled=compiled,
                    provider=provider,
                    index=index,
                    language=options.language,
                    coordinator=coordinator,
                    execution_id=claim.execution_id,
                    owner_token=claim.owner_token,
                    operation_key=operation_key,
                    daily_request_limit=policy.daily_request_limit,
                )

        budget_blocked = any(
            'AI_BUDGET_EXCEEDED' in error for error in run_result.validation_errors
        )
        if (
            not any('OUTCOME_UNKNOWN' in error for error in run_result.validation_errors)
            and not budget_blocked
        ):
            coordinator.finish(
                execution_id=claim.execution_id,
                owner_token=claim.owner_token,
                run_id=run_result.run_id,
                success=run_result.status == 'success',
                error_category=None if run_result.status == 'success' else run_result.status,
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
        *,
        vacancy_id: str | None = None,
        require_package: bool = True,
    ) -> PayloadPreview:
        """Generate a payload preview without executing the provider."""
        package = self._require_package() if require_package else self._load_package()
        index = self._build_index(package)
        policy = self._effective_preview_policy(options)
        compiled = compile_prompt(
            compiler_input,
            index,
            package,
            provider=options.provider,
            model=options.model,
            privacy_mode=policy.privacy_mode,
            language=options.language,
            policy=policy,
            subject_ids={'vacancy_id': vacancy_id} if vacancy_id else {},
        )
        cached = self._check_cache(compiled) if policy.cache_enabled else None
        receipt = None
        receipt_expiry = None
        if self._receipt_signer is not None:
            receipt = self._receipt_signer.issue(
                kind='v4_analysis',
                provider_plan_hash=compiled.provider_plan_hash,
                subject_ids=compiled.subject_ids or {'vacancy_id': vacancy_id or ''},
                provider=compiled.provider,
                model=compiled.model,
                privacy_policy_fingerprint=compiled.privacy_policy_fingerprint,
            )
            if receipt:
                receipt_expiry = self._receipt_signer.receipt_expiry()
        initial_attempts = 0 if cached is not None else 1
        budget_used = ProviderCoordinator(self._session).daily_usage(scope='companion')
        return PayloadPreview(
            provider=compiled.provider,
            model=compiled.model,
            token_estimate=compiled.token_estimate,
            estimated_cost_usd=_estimate_openai_cost(compiled.model, compiled.token_estimate, 0),
            prompt_version=compiled.prompt_version,
            input_hash=compiled.input_hash,
            cache_hit=cached is not None,
            privacy_mode=policy.privacy_mode,
            language=options.language,
            what_is_sent=_build_preview_sent_list(compiler_input, policy.privacy_mode, policy),
            what_is_not_sent=_build_preview_not_sent_list(policy.privacy_mode),
            provider_plan_hash=compiled.provider_plan_hash,
            operation_kind=compiled.operation_kind,
            subject_ids=compiled.subject_ids,
            dynamic_payload=compiled.dynamic_payload,
            repair_possible=True,
            expected_initial_attempts=initial_attempts,
            expected_max_attempts=0 if cached is not None else 2,
            receipt=receipt,
            receipt_expires_at=receipt_expiry,
            cache_reuse_predicate=(
                'Exact provider plan hash, provider/model, engine/compiler, privacy policy, '
                'and validated persisted result.'
            ),
            budget_limit=policy.daily_request_limit,
            budget_used=budget_used,
            budget_remaining=max(0, policy.daily_request_limit - budget_used),
        )

    # ── Internal helpers ──────────────────────────────────────────────────

    def _effective_preview_policy(self, options: AnalysisOptions) -> ProviderInputPolicy:
        """Use the supplied policy, or a strict non-executable fallback."""
        return options.policy or ProviderInputPolicy(
            ai_enabled=False,
            provider='openai',
            model=options.model,
            privacy_mode='strict',
            allow_resume_highlights_to_ai=False,
            allow_full_description_to_ai=False,
            redact_contacts=True,
            daily_request_limit=0,
            cache_enabled=False,
        )

    def _effective_execution_policy(self, options: AnalysisOptions) -> ProviderInputPolicy:
        policy = options.policy
        if policy is None:
            raise ProviderExecutionGateError(
                'PROVIDER_POLICY_REQUIRED',
                'An explicit current AI/privacy policy is required before provider execution.',
                403,
            )
        if policy.provider != options.provider:
            raise ProviderExecutionGateError(
                'PROVIDER_POLICY_MISMATCH',
                'The reviewed provider policy does not match the requested provider.',
                409,
            )
        if policy.model and options.model and policy.model != options.model:
            raise ProviderExecutionGateError(
                'PROVIDER_POLICY_MISMATCH',
                'The reviewed provider policy does not match the requested model.',
                409,
            )
        if not policy.execution_ready:
            raise ProviderExecutionGateError(
                'AI_PERMISSION_REQUIRED',
                'AI execution is disabled by the current policy.',
                403,
            )
        return policy

    def _verify_execution_gate(
        self,
        compiled: CompiledPrompt,
        options: AnalysisOptions,
        vacancy_id: str,
        policy: ProviderInputPolicy,
    ) -> PreviewReceiptClaims:
        if not options.confirmation:
            raise ProviderExecutionGateError(
                'CONFIRMATION_REQUIRED',
                'Explicit confirmation is required before provider calls.',
                409,
            )
        if self._receipt_signer is None:
            raise ProviderExecutionGateError(
                'RECEIPT_SIGNING_KEY_UNAVAILABLE',
                'Preview receipt signing is unavailable; execution is blocked.',
                503,
            )
        try:
            return self._receipt_signer.verify(
                options.preview_receipt,
                kind='v4_analysis',
                provider_plan_hash=compiled.provider_plan_hash,
                subject_ids={'vacancy_id': vacancy_id},
                provider=compiled.provider,
                model=compiled.model,
                privacy_policy_fingerprint=_policy_fingerprint(policy),
            )
        except ReceiptKeyUnavailableError as exc:
            raise ProviderExecutionGateError(
                'RECEIPT_SIGNING_KEY_UNAVAILABLE',
                'Preview receipt signing is unavailable; execution is blocked.',
                503,
            ) from exc
        except ReceiptVerificationError as exc:
            code = str(exc)
            status = 409 if code in {'PREVIEW_RECEIPT_STALE', 'PREVIEW_RECEIPT_EXPIRED'} else 422
            raise ProviderExecutionGateError(
                code,
                'The preview receipt is missing, invalid, expired, or stale.',
                status,
            ) from exc

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
                EngineRun.provider_plan_hash == compiled.provider_plan_hash,
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
        coordinator: ProviderCoordinator | None = None,
        execution_id: str | None = None,
        owner_token: str | None = None,
        attempt_number: int = 0,
        operation_key: str = '',
    ) -> AnalysisRunResult:
        request = self._provider_request(compiled)

        try:
            response = asyncio.run(provider.analyze_vacancy(request))
        except Exception:
            if coordinator is not None and execution_id and owner_token:
                coordinator.mark_outcome_unknown(
                    execution_id=execution_id,
                    owner_token=owner_token,
                    error_category='PROVIDER_OUTCOME_UNKNOWN',
                )
            run = self._persist_run(
                vacancy_id=vacancy_id,
                compiled=compiled,
                status='error',
                repair_status='invalid',
                raw_output='',
                structured_result=None,
                validation_errors=['PROVIDER_OUTCOME_UNKNOWN'],
                provider_meta=None,
                operation_key=operation_key,
                attempt_number=attempt_number,
            )
            return self._to_run_result(run)

        result = self._process_provider_response(
            vacancy_id=vacancy_id,
            compiled=compiled,
            response=response,
            index=index,
            language=language,
            operation_key=operation_key,
            attempt_number=attempt_number,
        )
        if coordinator is not None:
            # Release the request session's write transaction before the
            # coordinator opens its serialized SQLite transaction.
            self._session.commit()
        if (
            coordinator is not None
            and execution_id
            and owner_token
            and response.error
            and _is_unknown_provider_error(response.error)
        ):
            coordinator.mark_outcome_unknown(
                execution_id=execution_id,
                owner_token=owner_token,
                error_category='PROVIDER_OUTCOME_UNKNOWN',
            )
        return result

    @staticmethod
    def _provider_request(compiled: CompiledPrompt) -> AnalysisRequest:
        """Derive the provider request exclusively from the canonical plan."""
        return AnalysisRequest(
            system_prompt=compiled.system_prompt,
            user_prompt=compiled.user_prompt,
            output_schema=compiled.output_schema,
            model=compiled.model,
            provider=compiled.provider,
            prompt_version=compiled.prompt_version,
            provider_plan_hash=compiled.provider_plan_hash,
            operation_kind=compiled.operation_kind,
            subject_ids=compiled.subject_ids,
            provider_affecting_options=compiled.provider_affecting_options,
        )

    def _attempt_repair(
        self,
        *,
        run_result: AnalysisRunResult,
        compiled: CompiledPrompt,
        provider: LLMProvider,
        index: KnowledgeIndex | None,
        language: str,
        coordinator: ProviderCoordinator | None = None,
        execution_id: str | None = None,
        owner_token: str | None = None,
        operation_key: str = '',
        daily_request_limit: int = 10,
    ) -> AnalysisRunResult:
        if run_result.structured_result is None:
            return run_result

        original_dict = run_result.structured_result.model_dump()

        request = self._provider_request(compiled)

        attempt_number = 0
        if coordinator is not None and execution_id and owner_token:
            try:
                provider.preflight()
            except Exception:
                # Credential/configuration preflight is definitely before
                # dispatch.  Do not turn it into an outcome-unknown attempt.
                return run_result
            try:
                attempt = coordinator.reserve_and_mark_dispatching(
                    execution_id=execution_id,
                    owner_token=owner_token,
                    scope='companion',
                    day_key=_day_key(),
                    daily_limit=daily_request_limit,
                )
                attempt_number = attempt.attempt_number
            except ProviderBudgetExceededError:
                return self._append_validation_error(run_result, 'AI_BUDGET_EXCEEDED')
            except Exception:
                # A failed reservation has no dispatch authority and therefore
                # cannot justify an automatic retry or an unknown send.
                return run_result

        try:
            response = asyncio.run(
                provider.repair_output(request, run_result.validation_errors, original_dict)
            )
        except Exception:
            if coordinator is not None and execution_id and owner_token:
                coordinator.mark_outcome_unknown(
                    execution_id=execution_id,
                    owner_token=owner_token,
                    error_category='PROVIDER_OUTCOME_UNKNOWN',
                )
            return self._append_validation_error(run_result, 'PROVIDER_OUTCOME_UNKNOWN')

        result = self._process_provider_response(
            vacancy_id=run_result.vacancy_id,
            compiled=compiled,
            response=response,
            index=index,
            language=language,
            is_repair=True,
            operation_key=operation_key,
            attempt_number=attempt_number,
        )
        if coordinator is not None:
            self._session.commit()
        unknown_response = bool(
            coordinator is not None
            and execution_id
            and owner_token
            and response.error
            and _is_unknown_provider_error(response.error)
        )
        if unknown_response and coordinator is not None and execution_id and owner_token:
            coordinator.mark_outcome_unknown(
                execution_id=execution_id,
                owner_token=owner_token,
                error_category='PROVIDER_OUTCOME_UNKNOWN',
            )
        return (
            self._append_validation_error(result, 'PROVIDER_OUTCOME_UNKNOWN')
            if unknown_response
            else result
        )

    def _attempt_schema_repair(
        self,
        *,
        run_result: AnalysisRunResult,
        compiled: CompiledPrompt,
        provider: LLMProvider,
        index: KnowledgeIndex | None,
        language: str,
        coordinator: ProviderCoordinator | None = None,
        execution_id: str | None = None,
        owner_token: str | None = None,
        operation_key: str = '',
        daily_request_limit: int = 10,
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

        request = self._provider_request(compiled)
        attempt_number = 0
        if coordinator is not None and execution_id and owner_token:
            try:
                provider.preflight()
            except Exception:
                return run_result
            try:
                attempt = coordinator.reserve_and_mark_dispatching(
                    execution_id=execution_id,
                    owner_token=owner_token,
                    scope='companion',
                    day_key=_day_key(),
                    daily_limit=daily_request_limit,
                )
                attempt_number = attempt.attempt_number
            except ProviderBudgetExceededError:
                return self._append_validation_error(run_result, 'AI_BUDGET_EXCEEDED')
            except Exception:
                return run_result
        try:
            response = asyncio.run(
                provider.repair_output(request, run_result.validation_errors, original)
            )
        except Exception:
            if coordinator is not None and execution_id and owner_token:
                coordinator.mark_outcome_unknown(
                    execution_id=execution_id,
                    owner_token=owner_token,
                    error_category='PROVIDER_OUTCOME_UNKNOWN',
                )
            return self._append_validation_error(run_result, 'PROVIDER_OUTCOME_UNKNOWN')
        result = self._process_provider_response(
            vacancy_id=run_result.vacancy_id,
            compiled=compiled,
            response=response,
            index=index,
            language=language,
            is_repair=True,
            operation_key=operation_key,
            attempt_number=attempt_number,
        )
        if coordinator is not None:
            self._session.commit()
        unknown_response = bool(
            coordinator is not None
            and execution_id
            and owner_token
            and response.error
            and _is_unknown_provider_error(response.error)
        )
        if unknown_response and coordinator is not None and execution_id and owner_token:
            coordinator.mark_outcome_unknown(
                execution_id=execution_id,
                owner_token=owner_token,
                error_category='PROVIDER_OUTCOME_UNKNOWN',
            )
        return (
            self._append_validation_error(result, 'PROVIDER_OUTCOME_UNKNOWN')
            if unknown_response
            else result
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
        operation_key: str = '',
        attempt_number: int = 0,
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
                validation_errors=[_safe_provider_error(response.error)],
                provider_meta=response.meta,
                operation_key=operation_key,
                attempt_number=attempt_number,
            )
            return self._with_transient_raw(self._to_run_result(run), response.raw_text)

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
                validation_errors=[_safe_validation_error(error) for error in parse_errors],
                provider_meta=response.meta,
                operation_key=operation_key,
                attempt_number=attempt_number,
            )
            return self._with_transient_raw(self._to_run_result(run), response.raw_text)

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
            operation_key=operation_key,
            attempt_number=attempt_number,
        )
        return self._with_transient_raw(self._to_run_result(run), response.raw_text)

    @staticmethod
    def _with_transient_raw(result: AnalysisRunResult, raw_text: str) -> AnalysisRunResult:
        """Keep raw text only in the in-memory repair window."""
        if not raw_text:
            return result
        return result.model_copy(update={'raw_output': raw_text})

    @staticmethod
    def _append_validation_error(result: AnalysisRunResult, error: str) -> AnalysisRunResult:
        """Return a safe result marker for a repair that was not dispatched."""
        if error in result.validation_errors:
            return result
        return result.model_copy(update={'validation_errors': [*result.validation_errors, error]})

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
        operation_key: str = '',
        attempt_number: int = 0,
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
            # Raw provider output is a transient in-memory repair input only.
            raw_output=None,
            validated_output=validated_json,
            status=status,
            validation_errors_json=(
                json.dumps([_safe_validation_error(error) for error in validation_errors])
                if validation_errors
                else None
            ),
            token_input=provider_meta.token_input if provider_meta else None,
            token_output=provider_meta.token_output if provider_meta else None,
            estimated_cost=provider_meta.estimated_cost_usd if provider_meta else None,
            created_at=now,
            provider_plan_hash=compiled.provider_plan_hash,
            operation_key=operation_key or None,
            attempt_number=attempt_number,
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
            # Legacy rows may still contain a provider body. Current runtime
            # reads never rehydrate that column; raw text exists only on the
            # transient repair path returned by _with_transient_raw().
            raw_output=None,
            validation_errors=validation_errors,
            token_input=run.token_input,
            token_output=run.token_output,
            estimated_cost_usd=run.estimated_cost,
            created_at=run.created_at,
            provider_plan_hash=run.provider_plan_hash or '',
            operation_key=run.operation_key or '',
            provider_attempts=run.attempt_number,
        )


# ── Helpers ─────────────────────────────────────────────────────────────────


def _build_preview_sent_list(
    input_data: PromptCompilerInput,
    privacy_mode: str,
    policy: ProviderInputPolicy | None = None,
) -> list[str]:
    from app.analysis.privacy import sanitize_provider_value

    effective_policy = policy or ProviderInputPolicy(
        ai_enabled=False,
        privacy_mode='strict' if privacy_mode == 'strict' else 'standard',
        allow_full_description_to_ai=privacy_mode != 'strict',
    )
    safe = lambda value, limit=800: sanitize_provider_value(  # noqa: E731
        value, effective_policy, max_chars=limit
    )
    sent = [f'Title: {safe(input_data.title, 500)}']
    if input_data.company_name:
        sent.append(f'Company: {safe(input_data.company_name, 500)}')
    if input_data.salary_raw:
        sent.append(f'Salary: {safe(input_data.salary_raw, 200)}')
    if input_data.city:
        sent.append(f'City: {safe(input_data.city, 200)}')
    if input_data.work_mode:
        sent.append(f'Work mode: {safe(input_data.work_mode, 32)}')
    sent.append(f'Skills ({len(input_data.skills[:20])} items)')
    if (
        privacy_mode != 'strict'
        and effective_policy.allow_full_description_to_ai
        and input_data.description_clean
    ):
        description_length = len(
            str(safe(input_data.description_clean, effective_policy.max_input_chars))
        )
        sent.append(f'Description ({description_length} chars)')
    sent.append(f'Selected claims: {len(input_data.selected_claim_ids)}')
    sent.append(f'Selected cases: {len(input_data.selected_case_ids)}')
    if input_data.selected_portfolio_id:
        sent.append(f'Portfolio: {input_data.selected_portfolio_id}')
    if input_data.project_instructions:
        sent.append(
            f'Project Instructions ({len(str(safe(input_data.project_instructions, 16000)))} chars)'
        )
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


def _day_key() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).date().isoformat()


def _safe_provider_error(error: str | None) -> str:
    """Map provider failures to bounded categories, never persist response text."""
    value = (error or 'PROVIDER_ERROR').upper()
    if 'TIMEOUT' in value:
        return 'PROVIDER_OUTCOME_UNKNOWN'
    if 'CONNECT_ERROR' in value:
        return 'PROVIDER_OUTCOME_UNKNOWN'
    for category in (
        'AUTH_ERROR',
        'RATE_ERROR',
        'PROVIDER_PARSE_ERROR',
        'PROVIDER_EMPTY',
        'PROVIDER_ERROR',
    ):
        if category in value:
            return category
    return 'PROVIDER_ERROR'


def _safe_validation_error(error: str) -> str:
    """Bound validation diagnostics to paths/categories rather than values."""
    safe = ''.join(ch for ch in str(error) if ch.isalnum() or ch in '[]_.:- /')
    return safe[:512] or 'VALIDATION_ERROR'


def _is_unknown_provider_error(error: str | None) -> bool:
    value = (error or '').upper()
    return 'TIMEOUT' in value or 'CONNECT_ERROR' in value or 'NETWORK' in value
