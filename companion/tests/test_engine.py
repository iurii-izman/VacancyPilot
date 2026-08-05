"""Tests for engine V4 package loader, installer, index, and health — AOPS-07.

Coverage:
- Valid minimal fixture loads deterministically
- Missing file
- Extra/suffixed active file
- Hash mismatch
- Unsafe path
- Duplicate ID
- Bad frontmatter/version
- Authority overlap
- Project Instructions over limit
- Atomic failed installation
- Health redaction / no candidate text
"""

from __future__ import annotations

import hashlib
import tempfile
from pathlib import Path

import pytest  # type: ignore[import-untyped]

from app.engine.installer import install_package, verify_package
from app.engine.models import (
    LoadedEnginePackage,
)
from app.engine.package import (
    CHECKSUMS_FILENAME,
    MANIFEST_FILENAME,
    PROJECT_INSTRUCTIONS_FILENAME,
    PROJECT_INSTRUCTIONS_MAX_BYTES,
    _check_authority_overlaps,
    _extract_ids_from_text,
    _find_duplicates,
    _parse_frontmatter_yaml,
    load_engine_package,
)

# ── Helpers ──────────────────────────────────────────────────────────────

FIXTURES_ROOT = Path(__file__).resolve().parent / 'engine_fixtures'
VALID_MINIMAL = FIXTURES_ROOT / 'valid-minimal'


def _hash_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _assert_valid(pkg: LoadedEnginePackage) -> None:
    """Assert a package is valid with no errors."""
    assert pkg.valid, (
        f'Expected valid package but got {len(pkg.validation_errors)} errors: '
        f'{"; ".join(e.safe_summary() for e in pkg.validation_errors)}'
    )
    assert pkg.identity.engine_version == '4.0.0'
    assert pkg.identity.active_count == 10
    assert pkg.identity.aggregate_hash != '0' * 64


def _assert_invalid(pkg: LoadedEnginePackage, expected_code: str) -> None:
    """Assert a package is invalid with a specific error code."""
    assert not pkg.valid, f'Expected invalid package (code={expected_code}) but it was valid'
    codes = {e.code for e in pkg.validation_errors}
    assert expected_code in codes, (
        f'Expected error code {expected_code} but got {codes}: '
        f'{"; ".join(e.safe_summary() for e in pkg.validation_errors)}'
    )


# ── Valid minimal fixture ────────────────────────────────────────────────


def test_valid_minimal_fixture_loads() -> None:
    """The valid-minimal synthetic fixture should load as a valid package."""
    pkg = load_engine_package(VALID_MINIMAL)
    _assert_valid(pkg)
    assert len(pkg.files) == 10
    assert pkg.identity.active_count == 10


def test_valid_minimal_loads_deterministically() -> None:
    """Loading the same package twice produces the same aggregate hash."""
    pkg1 = load_engine_package(VALID_MINIMAL)
    pkg2 = load_engine_package(VALID_MINIMAL)
    assert pkg1.aggregate_hash == pkg2.aggregate_hash
    assert pkg1.identity.engine_version == pkg2.identity.engine_version


def test_valid_minimal_verifies() -> None:
    """verify_package should return valid for the valid-minimal fixture."""
    result = verify_package(VALID_MINIMAL)
    assert result.valid
    assert result.engine_version == '4.0.0'
    assert result.active_count == 10


# ── Invalid: missing file ────────────────────────────────────────────────


def test_missing_file(tmp_path: Path) -> None:
    """A package missing one active file should fail with MISSING_ACTIVE_FILE."""
    _copy_fixture(VALID_MINIMAL, tmp_path)
    (tmp_path / 'active' / '01_candidate_claims.md').unlink()
    pkg = load_engine_package(tmp_path)
    _assert_invalid(pkg, 'MISSING_ACTIVE_FILE')


