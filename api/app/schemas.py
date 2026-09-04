"""Pydantic v2 base module.

Intentionally domain-free. Every request/response model in the app inherits
from `ApiModel` so serialisation behaviour is decided in exactly one place.
Add your feature schemas next to their router, or here if they are shared.
"""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ApiModel(BaseModel):
    """Base for everything crossing the wire."""

    model_config = ConfigDict(
        from_attributes=True,      # lets you return ORM objects directly
        extra="forbid",            # unknown keys are a 422, not a silent drop
        str_strip_whitespace=True,
        validate_assignment=True,
    )


class HealthResponse(ApiModel):
    status: str = Field(examples=["ok"])
    db: bool


class ErrorResponse(ApiModel):
    """The only error shape this API ever returns."""

    error: str


class PageMeta(ApiModel):
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)


class Page(ApiModel, Generic[T]):
    """Generic limit/offset envelope. Use as `Page[ItemRead]`."""

    items: list[T]
    meta: PageMeta
