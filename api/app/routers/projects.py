"""Projects and their roadmaps - the shareable artefact."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Response, status
from sqlalchemy import select
from sqlalchemy.orm import noload, selectinload

from app.deps import GeminiDep, SessionDep
from app.models import Evaluation, Idea, IdeaSet, Project, RoadmapStep
from app.project_access import issue_edit_token, verify_project_edit_token
from app.ratelimit import RateLimiter
from app.schemas import (
    ErrorResponse,
    EvaluationRead,
    ProjectCreate,
    ProjectCreated,
    ProjectRead,
    RoadmapStepRead,
    StepUpdate,
)
from app.services.fallback import fallback_roadmap
from app.services.gemini import GeminiError

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

ai_limit = Depends(RateLimiter(limit=12, window_seconds=60.0, scope="projects"))
ResourceId = Annotated[str, Path(min_length=8, max_length=32)]


def _evaluation_to_read(evaluation: Evaluation) -> EvaluationRead:
    payload = dict(evaluation.result)
    payload.update(
        id=evaluation.id,
        overall_score=evaluation.overall_score,
        created_at=evaluation.created_at,
    )
    return EvaluationRead.model_validate(payload)


def _to_read(project: Project, latest_evaluation: Evaluation | None = None) -> ProjectRead:
    """Attach progress counts the UI needs without a second query."""
    steps = [RoadmapStepRead.model_validate(s) for s in project.steps]
    return ProjectRead(
        id=project.id,
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
            _evaluation_to_read(latest_evaluation) if latest_evaluation is not None else None
        ),
    )


async def _load_project(session: SessionDep, project_id: str) -> Project:
    # Project pages need their roadmap, but never need to hydrate an unbounded
    # mentor history. Mentor routes load only the most recent turns explicitly.
    project = await session.scalar(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.steps), noload(Project.messages))
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post(
    "",
    response_model=ProjectCreated,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ai_limit],
    summary="Choose an idea and generate its roadmap",
)
async def create_project(
    payload: ProjectCreate, session: SessionDep, gemini: GeminiDep, response: Response
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


@router.get("/{project_id}", response_model=ProjectRead, summary="Read a project")
async def get_project(session: SessionDep, project_id: ResourceId) -> ProjectRead:
    """Public by design - this is the URL a student shares with a professor."""
    project = await _load_project(session, project_id)
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
) -> RoadmapStepRead:
    """Scoped to the project so a step id alone cannot mutate another project."""
    project = await _load_project(session, project_id)
    verify_project_edit_token(project, edit_token)
    step = await session.scalar(
        select(RoadmapStep).where(RoadmapStep.id == step_id, RoadmapStep.project_id == project_id)
    )
    if step is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Step not found")
    step.is_done = payload.is_done
    await session.commit()
    return RoadmapStepRead.model_validate(step)
