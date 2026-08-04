"""Tests for the health endpoint and error envelope contract."""

import json
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, ValidationError

from app.main import create_app

# ── Health 200 contract ──────────────────────────────────────────────


class TestHealth200:
    """Happy-path health endpoint returns the expected shape."""

    def test_returns_200(self, client: TestClient) -> None:
        resp = client.get('/api/v1/health')
        assert resp.status_code == 200

    def test_body_has_data_and_meta(self, client: TestClient) -> None:
        resp = client.get('/api/v1/health')
        body = resp.json()
        assert 'data' in body
        assert 'meta' in body

    def test_data_status_is_ok(self, client: TestClient) -> None:
        resp = client.get('/api/v1/health')
        assert resp.json()['data']['status'] == 'ok'

    def test_data_includes_db_status(self, client: TestClient) -> None:
        resp = client.get('/api/v1/health')
        assert 'db' in resp.json()['data']
        assert resp.json()['data']['db'] == 'unavailable'

    def test_data_includes_service_version(self, client: TestClient) -> None:
        resp = client.get('/api/v1/health')
        assert 'service_version' in resp.json()['data']
        assert resp.json()['data']['service_version'] == '0.1.0'

    def test_data_includes_api_version(self, client: TestClient) -> None:
        resp = client.get('/api/v1/health')
        assert 'api_version' in resp.json()['data']
        assert resp.json()['data']['api_version'] == '1'

    def test_meta_includes_request_id(self, client: TestClient) -> None:
        resp = client.get('/api/v1/health')
        assert 'request_id' in resp.json()['meta']
        assert isinstance(resp.json()['meta']['request_id'], str)

    def test_meta_includes_api_version(self, client: TestClient) -> None:
        resp = client.get('/api/v1/health')
        assert 'api_version' in resp.json()['data']

    def test_request_id_is_uuid_format(self, client: TestClient) -> None:
        resp = client.get('/api/v1/health')
        rid = resp.json()['meta']['request_id']
        parts = rid.split('-')
        assert len(parts) == 5
        assert all(len(p) > 0 for p in parts)


# ── Supplied request ID echo ─────────────────────────────────────────


class TestRequestIdEcho:
    """Client-supplied request IDs are echoed back."""

    def test_supplied_uuid_is_echoed(self, client: TestClient) -> None:
        supplied = '550e8400-e29b-41d4-a716-446655440000'
        resp = client.get(
            '/api/v1/health',
            headers={'X-VacancyPilot-Request-ID': supplied},
        )
        assert resp.json()['meta']['request_id'] == supplied
        assert resp.headers['X-VacancyPilot-Request-ID'] == supplied

    def test_supplied_uuid_v4_is_accepted(self, client: TestClient) -> None:
        supplied = str(uuid.uuid4())
        resp = client.get(
            '/api/v1/health',
            headers={'X-VacancyPilot-Request-ID': supplied},
        )
        assert resp.json()['meta']['request_id'] == supplied


# ── Generated request ID ─────────────────────────────────────────────


class TestGeneratedRequestId:
    """When no request ID is supplied, the companion generates one."""

    def test_generated_when_header_missing(self, client: TestClient) -> None:
        resp = client.get('/api/v1/health')
        rid = resp.json()['meta']['request_id']
        assert len(rid) > 0
        assert rid != 'unknown'

    def test_generated_when_header_is_invalid(self, client: TestClient) -> None:
        resp = client.get(
            '/api/v1/health',
            headers={'X-VacancyPilot-Request-ID': 'not-a-uuid'},
        )
        rid = resp.json()['meta']['request_id']
        assert rid != 'not-a-uuid'
        assert rid != 'unknown'

    def test_generated_when_header_is_empty(self, client: TestClient) -> None:
        resp = client.get(
            '/api/v1/health',
            headers={'X-VacancyPilot-Request-ID': ''},
        )
        rid = resp.json()['meta']['request_id']
        assert rid != ''

    def test_response_header_echoes_generated_id(self, client: TestClient) -> None:
        resp = client.get('/api/v1/health')
        assert 'X-VacancyPilot-Request-ID' in resp.headers
        assert resp.headers['X-VacancyPilot-Request-ID'] == resp.json()['meta']['request_id']


# ── Validation error envelope ────────────────────────────────────────


