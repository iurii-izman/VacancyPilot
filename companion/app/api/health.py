"""Health-check endpoint — public, no auth, no upstream dependencies."""

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.errors import ErrorResponse
from app.config import settings
from app.db.session import get_db_session

router = APIRouter(tags=['health'])


class HealthData(BaseModel):
    """Typed health payload inside the standard success envelope."""

    status: str
    service_version: str
    api_version: str
    db: str


class HealthMeta(BaseModel):
    request_id: str


class HealthResponse(BaseModel):
    """Full typed health response matching the v1 contract envelope."""

    data: HealthData
    meta: HealthMeta


@router.get(
    '/health',
    response_model=HealthResponse,
    summary='Companion health check',
    description=(
        'Returns the companion process version, API version, database status, '
        'and request metadata. Public endpoint — no client token required.'
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
async def health(
    request: Request,
    db: Session | None = Depends(get_db_session),  # noqa: B008
) -> HealthResponse:
    """Return service identity and status including database reachability."""
    request_id: str = getattr(request.state, 'request_id', 'unknown')

    # Lightweight DB probe — never leaks paths or connection details.
    db_status = 'unavailable'
    if db is not None:
        try:
            result = db.execute(text('SELECT 1'))
            result.scalar()
            db_status = 'ok'
        except Exception:
            db_status = 'unavailable'

    return HealthResponse(
        data=HealthData(
            status='ok',
            service_version=settings.service_version,
            api_version=settings.api_version,
            db=db_status,
        ),
        meta=HealthMeta(request_id=request_id),
    )
