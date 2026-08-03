"""Loopback validation, CORS, body size, content-type, and rate-limit middleware."""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# ── Startup validation: refuse non-loopback binds ────────────────────────


def validate_loopback_bind(host: str) -> None:
    """Raise ``ValueError`` when *host* is not a loopback address.

    The companion must never bind to ``0.0.0.0`` or a public interface.
    """
    allowed = {'127.0.0.1', 'localhost', '::1'}
    if host not in allowed:
        raise ValueError(
            f'Refusing to bind to "{host}". '
            'The companion must bind only to a loopback address (127.0.0.1, localhost, or ::1).'
        )


# ── CORS builder ─────────────────────────────────────────────────────────


def build_cors_middleware(allowed_origins: list[str] | None = None) -> type[CORSMiddleware]:
    """Return CORSMiddleware configured for strict origin checking.

    No wildcard origins.  No credentialed CORS unless strictly justified.
    By default, allows only the extension origin.
    """

    class StrictCORSMiddleware(CORSMiddleware):
        def __init__(self, app: Any, **kwargs: Any) -> None:
            kwargs.setdefault('allow_origins', allowed_origins or [])
            kwargs.setdefault('allow_credentials', False)
            kwargs.setdefault('allow_methods', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
            kwargs.setdefault(
                'allow_headers',
                [
                    'Content-Type',
                    'X-VacancyPilot-Client',
                    'X-VacancyPilot-Request-ID',
                    'Idempotency-Key',
                ],
            )
            kwargs.setdefault('max_age', 600)
            super().__init__(app, **kwargs)

    return StrictCORSMiddleware  # type: ignore[return-value]


# ── Extension origin configuration ───────────────────────────────────────

# The extension origin is stable for the unpacked dev extension.
# Production would use the stable extension ID.
_DEFAULT_EXTENSION_ORIGIN = 'chrome-extension://vacancypilot-dev'


def get_configured_origins() -> list[str]:
    """Return the list of allowed CORS origins.

    Reads ``VACANCYPILOT_EXTENSION_ORIGINS`` (comma-separated) or falls
    back to the default dev extension origin.
    """
    import os

    env_val = os.environ.get('VACANCYPILOT_EXTENSION_ORIGINS', '').strip()
    if env_val:
        origins = [origin.strip().rstrip('/') for origin in env_val.split(',') if origin.strip()]
        if not origins:
            raise ValueError('VACANCYPILOT_EXTENSION_ORIGINS must contain an extension origin')
        for origin in origins:
            if (
                '*' in origin
                or not origin.startswith('chrome-extension://')
                or origin == 'chrome-extension://'
                or '/' in origin.removeprefix('chrome-extension://')
            ):
                raise ValueError(
                    'VACANCYPILOT_EXTENSION_ORIGINS accepts exact chrome-extension:// origins only'
                )
        return origins
    return [_DEFAULT_EXTENSION_ORIGIN]


# ── Request body size guard ──────────────────────────────────────────────

_MAX_BODY_BYTES = 1_048_576  # 1 MiB


class _BodyTooLargeError(Exception):
    pass


class BodySizeLimitMiddleware:
    """Enforce a cumulative request-body limit at the ASGI receive boundary."""

    def __init__(self, app: ASGIApp, max_bytes: int = _MAX_BODY_BYTES) -> None:
        self.app = app
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return

        request_id = str(scope.get('state', {}).get('request_id', 'unknown'))
        headers = {
            name.decode('latin-1').lower(): value.decode('latin-1')
            for name, value in scope.get('headers', [])
        }
        content_length = headers.get('content-length', '')
        if content_length.isdigit() and int(content_length) > self._max_bytes:
            await self._send_too_large(scope, receive, send, request_id)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message['type'] == 'http.request':
                received += len(message.get('body', b''))
                if received > self._max_bytes:
                    raise _BodyTooLargeError
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLargeError:
            await self._send_too_large(scope, receive, send, request_id)

    @staticmethod
    async def _send_too_large(
        scope: Scope,
        receive: Receive,
        send: Send,
        request_id: str,
    ) -> None:
        response = JSONResponse(
            status_code=413,
            content={
                'error': {
                    'code': 'PAYLOAD_TOO_LARGE',
                    'message': 'The request payload is too large',
                    'request_id': request_id,
                }
            },
            headers={'X-VacancyPilot-Request-ID': request_id},
        )
        await response(scope, receive, send)


# ── Content-type enforcement for JSON endpoints ──────────────────────────

# Paths that require ``application/json``.
_JSON_REQUIRED_PREFIXES = (
    '/api/v1/pair/',
    '/api/v1/hh/',
    '/api/v1/vacancies/',
    '/api/v1/applications/',
    '/api/v1/followups/',
    '/api/v1/backup/',
    '/api/v1/export/',
    '/api/v1/data/',
    '/api/v1/migration/',
)


class ContentTypeMiddleware(BaseHTTPMiddleware):
    """Enforce ``Content-Type: application/json`` on JSON-requiring endpoints.

    GET and HEAD requests are always allowed.  Other methods targeting
    JSON-required paths must send the correct Content-Type.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in ('GET', 'HEAD'):
            return await call_next(request)

        if _path_requires_json(request.url.path):
            content_type = request.headers.get('content-type', '')
            media_type = content_type.partition(';')[0].strip().lower()
            if media_type != 'application/json':
                request_id = getattr(request.state, 'request_id', 'unknown')
                return JSONResponse(
                    status_code=415,
                    content={
                        'error': {
                            'code': 'UNSUPPORTED_MEDIA_TYPE',
                            'message': 'The request media type is not supported. Use application/json.',  # noqa: E501
                            'request_id': request_id,
                        }
                    },
                    headers={'X-VacancyPilot-Request-ID': request_id},
                )

        return await call_next(request)


def _path_requires_json(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in _JSON_REQUIRED_PREFIXES)
