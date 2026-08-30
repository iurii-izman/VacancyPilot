"""VacancyPilot Ops Companion — FastAPI application factory.

No side effects on import. The factory creates and returns a configured
FastAPI application. Call ``create_app()`` and then start it with uvicorn.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.analysis.service import EnginePackageUnavailableError
from app.api.analysis import router as analysis_router
from app.api.engine import router as engine_router
from app.api.errors import (
    engine_package_unavailable_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.api.health import router as health_router
from app.api.migration import router as migration_router
from app.api.pairing import router as pairing_router
from app.api.vacancies import router as vacancies_router
from app.config import settings
from app.db import Base  # noqa: F401 — register models with metadata
from app.db.engine import create_engine
from app.observability.request_context import RequestContextMiddleware
from app.security.middleware import (
    BodySizeLimitMiddleware,
    ContentTypeMiddleware,
    build_cors_middleware,
    get_configured_origins,
    validate_loopback_bind,
)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Graceful startup/shutdown hooks.

    Startup validates the loopback binding, creates the local SQLite engine
    when runtime initialization is enabled, and configures the security logger.

    Shutdown disposes only an engine owned by this application.
    """
    # Validate binding before accepting any connections.
    validate_loopback_bind(settings.host)

    # Configure the root logger with redaction.
    from app.security.redaction import install_redacting_filter

    install_redacting_filter()

    owned_engine = None
    if app.state.initialize_db:
        owned_engine = create_engine()
        app.state.db_engine = owned_engine
    try:
        yield
    finally:
        if owned_engine is not None:
            owned_engine.dispose()
            del app.state.db_engine


def create_app(*, initialize_db: bool = True) -> FastAPI:
    """Build and return the configured FastAPI application.

    Does not bind a socket or make network calls.
    """
    app = FastAPI(
        title='VacancyPilot Ops Companion',
        version=settings.service_version,
        lifespan=_lifespan,
        openapi_url='/openapi.json',
        docs_url=None,
        redoc_url=None,
    )
    app.state.initialize_db = initialize_db

    # Starlette executes the last added middleware first. CORS is outermost
    # so valid OPTIONS preflights are answered before JSON enforcement.
    app.add_middleware(ContentTypeMiddleware)
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(RequestContextMiddleware)
    cors_middleware_class = build_cors_middleware(get_configured_origins())
    app.add_middleware(cors_middleware_class)

    # Routes
    api_prefix = settings.api_prefix
    app.include_router(health_router, prefix=api_prefix)
    app.include_router(pairing_router, prefix=api_prefix)
    app.include_router(migration_router, prefix=api_prefix)
    app.include_router(vacancies_router, prefix=api_prefix)
    app.include_router(analysis_router, prefix=api_prefix)
    app.include_router(engine_router, prefix=api_prefix)

    # Error handlers
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(EnginePackageUnavailableError, engine_package_unavailable_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    return app
