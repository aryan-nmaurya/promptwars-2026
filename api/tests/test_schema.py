"""Schema behaviour: migration, ordering, cascade, and id opacity."""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Idea, IdeaSet, MentorMessage, Project, RoadmapStep, new_id


async def test_migration_creates_every_table(engine) -> None:  # type: ignore[no-untyped-def]
    from sqlalchemy import inspect

    async with engine.connect() as conn:
        names = await conn.run_sync(lambda c: inspect(c).get_table_names())

    assert set(names) == {
        "idea_sets",
        "ideas",
        "projects",
        "roadmap_steps",
        "mentor_messages",
        "evaluations",
        "users",
        "sessions",
    }


def test_ids_are_unguessable_and_url_safe() -> None:
    ids = {new_id() for _ in range(500)}

    assert len(ids) == 500, "ids must not collide"
    for value in ids:
        assert re.fullmatch(r"[A-Za-z0-9_-]+", value), "must be URL-safe"
        assert len(value) >= 16, "too short to resist enumeration"


async def test_idea_set_orders_ideas_by_position(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        idea_set = IdeaSet(interests="healthcare", skills="python")
        # Inserted out of order on purpose.
        for position in (2, 0, 1):
            idea_set.ideas.append(
                Idea(
                    position=position, title=f"idea-{position}", summary="s", tech_stack=["python"]
                )
            )
        session.add(idea_set)
        await session.commit()
        set_id = idea_set.id

    async with session_factory() as session:
        loaded = await session.get(IdeaSet, set_id)
        assert loaded is not None
        assert [i.position for i in loaded.ideas] == [0, 1, 2]
        assert loaded.ideas[0].tech_stack == ["python"]


async def test_deleting_project_cascades_to_steps_and_messages(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        project = Project(title="Triage Bot", summary="s", tech_stack=["fastapi"])
        project.steps.append(RoadmapStep(phase="Phase 1", position=0, title="Set up repo"))
        project.messages.append(MentorMessage(role="user", content="where do I start?"))
        session.add(project)
        await session.commit()
        project_id = project.id

    async with session_factory() as session:
        project = await session.get(Project, project_id)
        assert project is not None
        await session.delete(project)
        await session.commit()

    async with session_factory() as session:
        steps = (await session.scalars(select(RoadmapStep))).all()
        messages = (await session.scalars(select(MentorMessage))).all()
        assert steps == [] and messages == [], "orphans left behind"


async def test_steps_default_to_not_done(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        project = Project(title="P", summary="s", tech_stack=[])
        project.steps.append(RoadmapStep(phase="Phase 1", position=0, title="Step"))
        session.add(project)
        await session.commit()

        step = (await session.scalars(select(RoadmapStep))).one()
        assert step.is_done is False
