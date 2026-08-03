"""Domain invariants enforced at the repository boundary.

These are not just comments — each invariant is testable and is
verified by the test suite.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import DeclarativeBase, Session

# ── Secret column detection ────────────────────────────────────────────

# Columns whose name matches any of these patterns are treated as
# potential secret-bearing and MUST NOT exist in domain tables.
_SECRET_NAME_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r'.*secret.*',
        r'(?:access|refresh|bearer|auth|client|api)[_-]?token',
        r'password',
        r'credential',
        r'api[_-]?key',
        r'bearer',
        r'auth[_-]?header',
    ]
]


def _column_looks_like_secret(name: str) -> bool:
    return any(p.match(name) for p in _SECRET_NAME_PATTERNS)


def ensure_no_secret_columns(base: type[DeclarativeBase]) -> list[str]:
    """Return a list of secret-like column qualified names found.

    An empty list means the schema is clean.  This is a safety gate,
    not a runtime check — it should be called in tests.
    """
    violations: list[str] = []
    for table_name, table in sorted(base.metadata.tables.items()):
        for col in table.columns:
            if _column_looks_like_secret(str(col.name)):
                violations.append(f'{table_name}.{col.name}')
    return violations


# ── Append-only guard ──────────────────────────────────────────────────

_APPEND_ONLY_TABLES = frozenset(
    {
        'application_events',
        'engine_runs',
        'evidence_usage',
        'letter_versions',
        'vacancy_snapshots',
        'hh_sync_runs',
    }
)


@event.listens_for(Session, 'before_flush')
def _protect_append_only_rows(
    session: Session,
    _flush_context: Any,
    _instances: Any,
) -> None:
    """Reject ORM updates/deletes of append-only records."""
    for instance in session.deleted:
        table_name = inspect(instance).mapper.local_table.name
        if table_name in _APPEND_ONLY_TABLES:
            ensure_append_only(table_name)

    for instance in session.dirty:
        table_name = inspect(instance).mapper.local_table.name
        if table_name in _APPEND_ONLY_TABLES and session.is_modified(
            instance,
            include_collections=False,
        ):
            ensure_append_only(table_name)


def ensure_append_only(table_name: str) -> None:
    """Raises ``ValueError`` when *table_name* does not support mutations.

    Call this inside repository methods that would otherwise accept
    UPDATE/DELETE on append-only tables.
    """
    if table_name in _APPEND_ONLY_TABLES:
        raise ValueError(
            f"Table '{table_name}' is append-only. "
            'Rows may be inserted but not updated or deleted through repository APIs.'
        )


# ── Sent-letter immutability ───────────────────────────────────────────


def ensure_sent_immutable(version_type: str | None, current_version_type: str) -> None:
    """Raise ``ValueError`` when trying to mutate an already-sent version."""
    if current_version_type == 'sent':
        raise ValueError('Sent letter versions are immutable and cannot be overwritten.')
