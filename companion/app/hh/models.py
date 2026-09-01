"""Small tolerant models for fields consumed from HH public responses."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class HHPage(BaseModel):
    model_config = ConfigDict(extra='ignore')
    items: list[dict[str, Any]] = Field(default_factory=list)
    page: int = 0
    pages: int = 0
    per_page: int = 0
    found: int = 0


class HHSearchQuery(BaseModel):
    model_config = ConfigDict(extra='forbid')
    schema_version: int = Field(default=1, ge=1, le=1)
    text: str | None = Field(default=None, max_length=300)
    area: list[str] = Field(default_factory=list, max_length=20)
    experience: list[str] = Field(default_factory=list, max_length=10)
    employment: list[str] = Field(default_factory=list, max_length=10)
    schedule: list[str] = Field(default_factory=list, max_length=10)
    salary: int | None = Field(default=None, ge=0, le=100_000_000)
    only_with_salary: bool | None = None
    professional_role: list[str] = Field(default_factory=list, max_length=30)
    search_field: list[str] = Field(default_factory=list, max_length=10)
    period: int | None = Field(default=None, ge=1, le=30)
    order_by: str | None = Field(default=None, max_length=50)

    def to_api_params(self) -> dict[str, Any]:
        """Serialize only fields accepted by the official public HH API.

        ``schema_version`` is an internal storage contract and must never
        cross the provider boundary.
        """
        return self.model_dump(
            exclude={'schema_version'},
            exclude_none=True,
            exclude_defaults=True,
        )


class HHSearchProfileInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=120)
    query: HHSearchQuery
    enabled: bool = True


class HHSearchProfilePatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str | None = Field(default=None, min_length=1, max_length=120)
    query: HHSearchQuery | None = None
    enabled: bool | None = None
    revision: int = Field(ge=1)
