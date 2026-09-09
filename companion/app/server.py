"""Project-owned loopback server entrypoint for VacancyPilot Companion."""

from __future__ import annotations

import argparse

import uvicorn

from app.config import settings
from app.main import create_app
from app.security.middleware import validate_loopback_bind


def build_server_config(
    host: str | None = None,
    port: int | None = None,
) -> uvicorn.Config:
    """Build a Uvicorn config only after validating the effective bind."""
    effective_host = host or settings.host
    effective_port = settings.port if port is None else port
    validate_loopback_bind(effective_host)
    if not 1 <= effective_port <= 65535:
        raise ValueError(f'Refusing to bind to invalid port: {effective_port}')
    return uvicorn.Config(
        create_app(),
        host=effective_host,
        port=effective_port,
        log_level=settings.log_level,
    )


def run_server(host: str | None = None, port: int | None = None) -> None:
    """Run the application using the validated project-owned configuration."""
    uvicorn.Server(build_server_config(host=host, port=port)).run()


def main(argv: list[str] | None = None) -> int:
    """Parse optional local overrides and start the Companion."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default=None, help='loopback host (default: 127.0.0.1)')
    parser.add_argument('--port', type=int, default=None, help='local TCP port (default: 8765)')
    args = parser.parse_args(argv)
    try:
        run_server(host=args.host, port=args.port)
    except ValueError as error:
        parser.error(str(error))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
