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

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("seed")

# Fixed ids keep the demo URL stable across reseeds.
DEMO_SET_ID = "demo-ideas-2026"
DEMO_PROJECT_ID = "demo-project-2026"

INTERESTS = "healthcare and accessibility for elderly patients"
SKILLS = "python, react, postgresql"

DEMO_IDEAS: list[dict[str, object]] = [
    {
        "id": "demo-idea-voice",
        "title": "Voice-First Medication Reminder and Tracking Dashboard",
        "summary": (
            "A web application that lets elderly patients confirm each daily medication "
            "using simple voice commands or large visual buttons. Carers see adherence "
            "history remotely through a companion view."
        ),
        "problem_solved": (
            "Elderly patients with low vision or dexterity issues struggle with complex "
            "smartphone apps, which leads to missed medication doses."
        ),
        "feasibility": 9,
        "tech_stack": ["Python", "FastAPI", "React", "PostgreSQL", "Web Speech API"],
    },
    {
        "id": "demo-idea-therapy",
        "title": "Accessible Post-Op Physical Therapy Companion",
        "summary": (
            "An interactive companion that guides patients through exercises prescribed "
            "after surgery, using high-contrast visuals and audio instructions. Progress "
            "is shared with the physiotherapist."
        ),
        "problem_solved": (
            "Patients discharged after surgery forget or abandon their exercise plan, and "
            "clinicians have no visibility until the next appointment."
        ),
        "feasibility": 8,
        "tech_stack": ["Python", "FastAPI", "React", "PostgreSQL"],
    },
    {
        "id": "demo-idea-reports",
        "title": "Plain-Language Medical Report Explainer",
        "summary": (
            "A tool that turns discharge summaries and lab reports into plain language at "
            "a chosen reading level, with the clinical terms kept alongside."
        ),
        "problem_solved": (
            "Patients receive reports written for clinicians and cannot act on advice they "
            "do not understand."
        ),
        "feasibility": 7,
        "tech_stack": ["Python", "FastAPI", "React", "PostgreSQL"],
    },
]

# (phase, title, detail, is_done) - the first three are ticked so the demo URL
# opens with visible progress and the mentor has completed work to reason about.
DEMO_STEPS: list[tuple[str, str, str, bool]] = [
    ("Phase 1: Foundation", "Initialise the PostgreSQL database and define the schema",
     "Create tables for patients, medications and adherence events.", True),
    ("Phase 1: Foundation", "Set up the FastAPI backend server",
     "Add a health endpoint and wire up async database sessions.", True),
    ("Phase 1: Foundation", "Scaffold the React frontend",
     "Create the project shell with routing and a high-contrast theme.", True),
    ("Phase 2: Core workflow", "Build the medication CRUD endpoints",
     "Validate every request body and paginate the list endpoint.", False),
    ("Phase 2: Core workflow", "Build the daily medication list screen",
     "Show today's doses with large touch targets and clear state.", False),
    ("Phase 2: Core workflow", "Record an adherence event when a dose is confirmed",
     "Write the event and update the screen optimistically.", False),
    ("Phase 3: Voice and accessibility", "Add Web Speech API voice confirmation",
     "Let the patient say 'taken' to confirm the highlighted dose.", False),
    ("Phase 3: Voice and accessibility", "Provide a non-voice fallback path",
     "Voice must never be the only way to complete an action.", False),
    ("Phase 3: Voice and accessibility", "Audit contrast and keyboard navigation",
     "Verify 4.5:1 text contrast and that every control is reachable.", False),
    ("Phase 4: Carer view and delivery", "Build the carer adherence dashboard",
     "Summarise the last 30 days per medication.", False),
    ("Phase 4: Carer view and delivery", "Write tests for both paths",
     "One success and one failure case per endpoint.", False),
    ("Phase 4: Carer view and delivery", "Deploy and rehearse the demo",
     "Ship it, then script the three-minute walkthrough.", False),
]

DEMO_CONVERSATION: list[tuple[str, str]] = [
    ("user", "I just finished the database step. What exactly should I do next?"),
    (
        "assistant",
        "Your next step is 'Set up the FastAPI backend server'. Concretely: create a "
        "backend/ directory, install fastapi, uvicorn and asyncpg, then add a health "
        "endpoint so you can prove the server and database talk to each other before "
        "you build any real feature. Getting that thin slice working end to end is "
        "worth more than a perfect schema.",
    ),
]


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
