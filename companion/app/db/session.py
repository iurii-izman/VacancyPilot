"""FastAPI dependency for database sessions.

Usage in route handlers::

    from fastapi import Depends
    from app.db.session import get_db_session, SessionDep

    @router.get('/example')
    async def example(db: SessionDep = Depends(get_db_session)):
        ...

For tests, set ``app.state.db_engine`` before the first request to use a
temporary database.  When no engine is configured the dependency returns
``None`` so endpoints can degrade gracefully.
"""

from __future__ import annotations

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session


def _resolve_engine(request: Request) -> Engine | None:
    """Return the engine stored on app state, or None."""
    engine: Engine | None = getattr(request.app.state, 'db_engine', None)
    return engine


def get_db_session(request: Request) -> Generator[Session | None, None, None]:
    """Yield a SQLAlchemy ``Session`` for the current request, or ``None``.

    When no engine is configured on ``app.state.db_engine`` the dependency
    yields ``None`` and the caller should handle the unavailable state.

    The request is the transaction boundary: successful handlers commit,
    failures roll back, and the session always closes.
    """
    engine = _resolve_engine(request)
    if engine is None:
        yield None
        return

    from sqlalchemy.orm import sessionmaker as _sessionmaker

    factory = _sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


SessionDep = Annotated[Session | None, Depends(get_db_session)]


def get_db_session_long(request: Request) -> Generator[Session | None, None, None]:
    """Yield a session suitable for longer-running migration operations.

    Differs from ``get_db_session`` only in that it does not auto-commit
    on success — the caller manages the transaction boundary explicitly.
    """
    engine = _resolve_engine(request)
    if engine is None:
        yield None
        return

    from sqlalchemy.orm import sessionmaker as _sessionmaker

    factory = _sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = factory()
    try:
        yield session
    finally:
        session.close()
