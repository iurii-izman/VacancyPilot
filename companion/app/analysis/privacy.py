"""Allowlist-first sanitisation for provider-bound dynamic values."""

from __future__ import annotations

import re
from typing import Any

from app.analysis.models import ProviderInputPolicy

_EMAIL_RE = re.compile(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}', re.UNICODE)
_URL_RE = re.compile(r'https?://[^\s<>"{}|\\^`\[\]]+', re.IGNORECASE)
_PHONE_PATTERNS = (
    re.compile(r'(?:\+7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}'),
    re.compile(r'\+\d{1,3}[\s\-]*\d{2,4}[\s\-]*\d{2,4}[\s\-]*\d{2,4}[\s\-]*\d{2,4}'),
    re.compile(r'(?<!\d)8\d{10}(?!\d)'),
)
_TOKEN_PATTERNS = (
    re.compile(r'eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+'),
    re.compile(r'\b[a-z]{2,4}_[A-Za-z0-9]{20,}\b'),
    re.compile(r'\b[A-Fa-f0-9]{40,}\b'),
    re.compile(r'bearer\s+[A-Za-z0-9._\-]+', re.IGNORECASE),
    re.compile(r'(?:session|csrf)[=:]\s*[A-Za-z0-9_\-]+', re.IGNORECASE),
)


def redact_provider_text(value: str, policy: ProviderInputPolicy) -> str:
    """Redact string leaves before any length bound is applied."""
    result = _URL_RE.sub('[url redacted]', value)
    result = _EMAIL_RE.sub('[email redacted]', result) if policy.redact_contacts else result
    if policy.redact_contacts:
        for pattern in _PHONE_PATTERNS:
            result = pattern.sub('[phone redacted]', result)
    for pattern in _TOKEN_PATTERNS:
        result = pattern.sub('[token redacted]', result)
    return result


def truncate_provider_text(value: str, max_chars: int) -> str:
    """Bound a redacted value while retaining a whole-word boundary."""
    if len(value) <= max_chars:
        return value
    cut = value[:max_chars]
    last_space = cut.rfind(' ')
    if last_space > max_chars * 0.8:
        cut = cut[:last_space]
    return f'{cut}…'


def sanitize_provider_value(
    value: Any,
    policy: ProviderInputPolicy,
    *,
    max_chars: int | None = None,
    max_depth: int = 8,
) -> Any:
    """Recursively sanitise values that have already passed an allowlist.

    Unknown keys must be filtered by the caller before invoking this helper;
    recursion here prevents a nested string leaf from bypassing redaction.
    """
    if max_depth <= 0:
        return '[nested value omitted]'
    if isinstance(value, str):
        safe = redact_provider_text(value, policy)
        return truncate_provider_text(safe, max_chars) if max_chars else safe
    if isinstance(value, list):
        return [
            sanitize_provider_value(item, policy, max_chars=max_chars, max_depth=max_depth - 1)
            for item in value
        ]
    if isinstance(value, tuple):
        return [
            sanitize_provider_value(item, policy, max_chars=max_chars, max_depth=max_depth - 1)
            for item in value
        ]
    if isinstance(value, dict):
        return {
            str(key): sanitize_provider_value(
                item, policy, max_chars=max_chars, max_depth=max_depth - 1
            )
            for key, item in value.items()
        }
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return str(value)
