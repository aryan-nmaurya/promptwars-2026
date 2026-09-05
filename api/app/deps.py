"""Shared FastAPI dependencies."""

from __future__ import annotations

from datetime import UTC, datetime
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth_service import hash_session_token
from app.config import get_settings
from app.db import get_session
from app.models import Session as DbSession
from app.models import User
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


bearer_scheme = HTTPBearer(auto_error=False)

SessionDep = Annotated[AsyncSession, Depends(get_session)]
GeminiDep = Annotated[GeminiService, Depends(get_gemini)]


async def get_current_session_and_user_optional(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> tuple[DbSession | None, User | None]:
    if credentials is None or not credentials.credentials:
        return None, None
    token = credentials.credentials.strip()
    token_hash = hash_session_token(token)
    stmt = (
        select(DbSession)
        .where(DbSession.token_hash == token_hash)
        .options(selectinload(DbSession.user))
    )
    result = await session.scalar(stmt)
    if result is None:
        return None, None
    expires_at = result.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        return None, None
    return result, result.user


async def get_current_user_optional(
    session_and_user: Annotated[
        tuple[DbSession | None, User | None],
        Depends(get_current_session_and_user_optional),
    ],
) -> User | None:
    return session_and_user[1]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session_and_user: Annotated[
        tuple[DbSession | None, User | None],
        Depends(get_current_session_and_user_optional),
    ],
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    user = session_and_user[1]
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
        )
    return user


async def get_current_session(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session_and_user: Annotated[
        tuple[DbSession | None, User | None],
        Depends(get_current_session_and_user_optional),
    ],
) -> DbSession:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    db_session = session_and_user[0]
    if db_session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
        )
    return db_session


CurrentUserDep = Annotated[User, Depends(get_current_user)]
CurrentSessionDep = Annotated[DbSession, Depends(get_current_session)]
OptionalUserDep = Annotated[User | None, Depends(get_current_user_optional)]
