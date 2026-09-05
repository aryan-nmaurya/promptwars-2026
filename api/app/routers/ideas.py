"""Idea generation - the first Gemini-powered feature."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status

from app.cache import TTLCache, cache_key
from app.config import get_settings
from app.deps import GeminiDep, SessionDep
from app.models import Idea, IdeaSet
from app.ratelimit import RateLimiter
from app.schemas import ErrorResponse, IdeaSetCreate, IdeaSetRead
from app.services.fallback import fallback_ideas
from app.services.gemini import GeneratedIdea, GeminiError

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ideas",
    tags=["ideas"],
    responses={
        422: {"model": ErrorResponse, "description": "Invalid request"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)

# Generation is the expensive call - keep it tighter than the read endpoints.
ai_limit = Depends(RateLimiter(limit=12, window_seconds=60.0))
IdeaSetId = Annotated[str, Path(min_length=8, max_length=32)]

#: Repeated identical submissions inside the window reuse the same generation
#: instead of paying for another Gemini call. Best effort - a miss is harmless.
_ideas_cache: TTLCache[list[GeneratedIdea]] = TTLCache(
    ttl_seconds=get_settings().IDEAS_CACHE_TTL_SECONDS
)


def reset_ideas_cache() -> None:
    """Clear the generation cache. Used by tests."""
    _ideas_cache.clear()


async def _generate(
    gemini: GeminiDep, interests: str, skills: str
) -> tuple[list[GeneratedIdea], bool]:
    """Return (ideas, used_fallback), preferring a cached generation."""
    key = cache_key(interests, skills)
    cached = _ideas_cache.get(key)
    if cached is not None:
        logger.info("Idea cache hit key=%s", key)
        return cached, False

    try:
        generated = await gemini.generate_ideas(interests, skills)
    except GeminiError:
        logger.exception("Gemini idea generation failed; serving seeded fallback")
        return fallback_ideas(), True

    _ideas_cache.set(key, generated)
    return generated, False


@router.post(
    "",
    response_model=IdeaSetRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ai_limit],
    summary="Generate three tailored project ideas",
)
async def create_idea_set(
    payload: IdeaSetCreate, session: SessionDep, gemini: GeminiDep
) -> IdeaSetRead:
    """Ask Gemini for ideas, persist them, and return the set.

    Falls back to the seeded example project if every model is unavailable, so
    the student sees a real project rather than a dead screen. The set records
    which happened so the UI can say so.
    """
    generated, used_fallback = await _generate(gemini, payload.interests, payload.skills)

    idea_set = IdeaSet(
        interests=payload.interests, skills=payload.skills, used_fallback=used_fallback
    )
    for position, item in enumerate(generated):
        idea_set.ideas.append(
            Idea(
                position=position,
                title=item.title,
                summary=item.summary,
                problem_solved=item.problem_solved,
                feasibility=item.feasibility,
                tech_stack=item.tech_stack,
            )
        )
    session.add(idea_set)
    await session.commit()
    return IdeaSetRead.model_validate(idea_set)


@router.get(
    "/{idea_set_id}",
    response_model=IdeaSetRead,
    summary="Re-read a generated set",
    responses={404: {"model": ErrorResponse, "description": "Not found"}},
)
async def get_idea_set(session: SessionDep, idea_set_id: IdeaSetId) -> IdeaSetRead:
    """Lets the picker survive a refresh without re-billing a Gemini call."""
    idea_set = await session.get(IdeaSet, idea_set_id)
    if idea_set is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Idea set not found")
    return IdeaSetRead.model_validate(idea_set)
