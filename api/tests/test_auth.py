"""Tests for authentication: signup, login, logout, profile, and project ownership."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Project
from app.models import Session as DbSession

SIGNUP_PAYLOAD = {
    "email": "student@university.edu",
    "password": "CorrectHorseBattery99!",
}


async def test_signup_and_me_returns_user(client: AsyncClient) -> None:
    """A new user can register and read their own profile, which never exposes credentials."""
    signup_res = await client.post("/auth/signup", json=SIGNUP_PAYLOAD)
    assert signup_res.status_code == 201
    signup_body = signup_res.json()
    assert "session_token" in signup_body
    assert signup_body["user"]["email"] == "student@university.edu"
    assert signup_body["user"]["onboarding_completed_at"] is None

    token = signup_body["session_token"]
    me_res = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    me_body = me_res.json()
    assert me_body["id"] == signup_body["user"]["id"]
    assert me_body["email"] == "student@university.edu"
    # Never leak secrets across the wire
    assert "password_hash" not in me_body
    assert "password_salt" not in me_body
    assert "session_token" not in me_body


async def test_login_success(client: AsyncClient) -> None:
    """Registered credentials successfully authenticate and grant a fresh session token."""
    await client.post("/auth/signup", json=SIGNUP_PAYLOAD)

    login_res = await client.post(
        "/auth/login",
        json={"email": "student@university.edu", "password": "CorrectHorseBattery99!"},
    )
    assert login_res.status_code == 200
    body = login_res.json()
    assert "session_token" in body
    assert body["user"]["email"] == "student@university.edu"


async def test_wrong_password_and_unknown_email_return_identical_401(client: AsyncClient) -> None:
    """Wrong password and missing account return identical 401s to prevent email enumeration."""
    await client.post("/auth/signup", json=SIGNUP_PAYLOAD)

    wrong_pw_res = await client.post(
        "/auth/login",
        json={"email": "student@university.edu", "password": "WrongPassword123!"},
    )
    assert wrong_pw_res.status_code == 401

    unknown_email_res = await client.post(
        "/auth/login",
        json={"email": "nobody@university.edu", "password": "AnyPassword123!"},
    )
    assert unknown_email_res.status_code == 401

    # Exact error body match protects against timing/message oracle attacks
    assert wrong_pw_res.json() == unknown_email_res.json()
    assert wrong_pw_res.json() == {"error": "Invalid email or password"}


async def test_expired_session_returns_401(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """Sessions past their expiry date are rejected with 401."""
    signup_res = await client.post("/auth/signup", json=SIGNUP_PAYLOAD)
    token = signup_res.json()["session_token"]

    # Manually expire the session in SQLite
    async with session_factory() as session:
        await session.execute(
            update(DbSession).values(expires_at=datetime.now(UTC) - timedelta(days=1))
        )
        await session.commit()

    res = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


async def test_logout_invalidates_session(client: AsyncClient) -> None:
    """Logging out removes the session row so the token can no longer be used."""
    signup_res = await client.post("/auth/signup", json=SIGNUP_PAYLOAD)
    token = signup_res.json()["session_token"]

    logout_res = await client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_res.status_code == 204

    me_res = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 401


async def test_auth_rate_limiting(client: AsyncClient) -> None:
    """Consecutive login attempts trip the rate limiter with 429."""
    for _ in range(15):
        await client.post(
            "/auth/login",
            json={"email": "student@university.edu", "password": "WrongPassword123!"},
        )

    res = await client.post(
        "/auth/login",
        json={"email": "student@university.edu", "password": "WrongPassword123!"},
    )
    assert res.status_code == 429


async def test_project_created_while_signed_in_carries_user_id(client: AsyncClient) -> None:
    """Projects created by an authenticated user are owned by that user."""
    signup_res = await client.post("/auth/signup", json=SIGNUP_PAYLOAD)
    user_id = signup_res.json()["user"]["id"]
    token = signup_res.json()["session_token"]

    # Generate an idea set
    ideas_res = await client.post("/ideas", json={"interests": "systems", "skills": "rust"})
    assert ideas_res.status_code == 201
    idea_id = ideas_res.json()["ideas"][0]["id"]

    # Create project with auth header
    project_res = await client.post(
        "/projects",
        json={"idea_id": idea_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert project_res.status_code == 201
    project_data = project_res.json()["project"]
    assert project_data["user_id"] == user_id

    # Check onboarding is marked complete
    me_res = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["onboarding_completed_at"] is not None


async def test_signup_adopts_anonymous_projects(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """A student who creates an anonymous demo project can adopt it upon signup."""
    # 1. Create anonymous idea & project
    ideas_res = await client.post("/ideas", json={"interests": "security", "skills": "python"})
    idea_id = ideas_res.json()["ideas"][0]["id"]

    proj_res = await client.post("/projects", json={"idea_id": idea_id})
    assert proj_res.status_code == 201
    anon_project_id = proj_res.json()["project"]["id"]
    edit_token = proj_res.json()["edit_token"]
    assert proj_res.json()["project"]["user_id"] is None

    # 2. Sign up with adoption payload
    signup_payload = {
        **SIGNUP_PAYLOAD,
        "adopted_projects": [{"project_id": anon_project_id, "edit_token": edit_token}],
    }
    signup_res = await client.post("/auth/signup", json=signup_payload)
    assert signup_res.status_code == 201
    user_id = signup_res.json()["user"]["id"]

    # 3. Verify project is now linked to user in database
    async with session_factory() as session:
        proj = await session.get(Project, anon_project_id)
        assert proj is not None
        assert proj.user_id == user_id


async def test_duplicate_signup_rejected(client: AsyncClient) -> None:
    """Registering an existing email is rejected with 409 Conflict."""
    res1 = await client.post("/auth/signup", json=SIGNUP_PAYLOAD)
    assert res1.status_code == 201

    res2 = await client.post("/auth/signup", json=SIGNUP_PAYLOAD)
    assert res2.status_code == 409
    assert res2.json() == {"error": "An account with this email already exists"}


async def test_password_length_enforced(client: AsyncClient) -> None:
    """Passwords shorter than 10 chars are rejected."""
    res = await client.post(
        "/auth/signup",
        json={"email": "short@univ.edu", "password": "too-short"},
    )
    assert res.status_code == 422


async def test_login_sweeps_this_users_expired_sessions(client: AsyncClient) -> None:
    """A dead row per login would grow the sessions table without bound."""
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import func, select

    from app.db import SessionLocal
    from app.models import Session as DbSession

    email = "sweeper@university.edu"
    await client.post("/auth/signup", json={"email": email, "password": "correct-horse-1"})

    async with SessionLocal() as session:
        rows = (await session.scalars(select(DbSession))).all()
        for row in rows:
            row.expires_at = datetime.now(UTC) - timedelta(days=1)
        await session.commit()

    await client.post("/auth/login", json={"email": email, "password": "correct-horse-1"})

    async with SessionLocal() as session:
        total = await session.scalar(select(func.count()).select_from(DbSession))
    assert total == 1, "the expired signup session must be swept, leaving only the fresh one"


async def test_a_swept_session_belongs_only_to_the_user_who_logged_in(
    client: AsyncClient,
) -> None:
    """The sweep is scoped by user_id; it must not touch anyone else's rows."""
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import func, select

    from app.db import SessionLocal
    from app.models import Session as DbSession
    from app.models import User

    await client.post(
        "/auth/signup", json={"email": "first@university.edu", "password": "correct-horse-1"}
    )
    await client.post(
        "/auth/signup", json={"email": "second@university.edu", "password": "correct-horse-2"}
    )

    async with SessionLocal() as session:
        other = await session.scalar(select(User).where(User.email == "second@university.edu"))
        assert other is not None
        rows = (await session.scalars(select(DbSession).where(DbSession.user_id == other.id))).all()
        for row in rows:
            row.expires_at = datetime.now(UTC) - timedelta(days=1)
        await session.commit()

    await client.post(
        "/auth/login", json={"email": "first@university.edu", "password": "correct-horse-1"}
    )

    async with SessionLocal() as session:
        expired_elsewhere = await session.scalar(
            select(func.count())
            .select_from(DbSession)
            .where(DbSession.expires_at <= datetime.now(UTC))
        )
    assert expired_elsewhere == 1, "another account's expired session must survive"
