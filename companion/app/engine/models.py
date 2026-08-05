"""Pydantic models for the V4 engine package schema — AOPS-07.

Defines the manifest, frontmatter schemas, validation errors, and the
immutable in-memory loaded package object.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ── Canonical active filenames (exactly ten) ─────────────────────────────

CANONICAL_ACTIVE_FILENAMES: tuple[str, ...] = (
    '00_source_manifest.md',
    '01_candidate_claims.md',
    '02_experience_case_bank.md',
    '03_portfolio_cases.md',
    '04_targeting_constraints.md',
    '05_voice_and_gold_examples.md',
    '07_project_master_instruction.md',
    '08_candidate_updates.md',
    '09_skill_calibration_matrix.md',
    '11_letter_regression_suite.md',
)

# Exactly ten — enforced by the loader.
CANONICAL_ACTIVE_COUNT: int = 10

# Separate file at package root, not in active/
PROJECT_INSTRUCTIONS_FILENAME: str = 'PROJECT_INSTRUCTIONS_READY_TO_PASTE_V4.md'
MANIFEST_FILENAME: str = 'manifest.json'
CHECKSUMS_FILENAME: str = 'checksums.sha256'

# Max bytes for Project Instructions to limit accidental inclusion
PROJECT_INSTRUCTIONS_MAX_BYTES: int = 64 * 1024  # 64 KiB

# Manifest schema version this loader supports
SUPPORTED_MANIFEST_SCHEMA_VERSION: int = 1

# ── File status enum ─────────────────────────────────────────────────────

FileStatus = Literal['active', 'draft', 'archived', 'superseded']


# ── Manifest schema ─────────────────────────────────────────────────────


class FileVersionEntry(BaseModel):
    """Version and status for a single canonical file."""

    model_config = ConfigDict(extra='forbid')

    filename: str = Field(min_length=1, max_length=128)
    version: str = Field(min_length=1, max_length=32)
    status: FileStatus


class Manifest(BaseModel):
    """Validated manifest.json — the engine package identity card."""

    model_config = ConfigDict(extra='forbid')

    schema_version: int = Field(ge=1)
    engine_version: str = Field(min_length=1, max_length=32)
    engine_label: str | None = Field(default=None, max_length=128)
    file_versions: list[FileVersionEntry] = Field(min_length=1, max_length=32)
    expected_checksums: dict[str, str] = Field(
        default_factory=dict,
        description='filename -> sha256 hex digest',
    )
    created_at: str | None = None
    updated_at: str | None = None
    notes: str | None = Field(default=None, max_length=1024)

    @field_validator('schema_version')
    @classmethod
    def _check_schema_version(cls, v: int) -> int:
        if v != SUPPORTED_MANIFEST_SCHEMA_VERSION:
            raise ValueError(
                f'Unsupported manifest schema version {v}; '
                f'loader supports version {SUPPORTED_MANIFEST_SCHEMA_VERSION}'
            )
        return v


# ── Frontmatter schemas per active file ──────────────────────────────────
# Each file has YAML-style frontmatter delimited by --- lines.


class SourceManifestFrontmatter(BaseModel):
    """00_source_manifest.md — engine identity and version anchor."""

    model_config = ConfigDict(extra='forbid')

    engine_id: str = Field(min_length=1, max_length=64)
    engine_version: str = Field(min_length=1, max_length=32)
    status: FileStatus
    created: str | None = None
    updated: str | None = None
    author: str | None = None
    description: str | None = Field(default=None, max_length=512)


class CandidateClaimFrontmatter(BaseModel):
    """01_candidate_claims.md — each claim entry."""

    model_config = ConfigDict(extra='forbid')

    claim_id: str = Field(min_length=1, max_length=64)
    evidence_level: Literal['E4', 'E3', 'E2', 'P1', 'X0', 'N0']
    status: Literal['active', 'draft', 'archived']
    category: str | None = Field(default=None, max_length=64)
    version: str | None = Field(default=None, max_length=32)


class CaseEntryFrontmatter(BaseModel):
    """02/03 — commercial and portfolio case entries."""

    model_config = ConfigDict(extra='forbid')

    case_id: str = Field(min_length=1, max_length=64)
    status: Literal['active', 'draft', 'archived']
    category: str | None = Field(default=None, max_length=64)
    commercial: bool = True  # True for experience, False for portfolio
    date: str | None = None
    version: str | None = Field(default=None, max_length=32)


class PortfolioEntryFrontmatter(BaseModel):
    """03_portfolio_cases.md — portfolio entries with boundaries."""

    model_config = ConfigDict(extra='forbid')

    portfolio_id: str = Field(min_length=1, max_length=64)
    status: Literal['active', 'draft', 'archived']
    boundary: str | None = Field(default=None, max_length=256)
    date: str | None = None
    version: str | None = Field(default=None, max_length=32)


class TargetingConstraintEntry(BaseModel):
    """04_targeting_constraints.md — hard-gate, cap, target rule entries."""

    model_config = ConfigDict(extra='forbid')

    rule_id: str = Field(min_length=1, max_length=64)
    rule_type: Literal['hard_gate', 'cap', 'target', 'preference']
    status: Literal['active', 'draft', 'archived']
    severity: Literal['info', 'low', 'medium', 'high', 'critical'] | None = None


class VoiceGoldEntry(BaseModel):
    """05_voice_and_gold_examples.md — voice and example metadata."""

    model_config = ConfigDict(extra='forbid')

    entry_id: str = Field(min_length=1, max_length=64)
    entry_type: Literal['voice_rule', 'gold_example', 'regression']
    status: Literal['active', 'draft', 'archived']


class SkillCalibrationEntry(BaseModel):
    """09_skill_calibration_matrix.md — skill calibration rows."""

    model_config = ConfigDict(extra='forbid')

    skill_id: str = Field(min_length=1, max_length=64)
    skill_name: str = Field(min_length=1, max_length=128)
    level: Literal['expert', 'advanced', 'intermediate', 'basic', 'familiar']
    evidence_level: Literal['E4', 'E3', 'E2', 'P1', 'X0', 'N0']
    status: Literal['active', 'draft', 'archived']


# Union for typed frontmatter parsing. The loader resolves which schema to use
# based on the filename.

ParsedFrontmatter = (
    SourceManifestFrontmatter
    | CandidateClaimFrontmatter
    | CaseEntryFrontmatter
    | PortfolioEntryFrontmatter
    | TargetingConstraintEntry
    | VoiceGoldEntry
    | SkillCalibrationEntry
)


# ── Validation error codes ──────────────────────────────────────────────


class EngineValidationError(BaseModel):
    """A single engine package validation failure."""

    model_config = ConfigDict(extra='forbid')

    code: str = Field(
        min_length=1,
        description='Machine-readable error code, e.g. MISSING_FILE, HASH_MISMATCH',
    )
    message: str = Field(min_length=1)
    filename: str | None = None
    claim_id: str | None = None
    case_id: str | None = None
    portfolio_id: str | None = None

    def safe_summary(self) -> str:
        """Return a one-line summary safe for Health (no candidate text)."""
        parts = [f'[{self.code}]']
        if self.filename:
            parts.append(self.filename)
        parts.append(self.message)
        return ' '.join(parts)


# ── Immutable loaded package object ──────────────────────────────────────


class PackageIdentity(BaseModel):
    """Identity fields derived from manifest + source manifest."""

    model_config = ConfigDict(frozen=True, extra='forbid')

    engine_version: str
    engine_label: str | None
    manifest_schema_version: int
    aggregate_hash: str = Field(min_length=64, max_length=64)  # sha256 hex
    loaded_at: str
    file_count: int
    active_count: int


class PackageFileRecord(BaseModel):
    """Metadata for one validated file in the loaded package."""

    model_config = ConfigDict(frozen=True, extra='forbid')

    filename: str
    relative_path: str  # e.g. "active/01_candidate_claims.md"
    version: str | None
    status: FileStatus | None
    sha256: str
    size_bytes: int
    frontmatter_parsed: bool
    frontmatter_type: str | None


class LoadedEnginePackage(BaseModel):
    """Immutable in-memory representation of a validated engine package.

    Once constructed, this object is frozen — no silent mutation.
    The caller receives either a fully valid package or an explicit
    validation error list.
    """

    model_config = ConfigDict(frozen=True, extra='forbid')

    identity: PackageIdentity
    manifest: Manifest
    files: tuple[PackageFileRecord, ...]
    valid: bool = True
    validation_errors: tuple[EngineValidationError, ...] = ()

    @property
    def aggregate_hash(self) -> str:
        return self.identity.aggregate_hash
