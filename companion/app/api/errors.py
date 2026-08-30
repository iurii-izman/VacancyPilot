"""Stable JSON error envelopes for validation and server errors."""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

_REQUEST_ID_HEADER = 'X-VacancyPilot-Request-ID'


class ErrorData(BaseModel):
    """Sanitized error payload used by every API error response."""

    code: str
    message: str
    request_id: str
    details: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    """Stable v1 error envelope."""

    error: ErrorData


def _get_request_id(request: Request) -> str:
    """Safely extract the request ID stored by the middleware."""
    return getattr(request.state, 'request_id', 'unknown')


def _build_error_body(
    code: str,
    message: str,
    request_id: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        'error': {
            'code': code,
            'message': message,
            'request_id': request_id,
        }
    }
    if details:
        body['error']['details'] = details
    return body


def _error_response(status_code: int, body: dict[str, Any], request_id: str) -> JSONResponse:
    """Return an error envelope with the request ID echoed in the header."""
    return JSONResponse(
        status_code=status_code,
        content=body,
        headers={_REQUEST_ID_HEADER: request_id},
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Map FastAPI/pydantic validation errors to the stable error envelope."""
    request_id = _get_request_id(request)

    # Collect only field locations and machine-readable error types. Pydantic
    # messages and raw inputs are intentionally excluded because future
    # request bodies can contain candidate or provider data.
    safe_errors: list[dict[str, Any]] = []
    for err in exc.errors():
        safe_errors.append(
            {
                'loc': list(err.get('loc', [])),
                'type': err.get('type', ''),
            }
        )

    body = _build_error_body(
        code='VALIDATION_ERROR',
        message='Request validation failed',
        request_id=request_id,
        details={'errors': safe_errors},
    )
    return _error_response(422, body, request_id)


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Map Starlette HTTP exceptions to the stable error envelope."""
    request_id = _get_request_id(request)

    # Use stable, sanitized messages rather than reflecting arbitrary
    # exception details into the response.
    error_map: dict[int, tuple[str, str]] = {
        400: ('BAD_REQUEST', 'The request could not be processed'),
        401: ('UNAUTHORIZED', 'Authentication is required'),
        403: ('FORBIDDEN', 'The request is not allowed'),
        404: ('NOT_FOUND', 'The requested resource was not found'),
        405: ('METHOD_NOT_ALLOWED', 'The request method is not allowed'),
        409: ('CONFLICT', 'The request conflicts with current state'),
        413: ('PAYLOAD_TOO_LARGE', 'The request payload is too large'),
        415: ('UNSUPPORTED_MEDIA_TYPE', 'The request media type is not supported'),
        429: ('RATE_LIMIT_EXCEEDED', 'Too many requests'),
        503: ('SERVICE_UNAVAILABLE', 'The local service is unavailable'),
    }
    error_code, message = error_map.get(
        exc.status_code,
        ('HTTP_ERROR', 'The request could not be completed'),
    )
    # Letter import validation is a documented machine-readable outcome.  Do
    # not reflect user-provided provider text; expose only this fixed code.
    if exc.status_code == 422 and exc.detail == 'IMPORT_INVALID':
        error_code, message = ('IMPORT_INVALID', 'Imported response failed local validation')

    body = _build_error_body(
        code=error_code,
        message=message,
        request_id=request_id,
    )
    return _error_response(exc.status_code, body, request_id)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all: return a sanitised 500 envelope without leaking internals."""
    request_id = _get_request_id(request)
    body = _build_error_body(
        code='INTERNAL_ERROR',
        message='An unexpected error occurred',
        request_id=request_id,
    )
    return _error_response(500, body, request_id)


async def engine_package_unavailable_handler(request: Request, exc: Any) -> JSONResponse:
    """Map EnginePackageUnavailable to a 409 envelope with a safe reason.

    The exception message is built by the service and contains only sanitized,
    non-private information (error codes and filenames) — never candidate
    content — so it is safe to expose.
    """
    request_id = _get_request_id(request)
    body = _build_error_body(
        code='ENGINE_PACKAGE_UNAVAILABLE',
        message=str(exc),
        request_id=request_id,
    )
    return _error_response(409, body, request_id)
