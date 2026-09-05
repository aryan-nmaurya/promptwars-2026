"""The Gemini Project Mentor: grounded answers and conversation history."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import StubGemini

PAYLOAD = {"interests": "healthcare", "skills": "python"}


async def _make_project(client: AsyncClient) -> dict:
    ideas = (await client.post("/ideas", json=PAYLOAD)).json()
    return (await client.post("/projects", json={"idea_id": ideas["ideas"][0]["id"]})).json()


async def test_answer_is_grounded_in_this_project(
    client: AsyncClient, gemini: StubGemini
) -> None:
    project = await _make_project(client)

    response = await client.post(
        f"/projects/{project['id']}/mentor", json={"question": "Where do I start?"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["question"]["role"] == "user"
    assert body["answer"]["role"] == "assistant"
    # The stub echoes its context back, proving the project was passed through.
    assert project["title"] in body["answer"]["content"]
    assert "mentor" in gemini.calls


async def test_context_includes_roadmap_progress(client: AsyncClient) -> None:
    project = await _make_project(client)
    await client.patch(
        f"/projects/{project['id']}/steps/{project['steps'][0]['id']}", json={"is_done": True}
    )

    answer = (
        await client.post(
            f"/projects/{project['id']}/mentor", json={"question": "What is next?"}
        )
    ).json()["answer"]["content"]

    assert "Completed steps (1)" in answer, "mentor must see what is already done"


async def test_conversation_is_persisted_in_order(client: AsyncClient) -> None:
    project = await _make_project(client)
    await client.post(f"/projects/{project['id']}/mentor", json={"question": "First question?"})
    await client.post(f"/projects/{project['id']}/mentor", json={"question": "Second question?"})

    history = await client.get(f"/projects/{project['id']}/mentor")

    assert history.status_code == 200
    body = history.json()
    assert body["meta"]["total"] == 4  # two questions, two answers
    assert [m["role"] for m in body["items"]] == ["user", "assistant", "user", "assistant"]
    assert body["items"][0]["content"] == "First question?"


async def test_history_paginates(client: AsyncClient) -> None:
    project = await _make_project(client)
    await client.post(f"/projects/{project['id']}/mentor", json={"question": "A question?"})

    page = await client.get(f"/projects/{project['id']}/mentor", params={"limit": 1})

    assert page.json()["meta"] == {"total": 2, "limit": 1, "offset": 0}
    assert len(page.json()["items"]) == 1


async def test_falls_back_when_gemini_is_down(client: AsyncClient, gemini: StubGemini) -> None:
    project = await _make_project(client)
    gemini.fail = True

    response = await client.post(
        f"/projects/{project['id']}/mentor", json={"question": "Help me please"}
    )

    assert response.status_code == 201
    assert "temporarily unreachable" in response.json()["answer"]["content"]


async def test_asking_about_unknown_project_is_404(client: AsyncClient) -> None:
    response = await client.post(
        "/projects/doesnotexist12345/mentor", json={"question": "Anything?"}
    )

    assert response.status_code == 404
    assert response.json() == {"error": "Project not found"}


async def test_history_of_unknown_project_is_404(client: AsyncClient) -> None:
    response = await client.get("/projects/doesnotexist12345/mentor")

    assert response.status_code == 404


async def test_empty_question_is_rejected(client: AsyncClient) -> None:
    project = await _make_project(client)

    response = await client.post(f"/projects/{project['id']}/mentor", json={"question": ""})

    assert response.status_code == 422
    assert response.json() == {"error": "Invalid request"}


async def test_overlong_question_is_rejected(client: AsyncClient) -> None:
    project = await _make_project(client)

    response = await client.post(
        f"/projects/{project['id']}/mentor", json={"question": "x" * 1001}
    )

    assert response.status_code == 422


async def _sse_events(client: AsyncClient, project_id: str, question: str) -> list[str]:
    """Collect raw SSE frames from the streaming endpoint."""
    frames: list[str] = []
    async with client.stream(
        "POST", f"/projects/{project_id}/mentor/stream", json={"question": question}
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        async for line in response.aiter_lines():
            frames.append(line)
    return frames


async def test_streaming_sends_chunks_then_a_done_frame(client: AsyncClient) -> None:
    project = await _make_project(client)

    frames = await _sse_events(client, project["id"], "What should I build first?")

    body = "\n".join(frames)
    assert body.count("event: chunk") >= 2, "answer must arrive in pieces"
    assert body.count("event: done") == 1, "exactly one terminal frame"
    assert project["title"] in body, "streamed answer must be grounded in this project"


async def test_streaming_persists_the_exchange_once(client: AsyncClient) -> None:
    project = await _make_project(client)

    await _sse_events(client, project["id"], "Where do I start?")
    history = (await client.get(f"/projects/{project['id']}/mentor")).json()

    assert history["meta"]["total"] == 2, "one question and one answer, not a partial write"
    assert [m["role"] for m in history["items"]] == ["user", "assistant"]
    assert "Grounded" in history["items"][1]["content"]


async def test_streaming_falls_back_when_gemini_dies(
    client: AsyncClient, gemini: StubGemini
) -> None:
    project = await _make_project(client)
    gemini.fail = True

    frames = await _sse_events(client, project["id"], "Help me please")

    body = "\n".join(frames)
    assert "temporarily unreachable" in body
    assert '"used_fallback": true' in body.replace(", ", ", ")


async def test_streaming_unknown_project_is_404(client: AsyncClient) -> None:
    response = await client.post(
        "/projects/doesnotexist12345/mentor/stream", json={"question": "Anything?"}
    )

    assert response.status_code == 404