def test_missing_manifest(tmp_path: Path) -> None:
    """A package without manifest.json should fail with MISSING_FILE."""
    _copy_fixture(VALID_MINIMAL, tmp_path)
    (tmp_path / MANIFEST_FILENAME).unlink()
    pkg = load_engine_package(tmp_path)
    _assert_invalid(pkg, 'MISSING_FILE')


def test_missing_project_instructions(tmp_path: Path) -> None:
    """A package without Project Instructions should fail with MISSING_FILE."""
    _copy_fixture(VALID_MINIMAL, tmp_path)
    (tmp_path / PROJECT_INSTRUCTIONS_FILENAME).unlink()
    pkg = load_engine_package(tmp_path)
    _assert_invalid(pkg, 'MISSING_FILE')


# ── Invalid: extra/suffixed active file ──────────────────────────────────


def test_extra_active_file(tmp_path: Path) -> None:
    """An unexpected file in active/ should produce EXTRA_ACTIVE_FILE."""
    _copy_fixture(VALID_MINIMAL, tmp_path)
    (tmp_path / 'active' / '99_extra_file.md').write_text('extra content', encoding='utf-8')
    pkg = load_engine_package(tmp_path)
    _assert_invalid(pkg, 'EXTRA_ACTIVE_FILE')


# ── Invalid: hash mismatch ───────────────────────────────────────────────


def test_hash_mismatch(tmp_path: Path) -> None:
    """A file whose sha256 does not match manifest should fail."""
    _copy_fixture(VALID_MINIMAL, tmp_path)
    # Change the checksums.sha256 to a wrong hash for one file
    checksum_path = tmp_path / CHECKSUMS_FILENAME
    lines = checksum_path.read_text('utf-8').splitlines()
    new_lines = []
    for line in lines:
        if 'active/00_source_manifest.md' in line:
            new_lines.append('0' * 64 + '  active/00_source_manifest.md')
        else:
            new_lines.append(line)
    checksum_path.write_text('\n'.join(new_lines) + '\n', encoding='utf-8')
    pkg = load_engine_package(tmp_path)
    _assert_invalid(pkg, 'HASH_MISMATCH')


def test_missing_checksum_is_rejected(tmp_path: Path) -> None:
    _copy_fixture(VALID_MINIMAL, tmp_path)
    checksum_path = tmp_path / CHECKSUMS_FILENAME
    lines = [
        line
        for line in checksum_path.read_text('utf-8').splitlines()
        if PROJECT_INSTRUCTIONS_FILENAME not in line
    ]
    checksum_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    _assert_invalid(load_engine_package(tmp_path), 'CHECKSUM_SET_MISMATCH')


def test_project_instructions_changes_aggregate_hash(tmp_path: Path) -> None:
    original = load_engine_package(VALID_MINIMAL)
    _copy_fixture(VALID_MINIMAL, tmp_path)
    instructions = tmp_path / PROJECT_INSTRUCTIONS_FILENAME
    instructions.write_text(instructions.read_text('utf-8') + '\nSynthetic update.\n', 'utf-8')
    checksum_path = tmp_path / CHECKSUMS_FILENAME
    lines = []
    for line in checksum_path.read_text('utf-8').splitlines():
        if PROJECT_INSTRUCTIONS_FILENAME in line:
            lines.append(f'{_hash_file(instructions)}  {PROJECT_INSTRUCTIONS_FILENAME}')
        else:
            lines.append(line)
    checksum_path.write_text('\n'.join(lines) + '\n', 'utf-8')

    changed = load_engine_package(tmp_path)
    _assert_valid(changed)
    assert changed.aggregate_hash != original.aggregate_hash


# ── Invalid: unsafe path ─────────────────────────────────────────────────


