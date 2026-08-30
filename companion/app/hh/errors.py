"""Sanitized errors for the official HH API boundary."""

from __future__ import annotations


class HHApiError(RuntimeError):
    """An upstream HH failure without response bodies or credentials."""

    def __init__(self, code: str, status_code: int | None = None) -> None:
        self.code = code
        self.status_code = status_code
        super().__init__(code)


class HHConfigurationError(HHApiError):
    """A required local credential or setting is not configured."""

    def __init__(
        self,
        message: str = 'HH application token is not configured',
        code: str = 'HH_APPLICATION_TOKEN_NOT_CONFIGURED',
    ) -> None:
        super().__init__(code)
        self.message = message
