"""OS keyring abstraction for secret storage.

The production implementation delegates to the ``keyring`` library.
Tests use an explicit in-memory fake that never touches the OS keyring.

Named secret slots define what the companion stores without exposing
their values to callers that shouldn't see them.
"""

from __future__ import annotations

import abc

# ── Named secret slots ──────────────────────────────────────────────────


class SecretSlot:
    """Well-known secret names used by the companion.

    The string value must match the keyring ``secret_name`` contract
    documented in `API_CONTRACT_V1.md` §18.1.

    Never log these names alongside their values.
    """

    HH_APPLICATION_TOKEN: str = 'vacancypilot_hh_application_token'
    HH_CLIENT_SECRET: str = 'vacancypilot_hh_client_secret'
    HH_OAUTH_TOKEN_BUNDLE: str = 'vacancypilot_hh_oauth_token_bundle'
    HH_REFRESH_TOKEN: str = 'vacancypilot_hh_refresh_token'
    AI_KEY: str = 'vacancypilot_ai_key'
    PAIRING_MATERIAL: str = 'vacancypilot_pairing_material'


# ── Abstract keyring ─────────────────────────────────────────────────────


class KeyringBackend(abc.ABC):
    """Abstract keyring for production and testing.

    Production: OS-native credential store via ``keyring``.
    Tests: in-memory ``FakeKeyring`` with explicit setup/teardown.
    """

    @abc.abstractmethod
    def get_secret(self, secret_name: str) -> str | None:
        """Return the stored secret or None."""
        ...

    @abc.abstractmethod
    def set_secret(self, secret_name: str, secret_value: str) -> None:
        """Store *secret_value* under *secret_name*."""
        ...

    @abc.abstractmethod
    def delete_secret(self, secret_name: str) -> None:
        """Remove the stored secret. No-op if absent."""
        ...


# ── Production keyring ───────────────────────────────────────────────────


class OSKeyring(KeyringBackend):
    """Production keyring backed by the OS credential store.

    Calls ``keyring`` which resolves to the appropriate platform backend
    (Windows Credential Manager, macOS Keychain, Linux Secret Service).
    """

    _SERVICE_NAME = 'vacancypilot-companion'

    def get_secret(self, secret_name: str) -> str | None:
        import keyring

        return keyring.get_password(self._SERVICE_NAME, secret_name)

    def set_secret(self, secret_name: str, secret_value: str) -> None:
        import keyring

        keyring.set_password(self._SERVICE_NAME, secret_name, secret_value)

    def delete_secret(self, secret_name: str) -> None:
        import contextlib

        import keyring

        with contextlib.suppress(keyring.errors.PasswordDeleteError):
            keyring.delete_password(self._SERVICE_NAME, secret_name)


# ── In-memory fake (tests only) ──────────────────────────────────────────


class FakeKeyring(KeyringBackend):
    """Explicit in-memory keyring for tests.

    Values are stored in a plain dict.  No OS credential store is touched.
    Tests must construct this and inject it explicitly — never use this
    as a production default.
    """

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    def get_secret(self, secret_name: str) -> str | None:
        return self._store.get(secret_name)

    def set_secret(self, secret_name: str, secret_value: str) -> None:
        self._store[secret_name] = secret_value

    def delete_secret(self, secret_name: str) -> None:
        self._store.pop(secret_name, None)

    # ── Test helpers ─────────────────────────────────────────────────

    @property
    def stored_secret_names(self) -> list[str]:
        """Return sorted list of currently stored secret names."""
        return sorted(self._store.keys())

    @property
    def is_empty(self) -> bool:
        """Return True when no secrets are stored."""
        return len(self._store) == 0
