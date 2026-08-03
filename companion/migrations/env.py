"""Alembic environment configuration.

Resolves the database URL at runtime from the same engine factory used
by the application, ensuring migrations always target the correct file.
"""

from __future__ import annotations

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.db.base import Base, register_sqlite_pragmas
from app.db.models import *  # noqa: F403 — ensure all models are imported


def _build_sqlite_url() -> str:
    """Build a SQLite URL matching the companion engine factory."""
    import os
    from pathlib import Path

    env_path = os.environ.get('VACANCYPILOT_DB_PATH', '').strip()
    if env_path:
        target = Path(env_path)
    else:
        companion_root = Path(__file__).resolve().parents[1]
        target = companion_root / 'data' / 'vacancypilot.db'

    target.parent.mkdir(parents=True, exist_ok=True)
    return f'sqlite:///{target.resolve().as_posix()}'


# Alembic Config object
config = context.config

# Override the placeholder URL
config.set_main_option('sqlalchemy.url', _build_sqlite_url())

# Interpret the config file for Python logging
if config.config_file_name is not None:
    from logging.config import fileConfig

    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a connection)."""
    url = config.get_main_option('sqlalchemy.url')
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={'paramstyle': 'named'},
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix='sqlalchemy.',
        poolclass=pool.NullPool,
    )

    # Enable foreign keys on every migration connection.
    register_sqlite_pragmas(connectable)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
