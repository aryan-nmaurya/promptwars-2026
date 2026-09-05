"""Idempotent demo data.

    python scripts/seed.py

Creates one fully-populated project at a stable, memorable URL so a judge or
professor can see the finished experience without waiting on a Gemini call.
Re-running updates the demo rows in place and never duplicates them.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.models import Base, Idea, IdeaSet, MentorMessage, Project, RoadmapStep  # noqa: E402
from app.services.fallback import (  # noqa: E402
    DEMO_CONVERSATION,
    DEMO_IDEAS,
    DEMO_STEPS,
    DEMO_INTERESTS,
    DEMO_SKILLS,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("seed")

# Fixed ids keep the demo URL stable across reseeds.
DEMO_SET_ID = "demo-ideas-2026"
DEMO_PROJECT_ID = "demo-project-2026"

INTERESTS = DEMO_INTERESTS
SKILLS = DEMO_SKILLS


# (phase, title, detail, is_done) - the first three are ticked so the demo URL
# opens with visible progress and the mentor has completed work to reason about.



async def _seed_idea_set(session) -> None:  # type: ignore[no-untyped-def]
    """Upsert the demo idea set and its three ideas."""
    idea_set = await session.get(IdeaSet, DEMO_SET_ID)
    if idea_set is None:
        idea_set = IdeaSet(id=DEMO_SET_ID)
        session.add(idea_set)
    idea_set.interests = INTERESTS
    idea_set.skills = SKILLS

    for position, spec in enumerate(DEMO_IDEAS):
        idea = await session.get(Idea, spec["id"])
        if idea is None:
            idea = Idea(id=spec["id"], idea_set_id=DEMO_SET_ID)
            session.add(idea)
        idea.position = position
        idea.title = spec["title"]  # type: ignore[assignment]
        idea.summary = spec["summary"]  # type: ignore[assignment]
        idea.problem_solved = spec["problem_solved"]  # type: ignore[assignment]
        idea.feasibility = spec["feasibility"]  # type: ignore[assignment]
        idea.tech_stack = spec["tech_stack"]  # type: ignore[assignment]


async def _seed_project(session) -> None:  # type: ignore[no-untyped-def]
    """Upsert the demo project, its roadmap and its mentor conversation."""
    chosen = DEMO_IDEAS[0]
    project = await session.get(Project, DEMO_PROJECT_ID)
    if project is None:
        project = Project(id=DEMO_PROJECT_ID)
        session.add(project)
    project.source_idea_id = chosen["id"]  # type: ignore[assignment]
    project.title = chosen["title"]  # type: ignore[assignment]
    project.summary = chosen["summary"]  # type: ignore[assignment]
    project.problem_solved = chosen["problem_solved"]  # type: ignore[assignment]
    project.feasibility = chosen["feasibility"]  # type: ignore[assignment]
    project.tech_stack = chosen["tech_stack"]  # type: ignore[assignment]
    project.interests = INTERESTS
    project.skills = SKILLS

    for position, (phase, title, detail, is_done) in enumerate(DEMO_STEPS):
        step_id = f"demo-step-{position:02d}"
        step = await session.get(RoadmapStep, step_id)
        if step is None:
            step = RoadmapStep(id=step_id, project_id=DEMO_PROJECT_ID)
            session.add(step)
        step.phase, step.position, step.title, step.detail = phase, position, title, detail
        step.is_done = is_done

    for index, (role, content) in enumerate(DEMO_CONVERSATION):
        message_id = f"demo-msg-{index:02d}"
        message = await session.get(MentorMessage, message_id)
        if message is None:
            message = MentorMessage(id=message_id, project_id=DEMO_PROJECT_ID)
            session.add(message)
        message.role, message.content = role, content


async def main() -> None:
    logger.info("Seeding demo data env=%s", get_settings().ENV)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        await _seed_idea_set(session)
        await session.flush()  # ideas must exist before the project references one
        await _seed_project(session)
        await session.commit()

    logger.info("Demo idea set:  /ideas/%s", DEMO_SET_ID)
    logger.info("Demo project:   /projects/%s", DEMO_PROJECT_ID)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
