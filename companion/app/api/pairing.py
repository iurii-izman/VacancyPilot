"""Pairing API router: start, confirm, and revoke.

Routes::

    POST /api/v1/pair/start     — unauthenticated, rate-limited
    POST /api/v1/pair/confirm   — unauthenticated, rate-limited
    POST /api/v1/pair/revoke    — requires client token
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.errors import ErrorResponse
from app.db.session import get_db_session
from app.security.auth import ClientTokenDep
from app.security.pairing import PairingCapacityError, get_pairing_service
from app.security.rate_limit import PAIRING_RATE_LIMIT, RateLimiter

router = APIRouter(tags=['pairing'])

# Single rate-limiter instance for pairing endpoints.
_pairing_limiter = RateLimiter(config=PAIRING_RATE_LIMIT)
_PAIRING_RATE_KEY = 'loopback-pairing'


# ── Request/response models ──────────────────────────────────────────────


class PairStartRequest(BaseModel):
    """Start a pairing challenge.  No auth required."""

    pass


class PairStartData(BaseModel):
    """Returned by start — the challenge ID, not the code."""

    challenge_id: str = Field(..., description='UUID of the created challenge')
    expires_in_seconds: int = Field(300, description='Challenge lifetime in seconds')


class PairStartResponse(BaseModel):
    data: PairStartData
    meta: dict[str, str]


class PairConfirmRequest(BaseModel):
    """Confirm a pairing challenge with the code displayed out-of-band."""

    challenge_id: str = Field(..., min_length=1, max_length=128)
    code: str = Field(..., min_length=6, max_length=6, pattern=r'^\d{6}$')


class PairConfirmData(BaseModel):
    """The client token is returned exactly once on successful confirm."""

    client_token: str = Field(..., description='Revocable local client token — store and protect')
    message: str = Field(
        default='Pairing successful. Store this token securely — it will not be shown again.',
    )


class PairConfirmResponse(BaseModel):
    data: PairConfirmData
    meta: dict[str, str]


class PairRevokeRequest(BaseModel):
    """Revoke the current client token.  Requires valid client token."""

    pass


class PairRevokeData(BaseModel):
    message: str = Field(default='Client token has been revoked.')


class PairRevokeResponse(BaseModel):
    data: PairRevokeData
    meta: dict[str, str]


# ── Helpers ──────────────────────────────────────────────────────────────


def _request_id(request: Request) -> str:
    return str(getattr(request.state, 'request_id', 'unknown'))


# ── Routes ───────────────────────────────────────────────────────────────


@router.post(
    '/pair/start',
    response_model=PairStartResponse,
    summary='Start pairing challenge',
    description=(
        'Creates a short-lived six-digit pairing code.  The code is displayed '
        'out-of-band by the companion process (stdout), never returned here. '
        'This endpoint is unauthenticated but rate-limited.'
    ),
    responses={
        200: {'description': 'Challenge created'},
        429: {'model': ErrorResponse, 'description': 'Too many pairing attempts'},
        503: {'model': ErrorResponse, 'description': 'Database unavailable'},
    },
)
async def pair_start(
    request: Request,
    db: Session | None = Depends(get_db_session),  # noqa: B008
) -> PairStartResponse:
    if not _pairing_limiter.allow(_PAIRING_RATE_KEY):
        from fastapi.exceptions import HTTPException

        raise HTTPException(status_code=429, detail='Too many pairing requests')

    if db is None:
        from fastapi.exceptions import HTTPException

        raise HTTPException(status_code=503, detail='Database unavailable')

    service = get_pairing_service()
    try:
        challenge_id, code = service.start_challenge()
    except PairingCapacityError as exc:
        from fastapi.exceptions import HTTPException

        raise HTTPException(status_code=429, detail='Too many active pairing challenges') from exc

    # The code is displayed out-of-band by the companion process.
    # We log only the challenge ID, never the code.
    import logging

    logger = logging.getLogger('app.security.pairing')
    logger.info('Pairing challenge started: challenge_id=%s', challenge_id)

    # Print the code to stdout so the user can see it in the terminal.
    print(f'\n  🔑 VacancyPilot pairing code: {code}\n')

    return PairStartResponse(
        data=PairStartData(challenge_id=challenge_id, expires_in_seconds=300),
        meta={'request_id': _request_id(request)},
    )


@router.post(
    '/pair/confirm',
    response_model=PairConfirmResponse,
    summary='Confirm pairing challenge',
    description=(
        'Validates the challenge ID and six-digit code.  Returns a '
        'cryptographically random client token exactly once.  The token '
        'must be stored securely by the caller — it will not be shown again.'
    ),
    responses={
        200: {'description': 'Pairing successful — client token returned'},
        401: {'model': ErrorResponse, 'description': 'Invalid challenge or code'},
        429: {'model': ErrorResponse, 'description': 'Too many pairing attempts'},
        503: {'model': ErrorResponse, 'description': 'Database unavailable'},
    },
)
async def pair_confirm(
    request: Request,
    body: PairConfirmRequest,
    db: Session | None = Depends(get_db_session),  # noqa: B008
) -> PairConfirmResponse:
    if not _pairing_limiter.allow(_PAIRING_RATE_KEY):
        from fastapi.exceptions import HTTPException

        raise HTTPException(status_code=429, detail='Too many pairing requests')

    if db is None:
        from fastapi.exceptions import HTTPException

        raise HTTPException(status_code=503, detail='Database unavailable')

    service = get_pairing_service()
    token = service.confirm_challenge(body.challenge_id, body.code, db)

    if token is None:
        from fastapi.exceptions import HTTPException

        raise HTTPException(status_code=401, detail='Invalid or expired challenge')

    return PairConfirmResponse(
        data=PairConfirmData(client_token=token),
        meta={'request_id': _request_id(request)},
    )


@router.post(
    '/pair/revoke',
    response_model=PairRevokeResponse,
    summary='Revoke client token',
    description=(
        'Invalidates the current paired client token.  After revocation, '
        'all protected endpoints require a new pairing.  Requires a valid '
        'client token.'
    ),
    responses={
        200: {'description': 'Token revoked'},
        401: {'model': ErrorResponse, 'description': 'Invalid or missing client token'},
        503: {'model': ErrorResponse, 'description': 'Database unavailable'},
    },
)
async def pair_revoke(
    request: Request,
    client_token: ClientTokenDep,
    db: Session | None = Depends(get_db_session),  # noqa: B008
) -> PairRevokeResponse:
    if db is None:
        from fastapi.exceptions import HTTPException

        raise HTTPException(status_code=503, detail='Database unavailable')

    service = get_pairing_service()
    service.revoke(db)

    return PairRevokeResponse(
        data=PairRevokeData(),
        meta={'request_id': _request_id(request)},
    )
