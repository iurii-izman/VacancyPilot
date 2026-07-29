"""Health-check endpoint — public, no auth, no upstream dependencies."""

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.api.errors import ErrorResponse
from app.config import settings

router = APIRouter(tags=['health'])


class HealthData(BaseModel):
    """Typed health payload inside the standard success envelope."""

    status: str
    service_version: str
    api_version: str


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
        'Returns the companion process version, API version, and status. '
        'Public endpoint — no client token required.'
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
async def health(request: Request) -> HealthResponse:
    """Return service identity and status."""
    request_id: str = getattr(request.state, 'request_id', 'unknown')
    return HealthResponse(
        data=HealthData(
            status='ok',
            service_version=settings.service_version,
            api_version=settings.api_version,
        ),
        meta=HealthMeta(request_id=request_id),
    )
