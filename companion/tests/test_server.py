"""Tests for the project-owned loopback server entrypoint."""

from __future__ import annotations

import pytest

from app.server import build_server_config


def test_default_server_config_is_loopback() -> None:
    config = build_server_config()
    assert config.host == '127.0.0.1'
    assert config.port == 8765


@pytest.mark.parametrize('host', ['0.0.0.0', '::', '::0', '192.168.1.10', '10.0.0.2'])
def test_server_config_rejects_non_loopback_hosts(host: str) -> None:
    with pytest.raises(ValueError, match='loopback'):
        build_server_config(host=host)


@pytest.mark.parametrize('host', ['127.0.0.1', 'localhost', '::1'])
def test_server_config_accepts_supported_loopback_hosts(host: str) -> None:
    assert build_server_config(host=host).host == host
