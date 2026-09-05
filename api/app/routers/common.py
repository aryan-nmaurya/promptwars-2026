"""Helpers shared by the routers that operate on a single project.

`projects`, `mentor` and `evaluations` all start from the same two steps:
load one project with its roadmap, and render a stored evaluation. Keeping
them here means no router has to reach into another router's private names.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload, selectinload

from app.models import Evaluation, Project
from app.schemas import EvaluationRead


async def load_project(session: AsyncSession, project_id: str) -> Project:
    """Load a project with its roadmap, or raise 404.

    Project pages need their roadmap, but never need to hydrate an unbounded
    mentor history. Mentor routes load only the most recent turns explicitly.
    """
    project = await session.scalar(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.steps), noload(Project.messages))
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def evaluation_to_read(evaluation: Evaluation) -> EvaluationRead:
    """Re-hydrate the stored result JSON into the public response model."""
    payload = dict(evaluation.result)
    payload.update(
        id=evaluation.id,
        overall_score=evaluation.overall_score,
        created_at=evaluation.created_at,
    )
    return EvaluationRead.model_validate(payload)
