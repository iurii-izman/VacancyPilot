"""R5-B denominator and zero-data coverage."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.security.pairing import generate_client_token, hash_client_token


def test_analytics_zero_data_is_explicit(client_with_db: TestClient, db_session: Session) -> None:
    token = generate_client_token()
    db_session.execute(
        text(
            'INSERT INTO settings (key, value_json, revision, created_at, updated_at) '
            "VALUES ('pairing_client_token_hash', :v, 1, :n, :n)"
        ),
        {'v': hash_client_token(token), 'n': '2026-08-31T00:00:00Z'},
    )
    db_session.commit()
    response = client_with_db.get(
        '/api/v1/analytics/application-summary', headers={'X-VacancyPilot-Client': token}
    )
    if response.status_code == 404:
        pytest.skip('R5-B analytics route is not present on the R5-A branch')
    assert response.status_code == 200
    data = response.json()['data']
    assert data['state'] == 'NO_DATA'
    assert data['applications_applied'] == 0
    assert data['response_rate'] is None
