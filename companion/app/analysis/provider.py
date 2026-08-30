"""Provider protocol and OpenAI BYOK implementation — AOPS-08.

Defines the abstract LLMProvider protocol with operations:
- analyze_vacancy
- repair_output

The P0 automated provider is OpenAI BYOK through companion keyring.
Fake providers for testing are also provided.
"""

from __future__ import annotations

import abc
import hashlib
import json
import time
from typing import Any

import httpx

from app.analysis.models import (
    AnalysisRequest,
    ProviderMeta,
    ProviderResponse,
)
from app.security.keyring import KeyringBackend, OSKeyring, SecretSlot

# ── Provider protocol ──────────────────────────────────────────────────────


class LLMProvider(abc.ABC):
    """Abstract provider for V4 vacancy analysis.

    Implements: analyze_vacancy, repair_output.
    Provider/model/capabilities are exposed as attributes.
    """

    @property
    @abc.abstractmethod
    def provider_id(self) -> str:
        """Provider identifier: 'openai', 'mock', etc."""
        ...

    @property
    @abc.abstractmethod
    def default_model(self) -> str:
        """Default model for this provider."""
        ...

    @abc.abstractmethod
    async def analyze_vacancy(self, request: AnalysisRequest) -> ProviderResponse:
        """Send a compiled prompt to the LLM and return the raw response."""
        ...

    @abc.abstractmethod
    async def repair_output(
        self,
        request: AnalysisRequest,
        validation_errors: list[str],
        original_result: dict[str, Any],
    ) -> ProviderResponse:
        """Request a repair of the output, given validation errors and the original result."""
        ...


# ── OpenAI BYOK provider ───────────────────────────────────────────────────


