"""V4 analysis models — AOPS-08.

Strict Pydantic schemas for the provider protocol, prompt compiler, structured
LLM output, and deterministic literal validation.  No prose outside the schema
is accepted.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ── Evidence level enum ────────────────────────────────────────────────────

EvidenceLevel = Literal['E4', 'E3', 'E2', 'P1', 'X0', 'N0']
DecisionBand = Literal['apply', 'consider', 'skip', 'needs_input']
ConfidenceBand = Literal['low', 'medium', 'high']
ProviderStatus = Literal['pending', 'running', 'success', 'invalid', 'error']
RepairStatus = Literal['valid', 'repaired', 'invalid']


# ── Vacancy identity ──────────────────────────────────────────────────────


class VacancyIdentity(BaseModel):
    """Normalised vacancy identity from the stored record."""

    model_config = ConfigDict(extra='forbid')

    company: str = Field(min_length=1, max_length=500)
    role: str = Field(min_length=1, max_length=500)
    source_id: str = Field(default='', max_length=128)
    url: str | None = Field(default=None, max_length=2048)


# ── Eligibility ───────────────────────────────────────────────────────────


class EligibilityResult(BaseModel):
    """Hard-gate eligibility check — local, not LLM."""

    model_config = ConfigDict(extra='forbid')

    format: Literal['standard', 'agency', 'direct', 'unknown', ''] = 'unknown'
    hard_fail: bool = False
    reasons: list[str] = Field(default_factory=list, max_length=16)


# ── Central requirement ───────────────────────────────────────────────────


class CentralRequirement(BaseModel):
    """One of exactly three central requirements extracted from the vacancy."""

    model_config = ConfigDict(extra='forbid')

    requirement: str = Field(min_length=1, max_length=500)
    importance: Literal['critical', 'high', 'medium'] = 'medium'
    rationale: str = Field(default='', max_length=200)


# ── Evidence map ──────────────────────────────────────────────────────────


class EvidenceMapEntry(BaseModel):
    """Links one requirement to a specific evidence item.

    Evidence IDs must exist in the loaded KnowledgeIndex. The validator
    rejects unknown IDs.
    """

    model_config = ConfigDict(extra='forbid')

    requirement_index: int = Field(
        ge=0, le=2, description='0-based index into central_requirements'
    )
    evidence_level: EvidenceLevel
    claim_id: str | None = Field(default=None, max_length=64)
    case_id: str | None = Field(default=None, max_length=64)
    portfolio_id: str | None = Field(default=None, max_length=64)
    allowed_wording: str = Field(default='', max_length=500)

    @model_validator(mode='after')
    def _at_least_one_evidence_ref(self) -> EvidenceMapEntry:
        if not self.claim_id and not self.case_id and not self.portfolio_id:
            raise ValueError('Evidence map entry must reference at least one evidence ID')
        return self


# ── Score ─────────────────────────────────────────────────────────────────


class ScoreCap(BaseModel):
    """A single score cap applied to the raw score."""

    model_config = ConfigDict(extra='forbid')

    rule_id: str = Field(min_length=1, max_length=64)
    reason: str = Field(min_length=1, max_length=300)
    max_score: int = Field(ge=0, le=100)


class ScoreResult(BaseModel):
    """V4 score with raw, caps, final, confidence, and decision."""

    model_config = ConfigDict(extra='forbid')

    raw: int = Field(ge=0, le=100)
    caps: list[ScoreCap] = Field(default_factory=list, max_length=16)
    final: int = Field(ge=0, le=100)
    confidence: ConfidenceBand
    decision: DecisionBand

    @model_validator(mode='after')
    def _final_not_exceed_lowest_cap(self) -> ScoreResult:
        if self.caps:
            lowest = min(c.max_score for c in self.caps)
            if self.final > lowest:
                raise ValueError(f'Final score {self.final} exceeds lowest cap {lowest}')
        if self.final > self.raw:
            raise ValueError('Final score cannot exceed raw score')
        return self


# ── Strategy ──────────────────────────────────────────────────────────────


class Strategy(BaseModel):
    """V4 letter/positioning strategy."""

    model_config = ConfigDict(extra='forbid')

    positioning: str = Field(default='', max_length=500)
    tone: Literal['confident', 'measured', 'curious', 'direct', 'humble'] = 'measured'
    opener: str = Field(default='', max_length=300)
    key_claim_priority: list[str] = Field(default_factory=list, max_length=6)
    risks_to_address: list[str] = Field(default_factory=list, max_length=4)


# ── Recruiter risks ──────────────────────────────────────────────────────


class RecruiterRisk(BaseModel):
    """Exactly two recruiter-side risks the candidate should prepare for."""

    model_config = ConfigDict(extra='forbid')

    risk: str = Field(min_length=1, max_length=500)
    severity: Literal['low', 'medium', 'high'] = 'medium'
    mitigation: str = Field(default='', max_length=500)


# ── Interview preparation ─────────────────────────────────────────────────


class InterviewPrepItem(BaseModel):
    """One interview preparation topic."""

    model_config = ConfigDict(extra='forbid')

    topic: str = Field(min_length=1, max_length=300)
    detail: str = Field(default='', max_length=500)


# ── QA result ────────────────────────────────────────────────────────────


class QAResult(BaseModel):
    """Post-generation quality assurance checks."""

    model_config = ConfigDict(extra='forbid')

    passed: bool = False
    checks: list[str] = Field(default_factory=list, max_length=32)
    errors: list[str] = Field(default_factory=list, max_length=32)


# ── Full structured V4 analysis result ────────────────────────────────────


class V4StructuredResult(BaseModel):
    """Complete structured output the LLM must return.

    This is the schema enforced on the provider response. Every field is
    validated locally; unknown fields are rejected.
    """

    model_config = ConfigDict(extra='forbid')

    vacancy_identity: VacancyIdentity
    eligibility: EligibilityResult
    central_requirements: list[CentralRequirement] = Field(
        min_length=0,
        max_length=3,  # 0 when not enough info; exactly 3 otherwise
    )
    evidence_map: list[EvidenceMapEntry] = Field(default_factory=list, max_length=24)
    score: ScoreResult
    strategy: Strategy
    cover_letter: str = Field(default='', max_length=5000)
    recruiter_risks: list[RecruiterRisk] = Field(min_length=2, max_length=2)
    interview_prep: list[InterviewPrepItem] = Field(default_factory=list, max_length=12)
    qa: QAResult = Field(default_factory=QAResult)

    @field_validator('central_requirements')
    @classmethod
    def _zero_or_three(cls, v: list[CentralRequirement]) -> list[CentralRequirement]:
        if len(v) not in (0, 3):
            raise ValueError(
                f'central_requirements must be exactly 3 or 0 (not enough info), got {len(v)}'
            )
        return v


# ── Prompt compiler input/output ──────────────────────────────────────────


class PromptCompilerInput(BaseModel):
    """Input to the prompt compiler: vacancy + engine index + config."""

    model_config = ConfigDict(extra='forbid')

    # Normalised vacancy fields
    title: str = Field(min_length=1, max_length=500)
    company_name: str | None = Field(default=None, max_length=500)
    salary_raw: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=200)
    work_mode: str | None = Field(default=None, max_length=32)
    experience_raw: str | None = Field(default=None, max_length=500)
    skills: list[str] = Field(default_factory=list, max_length=50)
    description_clean: str = Field(default='', max_length=12000)

    # Selected candidate evidence (IDs only — bodies come from engine)
    selected_claim_ids: list[str] = Field(default_factory=list, max_length=15)
    selected_case_ids: list[str] = Field(default_factory=list, max_length=5)
    selected_portfolio_id: str | None = Field(default=None, max_length=64)

    # Targeting
    hard_gate_ids: list[str] = Field(default_factory=list, max_length=10)
    cap_ids: list[str] = Field(default_factory=list, max_length=10)

    # Voice/regression
    voice_entry_ids: list[str] = Field(default_factory=list, max_length=10)
    regression_ids: list[str] = Field(default_factory=list, max_length=10)

    # Skill calibration
    skill_calibration_ids: list[str] = Field(default_factory=list, max_length=20)

    # Project instructions
    project_instructions: str = Field(default='', max_length=65536)

    # Privacy
    privacy_mode: Literal['standard', 'strict'] = 'standard'
    language: Literal['ru', 'en'] = 'ru'


class CompiledPrompt(BaseModel):
    """Output of the prompt compiler — deterministic, minimal payload."""

    model_config = ConfigDict(extra='forbid')

    system_prompt: str = Field(min_length=1)
    user_prompt: str = Field(min_length=1)
    output_schema: dict[str, Any]
    prompt_version: str = Field(min_length=1, max_length=32)
    selection_reasons: list[str] = Field(default_factory=list, max_length=20)
    input_hash: str = Field(min_length=64, max_length=64)
    payload_preview: str = Field(default='', max_length=2000)
    token_estimate: int = Field(ge=0)

    # Metadata for cache key
    engine_version: str = Field(default='')
    engine_hash: str = Field(default='')
    provider: str = Field(default='')
    model: str = Field(default='')


# ── Provider protocol ─────────────────────────────────────────────────────


class ProviderMeta(BaseModel):
    """Metadata returned alongside a provider response."""

    model_config = ConfigDict(extra='forbid')

    provider: str
    model: str
    prompt_version: str
    input_hash: str
    token_input: int | None = None
    token_output: int | None = None
    estimated_cost_usd: float | None = None
    latency_ms: int | None = None


class AnalysisRequest(BaseModel):
    """Request to a provider — the compiled prompt."""

    model_config = ConfigDict(extra='forbid')

    system_prompt: str
    user_prompt: str
    output_schema: dict[str, Any]
    model: str
    provider: str


class ProviderResponse(BaseModel):
    """Raw provider response before validation."""

    model_config = ConfigDict(extra='forbid')

    raw_text: str = Field(default='', max_length=65536)
    meta: ProviderMeta
    error: str | None = None


# ── Analysis run result ──────────────────────────────────────────────────


class AnalysisRunResult(BaseModel):
    """Persisted result of a full analysis run."""

    model_config = ConfigDict(extra='forbid')

    run_id: str
    vacancy_id: str
    status: ProviderStatus
    repair_status: RepairStatus = 'valid'

    # Identity
    engine_version: str
    engine_hash: str
    provider: str
    model: str
    prompt_version: str
    input_hash: str

    # Output
    structured_result: V4StructuredResult | None = None
    raw_output: str | None = None
    validation_errors: list[str] = Field(default_factory=list)

    # Token / cost
    token_input: int | None = None
    token_output: int | None = None
    estimated_cost_usd: float | None = None

    # Timestamps
    created_at: str = ''

    @property
    def ready(self) -> bool:
        return self.status == 'success' and self.repair_status in ('valid', 'repaired')


# ── API request/response schemas ──────────────────────────────────────────


class AnalyzeRequest(BaseModel):
    """POST /api/v1/vacancies/{id}/analyze request body."""

    model_config = ConfigDict(extra='forbid')

    provider: Literal['openai'] = 'openai'
    model: str | None = Field(default=None, max_length=64)
    force: bool = Field(
        default=False,
        description='When true, bypass the input-hash cache and force a new provider call.',
    )
    privacy_mode: Literal['standard', 'strict'] = 'standard'
    language: Literal['ru', 'en'] = 'ru'

    # Per-request evidence overrides (empty = compiler selects)
    claim_ids: list[str] = Field(default_factory=list, max_length=15)
    case_ids: list[str] = Field(default_factory=list, max_length=5)
    portfolio_id: str | None = Field(default=None, max_length=64)


class PayloadPreview(BaseModel):
    """Pre-execution payload preview for user review."""

    provider: str
    model: str
    token_estimate: int | None = None
    estimated_cost_usd: float | None = None
    prompt_version: str
    input_hash: str
    cache_hit: bool = False
    privacy_mode: str
    language: str
    what_is_sent: list[str] = Field(default_factory=list)
    what_is_not_sent: list[str] = Field(default_factory=list)


class AnalyzeData(BaseModel):
    """Response data for a completed analysis."""

    run_id: str
    vacancy_id: str
    status: str
    repair_status: str
    ready: bool
    score: int | None = None
    decision: str | None = None
    confidence: str | None = None
    cover_letter: str | None = None
    recruiter_risks: list[RecruiterRisk] = Field(default_factory=list)
    validation_errors: list[str] = Field(default_factory=list)
    token_input: int | None = None
    token_output: int | None = None
    estimated_cost_usd: float | None = None
    cached: bool = False
    created_at: str = ''


class AnalyzeResponse(BaseModel):
    data: AnalyzeData
    meta: dict[str, str]


class PreviewResponse(BaseModel):
    data: PayloadPreview
    meta: dict[str, str]


class EngineRunItem(BaseModel):
    run_id: str
    vacancy_id: str
    status: str
    repair_status: str
    ready: bool
    score: int | None = None
    decision: str | None = None
    engine_version: str
    provider: str
    model: str | None = None
    input_hash: str
    created_at: str


class EngineRunDetailResponse(BaseModel):
    data: EngineRunItem
    meta: dict[str, str]


# ── Cache entry ───────────────────────────────────────────────────────────


class AnalysisCacheEntry(BaseModel):
    """In-memory and DB representation of a cached compatible run."""

    model_config = ConfigDict(extra='forbid')

    run_id: str
    engine_version: str
    engine_hash: str
    prompt_version: str
    provider: str
    model: str
    input_hash: str
    structured_result_json: str
    created_at: str
