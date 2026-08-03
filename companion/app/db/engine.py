"""SQLite engine and session factory.

The companion uses WAL mode for concurrent reads. The database file
location is controlled by ``VACANCYPILOT_DB_PATH`` (default:
``<companion>/data/vacancypilot.db``).
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine as _create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db.base import register_sqlite_pragmas


def _resolve_db_path() -> Path:
    """Return the absolute database file path.

    Honour ``VACANCYPILOT_DB_PATH`` when set; otherwise use the default
    companion data directory.
    """
    configured_path = settings.db_path.strip()
    if configured_path:
        path = Path(configured_path)
    else:
        # Default: <companion>/data/vacancypilot.db
        companion_root = Path(__file__).resolve().parents[2]
        path = companion_root / 'data' / 'vacancypilot.db'

    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _build_db_url(path: Path) -> str:
    """Return the SQLAlchemy-compatible SQLite URL."""
    # Use absolute path with forward slashes to avoid URI encoding issues.
    abs_path = path.resolve().as_posix()
    return f'sqlite:///{abs_path}'


def create_engine(db_path: Path | None = None) -> Engine:
    """Create a configured SQLAlchemy SQLite engine.

    The engine is created with:
    - WAL journal mode (better concurrent read performance)
    - busy timeout of 5 s to tolerate brief write contention
    - ``check_same_thread`` disabled (SQLAlchemy manages its own pool)
    - Foreign keys enforced on every connection
    """
    path = db_path or _resolve_db_path()
    url = _build_db_url(path)

    engine = _create_engine(
        url,
        echo=False,
        connect_args={
            'check_same_thread': False,
            'timeout': 5,  # busy timeout in seconds; sync with PRAGMA below
        },
    )

    # Register before the first connection so pooled connections cannot bypass
    # foreign-key enforcement or the concurrency PRAGMAs.
    register_sqlite_pragmas(engine)

    return engine


def get_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Return a configured ``sessionmaker`` bound to *engine*."""
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