class OpenAIProvider(LLMProvider):
    """OpenAI chat completions provider using the user's own API key.

    The key is stored in the OS keyring via the companion keyring abstraction.
    Never logs the key. Never stores a copy outside the keyring.
    """

    OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

    def __init__(
        self,
        model: str | None = None,
        *,
        keyring: KeyringBackend | None = None,
    ) -> None:
        self._model = model or self.default_model
        self._keyring = keyring or OSKeyring()

    @property
    def provider_id(self) -> str:
        return 'openai'

    @property
    def default_model(self) -> str:
        return 'gpt-4o'

    def _get_api_key(self) -> str:
        """Retrieve the OpenAI API key from the OS keyring."""
        key = self._keyring.get_secret(SecretSlot.AI_KEY)
        if not key:
            raise ValueError(
                'OpenAI API key not configured. '
                'Store it in the OS keyring under "vacancypilot_ai_key".'
            )
        return key

    async def analyze_vacancy(self, request: AnalysisRequest) -> ProviderResponse:
        """Send the compiled prompt to OpenAI and return the raw response."""
        api_key = self._get_api_key()
        started_at = time.monotonic()

        messages: list[dict[str, str]] = [
            {'role': 'system', 'content': request.system_prompt},
            {'role': 'user', 'content': request.user_prompt},
        ]

        model = request.model or self._model
        token_param = self._token_limit_param(model, 2000)

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                response = await client.post(
                    self.OPENAI_API_URL,
                    headers={
                        'Content-Type': 'application/json',
                        'Authorization': f'Bearer {api_key}',
                    },
                    json={
                        'model': model,
                        'messages': messages,
                        'temperature': 0.4,
                        'response_format': {'type': 'json_object'},
                        **token_param,
                    },
                )
        except httpx.TimeoutException:
            elapsed = int((time.monotonic() - started_at) * 1000)
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version=request.provider or '',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error='PROVIDER_TIMEOUT: OpenAI API request timed out after 120s',
            )
        except httpx.ConnectError:
            elapsed = int((time.monotonic() - started_at) * 1000)
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version=request.provider or '',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error='PROVIDER_CONNECT_ERROR: Cannot reach OpenAI API (network or DNS)',
            )

        elapsed = int((time.monotonic() - started_at) * 1000)

        if response.status_code == 401:
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version=request.provider or '',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error='AUTH_ERROR: OpenAI API key is invalid or expired',
            )
        if response.status_code == 429:
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version=request.provider or '',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error='RATE_ERROR: OpenAI rate limit exceeded',
            )
        if response.status_code != 200:
            try:
                err_body = response.json()
                err_msg = err_body.get('error', {}).get('message', response.text)
            except Exception:
                err_msg = response.text
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version=request.provider or '',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error=f'PROVIDER_ERROR({response.status_code}): {err_msg[:300]}',
            )

        try:
            body = response.json()
        except ValueError:
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version=request.provider or '',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error='PROVIDER_PARSE_ERROR: response is not valid JSON',
            )

        choices = body.get('choices', [])
        if not choices:
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version=request.provider or '',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error='PROVIDER_EMPTY: no choices returned',
            )

        raw_text = choices[0].get('message', {}).get('content', '')
        usage = body.get('usage', {})
        token_input = usage.get('prompt_tokens')
        token_output = usage.get('completion_tokens')
        estimated_cost = _estimate_openai_cost(model, token_input or 0, token_output or 0)

        return ProviderResponse(
            raw_text=raw_text,
            meta=ProviderMeta(
                provider=self.provider_id,
                model=model,
                prompt_version=request.provider or '',
                input_hash=request.provider or '',
                token_input=token_input,
                token_output=token_output,
                estimated_cost_usd=estimated_cost,
                latency_ms=elapsed,
            ),
        )

    async def repair_output(
        self,
        request: AnalysisRequest,
        validation_errors: list[str],
        original_result: dict[str, Any],
    ) -> ProviderResponse:
        """Send a repair request with validation errors and original result."""
        api_key = self._get_api_key()
        started_at = time.monotonic()

        repair_prompt = (
            f'{request.user_prompt}\n\n'
            '---\n\n'
            'Your previous response was rejected by the validation system. '
            'Here is the original output:\n\n'
            f'```json\n{json.dumps(original_result, indent=2, ensure_ascii=False)}\n```\n\n'
            'Validation errors:\n' + '\n'.join(f'- {e}' for e in validation_errors) + '\n\n'
            'Please correct ALL validation errors while preserving the original '
            'evidence map, claims, and score where they are valid. '
            'Return ONLY the corrected JSON matching the output schema.'
        )

        messages: list[dict[str, str]] = [
            {'role': 'system', 'content': request.system_prompt},
            {'role': 'user', 'content': repair_prompt},
        ]

        model = request.model or self._model
        token_param = self._token_limit_param(model, 2000)

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                response = await client.post(
                    self.OPENAI_API_URL,
                    headers={
                        'Content-Type': 'application/json',
                        'Authorization': f'Bearer {api_key}',
                    },
                    json={
                        'model': model,
                        'messages': messages,
                        'temperature': 0.3,  # Lower temperature for repairs
                        **token_param,
                    },
                )
        except httpx.TimeoutException:
            elapsed = int((time.monotonic() - started_at) * 1000)
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version='',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error='PROVIDER_TIMEOUT: OpenAI API repair request timed out',
            )
        except httpx.ConnectError:
            elapsed = int((time.monotonic() - started_at) * 1000)
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version='',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error='PROVIDER_CONNECT_ERROR: Cannot reach OpenAI API',
            )

        elapsed = int((time.monotonic() - started_at) * 1000)

        if response.status_code != 200:
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version='',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error=f'PROVIDER_ERROR({response.status_code}): repair request failed',
            )

        try:
            body = response.json()
        except ValueError:
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version='',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error='PROVIDER_PARSE_ERROR: repair response is not valid JSON',
            )

        choices = body.get('choices', [])
        if not choices:
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=model,
                    prompt_version='',
                    input_hash='',
                    latency_ms=elapsed,
                ),
                error='PROVIDER_EMPTY: no choices returned in repair',
            )

        raw_text = choices[0].get('message', {}).get('content', '')
        usage = body.get('usage', {})
        return ProviderResponse(
            raw_text=raw_text,
            meta=ProviderMeta(
                provider=self.provider_id,
                model=model,
                prompt_version='',
                input_hash='',
                token_input=usage.get('prompt_tokens'),
                token_output=usage.get('completion_tokens'),
                estimated_cost_usd=_estimate_openai_cost(
                    model,
                    usage.get('prompt_tokens', 0),
                    usage.get('completion_tokens', 0),
                ),
                latency_ms=elapsed,
            ),
        )

    @staticmethod
    def _token_limit_param(model: str, value: int) -> dict[str, int]:
        """Return the correct token-limit parameter name.

        GPT-5, o1, o3, o4 models use max_completion_tokens.
        All others use max_tokens.
        """
        normalized = model.lower()
        if (
            normalized.startswith('gpt-5')
            or normalized.startswith('o1')
            or normalized.startswith('o3')
            or normalized.startswith('o4')
        ):
            return {'max_completion_tokens': value}
        return {'max_tokens': value}


