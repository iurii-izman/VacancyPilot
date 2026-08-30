"""AOPS-09 cover letter lifecycle and manual ChatGPT bridge routes."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analysis.models import V4StructuredResult
from app.analysis.validators import validate_letter
from app.api.vacancies import _require_db
from app.db.models import Application, CoverLetter, EngineRun, LetterVersion, Vacancy
from app.db.session import get_db_session_long
from app.domain.repositories import CoverLetterRepository
from app.letters.diff import compute_letter_diff
from app.security.auth import ClientTokenDep

router = APIRouter(tags=['letters'])


def _request_id(request: Request) -> str:
    return str(request.state.request_id)


class LetterVersionData(BaseModel):
    id: str
    version_type: str
    body_text: str
    source: str
    provider: str | None
    model: str | None
    prompt_version: str | None
    engine_run_id: str | None
    bridge_request_id: str | None
    vacancy_hash: str | None
    validation_errors: list[str]
    created_at: str


class LetterEnvelope(BaseModel):
    data: LetterVersionData
    meta: dict[str, str]


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    engine_run_id: str
    expected_revision: int | None = Field(default=None, ge=1)


class TextRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    body_text: str = Field(min_length=1, max_length=5000)
    expected_revision: int = Field(ge=1)


class BridgeRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    language: Literal['ru', 'en'] = 'ru'


class BridgeData(BaseModel):
    bridge_request_id: str
    vacancy_hash: str
    engine_version_expected: str
    request_text: str


class BridgeEnvelope(BaseModel):
    data: BridgeData
    meta: dict[str, str]


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    bridge_request_id: str = Field(min_length=8, max_length=128)
    vacancy_hash: str = Field(min_length=16, max_length=64)
    response_text: str = Field(min_length=1, max_length=65536)
    expected_revision: int | None = Field(default=None, ge=1)


class HistoryEnvelope(BaseModel):
    data: list[LetterVersionData]
    meta: dict[str, str]


class DiffEnvelope(BaseModel):
    data: dict[str, object]
    meta: dict[str, str]


def _application(session: Session, application_id: str) -> Application:
    app = session.get(Application, application_id)
    if app is None:
        raise HTTPException(status_code=404, detail='Application not found')
    return app


def _letter_for_application(session: Session, app: Application) -> CoverLetter | None:
    return (
        session.execute(
            select(CoverLetter)
            .where(CoverLetter.application_id == app.id)
            .order_by(CoverLetter.created_at.desc())
        )
        .scalars()
        .first()
    )


def _version_data(version: LetterVersion) -> LetterVersionData:
    errors: list[str] = []
    if version.validation_json:
        try:
            decoded = json.loads(version.validation_json)
            if isinstance(decoded, list):
                errors = [str(item) for item in decoded]
        except ValueError:
            errors = ['VALIDATION_METADATA_UNAVAILABLE']
    return LetterVersionData(
        id=version.id,
        version_type=version.version_type,
        body_text=version.body_text,
        source=version.source,
        provider=version.provider,
        model=version.model,
        prompt_version=version.prompt_version,
        engine_run_id=version.engine_run_id,
        bridge_request_id=version.bridge_request_id,
        vacancy_hash=version.vacancy_hash,
        validation_errors=errors,
        created_at=version.created_at,
    )


def _validate(body_text: str, vacancy: Vacancy) -> list[str]:
    return validate_letter(body_text, recommendation='apply', title=vacancy.title)


def _append(
    session: Session,
    app: Application,
    *,
    version_type: str,
    body_text: str,
    source: str,
    expected_revision: int | None,
    provider: str | None = None,
    model: str | None = None,
    prompt_version: str | None = None,
    engine_run_id: str | None = None,
    bridge_request_id: str | None = None,
    vacancy_hash: str | None = None,
    validation_errors: list[str] | None = None,
    diff_json: str | None = None,
) -> LetterVersion:
    repo = CoverLetterRepository(session)
    letter = _letter_for_application(session, app)
    if letter is None:
        letter = repo.create(application_id=app.id, mode='manual')
    revision = expected_revision if expected_revision is not None else letter.revision
    return repo.add_version(
        cover_letter_id=letter.id,
        version_type=version_type,
        body_text=body_text,
        source=source,
        provider=provider,
        model=model,
        prompt_version=prompt_version,
        engine_run_id=engine_run_id,
        bridge_request_id=bridge_request_id,
        vacancy_hash=vacancy_hash,
        validation_json=json.dumps(validation_errors or []),
        diff_json=diff_json,
        expected_revision=revision,
    )


@router.post('/applications/{application_id}/letters/generate', response_model=LetterEnvelope)
def generate_letter(
    request: Request,
    application_id: str,
    body: GenerateRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> LetterEnvelope:
    del client_identity
    session = _require_db(db)
    app = _application(session, application_id)
    run = session.get(EngineRun, body.engine_run_id)
    if (
        run is None
        or run.vacancy_id != app.vacancy_id
        or run.status != 'success'
        or not run.validated_output
    ):
        raise HTTPException(
            status_code=409, detail='A validated engine run for this application is required'
        )
    try:
        result = V4StructuredResult(**json.loads(run.validated_output))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=409, detail='Validated engine output is unavailable'
        ) from None
    vacancy = session.get(Vacancy, app.vacancy_id)
    assert vacancy is not None
    errors = _validate(result.cover_letter, vacancy)
    if errors:
        raise HTTPException(status_code=422, detail='Generated letter failed local validation')
    version = _append(
        session,
        app,
        version_type='generated',
        body_text=result.cover_letter,
        source='api',
        expected_revision=body.expected_revision,
        provider=run.provider,
        model=run.model,
        prompt_version=run.prompt_version,
        engine_run_id=run.id,
        validation_errors=[],
    )
    session.commit()
    return LetterEnvelope(data=_version_data(version), meta={'request_id': _request_id(request)})


@router.post('/applications/{application_id}/letters/bridge-request', response_model=BridgeEnvelope)
def build_bridge_request(
    request: Request,
    application_id: str,
    body: BridgeRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> BridgeEnvelope:
    del client_identity
    session = _require_db(db)
    app = _application(session, application_id)
    vacancy = session.get(Vacancy, app.vacancy_id)
    assert vacancy is not None
    vacancy_hash = hashlib.sha256((vacancy.description or '').encode()).hexdigest()
    bridge_id = hashlib.sha256(f'{vacancy.id}:{vacancy_hash}:v4'.encode()).hexdigest()[:32]
    request_text = (
        f'Bridge request ID: {bridge_id}\nVacancy hash: {vacancy_hash}\n'
        'Use Application Engine V4. Return the five-section response and include '
        'Section 3 as the cover letter. '
        'Do not invent facts; preserve evidence IDs.\n\n'
        f'Vacancy title: {vacancy.title}\nCompany: {vacancy.company_name or "Not specified"}\n'
        f'Vacancy text:\n{vacancy.description or "Not specified"}'
    )
    return BridgeEnvelope(
        data=BridgeData(
            bridge_request_id=bridge_id,
            vacancy_hash=vacancy_hash,
            engine_version_expected='4.0.0',
            request_text=request_text,
        ),
        meta={'request_id': _request_id(request)},
    )


@router.post('/applications/{application_id}/letters/import', response_model=LetterEnvelope)
def import_bridge_response(
    request: Request,
    application_id: str,
    body: ImportRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> LetterEnvelope:
    del client_identity
    session = _require_db(db)
    app = _application(session, application_id)
    vacancy = session.get(Vacancy, app.vacancy_id)
    assert vacancy is not None
    expected_hash = hashlib.sha256((vacancy.description or '').encode()).hexdigest()
    if body.vacancy_hash != expected_hash:
        raise HTTPException(status_code=409, detail='Bridge vacancy hash does not match')
    letter, risk_count = _parse_import(body.response_text)
    errors = _validate(letter, vacancy)
    if risk_count != 2:
        errors.append('IMPORT_RECRUITER_RISKS: expected exactly 2')
    if errors:
        raise HTTPException(status_code=422, detail='IMPORT_INVALID')
    version = _append(
        session,
        app,
        version_type='imported',
        body_text=letter,
        source='manual_chatgpt',
        expected_revision=body.expected_revision,
        bridge_request_id=body.bridge_request_id,
        vacancy_hash=body.vacancy_hash,
        validation_errors=[],
    )
    session.commit()
    return LetterEnvelope(data=_version_data(version), meta={'request_id': _request_id(request)})


@router.put('/applications/{application_id}/letters/final', response_model=LetterEnvelope)
def final_letter(
    request: Request,
    application_id: str,
    body: TextRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> LetterEnvelope:
    del client_identity
    session = _require_db(db)
    app = _application(session, application_id)
    vacancy = session.get(Vacancy, app.vacancy_id)
    assert vacancy is not None
    errors = _validate(body.body_text, vacancy)
    if errors:
        raise HTTPException(status_code=422, detail='FINAL_QA_FAILED')
    version = _append(
        session,
        app,
        version_type='final',
        body_text=body.body_text,
        source='user',
        expected_revision=body.expected_revision,
        validation_errors=[],
    )
    session.commit()
    return LetterEnvelope(data=_version_data(version), meta={'request_id': _request_id(request)})


@router.post('/applications/{application_id}/letters/edit', response_model=LetterEnvelope)
def edit_letter(
    request: Request,
    application_id: str,
    body: TextRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> LetterEnvelope:
    """Append an explicit user-edit snapshot without promoting it to final."""
    del client_identity
    session = _require_db(db)
    app = _application(session, application_id)
    version = _append(
        session,
        app,
        version_type='user_draft',
        body_text=body.body_text,
        source='user',
        expected_revision=body.expected_revision,
    )
    session.commit()
    return LetterEnvelope(data=_version_data(version), meta={'request_id': _request_id(request)})


@router.post('/applications/{application_id}/letters/sent', response_model=LetterEnvelope)
def sent_letter(
    request: Request,
    application_id: str,
    body: TextRequest,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> LetterEnvelope:
    del client_identity
    session = _require_db(db)
    app = _application(session, application_id)
    vacancy = session.get(Vacancy, app.vacancy_id)
    assert vacancy is not None
    errors = _validate(body.body_text, vacancy)
    if errors:
        raise HTTPException(status_code=422, detail='SENT_QA_FAILED')
    letter = _letter_for_application(session, app)
    if letter is None:
        raise HTTPException(
            status_code=409, detail='A generated or imported letter is required before sent'
        )
    versions = CoverLetterRepository(session).list_versions(letter.id)
    generated = next(
        (item for item in versions if item.version_type in ('generated', 'imported')), None
    )
    if generated is None:
        raise HTTPException(
            status_code=409, detail='A generated or imported letter is required before sent'
        )
    diff = compute_letter_diff(generated.body_text, body.body_text)
    try:
        version = _append(
            session,
            app,
            version_type='sent',
            body_text=body.body_text,
            source='user',
            expected_revision=body.expected_revision,
            validation_errors=[],
            diff_json=json.dumps(diff.as_dict()),
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    session.commit()
    return LetterEnvelope(data=_version_data(version), meta={'request_id': _request_id(request)})


@router.get('/applications/{application_id}/letters', response_model=HistoryEnvelope)
def letter_history(
    request: Request,
    application_id: str,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> HistoryEnvelope:  # noqa: B008
    del client_identity
    session = _require_db(db)
    app = _application(session, application_id)
    letter = _letter_for_application(session, app)
    versions = [] if letter is None else CoverLetterRepository(session).list_versions(letter.id)
    return HistoryEnvelope(
        data=[_version_data(item) for item in versions], meta={'request_id': _request_id(request)}
    )


@router.get('/applications/{application_id}/letters/diff', response_model=DiffEnvelope)
def letter_diff(
    request: Request,
    application_id: str,
    client_identity: ClientTokenDep,
    db: Session | None = Depends(get_db_session_long),  # noqa: B008
) -> DiffEnvelope:  # noqa: B008
    del client_identity
    session = _require_db(db)
    app = _application(session, application_id)
    letter = _letter_for_application(session, app)
    if letter is None:
        raise HTTPException(status_code=404, detail='Letter not found')
    versions = CoverLetterRepository(session).list_versions(letter.id)
    generated = next(
        (item for item in versions if item.version_type in ('generated', 'imported')), None
    )
    sent = next((item for item in versions if item.version_type == 'sent'), None)
    if generated is None or sent is None:
        raise HTTPException(status_code=409, detail='Generated and sent snapshots are required')
    return DiffEnvelope(
        data=compute_letter_diff(generated.body_text, sent.body_text).as_dict(),
        meta={'request_id': _request_id(request)},
    )


def _parse_import(response_text: str) -> tuple[str, int]:
    """Extract Section 3 letter and two risks from JSON or five-section text."""
    try:
        parsed = json.loads(response_text)
        if isinstance(parsed, dict):
            result = V4StructuredResult(**parsed)
            return result.cover_letter, len(result.recruiter_risks)
    except (ValueError, TypeError):
        pass
    section = re.search(
        r'(?:^|\n)\s*(?:3[.)]|section\s*3)\s*[^\n]*\n(?P<body>.*?)(?=\n\s*(?:4[.)]|section\s*4)\b|\Z)',
        response_text,
        re.IGNORECASE | re.DOTALL,
    )
    if not section:
        raise HTTPException(status_code=422, detail='IMPORT_INVALID')
    risks = re.findall(r'(?:^|\n)\s*(?:risk|риск)\s*[:\-]', response_text, re.IGNORECASE)
    return section.group('body').strip(), len(risks)
