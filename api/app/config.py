"""Application settings.

Everything the app needs from the environment lives here and nowhere else.
Read it via `get_settings()` so the parse happens once per cold start.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Env = Literal["development", "test", "preview", "production"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Required. Postgres connection string. `postgres://` and `postgresql://`
    # are rewritten to the async driver automatically (Vercel/Neon/Supabase all
    # hand you a libpq-style URL).
    DATABASE_URL: str

    # Comma-separated list of origins allowed to call this API.
    # Kept as a plain string: pydantic-settings tries to JSON-decode list[str]
    # fields, which makes `a.com,b.com` a startup crash. Use `.allowed_origins`.
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Optional third-party key. Server-side only - never expose to the browser.
    GOOGLE_API_KEY: str | None = None

    ENV: Env = "development"

    @field_validator("DATABASE_URL")
    @classmethod
    def _use_async_driver(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("DATABASE_URL must not be empty")
        for prefix in ("postgresql+asyncpg://", "sqlite+aiosqlite://"):
            if value.startswith(prefix):
                return value
        if value.startswith("postgres://"):
            return "postgresql+asyncpg://" + value[len("postgres://") :]
        if value.startswith("postgresql://"):
            return "postgresql+asyncpg://" + value[len("postgresql://") :]
        return value

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    @property
    def debug_errors(self) -> bool:
        """Whether error responses may include the real exception message."""
        return self.ENV in ("development", "test")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