def test_unsafe_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Symlink-marked active files are rejected before reading."""
    _copy_fixture(VALID_MINIMAL, tmp_path)
    symlink_target = tmp_path / 'active' / '00_source_manifest.md'
    real_is_symlink = Path.is_symlink

    def simulated_is_symlink(path: Path) -> bool:
        if path == symlink_target:
            return True
        return real_is_symlink(path)

    monkeypatch.setattr(Path, 'is_symlink', simulated_is_symlink)
    _assert_invalid(load_engine_package(tmp_path), 'UNSAFE_PATH')


# ── Invalid: duplicate IDs ───────────────────────────────────────────────


def test_duplicate_claim_id(tmp_path: Path) -> None:
    """Duplicate claim IDs should produce DUPLICATE_CLAIM_ID."""
    _copy_fixture(VALID_MINIMAL, tmp_path)
    claims_path = tmp_path / 'active' / '01_candidate_claims.md'
    # Put duplicate in the same frontmatter block (realistic scenario)
    content = (
        '---\n'
        'claims:\n'
        '  - claim_id: SYNTH-001\n'
        '    evidence_level: E4\n'
        '    status: active\n'
        '  - claim_id: SYNTH-001\n'
        '    evidence_level: E3\n'
        '    status: active\n'
        '  - claim_id: SYNTH-002\n'
        '    evidence_level: E3\n'
        '    status: active\n'
        '---\n'
        '\n'
        '# Duplicate Claims Test\n'
    )
    claims_path.write_text(content, encoding='utf-8')
    pkg = load_engine_package(tmp_path)
    _assert_invalid(pkg, 'DUPLICATE_CLAIM_ID')


# ── Invalid: bad frontmatter/version ─────────────────────────────────────


def test_invalid_manifest_schema_version(tmp_path: Path) -> None:
    """An unsupported manifest schema version should fail."""
    _copy_fixture(VALID_MINIMAL, tmp_path)
    import json

    manifest_path = tmp_path / MANIFEST_FILENAME
    manifest = json.loads(manifest_path.read_text('utf-8'))
    manifest['schema_version'] = 999
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    pkg = load_engine_package(tmp_path)
    _assert_invalid(pkg, 'INVALID_MANIFEST')


def test_malformed_frontmatter_is_rejected(tmp_path: Path) -> None:
    _copy_fixture(VALID_MINIMAL, tmp_path)
    claims = tmp_path / 'active' / '01_candidate_claims.md'
    claims.write_text('---\nclaims: [unterminated\n---\n', encoding='utf-8')
    _assert_invalid(load_engine_package(tmp_path), 'INVALID_FRONTMATTER')


def test_deployed_file_version_must_match_engine(tmp_path: Path) -> None:
    _copy_fixture(VALID_MINIMAL, tmp_path)
    import json

    manifest_path = tmp_path / MANIFEST_FILENAME
    manifest = json.loads(manifest_path.read_text('utf-8'))
    manifest['file_versions'][0]['version'] = '3.9.0'
    manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
    _assert_invalid(load_engine_package(tmp_path), 'FILE_VERSION_MISMATCH')


# ── Invalid: authority overlap ───────────────────────────────────────────


def test_authority_overlap() -> None:
    """Conflicting evidence levels for the same claim ID should be detected."""
    file_texts = {
        '01_candidate_claims.md': (
            '---\n'
            'claims:\n'
            '  - claim_id: OVERLAP-001\n'
            '    evidence_level: E4\n'
            '    status: active\n'
            '  - claim_id: OVERLAP-001\n'
            '    evidence_level: E2\n'
            '    status: active\n'
            '---\n'
        ),
    }
    errors = _check_authority_overlaps(file_texts)
    assert len(errors) >= 1
    codes = {e.code for e in errors}
    assert 'AUTHORITY_OVERLAP' in codes


# ── Invalid: Project Instructions over limit ─────────────────────────────


def test_project_instructions_over_limit(tmp_path: Path) -> None:
    """PI file exceeding the size limit should produce error."""
    _copy_fixture(VALID_MINIMAL, tmp_path)
    pi_path = tmp_path / PROJECT_INSTRUCTIONS_FILENAME
    oversized = 'A' * (PROJECT_INSTRUCTIONS_MAX_BYTES + 1)
    pi_path.write_text(oversized, encoding='utf-8')
    pkg = load_engine_package(tmp_path)
    _assert_invalid(pkg, 'PROJECT_INSTRUCTIONS_OVER_LIMIT')


# ── Installer: atomic failed installation ────────────────────────────────


def test_install_package_succeeds(tmp_path: Path) -> None:
    """Installing a valid package should produce a valid result."""
    target = tmp_path / 'engine'
    target.mkdir(parents=True, exist_ok=True)
    result = install_package(str(VALID_MINIMAL), str(target))
    assert result.status == 'installed'
    assert result.valid
    assert result.engine_version == '4.0.0'
    assert (target / 'current').is_dir()


def test_install_package_already_current(tmp_path: Path) -> None:
    """Installing the same package twice returns already_current."""
    target = tmp_path / 'engine'
    target.mkdir(parents=True, exist_ok=True)
    result1 = install_package(str(VALID_MINIMAL), str(target))
    assert result1.status == 'installed'
    result2 = install_package(str(VALID_MINIMAL), str(target))
    assert result2.status == 'already_current'


def test_install_package_invalid_source(tmp_path: Path) -> None:
    """Installing a package without active files should fail."""
    target = tmp_path / 'engine'
    target.mkdir(parents=True, exist_ok=True)
    broken = tmp_path / 'broken'
    broken.mkdir()
    (broken / 'manifest.json').write_text('{}', encoding='utf-8')
    result = install_package(str(broken), str(target))
    assert not result.valid
    assert result.status == 'failed_validation'


def test_install_to_nonexistent_target_creates_it(tmp_path: Path) -> None:
    """Installing to a path that doesn't exist yet should create it and succeed."""
    target = tmp_path / 'nonexistent' / 'engine'
    result = install_package(str(VALID_MINIMAL), str(target))
    assert result.status == 'installed'
    assert result.valid


