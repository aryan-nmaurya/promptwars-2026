"""The demo path.

`/projects/demo-project-2026` is the URL the README promises always works,
because it needs no Gemini call. That promise is only worth something if the
seed script is exercised, so these tests run it against the throwaway database
and then read the demo project back through the public API.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import seed  # noqa: E402


async def _run_seed(session_factory: async_sessionmaker[AsyncSession]) -> str | None:
    async with session_factory() as session:
        await seed._seed_idea_set(session)
        await session.flush()
        raw_edit_token = await seed._seed_project(session)
        await session.commit()
    return raw_edit_token


async def test_seeding_publishes_the_demo_project_at_its_stable_url(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await _run_seed(session_factory)

    response = await client.get(f"/projects/{seed.DEMO_PROJECT_ID}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == seed.DEMO_PROJECT_ID
    assert body["title"]
    assert body["core_features"], "the frozen scope drives Planned vs Built"
    assert body["steps_total"] >= 10, "the demo must open on a full roadmap"
    assert body["steps_done"] > 0, "the demo must open with visible progress"
    assert body["used_fallback"] is False, "seeded content is not a live-generation claim"


async def test_seeding_publishes_the_demo_idea_set(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await _run_seed(session_factory)

    response = await client.get(f"/ideas/{seed.DEMO_SET_ID}")

    assert response.status_code == 200
    body = response.json()
    assert len(body["ideas"]) == 3
    assert [idea["position"] for idea in body["ideas"]] == [0, 1, 2]


async def test_reseeding_is_idempotent_and_keeps_the_edit_capability(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """Re-running the script must not duplicate rows or invalidate a live demo."""
    first_token = await _run_seed(session_factory)
    first = (await client.get(f"/projects/{seed.DEMO_PROJECT_ID}")).json()

    second_token = await _run_seed(session_factory)
    second = (await client.get(f"/projects/{seed.DEMO_PROJECT_ID}")).json()

    assert first_token is not None, "the first seed mints a capability"
    assert second_token is None, "a re-seed must leave the presenter's capability working"
    assert first["steps_total"] == second["steps_total"]
    assert [step["id"] for step in first["steps"]] == [step["id"] for step in second["steps"]]


async def test_the_demo_project_is_read_only_without_the_capability(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """A judge opening the shared URL can read everything and change nothing."""
    await _run_seed(session_factory)
    project = (await client.get(f"/projects/{seed.DEMO_PROJECT_ID}")).json()
    step_id = project["steps"][0]["id"]

    response = await client.patch(
        f"/projects/{seed.DEMO_PROJECT_ID}/steps/{step_id}",
        json={"is_done": False},
    )

    assert response.status_code == 403


@pytest.mark.parametrize("identifier", [seed.DEMO_PROJECT_ID, seed.DEMO_SET_ID])
def test_demo_ids_satisfy_the_route_path_constraints(identifier: str) -> None:
    """The stable ids are hand-written, so they must still fit the 8-32 char bound."""
    assert 8 <= len(identifier) <= 32
