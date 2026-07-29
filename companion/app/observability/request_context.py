"""Per-request context: request ID acceptance and generation.

The companion accepts an optional ``X-VacancyPilot-Request-ID`` header
from the client. When absent, it generates a UUID4 request ID. The ID
is echoed in every response and is available to error handlers so that
sanitised error envelopes always include it.
"""

import re
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# UUIDs are allowed for client-supplied IDs; companion generates UUID4 when it must.
# The format check accepts standard hex-and-hyphens UUIDs only to avoid injection.
_REQUEST_ID_PATTERN = re.compile(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)

_REQUEST_ID_HEADER = 'X-VacancyPilot-Request-ID'
_RESPONSE_ID_HEADER = 'X-VacancyPilot-Request-ID'
_MAX_HEADER_BYTES = 256


def generate_request_id() -> str:
    """Generate a safe UUID4 request ID."""
    return str(uuid.uuid4())


def is_valid_request_id(value: str) -> bool:
    """Return True when *value* looks like a well-formed UUID."""
    return bool(_REQUEST_ID_PATTERN.match(value))


def _sanitise_header_value(value: str) -> str | None:
    """Return a trimmed, length-checked value or None."""
    raw = value.strip()
    if len(raw.encode('utf-8')) > _MAX_HEADER_BYTES:
        return None
    return raw or None


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach a canonical request ID to every request.

    - Accepts client-supplied ``X-VacancyPilot-Request-ID`` (UUID format).
    - Generates a UUID4 when the client header is absent or invalid.
    - Stores the resolved ID in ``request.state.request_id``.
    - Echoes the ID back in the ``X-VacancyPilot-Request-ID`` response header.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        header_value = request.headers.get(_REQUEST_ID_HEADER, '')
        sanitised = _sanitise_header_value(header_value)

        request_id: str
        if sanitised and is_valid_request_id(sanitised):
            request_id = sanitised
        else:
            request_id = generate_request_id()

        request.state.request_id = request_id

        response = await call_next(request)
        response.headers[_RESPONSE_ID_HEADER] = request_id
        return response
