"""Declarative base with UTC timestamp and UUID helpers."""

from __future__ import annotations

import uuid as _uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> str:
    """Return a canonical second-precision UTC timestamp for SQLite TEXT columns."""
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def new_uuid() -> str:
    """Generate a stable application UUID4 for primary keys."""
    return str(_uuid.uuid4())


class Base(DeclarativeBase):
    """Common declarative base for all domain models."""

    pass


class TimestampMixin:
    """Add ``created_at`` and ``updated_at`` with UTC defaults.

    Models that mix this in must also extend ``Base``.
    """

    created_at: Mapped[str] = mapped_column(default=utcnow)
    updated_at: Mapped[str] = mapped_column(default=utcnow, onupdate=utcnow)


def _configure_sqlite_connection(connection: Any, _connection_record: Any) -> None:
    """Configure every SQLite DBAPI connection before it enters the pool.

    The *connection* argument is a raw DBAPI connection passed by
    SQLAlchemy's event system, not a SQLAlchemy ``Connection``.
    """
    cursor = connection.cursor()
    try:
        cursor.execute('PRAGMA foreign_keys = ON')
        cursor.execute('PRAGMA busy_timeout = 5000')
        cursor.execute('PRAGMA journal_mode = WAL')
    finally:
        cursor.close()


def register_sqlite_pragmas(engine: Any) -> None:
    """Attach per-connection PRAGMAs to *engine*."""
    event.listen(engine, 'connect', _configure_sqlite_connection)
