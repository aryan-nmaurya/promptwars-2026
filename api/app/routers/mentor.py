"""Gemini Project Mentor - answers grounded in one specific project."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func, select

from app.deps import GeminiDep, SessionDep
from app.models import MentorMessage, Project
from app.ratelimit import RateLimiter
from app.schemas import (
    ErrorResponse,
    MentorAsk,
    MentorMessageRead,
    MentorReply,
    Page,
    PageMeta,
)
from app.services.fallback import fallback_answer
from app.services.gemini import GeminiError

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/projects/{project_id}/mentor",
    tags=["mentor"],
    responses={
        404: {"model": ErrorResponse, "description": "Not found"},
        422: {"model": ErrorResponse, "description": "Invalid request"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)

ai_limit = Depends(RateLimiter(limit=20, window_seconds=60.0))
ProjectId = Annotated[str, Path(min_length=8, max_length=32)]

HISTORY_TURNS = 6


def build_context(project: Project) -> str:
    """Ground the model in this project only - title, stack, and live progress.

    Roadmap state is included so the mentor can answer "what should I do next?"
    against what the student has actually ticked off.
    """
    done = [s.title for s in project.steps if s.is_done]
    todo = [s.title for s in project.steps if not s.is_done]
    lines = [
        f"Project title: {project.title}",
        f"Summary: {project.summary}",
        f"Problem it solves: {project.problem_solved}",
        f"Tech stack: {', '.join(project.tech_stack) or 'not chosen yet'}",
        f"Student's skills: {project.skills}",
        f"Student's interests: {project.interests}",
        f"Completed steps ({len(done)}): {'; '.join(done) or 'none yet'}",
        f"Remaining steps ({len(todo)}): {'; '.join(todo[:8]) or 'none'}",
    ]
    recent = project.messages[-HISTORY_TURNS:]
    if recent:
        lines.append("Recent conversation:")
        lines += [f"  {m.role}: {m.content[:300]}" for m in recent]
    return "\n".join(lines)


async def _load_project(session: SessionDep, project_id: str) -> Project:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post(
    "",
    response_model=MentorReply,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ai_limit],
    summary="Ask the mentor a question about this project",
)
async def ask_mentor(
    payload: MentorAsk, session: SessionDep, gemini: GeminiDep, project_id: ProjectId
) -> MentorReply:
    """Persist the question, answer it in context, persist the answer."""
    project = await _load_project(session, project_id)
    question = MentorMessage(project_id=project.id, role="user", content=payload.question)
    session.add(question)

    try:
        answer_text = await gemini.answer_question(
            context=build_context(project), question=payload.question
        )
    except GeminiError:
        logger.exception("Gemini mentor call failed; using fallback")
        answer_text = fallback_answer(payload.question)

    answer = MentorMessage(project_id=project.id, role="assistant", content=answer_text)
    session.add(answer)
    await session.commit()
    return MentorReply(
        question=MentorMessageRead.model_validate(question),
        answer=MentorMessageRead.model_validate(answer),
    )


@router.get("", response_model=Page[MentorMessageRead], summary="Read the conversation")
async def list_messages(
    session: SessionDep,
    project_id: ProjectId,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[MentorMessageRead]:
    """Oldest first. Backed by ix_messages_project_created."""
    await _load_project(session, project_id)
    where = MentorMessage.project_id == project_id
    total = await session.scalar(select(func.count()).select_from(MentorMessage).where(where)) or 0
    rows = await session.scalars(
        select(MentorMessage)
        .where(where)
        .order_by(MentorMessage.created_at, MentorMessage.id)
        .limit(limit)
        .offset(offset)
    )
    return Page[MentorMessageRead](
        items=[MentorMessageRead.model_validate(r) for r in rows],
        meta=PageMeta(total=total, limit=limit, offset=offset),
    )
