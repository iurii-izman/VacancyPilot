"""Structured logging with central secret redaction.

Every log call passes through the redaction filter before being emitted.
The filter strips authorization headers, tokens, keys, and contact fields
from log records, preventing accidental credential leakage even when a
handler logs a full request or response object.

Usage::

    from app.security.redaction import get_safe_logger
    logger = get_safe_logger(__name__)
    logger.info('pairing_started', extra={'challenge_id': cid})
"""

from __future__ import annotations

import logging
import re
from typing import Any

# ── Redaction patterns ───────────────────────────────────────────────────

# Header names whose values must be redacted from log output.
_REDACTED_HEADER_NAMES: set[str] = {
    'authorization',
    'x-vacancypilot-client',
    'x-api-key',
    'proxy-authorization',
    'cookie',
    'set-cookie',
}

# Field names in JSON/dict records whose values must be redacted.
_REDACTED_FIELD_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r'.*token.*',
        r'.*secret.*',
        r'.*password.*',
        r'.*credential.*',
        r'.*api[_-]?key.*',
        r'.*bearer.*',
        r'.*auth.*',
        r'.*email.*',
        r'.*phone.*',
        r'.*contact.*',
        r'.*access[_-]?key.*',
        r'.*refresh[_-]?key.*',
    ]
]

# Patterns for credential-bearing values (like URLs with embedded creds).
_CREDENTIAL_URL_PATTERN = re.compile(r'(https?://)[^@\s]+:([^@\s]+)@')

_REDACTED_PLACEHOLDER = '[REDACTED]'


def redact_header_value(header_name: str, value: str) -> str:
    """Return ``[REDACTED]`` for sensitive header names, else *value*."""
    if header_name.lower() in _REDACTED_HEADER_NAMES:
        return _REDACTED_PLACEHOLDER
    return value


def _field_is_sensitive(field_name: str) -> bool:
    return any(p.match(field_name) for p in _REDACTED_FIELD_PATTERNS)


def sanitize_dict(data: dict[str, Any], max_depth: int = 4) -> dict[str, Any]:
    """Recursively redact sensitive fields in a dictionary.

    Limits depth to *max_depth* to prevent runaway recursion.
    """
    if max_depth <= 0:
        return {'...': 'max_depth_exceeded'}

    result: dict[str, Any] = {}
    for key, value in data.items():
        if _field_is_sensitive(str(key)):
            result[key] = _REDACTED_PLACEHOLDER
        else:
            result[key] = _sanitize_value(value, max_depth - 1)
    return result


def _sanitize_value(value: Any, max_depth: int) -> Any:
    if max_depth <= 0 and isinstance(value, (dict, list, tuple)):
        return 'max_depth_exceeded'
    if isinstance(value, dict):
        return sanitize_dict(value, max_depth)
    if isinstance(value, list):
        return [_sanitize_value(item, max_depth) for item in value]
    if isinstance(value, tuple):
        return tuple(_sanitize_value(item, max_depth) for item in value)
    if isinstance(value, str):
        safe_url = _CREDENTIAL_URL_PATTERN.sub(
            r'\1' + _REDACTED_PLACEHOLDER + '@',
            value,
        )
        return RedactingFilter._redact_message(safe_url)
    return value


# ── Redacting log filter ─────────────────────────────────────────────────


class RedactingFilter(logging.Filter):
    """Log filter that sanitizes secrets from log records."""

    _SAFE_REQUEST_ID_PATTERN = re.compile(
        r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    )

    def filter(self, record: logging.LogRecord) -> bool:
        """Process record in-place: redact sensitive fields from msg/args/extra."""
        try:
            rendered = record.getMessage()
        except (TypeError, ValueError):
            rendered = str(record.msg)
        record.msg = self._redact_message(rendered)
        record.args = ()

        standard = logging.makeLogRecord({}).__dict__.keys()
        for key, value in list(record.__dict__.items()):
            if key not in standard and key not in {'message', 'asctime'}:
                if _field_is_sensitive(key):
                    record.__dict__[key] = _REDACTED_PLACEHOLDER
                else:
                    record.__dict__[key] = _sanitize_value(value, 4)

        return True

    @staticmethod
    def _redact_message(msg: str) -> str:
        """Apply pattern-based redaction to a plain-text message."""
        # Redact bearer tokens in messages
        msg = re.sub(
            r'Bearer\s+[^\s,;]+', f'Bearer {_REDACTED_PLACEHOLDER}', msg, flags=re.IGNORECASE
        )
        # Redact HH refresh/access token patterns
        msg = re.sub(r'refresh_token=[^\s&,;]+', f'refresh_token={_REDACTED_PLACEHOLDER}', msg)
        msg = re.sub(r'access_token=[^\s&,;]+', f'access_token={_REDACTED_PLACEHOLDER}', msg)
        # Redact API keys
        msg = re.sub(
            r'api[_-]?key[=:]\s*[^\s,;]+',
            f'api_key={_REDACTED_PLACEHOLDER}',
            msg,
            flags=re.IGNORECASE,
        )
        msg = re.sub(
            r'\b(access[_-]?token|refresh[_-]?token|token|secret|password|credential|'
            r'email|phone|contact)\b\s*[:=]\s*[^\s,;&]+',
            lambda match: f'{match.group(1)}={_REDACTED_PLACEHOLDER}',
            msg,
            flags=re.IGNORECASE,
        )
        msg = re.sub(
            r'\bsk-[A-Za-z0-9_-]{8,}\b',
            _REDACTED_PLACEHOLDER,
            msg,
            flags=re.IGNORECASE,
        )
        msg = _CREDENTIAL_URL_PATTERN.sub(r'\1' + _REDACTED_PLACEHOLDER + '@', msg)
        return msg


# ── Convenience logger factory ───────────────────────────────────────────


def get_safe_logger(name: str) -> logging.Logger:
    """Return a logger with the redacting filter attached."""
    logger = logging.getLogger(name)
    if not any(isinstance(f, RedactingFilter) for f in logger.filters):
        logger.addFilter(RedactingFilter())
    return logger


def install_redacting_filter() -> None:
    """Attach one redacting filter to the root logger and every root handler."""
    root = logging.getLogger()
    if not any(isinstance(item, RedactingFilter) for item in root.filters):
        root.addFilter(RedactingFilter())
    for handler in root.handlers:
        if not any(isinstance(item, RedactingFilter) for item in handler.filters):
            handler.addFilter(RedactingFilter())
