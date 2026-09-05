"""Projects and their roadmaps - the shareable artefact."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func, select

from app.deps import GeminiDep, SessionDep
from app.models import Idea, IdeaSet, Project, RoadmapStep
from app.ratelimit import RateLimiter
from app.schemas import (
    ErrorResponse,
    Page,
    PageMeta,
    ProjectCreate,
    ProjectRead,
    ProjectSummary,
    RoadmapStepRead,
    StepUpdate,
)
from app.services.fallback import fallback_roadmap
from app.services.gemini import GeminiUnavailable

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/projects",
    tags=["projects"],
    responses={
        404: {"model": ErrorResponse, "description": "Not found"},
        422: {"model": ErrorResponse, "description": "Invalid request"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)

ai_limit = Depends(RateLimiter(limit=12, window_seconds=60.0))
ResourceId = Annotated[str, Path(min_length=8, max_length=32)]


def _to_read(project: Project) -> ProjectRead:
    """Attach progress counts the UI needs without a second query."""
    steps = [RoadmapStepRead.model_validate(s) for s in project.steps]
    return ProjectRead(
        id=project.id,
        title=project.title,
        summary=project.summary,
        problem_solved=project.problem_solved,
        feasibility=project.feasibility,
        tech_stack=project.tech_stack,
        interests=project.interests,
        skills=project.skills,
        created_at=project.created_at,
        steps=steps,
        steps_total=len(steps),
        steps_done=sum(1 for s in steps if s.is_done),
    )


async def _load_project(session: SessionDep, project_id: str) -> Project:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post(
    "",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ai_limit],
    summary="Choose an idea and generate its roadmap",
)
async def create_project(
    payload: ProjectCreate, session: SessionDep, gemini: GeminiDep
) -> ProjectRead:
    """Copy the chosen idea into a project, then generate a phased build plan."""
    idea = await session.get(Idea, payload.idea_id)
    if idea is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found")

    # Fetched explicitly: `idea.idea_set` is a lazy back-reference, and touching
    # it here would emit IO outside the async greenlet context.
    parent = await session.get(IdeaSet, idea.idea_set_id)
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found")

    project = Project(
        source_idea_id=idea.id,
        title=idea.title,
        summary=idea.summary,
        problem_solved=idea.problem_solved,
        feasibility=idea.feasibility,
        tech_stack=idea.tech_stack,
        interests=parent.interests,
        skills=parent.skills,
    )
    try:
        steps = await gemini.generate_roadmap(
            title=idea.title, summary=idea.summary, tech_stack=idea.tech_stack, skills=parent.skills
        )
    except GeminiUnavailable:
        logger.exception("Gemini roadmap generation failed; using fallback")
        steps = fallback_roadmap(idea.title)

    for position, step in enumerate(steps):
        project.steps.append(
            RoadmapStep(position=position, phase=step.phase, title=step.title, detail=step.detail)
        )
    session.add(project)
    await session.commit()
    return _to_read(project)


@router.get("", response_model=Page[ProjectSummary], summary="List projects")
async def list_projects(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[ProjectSummary]:
    """Paginated, newest first. Backed by ix_projects_created_at."""
    total = await session.scalar(select(func.count()).select_from(Project)) or 0
    rows = await session.scalars(
        select(Project).order_by(Project.created_at.desc()).limit(limit).offset(offset)
    )
    return Page[ProjectSummary](
        items=[ProjectSummary.model_validate(row) for row in rows],
        meta=PageMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/{project_id}", response_model=ProjectRead, summary="Read a project")
async def get_project(session: SessionDep, project_id: ResourceId) -> ProjectRead:
    """Public by design - this is the URL a student shares with a professor."""
    return _to_read(await _load_project(session, project_id))


@router.patch(
    "/{project_id}/steps/{step_id}",
    response_model=RoadmapStepRead,
    summary="Tick a roadmap step off",
)
async def update_step(
    session: SessionDep, project_id: ResourceId, step_id: ResourceId, payload: StepUpdate
) -> RoadmapStepRead:
    """Scoped to the project so a step id alone cannot mutate another project."""
    step = await session.scalar(
        select(RoadmapStep).where(RoadmapStep.id == step_id, RoadmapStep.project_id == project_id)
    )
    if step is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Step not found")
    step.is_done = payload.is_done
    await session.commit()
    return RoadmapStepRead.model_validate(step)
