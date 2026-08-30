"""Engine V4 package installer — AOPS-07.

Copies an engine package from a supplied local source path into the
companion's configured data directory, validates it before activation,
and never reconstructs missing sources.

Installation is atomic: the new package is staged in a temporary sibling
directory, validated, and only then atomically swapped in via rename.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from app.engine.models import EngineValidationError, LoadedEnginePackage
from app.engine.package import load_engine_package


class InstallResult(BaseModel):
    """Outcome of a package install/verify operation."""

    status: Literal['installed', 'already_current', 'failed_validation', 'error']
    target_path: str
    valid: bool
    engine_version: str | None = None
    aggregate_hash: str | None = None
    active_count: int = 0
    validation_errors: list[EngineValidationError] = Field(default_factory=list)
    message: str


def _atomic_replace(src: Path | str, dst: Path | str) -> None:
    """Atomically replace *dst* with *src*.

    On POSIX: ``os.replace`` is atomic. On Windows: ``os.replace`` is
    atomic when src and dst are on the same filesystem (which they are).
    """
    os.replace(str(src), str(dst))


def install_package(
    source_path: str | Path,
    target_root: str | Path,
    *,
    force: bool = False,
) -> InstallResult:
    """Copy, validate, and atomically activate an engine package.

    Args:
        source_path: Path to the source engine package directory.
        target_root: The companion's configured engine data directory
            (e.g. ``data/engine``). The active package lives at
            ``<target_root>/current``.
        force: When True, replace an existing valid package even if it
            has the same aggregate hash.

    Returns:
        An ``InstallResult`` describing the outcome.
    """
    source = Path(source_path).resolve(strict=False)
    target = Path(target_root).resolve(strict=False)

    if not source.exists():
        return InstallResult(
            status='error',
            target_path=str(target / 'current'),
            valid=False,
            message=f'Source package path does not exist: {source}',
        )
    if not source.is_dir():
        return InstallResult(
            status='error',
            target_path=str(target / 'current'),
            valid=False,
            message=f'Source is not a directory: {source}',
        )

    # ── Build a temporary staging copy ───────────────────────────────────
    staging = target / '.staging'
    current = target / 'current'

    # Clean up any stale staging artefacts
    if staging.exists():
        shutil.rmtree(staging)

    try:
        target.mkdir(parents=True, exist_ok=True)
        # Preserve links so the loader can reject them. Dereferencing here
        # would allow an external file to bypass source-package boundaries.
        shutil.copytree(source, staging, symlinks=True)
    except OSError as exc:
        if staging.exists():
            shutil.rmtree(staging)
        return InstallResult(
            status='error',
            target_path=str(current),
            valid=False,
            message=f'Failed to copy package from {source}: {exc}',
        )

    # ── Validate the staging copy ────────────────────────────────────────
    package = load_engine_package(staging)
    if not package.valid:
        shutil.rmtree(staging)
        return InstallResult(
            status='failed_validation',
            target_path=str(current),
            valid=False,
            engine_version=package.identity.engine_version,
            aggregate_hash=package.identity.aggregate_hash,
            active_count=package.identity.active_count,
            validation_errors=list(package.validation_errors),
            message=f'Validation failed with {len(package.validation_errors)} error(s)',
        )

    # ── Check if already current ─────────────────────────────────────────
    if current.exists() and current.is_dir() and not force:
        try:
            existing = load_engine_package(current)
            if existing.valid and existing.aggregate_hash == package.aggregate_hash:
                shutil.rmtree(staging)
                return InstallResult(
                    status='already_current',
                    target_path=str(current),
                    valid=True,
                    engine_version=package.identity.engine_version,
                    aggregate_hash=package.identity.aggregate_hash,
                    active_count=package.identity.active_count,
                    message='Package is already current (matching aggregate hash)',
                )
        except Exception:
            pass  # existing package is missing or invalid — proceed with install

    # ── Atomic swap ──────────────────────────────────────────────────────
    old = target / '.previous'
    had_current = current.exists()
    try:
        if had_current:
            if old.exists():
                shutil.rmtree(old)
            _atomic_replace(current, old)
        _atomic_replace(staging, current)
    except OSError as exc:
        restored = not had_current
        if had_current and old.exists() and not current.exists():
            try:
                _atomic_replace(old, current)
                restored = True
            except OSError:
                restored = False
        if staging.exists():
            shutil.rmtree(staging)
        message = (
            'Package activation failed; previous package restored'
            if restored
            else 'Package activation failed; previous package remains in .previous'
        )
        return InstallResult(
            status='error',
            target_path=str(current),
            valid=False,
            validation_errors=[],
            message=f'{message}: {exc}',
        )

    return InstallResult(
        status='installed',
        target_path=str(current),
        valid=True,
        engine_version=package.identity.engine_version,
        aggregate_hash=package.identity.aggregate_hash,
        active_count=package.identity.active_count,
        message=f'Engine package v{package.identity.engine_version} installed successfully',
    )


def verify_package(package_root: str | Path) -> InstallResult:
    """Validate an engine package in-place without installing it.

    Returns an InstallResult with the validation outcome. Does not
    modify any files.
    """
    package = load_engine_package(package_root)
    target = Path(package_root).resolve(strict=False)

    if package.valid:
        return InstallResult(
            status='already_current',
            target_path=str(target),
            valid=True,
            engine_version=package.identity.engine_version,
            aggregate_hash=package.identity.aggregate_hash,
            active_count=package.identity.active_count,
            message=f'Package is valid. Engine v{package.identity.engine_version}, '
            f'{package.identity.active_count} active files.',
        )
    else:
        return InstallResult(
            status='failed_validation',
            target_path=str(target),
            valid=False,
            engine_version=package.identity.engine_version,
            aggregate_hash=package.identity.aggregate_hash,
            active_count=package.identity.active_count,
            validation_errors=list(package.validation_errors),
            message=f'Validation failed with {len(package.validation_errors)} error(s).',
        )


def get_active_package(target_root: str | Path) -> LoadedEnginePackage | None:
    """Return the active package validation result, or None when absent.

    The active package lives at ``<target_root>/current``.
    """
    current = Path(target_root) / 'current'
    if not current.exists() or not current.is_dir():
        return None
    return load_engine_package(current)
