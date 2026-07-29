"""Test fixtures for the companion test suite."""

from collections.abc import AsyncGenerator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.fixture(scope='session')
def app() -> FastAPI:
    """Return a configured FastAPI application instance."""
    return create_app()


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
