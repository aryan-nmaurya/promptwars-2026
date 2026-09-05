"""Project creation, reading, listing, and roadmap step updates."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import StubGemini

PAYLOAD = {"interests": "healthcare", "skills": "python"}


async def _make_project(client: AsyncClient) -> dict:
    ideas = (await client.post("/ideas", json=PAYLOAD)).json()
    response = await client.post("/projects", json={"idea_id": ideas["ideas"][0]["id"]})
    assert response.status_code == 201
    body = response.json()
    project = body["project"]
    project["_edit_token"] = body["edit_token"]
    return project


def _owner_headers(project: dict) -> dict[str, str]:
    return {"x-project-edit-token": project["_edit_token"]}


async def test_choosing_an_idea_creates_a_project_with_a_roadmap(
    client: AsyncClient, gemini: StubGemini
) -> None:
    project = await _make_project(client)

    assert project["title"].startswith("Idea 0")
    assert project["steps_total"] == 12
    assert project["steps_done"] == 0
    assert project["steps"][0]["phase"] == "Phase 1: Foundation"
    assert project["used_fallback"] is False
    assert "interests" not in project and "skills" not in project
    assert len(project["core_features"]) == 4
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
    assert response.json()["project"]["steps_total"] > 0, "fallback roadmap must not be empty"


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


async def test_projects_cannot_be_globally_enumerated(client: AsyncClient) -> None:
    """The list endpoint is scoped to the caller; there is no page of everyone's work."""
    await _make_project(client)

    response = await client.get("/projects")

    assert response.status_code == 401


async def test_ticking_a_step_persists(client: AsyncClient) -> None:
    project = await _make_project(client)
    step_id = project["steps"][0]["id"]

    patched = await client.patch(
        f"/projects/{project['id']}/steps/{step_id}",
        json={"is_done": True},
        headers=_owner_headers(project),
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
        f"/projects/{mine['id']}/steps/{theirs['steps'][0]['id']}",
        json={"is_done": True},
        headers=_owner_headers(mine),
    )

    assert response.status_code == 404


async def test_step_update_rejects_bad_body(client: AsyncClient) -> None:
    project = await _make_project(client)

    response = await client.patch(
        f"/projects/{project['id']}/steps/{project['steps'][0]['id']}",
        json={"is_done": "yes please"},
        headers=_owner_headers(project),
    )

    assert response.status_code == 422


async def test_shared_project_cannot_update_progress(client: AsyncClient) -> None:
    project = await _make_project(client)

    response = await client.patch(
        f"/projects/{project['id']}/steps/{project['steps'][0]['id']}",
        json={"is_done": True},
    )

    assert response.status_code == 403
    assert response.json() == {"error": "This shared project is read-only"}
