"""Projects and their roadmaps - the shareable artefact."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import noload

from app.deps import CurrentUserDep, GeminiDep, OptionalUserDep, SessionDep
from app.models import Evaluation, Idea, IdeaSet, Project, RoadmapStep
from app.project_access import authorize_project_write, issue_edit_token
from app.ratelimit import RateLimiter, default_rate_limit
from app.routers.common import evaluation_to_read, load_project
from app.schemas import (
    ErrorResponse,
    Page,
    PageMeta,
    ProjectCreate,
    ProjectCreated,
    ProjectRead,
    ProjectSummary,
    RoadmapStepRead,
    StepUpdate,
)
from app.services.fallback import fallback_roadmap
from app.services.gemini import GeminiError

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/projects",
    tags=["projects"],
    dependencies=[default_rate_limit],
    responses={
        404: {"model": ErrorResponse, "description": "Not found"},
        422: {"model": ErrorResponse, "description": "Invalid request"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)

ai_limit = Depends(RateLimiter(limit=12, window_seconds=60.0, scope="projects"))
ResourceId = Annotated[str, Path(min_length=8, max_length=32)]


def _to_read(project: Project, latest_evaluation: Evaluation | None = None) -> ProjectRead:
    """Attach progress counts the UI needs without a second query."""
    steps = [RoadmapStepRead.model_validate(s) for s in project.steps]
    return ProjectRead(
        id=project.id,
        user_id=project.user_id,
        title=project.title,
        summary=project.summary,
        problem_solved=project.problem_solved,
        feasibility=project.feasibility,
        tech_stack=project.tech_stack,
        core_features=project.core_features,
        stretch_goals=project.stretch_goals,
        created_at=project.created_at,
        used_fallback=project.used_fallback,
        steps=steps,
        steps_total=len(steps),
        steps_done=sum(1 for s in steps if s.is_done),
        latest_evaluation=(
            evaluation_to_read(latest_evaluation) if latest_evaluation is not None else None
        ),
    )


@router.post(
    "",
    response_model=ProjectCreated,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ai_limit],
    summary="Choose an idea and generate its roadmap",
)
async def create_project(
    payload: ProjectCreate,
    session: SessionDep,
    gemini: GeminiDep,
    response: Response,
    current_user: OptionalUserDep = None,
) -> ProjectCreated:
    """Copy the chosen idea into a project, then generate a phased build plan."""
    idea = await session.get(Idea, payload.idea_id)
    if idea is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found")

    # Fetched explicitly: `idea.idea_set` is a lazy back-reference, and touching
    # it here would emit IO outside the async greenlet context.
    parent = await session.get(IdeaSet, idea.idea_set_id)
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found")

    edit_token, edit_token_hash = issue_edit_token()
    project = Project(
        source_idea_id=idea.id,
        user_id=current_user.id if current_user is not None else None,
        title=idea.title,
        summary=idea.summary,
        problem_solved=idea.problem_solved,
        feasibility=idea.feasibility,
        tech_stack=idea.tech_stack,
        core_features=idea.core_features,
        stretch_goals=idea.stretch_goals,
        interests=parent.interests,
        skills=parent.skills,
        edit_token_hash=edit_token_hash,
    )
    if current_user is not None and current_user.onboarding_completed_at is None:
        current_user.onboarding_completed_at = datetime.now(UTC)
    used_fallback = False
    try:
        steps = await gemini.generate_roadmap(
            title=idea.title,
            summary=idea.summary,
            tech_stack=idea.tech_stack,
            skills=parent.skills,
            core_features=idea.core_features,
        )
    except GeminiError:
        logger.exception("Gemini roadmap generation failed; serving scoped fallback")
        steps = fallback_roadmap(
            title=idea.title,
            summary=idea.summary,
            tech_stack=idea.tech_stack,
            core_features=idea.core_features,
        )
        used_fallback = True
    project.used_fallback = used_fallback

    for position, step in enumerate(steps):
        project.steps.append(
            RoadmapStep(position=position, phase=step.phase, title=step.title, detail=step.detail)
        )
    session.add(project)
    await session.commit()
    response.headers["Cache-Control"] = "private, no-store"
    return ProjectCreated(project=_to_read(project), edit_token=edit_token)


@router.get(
    "",
    response_model=Page[ProjectSummary],
    summary="List the signed-in user's projects",
    responses={401: {"model": ErrorResponse, "description": "Authentication required"}},
)
async def list_my_projects(
    session: SessionDep,
    current_user: CurrentUserDep,
    response: Response,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[ProjectSummary]:
    """Newest first, scoped to the caller.

    This is what makes an account mean something. Before it existed, the only
    index of a student's projects was a list in one browser's localStorage,
    so signing in on a second device - or as a second person on a shared
    machine - showed whatever that browser happened to hold rather than what
    the account owned.

    Never enumerable: the filter is the authenticated user's own id, so there
    is no page of "all projects" for anyone.
    """
    response.headers["Cache-Control"] = "private, no-store"
    where = Project.user_id == current_user.id
    total = await session.scalar(select(func.count()).select_from(Project).where(where)) or 0
    rows = await session.scalars(
        select(Project)
        .where(where)
        # A summary row needs none of the children, and hydrating them here is
        # what made loading a user cost five queries.
        .options(noload(Project.steps), noload(Project.messages))
        .order_by(Project.created_at.desc(), Project.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return Page[ProjectSummary](
        items=[ProjectSummary.model_validate(row) for row in rows],
        meta=PageMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/{project_id}", response_model=ProjectRead, summary="Read a project")
async def get_project(session: SessionDep, project_id: ResourceId) -> ProjectRead:
    """Public by design - this is the URL a student shares with a professor."""
    project = await load_project(session, project_id)
    latest = await session.scalar(
        select(Evaluation)
        .where(Evaluation.project_id == project.id)
        .order_by(Evaluation.created_at.desc(), Evaluation.id.desc())
        .limit(1)
    )
    return _to_read(project, latest)


@router.patch(
    "/{project_id}/steps/{step_id}",
    response_model=RoadmapStepRead,
    summary="Tick a roadmap step off",
)
async def update_step(
    session: SessionDep,
    project_id: ResourceId,
    step_id: ResourceId,
    payload: StepUpdate,
    edit_token: Annotated[str | None, Header(alias="x-project-edit-token")] = None,
    current_user: OptionalUserDep = None,
) -> RoadmapStepRead:
    """Scoped to the project so a step id alone cannot mutate another project."""
    project = await load_project(session, project_id)
    authorize_project_write(project, edit_token, current_user)
    step = await session.scalar(
        select(RoadmapStep).where(RoadmapStep.id == step_id, RoadmapStep.project_id == project_id)
    )
    if step is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Step not found")
    step.is_done = payload.is_done
    await session.commit()
    return RoadmapStepRead.model_validate(step)
