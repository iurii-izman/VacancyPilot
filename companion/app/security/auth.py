"""Auth dependency for protected companion routes.

Every non-public, non-pairing route depends on ``require_client_token``.
The dependency reads the ``X-VacancyPilot-Client`` header and verifies
it against the stored hash via the pairing service.

Routes that need a DB session should also inject ``get_db_session``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request, Security
from fastapi.exceptions import HTTPException
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.security.pairing import hash_client_token
from app.security.rate_limit import PROTECTED_RATE_LIMIT, RateLimiter

_client_header = APIKeyHeader(name='X-VacancyPilot-Client', auto_error=False)
_protected_limiter = RateLimiter(config=PROTECTED_RATE_LIMIT)


def _require_client_header(
    request: Request,
    x_vacancypilot_client: str | None = Security(_client_header),
    db: Session | None = Depends(get_db_session),  # noqa: B008
) -> str:
    """Return the verified raw client token, or raise 401.

    Stores the validated token on ``request.state`` so downstream
    handlers know the authenticated client identity without repeating
    the human-readable token elsewhere.
    """
    from app.security.pairing import get_pairing_service

    if db is None:
        raise HTTPException(status_code=503, detail='Database unavailable')

    if not x_vacancypilot_client:
        raise HTTPException(status_code=401, detail='Missing client token header')

    # Bound check before hashing — safety against oversized headers.
    if len(x_vacancypilot_client.encode('utf-8')) > 512:
        raise HTTPException(status_code=401, detail='Client token exceeds maximum length')

    service = get_pairing_service()
    if not service.verify_token(x_vacancypilot_client, db):
        raise HTTPException(status_code=401, detail='Invalid client token')

    # Store a non-reversible representation on request state so downstream
    # handlers can check "was this request authenticated?" without the raw token.
    client_token_hash = hash_client_token(x_vacancypilot_client)
    if not _protected_limiter.allow(client_token_hash):
        raise HTTPException(status_code=429, detail='Too many protected requests')
    request.state.client_token_hash = client_token_hash

    return client_token_hash


# Reusable type for route signatures.
ClientTokenDep = Annotated[str, Depends(_require_client_header)]