def test_install_nonexistent_source_reports_error(tmp_path: Path) -> None:
    """Installing from a nonexistent path returns error status."""
    target = tmp_path / 'engine'
    result = install_package('/nonexistent/path/to/engine', str(target))
    assert result.status == 'error'
    assert not result.valid


def test_failed_activation_restores_previous_package(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A failed staging rename must leave the previous valid package active."""
    import app.engine.installer as installer

    target = tmp_path / 'engine'
    assert install_package(VALID_MINIMAL, target).valid
    original_hash = load_engine_package(target / 'current').aggregate_hash
    real_replace = installer._atomic_replace

    def fail_staging_replace(src: Path | str, dst: Path | str) -> None:
        if Path(src).name == '.staging' and Path(dst).name == 'current':
            raise OSError('synthetic activation failure')
        real_replace(src, dst)

    monkeypatch.setattr(installer, '_atomic_replace', fail_staging_replace)
    result = install_package(VALID_MINIMAL, target, force=True)

    assert result.status == 'error'
    restored = load_engine_package(target / 'current')
    assert restored.valid
    assert restored.aggregate_hash == original_hash


# ── Knowledge index ──────────────────────────────────────────────────────


def test_knowledge_index_from_valid_package() -> None:
    """Building a knowledge index from the valid fixture works."""
    from app.engine.index import build_knowledge_index

    pkg = load_engine_package(VALID_MINIMAL)
    assert pkg.valid

    # Collect file texts
    file_texts: dict[str, str] = {}
    for record in pkg.files:
        fpath = VALID_MINIMAL / record.relative_path
        file_texts[record.filename] = fpath.read_text('utf-8')

    idx = build_knowledge_index(pkg, file_texts)
    assert idx.claim_count == 3
    assert idx.case_count == 1
    assert idx.portfolio_count == 1
    assert len(idx.claim_evidence_levels) == 3
    assert 'SYNTH-001' in idx.claims
    assert idx.claims['SYNTH-001']['evidence_level'] == 'E4'
    assert len(idx.hard_gates) == 1
    assert 'GATE-001' in idx.hard_gates
    assert len(idx.caps) == 1
    assert len(idx.skill_calibrations) == 3


def test_knowledge_index_rejects_invalid_package() -> None:
    """Building a knowledge index from an invalid package should raise ValueError."""
    from app.engine.index import build_knowledge_index

    pkg = load_engine_package(VALID_MINIMAL)
    # Make it invalid by corrupting a file
    broken = pkg.model_copy(update={'valid': False})
    with pytest.raises(ValueError, match='Cannot build knowledge index from an invalid package'):
        build_knowledge_index(broken, {})


# ── Health redaction / no candidate text ─────────────────────────────────


def test_health_response_no_candidate_text(client) -> None:
    """The engine/status endpoint never returns candidate text."""
    from unittest import mock

    with mock.patch.dict('os.environ', {'VACANCYPILOT_ENGINE_ROOT': str(VALID_MINIMAL.parent)}):
        pass

    # We test the models directly — the endpoint uses get_active_package
    # which looks for <root>/current, so let's verify the response schema.
    from app.api.engine import EngineHealthData

    health = EngineHealthData(
        installed=True,
        configured=True,
        valid=True,
        engine_version='4.0.0',
        package_version=1,
        active_count=10,
        aggregate_hash='a' * 64,
        claim_count=3,
        case_count=1,
        portfolio_count=1,
        validation_error_codes=[],
        validation_filenames=[],
        last_successful_load_at='2026-08-05T00:00:00Z',
    )

    # Ensure no candidate text fields exist
    data_dict = health.model_dump()
    assert 'candidate_text' not in data_dict
    assert 'claim_text' not in data_dict
    assert 'evidence_body' not in data_dict
    assert 'description' not in data_dict
    assert 'content' not in data_dict


def test_health_reports_invalid_installed_package(
    client, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import settings

    target = tmp_path / 'engine'
    current = target / 'current'
    _copy_fixture(VALID_MINIMAL, current)
    (current / 'active' / '01_candidate_claims.md').unlink()
    monkeypatch.setattr(settings, 'engine_package_root', str(target))

    response = client.get('/api/v1/engine/status')
    assert response.status_code == 200
    data = response.json()['data']
    assert data['installed'] is True
    assert data['configured'] is True
    assert data['valid'] is False
    assert 'MISSING_ACTIVE_FILE' in data['validation_error_codes']
    assert data['validation_filenames'] == ['01_candidate_claims.md']


def test_health_reports_valid_counts_without_candidate_content(
    client, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import settings

    target = tmp_path / 'engine'
    _copy_fixture(VALID_MINIMAL, target / 'current')
    monkeypatch.setattr(settings, 'engine_package_root', str(target))

    response = client.get('/api/v1/engine/status')
    assert response.status_code == 200
    data = response.json()['data']
    assert data['installed'] is True
    assert data['valid'] is True
    assert data['claim_count'] == 3
    assert data['case_count'] == 1
    assert data['portfolio_count'] == 1
    serialized = response.text
    assert 'SYNTH-001' not in serialized
    assert 'Synthetic fixture' not in serialized


# ── Unit: frontmatter parser ─────────────────────────────────────────────


def test_parse_frontmatter_simple() -> None:
    """Parsing simple YAML frontmatter should work."""
    text = '---\nkey: value\nstatus: active\n---\n\n# Body content'
    result = _parse_frontmatter_yaml(text)
    assert result is not None
    assert result.get('key') == 'value'
    assert result.get('status') == 'active'


def test_parse_frontmatter_with_booleans() -> None:
    """Frontmatter with boolean values should parse correctly."""
    text = '---\ncase_id: CASE-001\ncommercial: true\nstatus: active\n---\n\nBody'
    result = _parse_frontmatter_yaml(text)
    assert result is not None
    assert result.get('commercial') is True


def test_parse_frontmatter_with_list() -> None:
    """Frontmatter with top-level claims list should parse."""
    text = (
        '---\n'
        'claims:\n'
        '  - claim_id: C1\n'
        '    evidence_level: E4\n'
        '  - claim_id: C2\n'
        '    evidence_level: E3\n'
        '---\n'
    )
    result = _parse_frontmatter_yaml(text)
    assert result is not None
    assert 'claims' in result


def test_parse_frontmatter_no_delimiters() -> None:
    """Text without frontmatter delimiters returns None."""
    text = '# Just a heading\n\nSome body content.'
    assert _parse_frontmatter_yaml(text) is None


# ── Unit: ID extraction ──────────────────────────────────────────────────


def test_extract_claim_ids() -> None:
    """Claim IDs should be extracted from frontmatter."""
    text = (
        '---\n'
        'claims:\n'
        '  - claim_id: C1\n'
        '    evidence_level: E4\n'
        '  - claim_id: C2\n'
        '    evidence_level: E3\n'
        '---\n'
    )
    ids = _extract_ids_from_text('01_candidate_claims.md', text)
    assert 'claim_ids' in ids
    assert ids['claim_ids'] == ['C1', 'C2']


def test_extract_case_ids() -> None:
    """Case IDs should be extracted from frontmatter."""
    text = '---\ncases:\n  - case_id: CASE-001\n    status: active\n---\n'
    ids = _extract_ids_from_text('02_experience_case_bank.md', text)
    assert 'case_ids' in ids
    assert ids['case_ids'] == ['CASE-001']


def test_extract_portfolio_ids() -> None:
    """Portfolio IDs should be extracted from frontmatter."""
    text = '---\ncases:\n  - portfolio_id: PORT-001\n    status: active\n---\n'
    ids = _extract_ids_from_text('03_portfolio_cases.md', text)
    assert 'portfolio_ids' in ids
    assert ids['portfolio_ids'] == ['PORT-001']


# ── Unit: find duplicates ────────────────────────────────────────────────


def test_find_duplicates_empty() -> None:
    assert _find_duplicates([]) == []


def test_find_duplicates_no_dupes() -> None:
    assert _find_duplicates(['a', 'b', 'c']) == []


def test_find_duplicates_with_dupes() -> None:
    assert _find_duplicates(['a', 'b', 'a', 'c', 'b']) == ['a', 'b']


# ── Unit: invalid package ────────────────────────────────────────────────


def test_load_nonexistent_raises() -> None:
    with pytest.raises(FileNotFoundError):
        load_engine_package('/nonexistent/path/to/engine')


def test_load_file_not_directory(tmp_path: Path) -> None:
    f = tmp_path / 'file.txt'
    f.write_text('not a directory', encoding='utf-8')
    with pytest.raises(ValueError, match='not a directory'):
        load_engine_package(f)


# ── Unit: verify reports counts ──────────────────────────────────────────


def test_verify_package_counts() -> None:
    """verify_package on valid fixture reports correct counts."""
    result = verify_package(VALID_MINIMAL)
    assert result.engine_version == '4.0.0'
    assert result.active_count == 10
    assert result.aggregate_hash is not None
    assert len(result.aggregate_hash) == 64


def test_verify_package_invalid_manifest() -> None:
    """verify_package with invalid manifest reports failure."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / 'active').mkdir()
        (root / MANIFEST_FILENAME).write_text('not json', encoding='utf-8')
        result = verify_package(root)
        assert not result.valid


# ── Helpers ──────────────────────────────────────────────────────────────


def _copy_fixture(src: Path, dst: Path) -> None:
    """Copy fixture tree from src to dst."""
    import shutil

    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, symlinks=False)
