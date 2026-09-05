"""POST /ideas and GET /ideas/{id}."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import StubGemini

PAYLOAD = {"interests": "healthcare", "skills": "python"}


async def test_generates_three_ideas(client: AsyncClient, gemini: StubGemini) -> None:
    response = await client.post("/ideas", json=PAYLOAD)

    assert response.status_code == 201
    body = response.json()
    assert len(body["ideas"]) == 3
    assert body["interests"] == "healthcare"
    assert [i["position"] for i in body["ideas"]] == [0, 1, 2]
    assert body["ideas"][0]["tech_stack"] == ["python", "FastAPI"]
    assert gemini.calls == ["ideas"]


async def test_idea_set_is_readable_after_creation(client: AsyncClient) -> None:
    created = (await client.post("/ideas", json=PAYLOAD)).json()

    fetched = await client.get(f"/ideas/{created['id']}")

    assert fetched.status_code == 200
    assert fetched.json()["id"] == created["id"]
    assert len(fetched.json()["ideas"]) == 3


async def test_falls_back_when_gemini_is_down(client: AsyncClient, gemini: StubGemini) -> None:
    gemini.fail = True

    response = await client.post("/ideas", json=PAYLOAD)

    # Degraded, never dead: the student still gets three usable ideas.
    assert response.status_code == 201
    assert len(response.json()["ideas"]) == 3


async def test_rejects_missing_field(client: AsyncClient) -> None:
    response = await client.post("/ideas", json={"interests": "healthcare"})

    assert response.status_code == 422
    assert response.json() == {"error": "Invalid request"}


async def test_rejects_too_short_input(client: AsyncClient) -> None:
    response = await client.post("/ideas", json={"interests": "a", "skills": "b"})

    assert response.status_code == 422


async def test_rejects_unknown_field(client: AsyncClient) -> None:
    response = await client.post("/ideas", json={**PAYLOAD, "is_admin": True})

    assert response.status_code == 422


async def test_unknown_idea_set_is_404(client: AsyncClient) -> None:
    response = await client.get("/ideas/doesnotexist12345")

    assert response.status_code == 404
    assert response.json() == {"error": "Idea set not found"}


async def test_rate_limit_protects_the_ai_endpoint(client: AsyncClient) -> None:
    codes = [
        (await client.post("/ideas", json=PAYLOAD, headers={"x-forwarded-for": "5.5.5.5"})).status_code
        for _ in range(14)
    ]

    assert 429 in codes, "AI endpoint must be rate limited"
    assert codes.count(201) == 12


async def test_identical_input_reuses_the_cached_generation(
    client: AsyncClient, gemini: StubGemini
) -> None:
    await client.post("/ideas", json=PAYLOAD)
    # Same words, different casing and spacing - must still hit the cache.
    await client.post("/ideas", json={"interests": " Healthcare ", "skills": "PYTHON"})

    assert gemini.calls == ["ideas"], "second identical request must not call Gemini"


async def test_different_input_bypasses_the_cache(
    client: AsyncClient, gemini: StubGemini
) -> None:
    await client.post("/ideas", json=PAYLOAD)
    await client.post("/ideas", json={"interests": "climate", "skills": "rust"})

    assert gemini.calls == ["ideas", "ideas"]


async def test_fallback_is_flagged_not_disguised(
    client: AsyncClient, gemini: StubGemini
) -> None:
    gemini.fail = True

    body = (await client.post("/ideas", json=PAYLOAD)).json()

    # The UI must be able to tell the student this is seeded content.
    assert body["used_fallback"] is True
    assert len(body["ideas"]) == 3
