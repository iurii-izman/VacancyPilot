"""Application configuration with safe local-development defaults."""

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Companion settings loaded from environment with safe defaults.

    All values are safe for local development. The host is constrained to
    loopback so an environment override cannot expose the service.
    """

    model_config = {'env_prefix': 'VACANCYPILOT_', 'extra': 'ignore'}

    # Service identity
    service_version: str = '0.1.0'
    api_version: str = '1'

    # Binding — always loopback
    host: Literal['127.0.0.1'] = '127.0.0.1'
    port: int = 8765

    # Database
    db_path: str = ''  # empty => default under companion/data/

    # Engine
    engine_package_root: str = ''  # empty => default companion/data/engine/

    # Observability
    log_level: str = 'info'

    @property
    def api_prefix(self) -> str:
        return f'/api/v{self.api_version}'


settings = Settings()


def resolve_engine_package_root() -> Path:
    """Return the absolute engine data root used by API and CLI alike."""
    configured = settings.engine_package_root.strip()
    if configured:
        return Path(configured).expanduser().resolve(strict=False)
    companion_root = Path(__file__).resolve().parents[1]
    return companion_root / 'data' / 'engine'
