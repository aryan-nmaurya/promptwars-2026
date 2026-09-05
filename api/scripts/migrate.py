"""Create any missing tables.

    python scripts/migrate.py

`Base.metadata.create_all` is the migration strategy for this project: it adds
missing tables and indexes and never drops or alters anything, so it is safe to
re-run. It does NOT alter existing columns - if you change a column type after
data exists, drop the table or move to Alembic.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import engine  # noqa: E402
from app.models import Base  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("migrate")


#: Columns added after a table already shipped. `create_all` only creates
#: missing TABLES, never missing columns, so each one is applied explicitly.
#: Postgres-only: SQLite test databases are always built fresh by create_all.
ADDED_COLUMNS: list[tuple[str, str, str]] = [
    ("idea_sets", "used_fallback", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("projects", "used_fallback", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("ideas", "core_features", "JSON NOT NULL DEFAULT '[]'"),
    ("ideas", "stretch_goals", "JSON NOT NULL DEFAULT '[]'"),
    ("projects", "core_features", "JSON NOT NULL DEFAULT '[]'"),
    ("projects", "stretch_goals", "JSON NOT NULL DEFAULT '[]'"),
    ("projects", "edit_token_hash", "VARCHAR(64)"),
    ("projects", "user_id", "VARCHAR(32)"),
]


async def _add_missing_columns(conn) -> None:  # type: ignore[no-untyped-def]
    """Idempotent ADD COLUMN IF NOT EXISTS for each late-added column."""
    if conn.dialect.name != "postgresql":
        return
    for table, column, ddl in ADDED_COLUMNS:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}"))
        logger.info("Ensured column %s.%s", table, column)


async def main() -> None:
    """Create missing tables, then apply any late-added columns."""
    logger.info("Migrating env=%s", get_settings().ENV)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _add_missing_columns(conn)
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    logger.info("Tables ensured: %s", tables)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
