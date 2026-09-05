"""Database engine, session factory, and the `get_session` dependency.

Serverless rule: no long-lived connections. Every invocation opens a
connection and drops it, so the pool must be `NullPool`. A real pool here
would exhaust Postgres' connection limit the moment traffic fans out across
Lambda instances.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.config import get_settings

logger = logging.getLogger(__name__)

# libpq understands these; asyncpg raises TypeError on them. Managed Postgres
# providers put them in the URL they give you, so strip and translate.
_LIBPQ_ONLY_PARAMS = frozenset(
    {
        "sslmode",
        "channel_binding",
        "target_session_attrs",
        "options",
        "connect_timeout",
        "pgbouncer",  # Supabase/Prisma-style URLs carry this; asyncpg rejects it
    }
)
_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", ""})

#: Transaction-mode connection poolers. Every managed Postgres puts you behind
#: one, and its hostname or port is the only hint you get.
_POOLER_PORTS = frozenset({6543})


def prepare_url(raw: str) -> tuple[str, dict[str, Any]]:
    """Split a connection string into (driver-safe URL, connect_args)."""
    parts = urlsplit(raw)
    if "asyncpg" not in parts.scheme:
        return raw, {}

    params = parse_qsl(parts.query, keep_blank_values=True)
    kept = [(k, v) for k, v in params if k.lower() not in _LIBPQ_ONLY_PARAMS]
    dropped = {k.lower(): v.lower() for k, v in params if k.lower() in _LIBPQ_ONLY_PARAMS}

    connect_args: dict[str, Any] = {}
    host = parts.hostname or ""
    sslmode = dropped.get("sslmode", "")
    is_local = host in _LOCAL_HOSTS
    if sslmode in ("require", "verify-ca", "verify-full") or (
        not is_local and sslmode != "disable"
    ):
        connect_args["ssl"] = True

    # Behind PgBouncer in transaction mode, server connections are shared, so
    # asyncpg's numerically-named prepared statements collide across clients:
    # "prepared statement __asyncpg_stmt_1__ already exists", or stale type
    # caches raising InvalidCachedStatementError. Unique names plus no caching
    # is SQLAlchemy's documented fix. Costs one extra round trip per statement,
    # which is nothing next to a 2am outage.
    is_pooled = (
        "-pooler" in host or (parts.port in _POOLER_PORTS) or dropped.get("pgbouncer") == "true"
    )
    if is_pooled:
        connect_args["prepared_statement_name_func"] = lambda: f"__asyncpg_{uuid4()}__"
        connect_args["statement_cache_size"] = 0
        logger.info("Pooled Postgres endpoint detected; prepared statement caching disabled")

    cleaned = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(kept), parts.fragment))
    return cleaned, connect_args


def _build_engine() -> AsyncEngine:
    settings = get_settings()
    url, connect_args = prepare_url(settings.DATABASE_URL)
    return create_async_engine(
        url,
        poolclass=NullPool,
        connect_args=connect_args,
        echo=False,
        future=True,
    )


engine: AsyncEngine = _build_engine()

SessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency. Rolls back on error, always closes."""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def ping_db() -> bool:
    """True if the database answers. Never raises - /health must stay up."""
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.warning("Database health check failed", exc_info=True)
        return False
