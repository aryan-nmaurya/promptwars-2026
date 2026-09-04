"""Idempotent seed script.

    python scripts/seed.py

Creates any missing tables, then upserts the sample rows by name. Safe to run
as many times as you like - re-running never duplicates and never wipes.
Delete `SEED_ITEMS` and put your own fixtures there.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.models import Base, Item  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("seed")

SEED_ITEMS: list[dict[str, str | None]] = [
    {"name": "example-one", "description": "Seeded row. Delete me."},
    {"name": "example-two", "description": "Seeded row. Delete me."},
    {"name": "example-three", "description": None},
]


async def create_tables() -> None:
    """`Base.metadata.create_all` is the whole migration story for a hackathon.

    Reach for Alembic only if you need to change a table after you have data
    you care about.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Tables ensured")


async def seed() -> None:
    created = updated = 0
    async with SessionLocal() as session:
        for row in SEED_ITEMS:
            name = row["name"]
            assert isinstance(name, str)
            existing = await session.scalar(select(Item).where(Item.name == name))
            if existing is None:
                session.add(Item(name=name, description=row["description"]))
                created += 1
            elif existing.description != row["description"]:
                existing.description = row["description"]
                updated += 1
        await session.commit()
    logger.info("Seed complete: %d created, %d updated", created, updated)


async def main() -> None:
    settings = get_settings()
    logger.info("Seeding env=%s", settings.ENV)
    await create_tables()
    await seed()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
