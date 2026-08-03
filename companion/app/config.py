"""Application configuration with safe local-development defaults."""

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

    # Observability
    log_level: str = 'info'

    @property
    def api_prefix(self) -> str:
        return f'/api/v{self.api_version}'


settings = Settings()
