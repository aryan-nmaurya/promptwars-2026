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
    """All configuration, read from the environment exactly once per cold start."""

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

    # Tried in order; the first that answers wins. Measured against this key:
    # gemini-2.5-* is 404 for new keys, *-latest aliases return 503, and
    # gemini-3.5-flash intermittently 500s - so the stable model leads.
    # Measured: ~5-6s from Vercel (iad1 sits next to Google), ~18s from a
    # laptop in India. 8s is right in production; raise it in local .env or
    # every local call will time out and fall back.
    # Worst case 2 models x (1 + GEMINI_RETRIES) x timeout must stay under
    # vercel.json's maxDuration of 60s.
    GEMINI_MODELS: str = "gemini-3.6-flash,gemini-3.5-flash"
    GEMINI_TIMEOUT_SECONDS: float = 8.0
    GEMINI_RETRIES: int = 1
    IDEAS_CACHE_TTL_SECONDS: float = 600.0

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
    def gemini_models(self) -> list[str]:
        return [m.strip() for m in self.GEMINI_MODELS.split(",") if m.strip()]

    @property
    def ai_enabled(self) -> bool:
        """False when no key is configured; routes then return 503, not 500."""
        return bool(self.GOOGLE_API_KEY)

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