# ── Fake provider (for tests) ─────────────────────────────────────────────


class FakeProvider(LLMProvider):
    """Deterministic fake provider for testing.

    Returns a pre-configured response. Never makes network calls.
    """

    def __init__(
        self,
        *,
        response: dict[str, Any] | None = None,
        error: str | None = None,
        model: str | None = None,
    ) -> None:
        self._model = model or 'fake-model'
        self._response = response or _default_fake_response()
        self._error = error
        self._call_count = 0
        self._repair_count = 0

    @property
    def provider_id(self) -> str:
        return 'fake'

    @property
    def default_model(self) -> str:
        return self._model

    @property
    def call_count(self) -> int:
        return self._call_count

    @property
    def repair_count(self) -> int:
        return self._repair_count

    async def analyze_vacancy(self, request: AnalysisRequest) -> ProviderResponse:
        self._call_count += 1
        if self._error:
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=self._model,
                    prompt_version='test-1.0',
                    input_hash=hashlib.sha256(request.user_prompt.encode()).hexdigest(),
                    token_input=100,
                    token_output=200,
                    estimated_cost_usd=0.0,
                    latency_ms=5,
                ),
                error=self._error,
            )
        return ProviderResponse(
            raw_text=json.dumps(self._response, ensure_ascii=False),
            meta=ProviderMeta(
                provider=self.provider_id,
                model=self._model,
                prompt_version='test-1.0',
                input_hash=hashlib.sha256(request.user_prompt.encode()).hexdigest(),
                token_input=100,
                token_output=200,
                estimated_cost_usd=0.0,
                latency_ms=5,
            ),
        )

    async def repair_output(
        self,
        request: AnalysisRequest,
        validation_errors: list[str],
        original_result: dict[str, Any],
    ) -> ProviderResponse:
        self._repair_count += 1
        if self._error:
            return ProviderResponse(
                raw_text='',
                meta=ProviderMeta(
                    provider=self.provider_id,
                    model=self._model,
                    prompt_version='test-1.0',
                    input_hash='',
                    token_input=50,
                    token_output=100,
                    estimated_cost_usd=0.0,
                    latency_ms=5,
                ),
                error=self._error,
            )
        # Fix the specific validation error in a deterministic way
        fixed = dict(original_result)
        # For tests, we simply return the fixed version — tests configure the response
        return ProviderResponse(
            raw_text=json.dumps(fixed, ensure_ascii=False),
            meta=ProviderMeta(
                provider=self.provider_id,
                model=self._model,
                prompt_version='test-1.0',
                input_hash='',
                token_input=50,
                token_output=100,
                estimated_cost_usd=0.0,
                latency_ms=5,
            ),
        )


# ── Provider factory ──────────────────────────────────────────────────────


def create_provider(
    provider_id: str,
    model: str | None = None,
    *,
    keyring: KeyringBackend | None = None,
) -> LLMProvider:
    """Create a provider by ID. Raises ValueError for unknown providers."""
    if provider_id == 'openai':
        return OpenAIProvider(model=model, keyring=keyring)
    if provider_id == 'fake':
        return FakeProvider(model=model)
    raise ValueError(f'Unknown provider: {provider_id}')


# ── Cost estimation ──────────────────────────────────────────────────────

_OPENAI_PRICING: dict[str, tuple[float, float]] = {
    'gpt-4o': (2.50, 10.00),
    'gpt-4o-mini': (0.15, 0.60),
    'gpt-4-turbo': (10.00, 30.00),
    'gpt-4': (30.00, 60.00),
    'gpt-3.5-turbo': (0.50, 1.50),
    'o1': (15.00, 60.00),
    'o3-mini': (1.10, 4.40),
    'o4-mini': (1.10, 4.40),
    'gpt-5': (2.50, 10.00),
    'gpt-5-mini': (0.15, 0.60),
}


