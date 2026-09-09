"""Root-relative local runtime and private-package path contracts."""

from __future__ import annotations

from pathlib import Path

from app.config import (
    resolve_engine_package_root,
    resolve_local_companion_root,
    resolve_private_engine_source,
    settings,
)
from app.db.engine import _resolve_db_path


def test_default_local_paths_are_inside_repository(monkeypatch) -> None:
    monkeypatch.setattr(settings, 'engine_package_root', '')
    monkeypatch.setattr(settings, 'db_path', '')

    repository_root = Path(__file__).resolve().parents[2]
    local_root = repository_root / '.local'

    assert resolve_local_companion_root() == local_root / 'data' / 'companion'
    assert resolve_private_engine_source() == local_root / 'private-engine'
    assert resolve_engine_package_root() == local_root / 'data' / 'companion' / 'engine'
    assert _resolve_db_path() == local_root / 'data' / 'companion' / 'vacancypilot.db'


def test_explicit_overrides_remain_supported(monkeypatch, tmp_path: Path) -> None:
    db_path = tmp_path / 'override.db'
    engine_root = tmp_path / 'engine'
    monkeypatch.setattr(settings, 'db_path', str(db_path))
    monkeypatch.setattr(settings, 'engine_package_root', str(engine_root))

    assert _resolve_db_path() == db_path
    assert resolve_engine_package_root() == engine_root