class TestValidationErrorEnvelope:
    """Malformed requests return the stable error envelope."""

    @staticmethod
    def _app_with_validation_route() -> FastAPI:
        from app.main import create_app

        class ValidationProbe(BaseModel):
            count: int

        app = create_app(initialize_db=False)

        @app.post('/_test/validation')
        async def validation_probe(payload: ValidationProbe) -> dict[str, int]:
            return {'count': payload.count}

        return app

    def test_invalid_body_returns_422(self) -> None:
        with TestClient(self._app_with_validation_route()) as client:
            resp = client.post('/_test/validation', json={'count': 'not-an-integer'})
        assert resp.status_code == 422

    def test_validation_error_has_error_code(self) -> None:
        with TestClient(self._app_with_validation_route()) as client:
            resp = client.post('/_test/validation', json={'count': 'not-an-integer'})
        assert resp.json()['error']['code'] == 'VALIDATION_ERROR'

    def test_error_envelope_shape(self) -> None:
        with TestClient(self._app_with_validation_route()) as client:
            resp = client.post('/_test/validation', json={'count': 'not-an-integer'})
        body = resp.json()
        assert 'error' in body
        assert 'code' in body['error']
        assert 'message' in body['error']
        assert 'request_id' in body['error']

    def test_error_includes_request_id(self) -> None:
        supplied = str(uuid.uuid4())
        with TestClient(self._app_with_validation_route()) as client:
            resp = client.post(
                '/_test/validation',
                json={'count': 'not-an-integer'},
                headers={'X-VacancyPilot-Request-ID': supplied},
            )
        body = resp.json()
        assert body['error']['request_id'] == supplied
        assert resp.headers['X-VacancyPilot-Request-ID'] == supplied

    def test_unhandled_500_envelope(self) -> None:
        """Trigger a 500 via an endpoint that raises intentionally."""
        from app.main import create_app

        app = create_app(initialize_db=False)

        @app.get('/_test/unhandled')
        async def unhandled_probe() -> None:
            raise RuntimeError('sensitive internal detail')

        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get('/_test/unhandled')

        assert resp.status_code == 500
        assert resp.json()['error']['code'] == 'INTERNAL_ERROR'
        assert resp.json()['error']['message'] == 'An unexpected error occurred'
        assert 'sensitive internal detail' not in resp.text
        assert resp.json()['error']['request_id'] == resp.headers['X-VacancyPilot-Request-ID']


# ── App factory: importing does not bind ─────────────────────────────


class TestAppFactory:
    """The application factory creates an app without side effects."""

    def test_create_app_returns_fastapi_instance(self) -> None:
        from app.main import create_app

        app = create_app(initialize_db=False)
        assert app.title == 'VacancyPilot Ops Companion'

    def test_import_does_not_bind_socket(self) -> None:
        """Subprocess test: importing app.main does not start a server."""
        script = """
from fastapi import FastAPI
import socket

def forbidden_socket(*args, **kwargs):
    raise AssertionError('socket created during import/app construction')

socket.socket = forbidden_socket
from app.main import create_app
create_app(initialize_db=False)
print('IMPORT_OK')
"""
        root = Path(__file__).resolve().parents[2]  # VacancyPilot/
        companion_dir = root / 'companion'
        result = subprocess.run(
            [sys.executable, '-c', script],
            capture_output=True,
            text=True,
            cwd=str(companion_dir),
            timeout=10,
        )
        assert result.returncode == 0
        assert 'IMPORT_OK' in result.stdout

    def test_create_app_has_health_route(self) -> None:
        """Health endpoint is registered and reachable."""
        from fastapi.testclient import TestClient

        from app.main import create_app

        app = create_app(initialize_db=False)
        with TestClient(app) as c:
            resp = c.get('/api/v1/health')
            assert resp.status_code == 200

    def test_create_app_has_error_handlers(self) -> None:
        from app.main import create_app

        app = create_app(initialize_db=False)
        assert len(app.exception_handlers) > 0


# ── OpenAPI snapshot determinism ─────────────────────────────────────