def _estimate_openai_cost(model: str, input_tokens: int, output_tokens: int) -> float | None:
    """Estimate USD cost based on known model pricing. Returns None if unknown."""
    for key, (in_price, out_price) in _OPENAI_PRICING.items():
        if model.lower().startswith(key):
            in_cost = (input_tokens / 1_000_000) * in_price
            out_cost = (output_tokens / 1_000_000) * out_price
            return round(in_cost + out_cost, 6)
    return None


# ── Default fake response for tests ──────────────────────────────────────


def _default_fake_response() -> dict[str, Any]:
    return {
        'vacancy_identity': {
            'company': 'Test Company',
            'role': 'Software Engineer',
        },
        'eligibility': {
            'format': 'standard',
            'hard_fail': False,
            'reasons': [],
        },
        'central_requirements': [
            {
                'requirement': '5+ years of Python experience',
                'importance': 'critical',
                'rationale': 'Core skill needed for the role',
            },
            {
                'requirement': 'Experience with FastAPI and async Python',
                'importance': 'high',
                'rationale': 'Primary framework used by the team',
            },
            {
                'requirement': 'SQL and database design skills',
                'importance': 'medium',
                'rationale': 'Data-heavy application',
            },
        ],
        'evidence_map': [
            {
                'requirement_index': 0,
                'evidence_level': 'E4',
                'claim_id': 'SYNTH-001',
                'allowed_wording': '5+ years Python, built production APIs',
            },
            {
                'requirement_index': 1,
                'evidence_level': 'E3',
                'claim_id': 'SYNTH-002',
                'allowed_wording': 'Built FastAPI services with async patterns',
            },
        ],
        'score': {
            'raw': 85,
            'caps': [],
            'final': 85,
            'confidence': 'high',
            'decision': 'apply',
        },
        'strategy': {
            'positioning': 'Experienced Python backend engineer',
            'tone': 'confident',
            'opener': 'I was excited to see this role...',
            'key_claim_priority': [],
            'risks_to_address': [],
        },
        'cover_letter': (
            'Здравствуйте,\n\n'
            'Меня заинтересовала вакансия "Software Engineer" в компании Test Company — '
            'пишу вам, потому что отклик на эту роль выглядит для меня осмысленным шагом, '
            'а профиль роли совпадает с тем, чем я занимаюсь последние годы.\n\n'
            'Мой опыт и навыки включают более 5 лет коммерческой разработки на Python: '
            'я проектировал и запускал production API на FastAPI с асинхронными паттернами, '
            'а также проектировал схемы данных в SQL под высокие нагрузки. Один из сервисов '
            'я довёл до стабильных 10,000 запросов в минуту с 99.9% uptime, что дало команде '
            'измеримое улучшение надёжности и сократило время ответа для клиентов. '
            'Отдельно я занимался интеграциями внешних систем через очереди задач и '
            'настраивал наблюдаемость сервисов: логирование, метрики и алерты.\n\n'
            'Я понимаю, какую ценность могу принести вашей команде: сильный backend-фундамент, '
            'надёжные интеграции и внимательное отношение к качеству данных и срокам. '
            'Мне комфортно работать в среде, где решения принимаются на основе измерений, '
            'и я готов показать это на первых же задачах.\n\n'
            'Буду рад обсудить детали и благодарю за рассмотрение моей кандидатуры.\n\n'
            'С уважением,\n'
            'Иван Иванов'
        ),
        'recruiter_risks': [
            {
                'risk': 'Candidate may be overqualified for routine tasks',
                'severity': 'low',
                'mitigation': 'Emphasize interest in team leadership aspects',
            },
            {
                'risk': 'Notice period may extend start date',
                'severity': 'medium',
                'mitigation': 'Be transparent about availability',
            },
        ],
        'interview_prep': [
            {
                'topic': 'Team structure and development process',
                'detail': 'Ask about sprint length, code review practices, and CI/CD pipeline',
            },
        ],
        'qa': {
            'passed': True,
            'checks': ['h1', 'five_sections', 'word_count', 'signature', 'no_placeholders'],
            'errors': [],
        },
    }
