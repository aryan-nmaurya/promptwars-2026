"""Authentication router: signup, login, logout, and current user profile."""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.auth_service import (
    dummy_verify_password,
    hash_password,
    is_valid_email,
    issue_session_token,
    normalize_email,
    verify_password,
)
from app.deps import CurrentSessionDep, CurrentUserDep, SessionDep
from app.models import Project, User
from app.models import Session as DbSession
from app.project_access import _token_digest
from app.ratelimit import RateLimiter
from app.schemas import (
    AuthResponse,
    ErrorResponse,
    LoginRequest,
    SignupRequest,
    UserRead,
    UserUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    responses={
        400: {"model": ErrorResponse, "description": "Bad request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        422: {"model": ErrorResponse, "description": "Invalid request parameters"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)

# Dedicated rate limiter scopes so auth endpoints don't exhaust each other or AI budgets
signup_limit = Depends(RateLimiter(limit=10, window_seconds=60.0, scope="auth_signup"))
login_limit = Depends(RateLimiter(limit=15, window_seconds=60.0, scope="auth_login"))

GENERIC_AUTH_ERROR = "Invalid email or password"


async def _adopt_projects(
    session: SessionDep, user_id: str, adopted_projects: list[object]
) -> None:
    """Adopt anonymous projects created in the current browser before signup."""
    for item in adopted_projects:
        project_id = getattr(item, "project_id", None)
        edit_token = getattr(item, "edit_token", None)
        if not project_id or not edit_token:
            continue

        project = await session.get(Project, project_id)
        if project is None or project.user_id is not None or not project.edit_token_hash:
            continue

        candidate_digest = _token_digest(edit_token.strip())
        if secrets.compare_digest(candidate_digest, project.edit_token_hash):
            project.user_id = user_id
            logger.info("Adopted anonymous project id=%s for user_id=%s", project.id, user_id)


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[signup_limit],
    summary="Create a new user account",
)
async def signup(payload: SignupRequest, session: SessionDep) -> AuthResponse:
    """Register a new user, optionally adopt local projects, and issue a session token."""
    email = normalize_email(payload.email)
    if not is_valid_email(email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid email format",
        )

    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    password_hash, password_salt = hash_password(payload.password)
    user = User(
        email=email,
        password_hash=password_hash,
        password_salt=password_salt,
    )
    session.add(user)
    await session.flush()  # populate user.id

    if payload.adopted_projects:
        await _adopt_projects(session, user.id, payload.adopted_projects)

    raw_token, token_hash, expires_at = issue_session_token()
    db_session = DbSession(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(db_session)
    await session.commit()

    return AuthResponse(
        user=UserRead.model_validate(user),
        session_token=raw_token,
    )


@router.post(
    "/login",
    response_model=AuthResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[login_limit],
    summary="Authenticate and receive a session token",
)
async def login(payload: LoginRequest, session: SessionDep) -> AuthResponse:
    """Log in with email and password.

    Timing and error responses are deliberately identical for missing users and
    wrong passwords to prevent account enumeration.
    """
    email = normalize_email(payload.email)
    user = await session.scalar(select(User).where(User.email == email))

    if user is None:
        dummy_verify_password(payload.password)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
        )

    if not verify_password(payload.password, user.password_salt, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
        )

    raw_token, token_hash, expires_at = issue_session_token()
    db_session = DbSession(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(db_session)
    await session.commit()

    return AuthResponse(
        user=UserRead.model_validate(user),
        session_token=raw_token,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Terminate the current session",
)
async def logout(current_session: CurrentSessionDep, session: SessionDep) -> None:
    """Invalidate the session token by deleting its database record."""
    await session.delete(current_session)
    await session.commit()


@router.get(
    "/me",
    response_model=UserRead,
    summary="Get current user profile",
)
async def get_me(current_user: CurrentUserDep) -> UserRead:
    """Return the authenticated user profile. Never exposes session tokens or hashes."""
    return UserRead.model_validate(current_user)


@router.patch(
    "/me",
    response_model=UserRead,
    summary="Update current user profile (e.g. mark onboarding complete)",
)
async def update_me(
    payload: UserUpdate, current_user: CurrentUserDep, session: SessionDep
) -> UserRead:
    """Update user state like onboarding completion."""
    if payload.onboarding_completed and current_user.onboarding_completed_at is None:
        current_user.onboarding_completed_at = datetime.now(UTC)
        await session.commit()
    return UserRead.model_validate(current_user)
