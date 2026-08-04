"""Authenticated, transactional Dexie-to-SQLite migration routes — AOPS-05."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Setting
from app.db.session import get_db_session_long
from app.domain.repositories import VacancyRepository
from app.security.auth import ClientTokenDep

router = APIRouter(tags=['migration'])


class SnapshotInfo(BaseModel):
    model_config = ConfigDict(extra='forbid')
    captured_at: str
    counts: dict[str, int]
    snapshot_hash: str = Field(pattern=r'^[0-9a-f]{64}$')


class MigrationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    export_version: Literal[2]
    snapshot: SnapshotInfo
    export_data: dict[str, list[Any]]


class ConflictDetail(BaseModel):
    entity_type: str
    entity_id: str
    reason: str


class MigrationPreviewData(BaseModel):
    inserts: int
    updates: int
    unchanged: int
    conflicts: int
    conflict_details: list[ConflictDetail] | None
    total: int
    retained_in_backup: int
    has_blocking_conflicts: bool


class MigrationPreviewResponse(BaseModel):
    data: MigrationPreviewData
    meta: dict[str, str]


class MigrationImportData(BaseModel):
    status: Literal['committed', 'rolled_back']
    inserts: int
    updates: int
    unchanged: int
    conflicts: int
    retained_in_backup: int
    checkpoint: str | None = None
    summary: str
    breakdown: list[dict[str, Any]]


class MigrationImportResponse(BaseModel):
    data: MigrationImportData
    meta: dict[str, str]


class MigrationStatusData(BaseModel):
    mode: Literal['standalone', 'ops']
    imported: bool
    last_import_at: str | None
    last_import_checkpoint: str | None
    outbox_depth: int
    blocked_outbox: int


class MigrationStatusResponse(BaseModel):
    data: MigrationStatusData
    meta: dict[str, str]


def _request_id(request: Request) -> str:
    return str(request.state.request_id)


def _require_db(db: Session | None) -> Session:
    if db is None:
        raise HTTPException(status_code=503, detail='Database unavailable')
    return db


def _job_key(job: dict[str, Any]) -> str:
    value = job.get('sourceVacancyId') or job.get('id')
    if not isinstance(value, str) or not value.strip():
        raise ValueError('Every migrated job requires a stable source vacancy ID')
    return value.strip().removeprefix('hh_')


def _preview(body: MigrationRequest, db: Session) -> MigrationPreviewData:
    repo = VacancyRepository(db)
    jobs = body.export_data.get('jobs', [])
    inserts = unchanged = 0
    details: list[ConflictDetail] = []
    for raw in jobs:
        if not isinstance(raw, dict):
            details.append(
                ConflictDetail(
                    entity_type='jobs', entity_id='unknown', reason='Invalid job payload'
                )
            )
            continue
        try:
            source_id = _job_key(raw)
        except ValueError as error:
            details.append(
                ConflictDetail(entity_type='jobs', entity_id='unknown', reason=str(error))
            )
            continue
        existing = repo.get_by_source('hh', source_id)
        if existing is None:
            inserts += 1
        elif existing.description_hash == raw.get('descriptionHash') and existing.title == str(
            raw.get('title', '')
        ):
            unchanged += 1
        else:
            details.append(
                ConflictDetail(
                    entity_type='jobs',
                    entity_id=source_id,
                    reason='Natural-key duplicate differs from the SQLite record',
                )
            )
    retained = sum(len(rows) for name, rows in body.export_data.items() if name != 'jobs')
    return MigrationPreviewData(
        inserts=inserts,
        updates=0,
        unchanged=unchanged,
        conflicts=len(details),
        conflict_details=details or None,
        total=sum(len(rows) for rows in body.export_data.values()),
        retained_in_backup=retained,
        has_blocking_conflicts=bool(details),
    )


@router.post('/migration/preview', response_model=MigrationPreviewResponse)
def migration_preview(
    request: Request,
    body: MigrationRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> MigrationPreviewResponse:
    """Return a content-aware preview without mutating SQLite."""
    del client_identity
    preview = _preview(body, _require_db(db))
    return MigrationPreviewResponse(data=preview, meta={'request_id': _request_id(request)})


@router.post('/migration/import', response_model=MigrationImportResponse)
def migration_import(
    request: Request,
    body: MigrationRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> MigrationImportResponse:
    """Import non-conflicting vacancies and persist the exact sanitized backup atomically."""
    del client_identity
    session = _require_db(db)
    checkpoint_key = f'migration_checkpoint_{body.snapshot.snapshot_hash}'
    existing = session.get(Setting, checkpoint_key)
    if existing is not None:
        previous = json.loads(existing.value_json)
        return MigrationImportResponse(
            data=MigrationImportData(**previous['result']),
            meta={'request_id': _request_id(request)},
        )

    preview = _preview(body, session)
    if preview.has_blocking_conflicts:
        return MigrationImportResponse(
            data=MigrationImportData(
                status='rolled_back',
                inserts=0,
                updates=0,
                unchanged=preview.unchanged,
                conflicts=preview.conflicts,
                retained_in_backup=preview.retained_in_backup,
                summary='Import blocked by visible conflicts; SQLite was not modified.',
                breakdown=[],
            ),
            meta={'request_id': _request_id(request)},
        )

    repo = VacancyRepository(session)
    checkpoint = str(uuid.uuid4())
    committed_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    try:
        inserted = 0
        for raw in body.export_data.get('jobs', []):
            if not isinstance(raw, dict):
                raise ValueError('Invalid job payload')
            source_id = _job_key(raw)
            if repo.get_by_source('hh', source_id) is not None:
                continue
            repo.upsert(
                source='hh',
                source_vacancy_id=source_id,
                url=raw.get('sourceUrl'),
                title=str(raw.get('title') or 'Unknown'),
                company_id=raw.get('companyId'),
                company_name=raw.get('companyName'),
                salary_min=raw.get('salaryMin'),
                salary_max=raw.get('salaryMax'),
                currency=raw.get('salaryCurrency'),
                work_mode=raw.get('workMode'),
                experience=raw.get('experienceRaw'),
                description=raw.get('descriptionClean'),
                description_hash=raw.get('descriptionHash'),
                skills_json=json.dumps(raw.get('skills', []), ensure_ascii=False),
            )
            inserted += 1
        result = MigrationImportData(
            status='committed',
            inserts=inserted,
            updates=0,
            unchanged=preview.unchanged,
            conflicts=0,
            retained_in_backup=preview.retained_in_backup,
            checkpoint=checkpoint,
            summary=(
                f'Imported {inserted} vacancies; retained '
                f'{preview.retained_in_backup} other records in the recovery backup.'
            ),
            breakdown=[
                {'entity_type': 'vacancies', 'inserts': inserted, 'unchanged': preview.unchanged}
            ],
        )
        session.add(
            Setting(
                key=checkpoint_key,
                value_json=json.dumps(
                    {
                        'schema_version': 1,
                        'snapshot_hash': body.snapshot.snapshot_hash,
                        'committed_at': committed_at,
                        'checkpoint': checkpoint,
                        'result': result.model_dump(),
                        'source_backup': body.export_data,
                    },
                    ensure_ascii=False,
                ),
                revision=1,
            )
        )
        session.commit()
        return MigrationImportResponse(data=result, meta={'request_id': _request_id(request)})
    except Exception:
        session.rollback()
        return MigrationImportResponse(
            data=MigrationImportData(
                status='rolled_back',
                inserts=0,
                updates=0,
                unchanged=0,
                conflicts=0,
                retained_in_backup=preview.retained_in_backup,
                summary='Import failed and was rolled back. No SQLite data was modified.',
                breakdown=[],
            ),
            meta={'request_id': _request_id(request)},
        )


@router.get('/migration/status', response_model=MigrationStatusResponse)
def migration_status(
    request: Request,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> MigrationStatusResponse:
    """Return the latest committed migration checkpoint."""
    del client_identity
    session = _require_db(db)
    rows = (
        session.execute(select(Setting).where(Setting.key.like('migration_checkpoint_%')))
        .scalars()
        .all()
    )
    latest_data = json.loads(rows[-1].value_json) if rows else None
    data = MigrationStatusData(
        mode='ops' if latest_data else 'standalone',
        imported=bool(latest_data),
        last_import_at=latest_data.get('committed_at') if latest_data else None,
        last_import_checkpoint=latest_data.get('checkpoint') if latest_data else None,
        outbox_depth=0,
        blocked_outbox=0,
    )
    return MigrationStatusResponse(data=data, meta={'request_id': _request_id(request)})
