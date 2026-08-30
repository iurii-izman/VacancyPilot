"""Engine V4 package loader — AOPS-07.

Loads, validates, and produces an immutable ``LoadedEnginePackage`` from a
local directory containing ``active/``, ``manifest.json``, ``checksums.sha256``,
and ``PROJECT_INSTRUCTIONS_READY_TO_PASTE_V4.md``.

No silent fallback to a partially valid package. Every validation failure is
recorded as an ``EngineValidationError``.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import yaml  # type: ignore[import-untyped]
from pydantic import ValidationError

from app.engine.models import (
    CANONICAL_ACTIVE_COUNT,
    CANONICAL_ACTIVE_FILENAMES,
    CHECKSUMS_FILENAME,
    MANIFEST_FILENAME,
    PROJECT_INSTRUCTIONS_FILENAME,
    PROJECT_INSTRUCTIONS_MAX_BYTES,
    CandidateClaimFrontmatter,
    CaseEntryFrontmatter,
    DocumentFrontmatter,
    EngineValidationError,
    FileStatus,
    LoadedEnginePackage,
    Manifest,
    PackageFileRecord,
    PackageIdentity,
    PortfolioEntryFrontmatter,
    SkillCalibrationEntry,
    SourceManifestFrontmatter,
    TargetingConstraintEntry,
    VoiceGoldEntry,
)

# ── Safe-path helpers ────────────────────────────────────────────────────


def _is_safe_path(base: Path, target: Path) -> bool:
    """Return True only when *target* resolves inside *base*.

    Uses ``resolve()`` to defeat ``..`` traversal attacks.
    """
    try:
        resolved_base = base.resolve(strict=False)
        resolved_target = target.resolve(strict=False)
    except (OSError, RuntimeError):
        return False
    # On Windows, Path.resolve normalises away symlinks. For the companion
    # (which only reads a user-supplied local path), this is sufficient.
    try:
        resolved_target.relative_to(resolved_base)
    except ValueError:
        return False
    return True


def _safe_read(path: Path, max_bytes: int | None = None) -> bytes:
    """Read file bytes with a configurable size cap. Never follows symlinks."""
    if path.is_symlink():
        raise OSError(f'Symlinks are not allowed: {path}')
    data = path.read_bytes()
    if max_bytes is not None and len(data) > max_bytes:
        raise OSError(f'File exceeds maximum size of {max_bytes} bytes: {path.name}')
    return data


# ── Frontmatter parser ───────────────────────────────────────────────────

_FRONTMATTER_RE = re.compile(r'^---\s*\n(.*?)\n---\s*(?:\n|$)', re.DOTALL | re.MULTILINE)


def _parse_raw_yaml(raw: str) -> Any:
    """Parse YAML with the required safe loader; never partially fall back."""
    return yaml.safe_load(raw)


def _parse_frontmatter_yaml(text: str) -> dict[str, Any] | None:
    """Extract and parse YAML frontmatter from markdown text.

    Returns None when no frontmatter delimiters are found.
    Only the first frontmatter block is returned.
    """
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return None
    raw = match.group(1)
    try:
        parsed = _parse_raw_yaml(raw)
    except Exception:
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def _parse_all_frontmatter_blocks(text: str) -> list[dict[str, Any]]:
    """Extract and parse ALL YAML frontmatter blocks from markdown text.

    Returns a list of parsed dicts, one per frontmatter block.
    Used for ID extraction across files with multiple entry blocks.
    """
    blocks: list[dict[str, Any]] = []
    for match in _FRONTMATTER_RE.finditer(text):
        raw = match.group(1)
        try:
            parsed = _parse_raw_yaml(raw)
        except Exception:
            continue
        if isinstance(parsed, dict):
            blocks.append(parsed)
    return blocks


# ── Fenced YAML entry blocks (authoritative V4 package format) ──────────

# The real V4 sources carry per-entry metadata in fenced ```yaml blocks in
# the document body (one block per claim/case/portfolio/rule), in addition to
# the document-level ``---`` frontmatter block.
_FENCED_YAML_RE = re.compile(r'^```yaml\s*\n(.*?)\n```\s*$', re.DOTALL | re.MULTILINE)


def _parse_fenced_yaml_blocks(text: str) -> list[dict[str, Any]]:
    """Extract and parse ALL fenced ```yaml blocks from markdown text."""
    blocks: list[dict[str, Any]] = []
    for match in _FENCED_YAML_RE.finditer(text):
        raw = match.group(1)
        try:
            parsed = _parse_raw_yaml(raw)
        except Exception:
            continue
        if isinstance(parsed, dict):
            blocks.append(parsed)
    return blocks


# Legacy (synthetic fixture) collection keys per canonical file.
_LEGACY_COLLECTION_KEYS: dict[str, tuple[str, ...]] = {
    '01_candidate_claims.md': ('claims', 'candidate_claims'),
    '02_experience_case_bank.md': ('cases', 'commercial_cases'),
    '03_portfolio_cases.md': ('cases', 'portfolio_cases'),
    '04_targeting_constraints.md': ('rules', 'constraints'),
    '05_voice_and_gold_examples.md': ('entries', 'voice_entries'),
    '09_skill_calibration_matrix.md': ('skills', 'calibrations'),
}

# Required machine ID per canonical file for fenced entry blocks.
_FENCED_ID_FIELD: dict[str, str] = {
    '01_candidate_claims.md': 'claim_id',
    '02_experience_case_bank.md': 'case_id',
    '03_portfolio_cases.md': 'portfolio_id',
    '04_targeting_constraints.md': 'target_id',
    '05_voice_and_gold_examples.md': 'gold_id',
    '08_candidate_updates.md': 'update_id',
}


_ENTRY_SCHEMAS: dict[str, tuple[tuple[str, ...], type]] = {
    '01_candidate_claims.md': (('claims', 'candidate_claims'), CandidateClaimFrontmatter),
    '02_experience_case_bank.md': (('cases', 'commercial_cases'), CaseEntryFrontmatter),
    '03_portfolio_cases.md': (('cases', 'portfolio_cases'), PortfolioEntryFrontmatter),
    '04_targeting_constraints.md': (('rules', 'constraints'), TargetingConstraintEntry),
    '05_voice_and_gold_examples.md': (('entries', 'voice_entries'), VoiceGoldEntry),
    '09_skill_calibration_matrix.md': (('skills', 'calibrations'), SkillCalibrationEntry),
}


def _validate_frontmatter(
    filename: str,
    text: str,
    *,
    engine_version_anchor: str | None = None,
) -> tuple[str | None, SourceManifestFrontmatter | None, list[EngineValidationError]]:
    """Strictly validate every structured frontmatter block in a canonical file.

    Supports two package formats:
    - legacy/synthetic: entry collections inside ``---`` frontmatter blocks;
    - authoritative V4: document-level ``---`` block (``document_id`` /
      ``content_version`` / ``status``) plus per-entry fenced ```yaml blocks.
    """
    # Only a ``---`` block at the very start of the document is frontmatter.
    # Body horizontal rules must not be mistaken for frontmatter delimiters.
    leading_match = _FRONTMATTER_RE.match(text)
    matches = [leading_match] if leading_match else []
    fenced_blocks = _parse_fenced_yaml_blocks(text)
    # Document-level frontmatter is mandatory only for the source manifest and
    # entry-bearing files; plain guidance files (07/08/11) may lack it.
    _REQUIRES_DOCUMENT_BLOCK = (
        {'00_source_manifest.md'}
        | set(_ENTRY_SCHEMAS)
    )
    if not matches and filename in _REQUIRES_DOCUMENT_BLOCK:
        return (
            None,
            None,
            [
                EngineValidationError(
                    code='INVALID_FRONTMATTER',
                    message='Required YAML frontmatter is missing or unterminated',
                    filename=filename,
                )
            ],
        )

    source_manifest: SourceManifestFrontmatter | None = None
    errors: list[EngineValidationError] = []
    parsed_type: str | None = None

    # ── Document-level ``---`` blocks ────────────────────────────────────
    for match in matches:
        try:
            block = _parse_raw_yaml(match.group(1))
            if not isinstance(block, dict):
                raise ValueError('frontmatter root must be a mapping')

            if filename == '00_source_manifest.md':
                if source_manifest is not None:
                    raise ValueError('source manifest must contain exactly one frontmatter block')
                try:
                    source_manifest = SourceManifestFrontmatter(**block)
                    parsed_type = SourceManifestFrontmatter.__name__
                    continue
                except ValidationError:
                    # Authoritative V4 source manifest uses the document schema;
                    # the engine version anchor is the package manifest itself.
                    source_manifest = SourceManifestFrontmatter(
                        engine_id=str(block.get('document_id', 'engine')),
                        engine_version=engine_version_anchor
                        or str(block.get('content_version', '0.0.0')),
                        status=str(block.get('status', 'active')).lower(),  # type: ignore[arg-type]
                    )
                    parsed_type = SourceManifestFrontmatter.__name__
                    continue

            legacy_keys = _LEGACY_COLLECTION_KEYS.get(filename, ())
            if any(key in block for key in legacy_keys):
                # Legacy synthetic format: validate entries against the schema.
                keys = legacy_keys
                schema = _ENTRY_SCHEMAS[filename][1]
                entries: Any = None
                for key in keys:
                    if key in block:
                        entries = block[key]
                        break
                if entries is None:
                    schema(**block)
                else:
                    if not isinstance(entries, list) or not entries:
                        raise ValueError('frontmatter entry collection must be a non-empty list')
                    for entry in entries:
                        if not isinstance(entry, dict):
                            raise ValueError('frontmatter entries must be mappings')
                        schema(**entry)
                parsed_type = schema.__name__
                continue

            # Authoritative V4 document-level block.
            DocumentFrontmatter(**block)
            parsed_type = parsed_type or DocumentFrontmatter.__name__
        except (ValidationError, ValueError, yaml.YAMLError):
            errors.append(
                EngineValidationError(
                    code='INVALID_FRONTMATTER',
                    message='YAML frontmatter does not match the required schema',
                    filename=filename,
                )
            )

    # ── Fenced per-entry blocks (authoritative V4 format) ────────────────
    id_field = _FENCED_ID_FIELD.get(filename)
    if id_field:
        for block in fenced_blocks:
            entry_id = block.get(id_field)
            if entry_id is None:
                # Policy/config map block (evidence legend, score_caps,
                # decision_bands, ...) — valid, but not an entry.
                continue
            if not isinstance(entry_id, str) or not entry_id.strip():
                errors.append(
                    EngineValidationError(
                        code='INVALID_FRONTMATTER',
                        message=f'Fenced entry block has an invalid {id_field}',
                        filename=filename,
                    )
                )
            elif len(entry_id) > 64:
                errors.append(
                    EngineValidationError(
                        code='INVALID_FRONTMATTER',
                        message=f'{id_field} exceeds 64 characters',
                        filename=filename,
                    )
                )

    return parsed_type, source_manifest, errors


# ── ID extraction (for uniqueness checks) ────────────────────────────────


def _extract_ids_from_text(filename: str, text: str) -> dict[str, list[str]]:
    """Extract structured IDs from file content for uniqueness validation.

    Does not return candidate text — only machine identifiers.
    Scans ALL frontmatter blocks in the file.
    """
    result: dict[str, list[str]] = {}
    all_fm = _parse_all_frontmatter_blocks(text)

    for fm in all_fm:
        if filename == '01_candidate_claims.md':
            claims = fm.get('claims', fm.get('candidate_claims', []))
            if isinstance(claims, list):
                result.setdefault('claim_ids', []).extend(
                    c['claim_id'] for c in claims if isinstance(c, dict) and 'claim_id' in c
                )
        elif filename == '02_experience_case_bank.md':
            cases = fm.get('cases', fm.get('commercial_cases', []))
            if isinstance(cases, list):
                result.setdefault('case_ids', []).extend(
                    c['case_id'] for c in cases if isinstance(c, dict) and 'case_id' in c
                )
        elif filename == '03_portfolio_cases.md':
            entries = fm.get('cases', fm.get('portfolio_cases', []))
            if isinstance(entries, list):
                result.setdefault('portfolio_ids', []).extend(
                    e['portfolio_id']
                    for e in entries
                    if isinstance(e, dict) and 'portfolio_id' in e
                )
        elif filename == '04_targeting_constraints.md':
            rules = fm.get('rules', fm.get('constraints', []))
            if isinstance(rules, list):
                result.setdefault('rule_ids', []).extend(
                    r['rule_id'] for r in rules if isinstance(r, dict) and 'rule_id' in r
                )
        elif filename == '05_voice_and_gold_examples.md':
            entries = fm.get('entries', fm.get('voice_entries', []))
            if isinstance(entries, list):
                result.setdefault('entry_ids', []).extend(
                    e['entry_id'] for e in entries if isinstance(e, dict) and 'entry_id' in e
                )
        elif filename == '09_skill_calibration_matrix.md':
            skills = fm.get('skills', fm.get('calibrations', []))
            if isinstance(skills, list):
                result.setdefault('skill_ids', []).extend(
                    s['skill_id'] for s in skills if isinstance(s, dict) and 'skill_id' in s
                )

    # Authoritative V4 format: per-entry fenced ```yaml blocks.
    fenced_id_field = _FENCED_ID_FIELD.get(filename)
    if fenced_id_field:
        key = {
            'claim_id': 'claim_ids',
            'case_id': 'case_ids',
            'portfolio_id': 'portfolio_ids',
            'target_id': 'rule_ids',
            'gold_id': 'entry_ids',
            'update_id': 'update_ids',
        }[fenced_id_field]
        for block in _parse_fenced_yaml_blocks(text):
            value = block.get(fenced_id_field)
            if isinstance(value, str) and value.strip():
                result.setdefault(key, []).append(value)

    return result


# ── Authority graph overlap detection ────────────────────────────────────


def _check_authority_overlaps(file_texts: dict[str, str]) -> list[EngineValidationError]:
    """Detect authority conflicts across claim, case, and portfolio files.

    A claim should not reference a case or portfolio that doesn't exist,
    and no two active claims should assert the same evidence for conflicting
    levels.
    """
    errors: list[EngineValidationError] = []

    # Collect claim evidence levels by claim_id
    claim_evidence: dict[str, str] = {}
    claim_blocks: list[dict[str, Any]] = []
    if '01_candidate_claims.md' in file_texts:
        claim_blocks = _parse_all_frontmatter_blocks(file_texts['01_candidate_claims.md'])
        for fm in claim_blocks:
            claims = fm.get('claims', fm.get('candidate_claims', []))
            if isinstance(claims, list):
                for c in claims:
                    if isinstance(c, dict):
                        cid = c.get('claim_id')
                        level = c.get('evidence_level')
                        if cid and level:
                            if cid in claim_evidence and claim_evidence[cid] != level:
                                errors.append(
                                    EngineValidationError(
                                        code='AUTHORITY_OVERLAP',
                                        message=f'Claim {cid} appears with conflicting '
                                        f'evidence levels: {claim_evidence[cid]} vs {level}',
                                        claim_id=cid,
                                    )
                                )
                            claim_evidence[cid] = str(level)

    # Collect case IDs
    case_ids: set[str] = set()
    if '02_experience_case_bank.md' in file_texts:
        for fm in _parse_all_frontmatter_blocks(file_texts['02_experience_case_bank.md']):
            cases = fm.get('cases', fm.get('commercial_cases', []))
            if isinstance(cases, list):
                for c in cases:
                    if isinstance(c, dict) and 'case_id' in c:
                        case_ids.add(str(c['case_id']))

    # Collect portfolio IDs
    portfolio_ids: set[str] = set()
    if '03_portfolio_cases.md' in file_texts:
        for fm in _parse_all_frontmatter_blocks(file_texts['03_portfolio_cases.md']):
            entries = fm.get('cases', fm.get('portfolio_cases', []))
            if isinstance(entries, list):
                for e in entries:
                    if isinstance(e, dict) and 'portfolio_id' in e:
                        portfolio_ids.add(str(e['portfolio_id']))

    # Validate only explicit authority references; never infer relationships
    # from prose or generated text.
    for fm in claim_blocks:
        claims = fm.get('claims', fm.get('candidate_claims', []))
        if not isinstance(claims, list):
            continue
        for claim in claims:
            if not isinstance(claim, dict):
                continue
            claim_id = str(claim.get('claim_id') or '') or None
            for key in ('case_ids', 'case_refs', 'commercial_case_ids'):
                refs = claim.get(key, [])
                if isinstance(refs, list):
                    for ref in refs:
                        if str(ref) not in case_ids:
                            errors.append(
                                EngineValidationError(
                                    code='AUTHORITY_REFERENCE_MISSING',
                                    message='Claim references a missing commercial case',
                                    claim_id=claim_id,
                                    case_id=str(ref),
                                )
                            )
            for key in ('portfolio_ids', 'portfolio_refs'):
                refs = claim.get(key, [])
                if isinstance(refs, list):
                    for ref in refs:
                        if str(ref) not in portfolio_ids:
                            errors.append(
                                EngineValidationError(
                                    code='AUTHORITY_REFERENCE_MISSING',
                                    message='Claim references a missing portfolio record',
                                    claim_id=claim_id,
                                    portfolio_id=str(ref),
                                )
                            )

    return errors


# ── Main loader ──────────────────────────────────────────────────────────


def load_engine_package(package_root: str | Path) -> LoadedEnginePackage:
    """Load, validate, and return an immutable engine package.

    Args:
        package_root: Path to the engine package directory containing
            ``active/``, ``manifest.json``, ``checksums.sha256``, and
            ``PROJECT_INSTRUCTIONS_READY_TO_PASTE_V4.md``.

    Returns:
        A ``LoadedEnginePackage`` with ``valid=True`` on success, or
        ``valid=False`` with populated ``validation_errors`` on failure.

    Raises:
        FileNotFoundError: When *package_root* does not exist.
        ValueError: When *package_root* is not a directory.
    """
    root = Path(package_root)
    if not root.exists():
        raise FileNotFoundError(f'Engine package root not found: {root}')
    if not root.is_dir():
        raise ValueError(f'Engine package root is not a directory: {root}')
    if root.is_symlink():
        return _invalid_package(
            EngineValidationError(
                code='UNSAFE_PATH', message='Engine package root must not be a symlink'
            )
        )

    errors: list[EngineValidationError] = []
    file_records: list[PackageFileRecord] = []
    file_texts: dict[str, str] = {}  # filename -> UTF-8 text (for indexing)

    # ── 1. Verify required top-level files ───────────────────────────────
    manifest_path = root / MANIFEST_FILENAME
    checksums_path = root / CHECKSUMS_FILENAME
    pi_path = root / PROJECT_INSTRUCTIONS_FILENAME
    active_dir = root / 'active'

    if not manifest_path.is_file():
        errors.append(
            EngineValidationError(
                code='MISSING_FILE', message='manifest.json is required', filename=MANIFEST_FILENAME
            )
        )
    if not checksums_path.is_file():
        errors.append(
            EngineValidationError(
                code='MISSING_FILE',
                message='checksums.sha256 is required',
                filename=CHECKSUMS_FILENAME,
            )
        )
    if not pi_path.is_file():
        errors.append(
            EngineValidationError(
                code='MISSING_FILE',
                message='PROJECT_INSTRUCTIONS_READY_TO_PASTE_V4.md is required',
                filename=PROJECT_INSTRUCTIONS_FILENAME,
            )
        )
    if not active_dir.is_dir():
        errors.append(
            EngineValidationError(
                code='MISSING_DIRECTORY',
                message='active/ directory is required',
                filename='active/',
            )
        )
    elif active_dir.is_symlink() or not _is_safe_path(root, active_dir):
        errors.append(
            EngineValidationError(
                code='UNSAFE_PATH',
                message='active/ must be a real directory inside the package root',
                filename='active/',
            )
        )

    if errors:
        return LoadedEnginePackage(
            identity=PackageIdentity(
                engine_version='unknown',
                engine_label=None,
                manifest_schema_version=0,
                aggregate_hash='0' * 64,
                loaded_at=_utc_now(),
                file_count=0,
                active_count=0,
            ),
            manifest=Manifest.model_construct(
                schema_version=0,
                engine_version='unknown',
                file_versions=[],
            ),
            files=(),
            valid=False,
            validation_errors=tuple(errors),
        )

    # ── 2. Parse manifest.json ──────────────────────────────────────────
    manifest_raw = b''
    try:
        manifest_raw = _safe_read(manifest_path)
        manifest_json = json.loads(manifest_raw.decode('utf-8'))
        manifest = Manifest(**manifest_json)
    except json.JSONDecodeError as exc:
        return _invalid_package(
            EngineValidationError(
                code='INVALID_JSON',
                message=f'manifest.json is not valid JSON: {exc}',
                filename=MANIFEST_FILENAME,
            )
        )
    except Exception as exc:
        return _invalid_package(
            EngineValidationError(
                code='INVALID_MANIFEST',
                message=f'manifest.json validation failed: {exc}',
                filename=MANIFEST_FILENAME,
            )
        )

    # Manifest/current pointer consistency is strict: exactly the canonical
    # files, one entry each, all active, all on the deployed engine version.
    manifest_names = [entry.filename for entry in manifest.file_versions]
    if len(manifest_names) != len(set(manifest_names)):
        errors.append(
            EngineValidationError(
                code='MANIFEST_DUPLICATE_FILE_ENTRY',
                message='manifest.json contains duplicate file entries',
                filename=MANIFEST_FILENAME,
            )
        )
    if set(manifest_names) != set(CANONICAL_ACTIVE_FILENAMES):
        errors.append(
            EngineValidationError(
                code='MANIFEST_FILE_SET_MISMATCH',
                message='manifest.json must declare exactly the ten canonical active files',
                filename=MANIFEST_FILENAME,
            )
        )
    for entry in manifest.file_versions:
        if entry.status != 'active':
            errors.append(
                EngineValidationError(
                    code='MANIFEST_STATUS_MISMATCH',
                    message='A deployed canonical file is not marked active',
                    filename=entry.filename,
                )
            )
        # Per-file content versions may differ from the engine version:
        # authoritative V4 packages carry e.g. claims 3.7.0 inside engine
        # 4.0.0. Version presence is enforced by FileVersionEntry.min_length.

    expected_manifest_paths = {f'active/{name}' for name in CANONICAL_ACTIVE_FILENAMES}
    if set(manifest.expected_checksums) != expected_manifest_paths:
        errors.append(
            EngineValidationError(
                code='MANIFEST_CHECKSUM_SET_MISMATCH',
                message='Manifest checksums must cover exactly the canonical active files',
                filename=MANIFEST_FILENAME,
            )
        )
    for path, digest in manifest.expected_checksums.items():
        if not re.fullmatch(r'[0-9a-fA-F]{64}', digest):
            errors.append(
                EngineValidationError(
                    code='INVALID_CHECKSUM',
                    message='Manifest contains an invalid SHA-256 digest',
                    filename=Path(path).name,
                )
            )

    # ── 3. Verify safe paths and read checksums ─────────────────────────
    checksums_raw = b''
    try:
        checksums_raw = _safe_read(checksums_path)
        checksums = _parse_checksums(checksums_raw.decode('utf-8'))
    except Exception as exc:
        errors.append(
            EngineValidationError(
                code='CHECKSUM_PARSE_ERROR',
                message=f'Failed to parse checksums.sha256: {exc}',
                filename=CHECKSUMS_FILENAME,
            )
        )
        checksums = {}

    expected_checksum_paths = expected_manifest_paths | {PROJECT_INSTRUCTIONS_FILENAME}
    if set(checksums) != expected_checksum_paths:
        errors.append(
            EngineValidationError(
                code='CHECKSUM_SET_MISMATCH',
                message='checksums.sha256 must cover active files and Project Instructions exactly',
                filename=CHECKSUMS_FILENAME,
            )
        )

    # ── 4. Verify active/ directory contents ────────────────────────────
    try:
        active_files = sorted(
            [f for f in active_dir.iterdir() if f.is_file() and not f.name.startswith('.')]
        )
    except OSError as exc:
        return _invalid_package(
            EngineValidationError(
                code='IO_ERROR',
                message=f'Cannot read active/ directory: {exc}',
                filename='active/',
            )
        )

    active_names = {f.name for f in active_files}

    # Check for missing canonical files
    for canonical in CANONICAL_ACTIVE_FILENAMES:
        if canonical not in active_names:
            errors.append(
                EngineValidationError(
                    code='MISSING_ACTIVE_FILE',
                    message=f'Required active file is missing: {canonical}',
                    filename=canonical,
                )
            )

    # Check for extra/suffixed files in active/
    for f in active_files:
        if f.name not in CANONICAL_ACTIVE_FILENAMES:
            errors.append(
                EngineValidationError(
                    code='EXTRA_ACTIVE_FILE',
                    message=f'Unexpected file in active/: {f.name}',
                    filename=f.name,
                )
            )

    # ── 5. Validate Project Instructions size ───────────────────────────
    pi_data = b''
    try:
        pi_data = _safe_read(pi_path)
    except OSError as exc:
        errors.append(
            EngineValidationError(
                code='IO_ERROR',
                message=f'Cannot read Project Instructions: {exc}',
                filename=PROJECT_INSTRUCTIONS_FILENAME,
            )
        )

    if pi_data:
        try:
            pi_data.decode('utf-8')
        except UnicodeDecodeError:
            errors.append(
                EngineValidationError(
                    code='UTF8_DECODE_ERROR',
                    message='Project Instructions is not valid UTF-8',
                    filename=PROJECT_INSTRUCTIONS_FILENAME,
                )
            )
        pi_expected = checksums.get(PROJECT_INSTRUCTIONS_FILENAME)
        pi_hash = hashlib.sha256(pi_data).hexdigest()
        if pi_expected is None or pi_hash != pi_expected:
            errors.append(
                EngineValidationError(
                    code='HASH_MISMATCH',
                    message='Project Instructions checksum does not match',
                    filename=PROJECT_INSTRUCTIONS_FILENAME,
                )
            )

    if pi_data and len(pi_data) > PROJECT_INSTRUCTIONS_MAX_BYTES:
        errors.append(
            EngineValidationError(
                code='PROJECT_INSTRUCTIONS_OVER_LIMIT',
                message=(
                    f'Project Instructions is {len(pi_data)} bytes; '
                    f'maximum is {PROJECT_INSTRUCTIONS_MAX_BYTES} bytes'
                ),
                filename=PROJECT_INSTRUCTIONS_FILENAME,
            )
        )

    # ── 6. Read and validate each active file ────────────────────────────
    source_frontmatter: SourceManifestFrontmatter | None = None
    for canonical in CANONICAL_ACTIVE_FILENAMES:
        fpath = active_dir / canonical
        if not fpath.is_file():
            continue  # error already recorded above

        if not _is_safe_path(active_dir, fpath) or fpath.is_symlink():
            errors.append(
                EngineValidationError(
                    code='UNSAFE_PATH',
                    message='Active file path escapes the package or is a symlink',
                    filename=canonical,
                )
            )
            continue

        try:
            raw = _safe_read(fpath)
        except OSError as exc:
            errors.append(
                EngineValidationError(
                    code='IO_ERROR',
                    message=f'Cannot read active file: {exc}',
                    filename=canonical,
                )
            )
            continue

        # Byte/hash validation
        computed_hash = hashlib.sha256(raw).hexdigest()
        expected_hash = checksums.get(f'active/{canonical}')
        manifest_expected = manifest.expected_checksums.get(f'active/{canonical}')
        if expected_hash is None or manifest_expected is None:
            errors.append(
                EngineValidationError(
                    code='MISSING_CHECKSUM',
                    message='Active file must be covered by both checksum sources',
                    filename=canonical,
                )
            )
        else:
            if expected_hash.lower() != manifest_expected.lower():
                errors.append(
                    EngineValidationError(
                        code='CHECKSUM_SOURCE_MISMATCH',
                        message='Manifest and checksums.sha256 disagree',
                        filename=canonical,
                    )
                )
            if computed_hash != expected_hash.lower() or computed_hash != manifest_expected.lower():
                errors.append(
                    EngineValidationError(
                        code='HASH_MISMATCH',
                        message=(
                            f'Checksum mismatch for active/{canonical}: '
                            f'expected {expected_hash[:16]}..., got {computed_hash[:16]}...'
                        ),
                        filename=canonical,
                    )
                )

        # UTF-8 parsing
        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError as exc:
            errors.append(
                EngineValidationError(
                    code='UTF8_DECODE_ERROR',
                    message=f'File is not valid UTF-8: {exc}',
                    filename=canonical,
                )
            )
            continue

        file_texts[canonical] = text

        # Frontmatter parsing
        fm_version = _get_version_for_file(canonical, manifest)
        fm_type, parsed_source, frontmatter_errors = _validate_frontmatter(
            canonical, text, engine_version_anchor=manifest.engine_version
        )
        errors.extend(frontmatter_errors)
        if parsed_source is not None:
            source_frontmatter = parsed_source

        file_records.append(
            PackageFileRecord(
                filename=canonical,
                relative_path=f'active/{canonical}',
                version=fm_version,
                status=_get_status_for_file(canonical, manifest),
                sha256=computed_hash,
                size_bytes=len(raw),
                frontmatter_parsed=fm_type is not None,
                frontmatter_type=fm_type,
            )
        )

    # ── 7. Unique ID validation ─────────────────────────────────────────
    all_claim_ids: list[str] = []
    all_case_ids: list[str] = []
    all_portfolio_ids: list[str] = []

    for fname, text in file_texts.items():
        ids = _extract_ids_from_text(fname, text)
        all_claim_ids.extend(ids.get('claim_ids', []))
        all_case_ids.extend(ids.get('case_ids', []))
        all_portfolio_ids.extend(ids.get('portfolio_ids', []))

    dup_claims = _find_duplicates(all_claim_ids)
    for cid in dup_claims:
        errors.append(
            EngineValidationError(
                code='DUPLICATE_CLAIM_ID',
                message=f'Duplicate claim ID: {cid}',
                claim_id=cid,
            )
        )

    dup_cases = _find_duplicates(all_case_ids)
    for cid in dup_cases:
        errors.append(
            EngineValidationError(
                code='DUPLICATE_CASE_ID',
                message=f'Duplicate case ID: {cid}',
                case_id=cid,
            )
        )

    dup_portfolios = _find_duplicates(all_portfolio_ids)
    for pid in dup_portfolios:
        errors.append(
            EngineValidationError(
                code='DUPLICATE_PORTFOLIO_ID',
                message=f'Duplicate portfolio ID: {pid}',
                portfolio_id=pid,
            )
        )

    # ── 8. Authority graph overlap check ─────────────────────────────────
    authority_errors = _check_authority_overlaps(file_texts)
    errors.extend(authority_errors)

    if source_frontmatter is not None:
        if source_frontmatter.engine_version != manifest.engine_version:
            errors.append(
                EngineValidationError(
                    code='SOURCE_VERSION_MISMATCH',
                    message='Source manifest and package manifest versions differ',
                    filename='00_source_manifest.md',
                )
            )
        if source_frontmatter.status != 'active':
            errors.append(
                EngineValidationError(
                    code='SOURCE_STATUS_MISMATCH',
                    message='Source manifest is not marked active',
                    filename='00_source_manifest.md',
                )
            )

    # ── 9. Manifest/current pointer consistency ─────────────────────────
    manifest_active_files = {fv.filename for fv in manifest.file_versions}
    for canonical in CANONICAL_ACTIVE_FILENAMES:
        if canonical not in manifest_active_files:
            errors.append(
                EngineValidationError(
                    code='MANIFEST_MISSING_FILE_ENTRY',
                    message=f'Active file not declared in manifest: {canonical}',
                    filename=canonical,
                )
            )

    # ── 10. Compute aggregate hash ───────────────────────────────────────
    aggregate_parts = [
        f'{MANIFEST_FILENAME}:{hashlib.sha256(manifest_raw).hexdigest()}',
        f'{CHECKSUMS_FILENAME}:{hashlib.sha256(checksums_raw).hexdigest()}',
        f'{PROJECT_INSTRUCTIONS_FILENAME}:{hashlib.sha256(pi_data).hexdigest()}',
    ]
    aggregate_parts.extend(
        f'{rec.relative_path}:{rec.sha256}'
        for rec in sorted(file_records, key=lambda r: r.relative_path)
    )
    aggregate_input = ''.join(aggregate_parts)
    aggregate_hash = hashlib.sha256(aggregate_input.encode('utf-8')).hexdigest()

    if errors:
        return LoadedEnginePackage(
            identity=PackageIdentity(
                engine_version=manifest.engine_version,
                engine_label=manifest.engine_label,
                manifest_schema_version=manifest.schema_version,
                aggregate_hash=aggregate_hash,
                loaded_at=_utc_now(),
                file_count=len(file_records) + 3,  # + manifest, checksums, pi
                active_count=len(
                    [r for r in file_records if r.filename in CANONICAL_ACTIVE_FILENAMES]
                ),
            ),
            manifest=manifest,
            files=tuple(file_records),
            valid=False,
            validation_errors=tuple(errors),
        )

    return LoadedEnginePackage(
        identity=PackageIdentity(
            engine_version=manifest.engine_version,
            engine_label=manifest.engine_label,
            manifest_schema_version=manifest.schema_version,
            aggregate_hash=aggregate_hash,
            loaded_at=_utc_now(),
            file_count=len(file_records) + 3,
            active_count=CANONICAL_ACTIVE_COUNT,
        ),
        manifest=manifest,
        files=tuple(file_records),
        valid=True,
        validation_errors=(),
    )


# ── Internal helpers ─────────────────────────────────────────────────────


def _utc_now() -> str:
    """Return a canonical UTC timestamp."""
    from datetime import UTC, datetime

    return datetime.now(UTC).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def _invalid_package(error: EngineValidationError) -> LoadedEnginePackage:
    """Return a fully invalid package with a single error.

    Uses ``model_construct`` to bypass Pydantic validation on the fallback
    Manifest — the real values are not expected to pass schema checks.
    """
    return LoadedEnginePackage(
        identity=PackageIdentity(
            engine_version='unknown',
            engine_label=None,
            manifest_schema_version=0,
            aggregate_hash='0' * 64,
            loaded_at=_utc_now(),
            file_count=0,
            active_count=0,
        ),
        manifest=Manifest.model_construct(
            schema_version=0,
            engine_version='unknown',
            file_versions=[],
        ),
        files=(),
        valid=False,
        validation_errors=(error,),
    )


def _parse_checksums(content: str) -> dict[str, str]:
    """Parse sha256sum-format content into {filename: hash}."""
    result: dict[str, str] = {}
    for line in content.strip().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2:
            raise ValueError('Each checksum line must contain a digest and relative path')
        digest, path = parts[0].lower(), parts[1].strip()
        if path.startswith('*'):
            path = path[1:]
        if not re.fullmatch(r'[0-9a-f]{64}', digest):
            raise ValueError(f'Invalid SHA-256 digest for {path}')
        normalized = Path(path).as_posix()
        if normalized.startswith('/') or '..' in Path(normalized).parts:
            raise ValueError(f'Unsafe checksum path: {path}')
        if normalized in result:
            raise ValueError(f'Duplicate checksum path: {path}')
        result[normalized] = digest
    return result


def _get_version_for_file(filename: str, manifest: Manifest) -> str | None:
    for fv in manifest.file_versions:
        if fv.filename == filename:
            return fv.version
    return None


def _get_status_for_file(filename: str, manifest: Manifest) -> FileStatus | None:
    for fv in manifest.file_versions:
        if fv.filename == filename:
            return fv.status
    return None


def _find_duplicates(items: list[str]) -> list[str]:
    """Return items that appear more than once, preserving first-seen order."""
    seen: set[str] = set()
    dupes: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen and item not in dupes:
            dupes.add(item)
            result.append(item)
        seen.add(item)
    return result
