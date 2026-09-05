"""Shared FastAPI dependencies."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.services.gemini import GeminiService, build_gemini


@lru_cache(maxsize=1)
def _service() -> GeminiService | None:
    return build_gemini(get_settings())


def gemini_or_none() -> GeminiService | None:
    """The service, or None when unconfigured. For probes that must not raise."""
    return _service()


def get_gemini() -> GeminiService:
    """503 rather than 500 when the key is missing - a config fault, not a bug."""
    service = _service()
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured",
        )
    return service


SessionDep = Annotated[AsyncSession, Depends(get_session)]
GeminiDep = Annotated[GeminiService, Depends(get_gemini)]
