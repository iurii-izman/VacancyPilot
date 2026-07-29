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

from app.api.errors import (
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.api.health import router as health_router
from app.config import settings
from app.observability.request_context import RequestContextMiddleware


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Graceful startup/shutdown hooks.

    Startup: no network calls, no DB connections yet — ready for later
    SQLite engine boot.
    Shutdown: clean teardown placeholder for future DB/services.
    """
    # Startup — intentionally minimal; no imports trigger network I/O.
    yield
    # Shutdown — placeholder for graceful DB/service teardown.


def create_app() -> FastAPI:
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

    # Middleware — request ID must be available before any handler runs.
    app.add_middleware(RequestContextMiddleware)

    # Routes
    app.include_router(health_router, prefix=settings.api_prefix)

    # Error handlers
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)

    return app
