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

from app.config import get_settings  # noqa: E402
from app.db import engine  # noqa: E402
from app.models import Base  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("migrate")


async def main() -> None:
    logger.info("Migrating env=%s", get_settings().ENV)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    logger.info("Tables ensured: %s", tables)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
