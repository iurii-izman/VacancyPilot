"""Database layer — SQLAlchemy engine, models, and session management."""

from app.db.base import Base
from app.db.engine import create_engine, get_session_factory
from app.db.models import *  # noqa: F403 — register all models with Base.metadata
from app.db.session import SessionDep, get_db_session

__all__ = ['Base', 'SessionDep', 'create_engine', 'get_db_session', 'get_session_factory']
