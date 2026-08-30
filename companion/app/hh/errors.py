"""Sanitized errors for the official HH API boundary."""

from __future__ import annotations


class HHApiError(RuntimeError):
    """An upstream HH failure without response bodies or credentials."""

    def __init__(self, code: str, status_code: int | None = None) -> None:
        self.code = code
        self.status_code = status_code
        super().__init__(code)


class HHConfigurationError(HHApiError):
    """The local application token is not configured."""

    def __init__(self) -> None:
        super().__init__('HH_APPLICATION_TOKEN_NOT_CONFIGURED')
