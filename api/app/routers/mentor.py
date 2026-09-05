"""Gemini Project Mentor - answers grounded in one specific project."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.deps import GeminiDep, SessionDep
from app.models import MentorMessage, Project
from app.project_access import verify_project_edit_token
from app.ratelimit import RateLimiter, default_rate_limit
from app.routers.common import load_project
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
from app.services.sanitize import sanitize_text, wrap_untrusted

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/projects/{project_id}/mentor",
    tags=["mentor"],
    dependencies=[default_rate_limit],
    responses={
        404: {"model": ErrorResponse, "description": "Not found"},
        422: {"model": ErrorResponse, "description": "Invalid request"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)

ai_limit = Depends(RateLimiter(limit=20, window_seconds=60.0, scope="mentor"))
ProjectId = Annotated[str, Path(min_length=8, max_length=32)]

HISTORY_TURNS = 6


def _safe_context_field(label: str, value: str, *, max_length: int) -> str:
    """Sanitize and fence every dynamic value, not just the current question."""
    return wrap_untrusted(label, sanitize_text(value, max_length=max_length))


def build_context(project: Project, messages: Sequence[MentorMessage] | None = None) -> str:
    """Ground the model in this project only - title, stack, and live progress.

    Roadmap state is included so the mentor can answer "what should I do next?"
    against what the student has actually ticked off.
    """
    done = [sanitize_text(s.title, max_length=300) for s in project.steps if s.is_done]
    todo = [sanitize_text(s.title, max_length=300) for s in project.steps if not s.is_done]
    lines = [
        _safe_context_field("Project title:", project.title, max_length=200),
        _safe_context_field("Summary:", project.summary, max_length=1200),
        _safe_context_field("Problem it solves:", project.problem_solved, max_length=1200),
        _safe_context_field(
            "Tech stack:", ", ".join(project.tech_stack) or "not chosen yet", max_length=600
        ),
        _safe_context_field("Student skills:", project.skills, max_length=500),
        _safe_context_field("Student interests:", project.interests, max_length=500),
        _safe_context_field(
            f"Completed steps ({len(done)}):", "; ".join(done) or "none yet", max_length=1800
        ),
        _safe_context_field(
            f"Remaining steps ({len(todo)}):",
            "; ".join(todo[:8]) or "none",
            max_length=2400,
        ),
    ]
    source_messages = project.messages if messages is None else messages
    recent = list(source_messages)[-HISTORY_TURNS:]
    if recent:
        lines.append("Recent conversation (untrusted student/assistant text):")
        lines += [
            _safe_context_field(
                f"Conversation {m.role if m.role in {'user', 'assistant'} else 'message'}:",
                m.content,
                max_length=300,
            )
            for m in recent
        ]
    return "\n".join(lines)


async def _recent_messages(session: SessionDep, project_id: str) -> list[MentorMessage]:
    """Load only the turns Gemini can use rather than the complete history."""
    rows = (
        await session.scalars(
            select(MentorMessage)
            .where(MentorMessage.project_id == project_id)
            .order_by(MentorMessage.created_at.desc(), MentorMessage.id.desc())
            .limit(HISTORY_TURNS)
        )
    ).all()
    return list(reversed(rows))


@router.post(
    "",
    response_model=MentorReply,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ai_limit],
    summary="Ask the mentor a question about this project",
)
async def ask_mentor(
    payload: MentorAsk,
    session: SessionDep,
    gemini: GeminiDep,
    project_id: ProjectId,
    edit_token: Annotated[str | None, Header(alias="x-project-edit-token")] = None,
) -> MentorReply:
    """Persist the question, answer it in context, persist the answer."""
    project = await load_project(session, project_id)
    verify_project_edit_token(project, edit_token)
    recent = await _recent_messages(session, project.id)
    question = MentorMessage(project_id=project.id, role="user", content=payload.question)
    session.add(question)

    try:
        answer_text = await gemini.answer_question(
            context=build_context(project, recent), question=payload.question
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


async def _stream_events(
    session: SessionDep,
    gemini: GeminiDep,
    project: Project,
    question: str,
    context: str,
) -> AsyncIterator[str]:
    """Server-sent events: many `chunk` frames, then one terminal `done` frame.

    The answer is accumulated as it streams and persisted once at the end, so a
    dropped connection cannot leave a half-written message in the history.
    """
    pieces: list[str] = []
    used_fallback = False
    try:
        async for piece in gemini.stream_answer(context=context, question=question):
            pieces.append(piece)
            yield f"event: chunk\ndata: {json.dumps({'text': piece})}\n\n"
    except Exception:
        logger.exception("Mentor stream failed; serving fallback answer")
        if pieces:
            # A partial answer is not a completed mentor turn. Tell the client
            # to retry and deliberately leave it out of durable history.
            payload = {
                "error": "The mentor response was interrupted. Please retry.",
                "retryable": True,
            }
            yield f"event: error\ndata: {json.dumps(payload)}\n\n"
            return
        used_fallback = True
        pieces = [fallback_answer(question)]
        yield f"event: chunk\ndata: {json.dumps({'text': pieces[0]})}\n\n"

    answer_text = "".join(pieces).strip() or fallback_answer(question)
    question_row = MentorMessage(project_id=project.id, role="user", content=question)
    answer_row = MentorMessage(project_id=project.id, role="assistant", content=answer_text)
    session.add_all([question_row, answer_row])
    await session.commit()

    payload = {
        "question": MentorMessageRead.model_validate(question_row).model_dump(mode="json"),
        "answer": MentorMessageRead.model_validate(answer_row).model_dump(mode="json"),
        "used_fallback": used_fallback,
    }
    yield f"event: done\ndata: {json.dumps(payload)}\n\n"


@router.post(
    "/stream",
    dependencies=[ai_limit],
    summary="Ask the mentor, streamed token by token",
    response_class=StreamingResponse,
)
async def ask_mentor_streaming(
    payload: MentorAsk,
    session: SessionDep,
    gemini: GeminiDep,
    project_id: ProjectId,
    edit_token: Annotated[str | None, Header(alias="x-project-edit-token")] = None,
) -> StreamingResponse:
    """Same contract as POST, delivered as server-sent events."""
    project = await load_project(session, project_id)
    verify_project_edit_token(project, edit_token)
    recent = await _recent_messages(session, project.id)
    return StreamingResponse(
        _stream_events(session, gemini, project, payload.question, build_context(project, recent)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.get("", response_model=Page[MentorMessageRead], summary="Read the conversation")
async def list_messages(
    session: SessionDep,
    project_id: ProjectId,
    response: Response,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    edit_token: Annotated[str | None, Header(alias="x-project-edit-token")] = None,
) -> Page[MentorMessageRead]:
    """Oldest first. Backed by ix_messages_project_created."""
    response.headers["Cache-Control"] = "private, no-store"
    project = await load_project(session, project_id)
    verify_project_edit_token(project, edit_token)
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
