"""Engine health endpoint — GET /api/v1/engine/status — AOPS-07.

Returns sanitized health fields. Never returns candidate text, evidence
bodies, or any private knowledge content through the health endpoint.
"""

from __future__ import annotations

import time
from pathlib import Path

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.api.errors import ErrorResponse
from app.config import resolve_engine_package_root, settings
from app.engine.installer import get_active_package
from app.engine.models import LoadedEnginePackage

router = APIRouter(tags=['engine'])

_ENGINE_STATUS_TTL_SECONDS = 5.0
_ENGINE_STATUS_ERROR_TTL_SECONDS = 1.0
_engine_status_cache: dict[tuple[str, int | None, int | None], tuple[float, EngineHealthData]] = {}


def _status_fingerprint(current_dir: Path) -> tuple[str, int | None, int | None]:
    try:
        stat = current_dir.stat()
        return (str(current_dir.resolve()), stat.st_mtime_ns, stat.st_size)
    except OSError:
        return (str(current_dir.resolve()), None, None)


# ── Response models ──────────────────────────────────────────────────────


class EngineHealthData(BaseModel):
    """Sanitized engine health payload. No candidate text ever exposed."""

    installed: bool
    configured: bool
    valid: bool
    engine_version: str | None = None
    package_version: int | None = None
    active_count: int | None = None
    aggregate_hash: str | None = None
    claim_count: int | None = None
    case_count: int | None = None
    portfolio_count: int | None = None
    validation_error_codes: list[str] = Field(default_factory=list)
    validation_filenames: list[str] = Field(default_factory=list)
    last_successful_load_at: str | None = None


class EngineHealthMeta(BaseModel):
    request_id: str


class EngineHealthResponse(BaseModel):
    """Standard v1 health envelope for engine status."""

    data: EngineHealthData
    meta: EngineHealthMeta


# ── Route ────────────────────────────────────────────────────────────────


@router.get(
    '/engine/status',
    response_model=EngineHealthResponse,
    summary='Application Engine V4 status',
    description=(
        'Returns sanitized engine health fields: installed/configured/valid, '
        'engine version, active file count, aggregate hash, claim/case/portfolio '
        'counts, validation error codes and safe filenames, and last successful '
        'load time. Candidate text is never returned through this endpoint.'
    ),
    responses={
        500: {
            'model': ErrorResponse,
            'description': 'Sanitized unhandled server error',
        }
    },
    openapi_extra={
        'parameters': [
            {
                'name': 'X-VacancyPilot-Request-ID',
                'in': 'header',
                'required': False,
                'description': 'Optional caller UUID; generated when absent or invalid.',
                'schema': {'type': 'string'},
            }
        ]
    },
)
async def engine_status(request: Request) -> EngineHealthResponse:
    """Return current Application Engine V4 health status.

    This endpoint is public (no client token required) because it never
    exposes candidate knowledge — only machine-readable validation metadata.
    """
    request_id: str = getattr(request.state, 'request_id', 'unknown')

    # Determine the configured engine package root
    target_root = resolve_engine_package_root()
    configured = bool(settings.engine_package_root.strip()) or target_root.is_dir()
    current_dir = target_root / 'current'
    fingerprint = _status_fingerprint(current_dir)
    cached = _engine_status_cache.get(fingerprint)
    if cached and cached[0] > time.monotonic():
        return EngineHealthResponse(
            data=cached[1],
            meta=EngineHealthMeta(request_id=request_id),
        )

    package: LoadedEnginePackage | None = None
    last_load_at: str | None = None
    load_failed = False

    try:
        package = get_active_package(target_root)
    except Exception:
        package = None
        load_failed = True

    installed = current_dir.is_dir()
    valid = package.valid if package else False

    engine_version = package.identity.engine_version if package else None
    package_version_val = package.identity.manifest_schema_version if package else None
    active_count = package.identity.active_count if package else None
    aggregate_hash = package.identity.aggregate_hash if package else None

    # Claims/cases/portfolio counts are derived from the knowledge index,
    # which requires re-extracting IDs from file content. We provide counts
    # from the manifest/validation metadata only, never from file content.
    #
    # The knowledge index is built separately and available via the loader.
    # For health, we report null counts until the index is built.
    claim_count: int | None = None
    case_count: int | None = None
    portfolio_count: int | None = None

    error_codes: list[str] = []
    safe_filenames: list[str] = []

    if load_failed:
        error_codes.append('ENGINE_LOAD_ERROR')

    if package and not package.valid:
        for err in package.validation_errors:
            error_codes.append(err.code)
            if err.filename:
                safe_filenames.append(err.filename)
        # Deduplicate while preserving order
        error_codes = list(dict.fromkeys(error_codes))
        safe_filenames = list(dict.fromkeys(safe_filenames))

    if package and package.valid:
        # Build knowledge index for counts (IDs only, no text)
        try:
            from app.engine.index import build_knowledge_index
            from app.engine.package import _safe_read

            file_texts: dict[str, str] = {}
            for record in package.files:
                fpath = current_dir / record.relative_path
                try:
                    raw = _safe_read(fpath)
                    file_texts[record.filename] = raw.decode('utf-8')
                except Exception:
                    continue
            if file_texts:
                idx = build_knowledge_index(package, file_texts)
                claim_count = idx.claim_count
                case_count = idx.case_count
                portfolio_count = idx.portfolio_count
        except Exception:
            pass

        last_load_at = package.identity.loaded_at

    health_data = EngineHealthData(
        installed=installed,
        configured=configured,
        valid=valid,
        engine_version=engine_version,
        package_version=package_version_val,
        active_count=active_count,
        aggregate_hash=aggregate_hash,
        claim_count=claim_count,
        case_count=case_count,
        portfolio_count=portfolio_count,
        validation_error_codes=error_codes,
        validation_filenames=safe_filenames,
        last_successful_load_at=last_load_at,
    )
    _engine_status_cache[fingerprint] = (
        time.monotonic()
        + (_ENGINE_STATUS_ERROR_TTL_SECONDS if load_failed else _ENGINE_STATUS_TTL_SECONDS),
        health_data,
    )
    # Keep the in-memory cache bounded if an operator changes package roots.
    if len(_engine_status_cache) > 8:
        oldest = min(_engine_status_cache, key=lambda key: _engine_status_cache[key][0])
        _engine_status_cache.pop(oldest, None)

    return EngineHealthResponse(
        data=health_data,
        meta=EngineHealthMeta(request_id=request_id),
    )
