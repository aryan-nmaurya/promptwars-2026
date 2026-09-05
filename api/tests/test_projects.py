"""Project creation, reading, listing, and roadmap step updates."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import StubGemini

PAYLOAD = {"interests": "healthcare", "skills": "python"}


async def _make_project(client: AsyncClient) -> dict:
    ideas = (await client.post("/ideas", json=PAYLOAD)).json()
    response = await client.post("/projects", json={"idea_id": ideas["ideas"][0]["id"]})
    assert response.status_code == 201
    return response.json()


async def test_choosing_an_idea_creates_a_project_with_a_roadmap(
    client: AsyncClient, gemini: StubGemini
) -> None:
    project = await _make_project(client)

    assert project["title"].startswith("Idea 0")
    assert project["steps_total"] == 2
    assert project["steps_done"] == 0
    assert project["steps"][0]["phase"] == "Phase 1: Foundation"
    assert project["used_fallback"] is False
    assert project["interests"] == "healthcare", "student context is carried over"
    assert gemini.calls == ["ideas", "roadmap"]


async def test_project_is_publicly_readable_by_url(client: AsyncClient) -> None:
    project = await _make_project(client)

    fetched = await client.get(f"/projects/{project['id']}")

    assert fetched.status_code == 200
    assert fetched.json()["id"] == project["id"]


async def test_falls_back_when_roadmap_generation_fails(
    client: AsyncClient, gemini: StubGemini
) -> None:
    ideas = (await client.post("/ideas", json=PAYLOAD)).json()
    gemini.fail = True

    response = await client.post("/projects", json={"idea_id": ideas["ideas"][0]["id"]})

    assert response.status_code == 201
    assert response.json()["steps_total"] > 0, "fallback roadmap must not be empty"


async def test_unknown_idea_is_404(client: AsyncClient) -> None:
    response = await client.post("/projects", json={"idea_id": "nope12345678"})

    assert response.status_code == 404
    assert response.json() == {"error": "Idea not found"}


async def test_missing_idea_id_is_422(client: AsyncClient) -> None:
    response = await client.post("/projects", json={})

    assert response.status_code == 422


async def test_unknown_project_is_404(client: AsyncClient) -> None:
    response = await client.get("/projects/doesnotexist12345")

    assert response.status_code == 404


async def test_list_projects_paginates(client: AsyncClient) -> None:
    for _ in range(3):
        await _make_project(client)

    page = await client.get("/projects", params={"limit": 2, "offset": 0})

    assert page.status_code == 200
    assert page.json()["meta"] == {"total": 3, "limit": 2, "offset": 0}
    assert len(page.json()["items"]) == 2


async def test_list_rejects_oversized_limit(client: AsyncClient) -> None:
    response = await client.get("/projects", params={"limit": 999})

    assert response.status_code == 422


async def test_ticking_a_step_persists(client: AsyncClient) -> None:
    project = await _make_project(client)
    step_id = project["steps"][0]["id"]

    patched = await client.patch(
        f"/projects/{project['id']}/steps/{step_id}", json={"is_done": True}
    )

    assert patched.status_code == 200
    assert patched.json()["is_done"] is True

    refreshed = (await client.get(f"/projects/{project['id']}")).json()
    assert refreshed["steps_done"] == 1


async def test_step_from_another_project_cannot_be_touched(client: AsyncClient) -> None:
    mine = await _make_project(client)
    theirs = await _make_project(client)

    # Correct step id, wrong project id: must not leak across projects.
    response = await client.patch(
        f"/projects/{mine['id']}/steps/{theirs['steps'][0]['id']}", json={"is_done": True}
    )

    assert response.status_code == 404


async def test_step_update_rejects_bad_body(client: AsyncClient) -> None:
    project = await _make_project(client)

    response = await client.patch(
        f"/projects/{project['id']}/steps/{project['steps'][0]['id']}",
        json={"is_done": "yes please"},
    )

    assert response.status_code == 422
