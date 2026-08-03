"""Request-scoped transaction boundary tests."""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.db.models import Setting
from app.db.session import SessionDep
from app.main import create_app


def _transaction_app(engine: Engine) -> FastAPI:
    app = create_app(initialize_db=False)
    app.state.db_engine = engine

    @app.post('/_test/commit')
    async def commit_probe(db: SessionDep) -> dict[str, str]:
        assert db is not None
        db.add(Setting(key='committed', value_json='{"schema_version":1}'))
        return {'status': 'ok'}

    @app.post('/_test/rollback')
    async def rollback_probe(db: SessionDep) -> None:
        assert db is not None
        db.add(Setting(key='rolled-back', value_json='{"schema_version":1}'))
        db.flush()
        raise RuntimeError('force request rollback')

    return app


def test_successful_request_commits(db_engine: Engine) -> None:
    with TestClient(_transaction_app(db_engine)) as client:
        assert client.post('/_test/commit').status_code == 200

    with Session(db_engine) as session:
        assert session.get(Setting, 'committed') is not None


def test_failed_request_rolls_back(db_engine: Engine) -> None:
    with TestClient(_transaction_app(db_engine), raise_server_exceptions=False) as client:
        response = client.post('/_test/rollback')
        assert response.status_code == 500

    with Session(db_engine) as session:
        assert session.get(Setting, 'rolled-back') is None
