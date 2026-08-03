"""Test fixtures for the companion test suite."""

from __future__ import annotations

import os
import tempfile
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.engine import create_engine
from app.main import create_app
from app.security.auth import ClientTokenDep

# ── Temporary SQLite database fixtures ─────────────────────────────────


@pytest.fixture(scope='function')
def tmp_db_path() -> Generator[Path, None, None]:
    """Create a temporary SQLite database file.

    The file is deleted after the test regardless of outcome.
    """
    fd, raw = tempfile.mkstemp(suffix='.db', prefix='vacancypilot_test_')
    os.close(fd)
    path = Path(raw)
    try:
        yield path
    finally:
        path.unlink(missing_ok=True)


@pytest.fixture(scope='function')
def db_engine(tmp_db_path: Path) -> Generator[Engine, None, None]:
    """Create a SQLAlchemy engine for a temporary SQLite database.

    Foreign keys and WAL are enabled.  The engine is disposed after the test.
    """
    engine = create_engine(tmp_db_path)

    # Create all tables so schema-inspection tests work.
    Base.metadata.create_all(engine)

    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture(scope='function')
def db_session(db_engine: Engine) -> Generator[Session, None, None]:
    """Create all tables and yield a transactional session.

    The session is rolled back and closed after the test.
    """
    Base.metadata.create_all(db_engine)

    factory = sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)
    session = factory()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


# ── FastAPI / TestClient fixtures ──────────────────────────────────────


def _add_security_test_route(app: FastAPI) -> None:
    """Mount an auth probe only in tests, never in the production factory."""

    @app.get(
        '/api/v1/_test/protected',
        include_in_schema=True,
        responses={
            401: {'description': 'Invalid or missing client token'},
            429: {'description': 'Protected request rate limit exceeded'},
            503: {'description': 'Database unavailable'},
        },
    )
    async def protected_test_route(
        request: Request,
        client_identity: ClientTokenDep,
    ) -> dict[str, object]:
        return {
            'data': {'message': 'Authenticated'},
            'meta': {'request_id': str(request.state.request_id)},
        }


@pytest.fixture(scope='function', autouse=True)
def reset_security_state() -> Generator[None, None, None]:
    """Keep module-level security state isolated between focused tests."""
    from app.api.pairing import _pairing_limiter
    from app.security.auth import _protected_limiter
    from app.security.pairing import get_pairing_service

    _pairing_limiter.reset()
    _protected_limiter.reset()
    get_pairing_service()._challenges.clear()
    yield
    _pairing_limiter.reset()
    _protected_limiter.reset()
    get_pairing_service()._challenges.clear()


@pytest.fixture(scope='session')
def app() -> FastAPI:
    """Return a configured FastAPI application instance."""
    instance = create_app(initialize_db=False)
    _add_security_test_route(instance)
    return instance


@pytest.fixture(scope='session')
def client(app: FastAPI) -> TestClient:
    """Return a synchronous FastAPI TestClient."""
    return TestClient(app)


@pytest.fixture(scope='session')
async def async_client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Return an async httpx client bound to the ASGI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as ac:
        yield ac


# ── App with temporary DB injected ─────────────────────────────────────


@pytest.fixture(scope='function')
def app_with_db(db_engine: Engine) -> Generator[FastAPI, None, None]:
    """Return a FastAPI app whose health endpoint uses the temporary DB."""
    Base.metadata.create_all(db_engine)
    app = create_app(initialize_db=False)
    _add_security_test_route(app)
    app.state.db_engine = db_engine
    yield app


@pytest.fixture(scope='function')
def client_with_db(app_with_db: FastAPI) -> TestClient:
    """Return a TestClient bound to an app with a temporary DB."""
    return TestClient(app_with_db)