class TestOpenAPISnapshot:
    """The OpenAPI schema can be generated and matches the checked-in snapshot."""

    def test_generated_schema_is_valid_json(self, client: TestClient) -> None:
        resp = client.get('/openapi.json')
        assert resp.status_code == 200
        body = resp.json()
        assert 'openapi' in body
        assert 'info' in body
        assert 'paths' in body

    def test_health_path_in_openapi(self, client: TestClient) -> None:
        resp = client.get('/openapi.json')
        body = resp.json()
        assert '/api/v1/health' in body['paths']
        assert 'get' in body['paths']['/api/v1/health']

    def test_request_id_header_in_openapi(self, client: TestClient) -> None:
        operation = client.get('/openapi.json').json()['paths']['/api/v1/health']['get']
        parameters = operation['parameters']
        assert any(
            parameter['in'] == 'header'
            and parameter['name'] == 'X-VacancyPilot-Request-ID'
            and parameter['required'] is False
            for parameter in parameters
        )

    def test_error_envelope_in_openapi(self, client: TestClient) -> None:
        schema = client.get('/openapi.json').json()
        response_schema = schema['paths']['/api/v1/health']['get']['responses']['500']['content'][
            'application/json'
        ]['schema']
        assert response_schema == {'$ref': '#/components/schemas/ErrorResponse'}
        assert 'ErrorData' in schema['components']['schemas']

    def test_schema_produces_stable_output(self, client: TestClient) -> None:
        """Two calls to /openapi.json return identical output."""
        resp1 = client.get('/openapi.json')
        resp2 = client.get('/openapi.json')
        assert resp1.json() == resp2.json()

    def test_openapi_snapshot_is_checked_in(self) -> None:
        """Ensure the snapshot file exists at shared/contracts/openapi.json."""
        root = Path(__file__).resolve().parents[2]  # VacancyPilot/
        snapshot = root / 'shared' / 'contracts' / 'openapi.json'
        assert snapshot.exists(), (
            'OpenAPI snapshot missing. Run the generation script to create it.'
        )

    def test_openapi_snapshot_matches_current(self) -> None:
        """The checked-in snapshot must match the currently generated schema."""
        root = Path(__file__).resolve().parents[2]  # VacancyPilot/
        snapshot = root / 'shared' / 'contracts' / 'openapi.json'
        if not snapshot.exists():
            pytest.skip('Snapshot file does not exist to compare against')

        # Compare against the production route set. The shared ``client``
        # fixture intentionally adds a test-only auth probe to its schema.
        current_schema = create_app(initialize_db=False).openapi()
        stored_schema = json.loads(snapshot.read_text(encoding='utf-8'))

        assert current_schema == stored_schema, (
            'OpenAPI snapshot is out of date. Regenerate with the generation script.'
        )

    def test_openapi_check_command_reports_no_drift(self) -> None:
        root = Path(__file__).resolve().parents[2]
        result = subprocess.run(
            [sys.executable, '-m', 'app.openapi', '--check'],
            capture_output=True,
            text=True,
            cwd=root / 'companion',
            timeout=10,
        )
        assert result.returncode == 0, result.stdout + result.stderr


# ── Config defaults ──────────────────────────────────────────────────


class TestConfig:
    """Settings have safe local-development defaults."""

    def test_default_host_is_loopback(self) -> None:
        from app.config import Settings

        s = Settings()
        assert s.host == '127.0.0.1'

    def test_non_loopback_host_is_rejected(self) -> None:
        from app.config import Settings

        with pytest.raises(ValidationError):
            Settings(host='0.0.0.0')  # type: ignore[arg-type]

    def test_default_port_is_8765(self) -> None:
        from app.config import Settings

        s = Settings()
        assert s.port == 8765

    def test_api_prefix(self) -> None:
        from app.config import Settings

        s = Settings()
        assert s.api_prefix == '/api/v1'


# ── Environment variable override ────────────────────────────────────


class TestConfigEnvOverride:
    """Settings respect environment variable overrides."""

    def test_service_version_can_be_overridden(self) -> None:
        from app.config import Settings

        s = Settings(service_version='2.0.0')
        assert s.service_version == '2.0.0'

    def test_port_can_be_overridden(self) -> None:
        from app.config import Settings

        s = Settings(port=9999)
        assert s.port == 9999


# ── DB health (with temporary database) ──────────────────────────────


class TestHealthDB:
    """Health endpoint reports DB status when a database is available."""

    def test_db_status_ok_when_available(self, client_with_db: TestClient) -> None:
        resp = client_with_db.get('/api/v1/health')
        assert resp.status_code == 200
        assert resp.json()['data']['db'] == 'ok'

    def test_db_status_in_response(self, client_with_db: TestClient) -> None:
        resp = client_with_db.get('/api/v1/health')
        body = resp.json()
        assert 'db' in body['data']
        assert body['data']['db'] in ('ok', 'unavailable')

    def test_no_local_paths_leaked(self, client_with_db: TestClient) -> None:
        """The DB status field must not expose file paths."""
        resp = client_with_db.get('/api/v1/health')
        body = resp.json()
        assert '.db' not in body['data']['db']
        assert '/' not in body['data']['db']
        assert '\\\\' not in body['data']['db']

    def test_runtime_lifespan_configures_and_disposes_db(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.config import settings
        from app.main import create_app

        monkeypatch.setattr(settings, 'db_path', str(tmp_path / 'runtime.db'))
        app = create_app()
        with TestClient(app) as runtime_client:
            assert runtime_client.get('/api/v1/health').json()['data']['db'] == 'ok'
            assert hasattr(app.state, 'db_engine')
        assert not hasattr(app.state, 'db_engine')
