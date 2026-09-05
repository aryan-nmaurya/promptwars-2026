"""Shared test fixtures.

Tests run against in-memory SQLite so `pytest` needs zero infrastructure.
`StaticPool` keeps one connection alive for the whole test, which is what makes
`:memory:` usable - the opposite of the NullPool the app uses in production.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
os.environ.setdefault("ENV", "test")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool  # noqa: E402

from app import (
    db,  # noqa: E402
    deps,  # noqa: E402
)
from app.deps import get_gemini  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.models import Base  # noqa: E402
from app.ratelimit import reset_rate_limit  # noqa: E402
from app.routers.ideas import reset_ideas_cache  # noqa: E402
from app.services.gemini import (  # noqa: E402
    GeminiUnavailable,
    GeneratedIdea,
    GeneratedStep,
)  # noqa: E402


class StubGemini:
    """Deterministic stand-in for the Gemini SDK.

    Set `fail=True` to make every call raise, which is how the tests exercise
    the fallback path without touching the network.
    """

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.calls: list[str] = []

    async def generate_ideas(self, interests: str, skills: str) -> list[GeneratedIdea]:
        self.calls.append("ideas")
        if self.fail:
            raise GeminiUnavailable("stubbed failure")
        return [
            GeneratedIdea(
                title=f"Idea {n} for {interests}",
                summary="A stubbed summary.",
                problem_solved="A stubbed problem.",
                feasibility=7 + n,
                tech_stack=[skills, "FastAPI"],
            )
            for n in range(3)
        ]

    async def generate_roadmap(
        self, title: str, summary: str, tech_stack: list[str], skills: str
    ) -> list[GeneratedStep]:
        self.calls.append("roadmap")
        if self.fail:
            raise GeminiUnavailable("stubbed failure")
        return [
            GeneratedStep(phase="Phase 1: Foundation", title="Set up repo", detail="d"),
            GeneratedStep(phase="Phase 2: Core build", title="Build it", detail="d"),
        ]

    async def stream_answer(self, *, context: str, question: str):  # type: ignore[no-untyped-def]
        self.calls.append("stream")
        if self.fail:
            raise GeminiUnavailable("stubbed failure")
        for piece in ("Grounded ", "streamed ", f"answer. Context saw: {context[:120]}"):
            yield piece

    async def ping(self) -> bool:
        self.calls.append("ping")
        return not self.fail

    async def answer_question(self, *, context: str, question: str) -> str:
        self.calls.append("mentor")
        if self.fail:
            raise GeminiUnavailable("stubbed failure")
        # Echo the context back so tests can assert the answer was grounded.
        return f"Grounded answer. Context saw: {context[:800]}"


@pytest.fixture
def gemini() -> StubGemini:
    return StubGemini()


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    test_engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield test_engine
    await test_engine.dispose()


@pytest.fixture
async def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(autouse=True)
def _clean_shared_state() -> None:
    """Rate-limit counters and the idea cache are process-global."""
    reset_rate_limit()
    reset_ideas_cache()


@pytest.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    gemini: StubGemini,
) -> AsyncIterator[AsyncClient]:
    """App wired to the throwaway SQLite database."""
    # Both the request dependency and the health probe read this factory.
    monkeypatch.setattr(db, "SessionLocal", session_factory)
    fastapi_app.dependency_overrides[get_gemini] = lambda: gemini
    # /health calls gemini_or_none() directly, outside the dependency graph.
    monkeypatch.setattr(deps, "_service", lambda: gemini)

    transport = ASGITransport(app=fastapi_app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as http_client:
            yield http_client
    finally:
        fastapi_app.dependency_overrides.clear()
