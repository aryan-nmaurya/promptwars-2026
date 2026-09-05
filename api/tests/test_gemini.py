"""Core AI logic: model fallback, grounding context, and offline fallbacks."""

from __future__ import annotations

import pytest

from app.models import MentorMessage, Project, RoadmapStep
from app.routers.mentor import build_context
from app.services.fallback import fallback_answer, fallback_ideas, fallback_roadmap
from app.services.gemini import (
    GeminiParseError,
    GeminiService,
    GeminiUnavailable,
    GeneratedIdeas,
)


class _FakeModels:
    """Fails for every model in `failing`, succeeds otherwise."""

    def __init__(self, failing: set[str], payload: object) -> None:
        self.failing = failing
        self.payload = payload
        self.attempts: list[str] = []

    async def generate_content(self, *, model: str, contents: str, config: object) -> object:
        self.attempts.append(model)
        if model in self.failing:
            raise RuntimeError(f"{model} unavailable")

        class _Response:
            parsed = self.payload
            text = "plain text answer"

        return _Response()


def _service(
    failing: set[str], payload: object, retries: int = 1
) -> tuple[GeminiService, _FakeModels]:
    service = GeminiService(
        api_key="test", models=["model-a", "model-b"], timeout=5.0, retries=retries
    )
    fake = _FakeModels(failing, payload)
    service._client = type("C", (), {"aio": type("A", (), {"models": fake})()})()  # noqa: SLF001
    return service, fake


async def test_falls_through_to_the_second_model(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = GeneratedIdeas.model_validate(
        {"ideas": [{"title": "t", "summary": "s", "problem_solved": "p",
                    "feasibility": 5, "tech_stack": ["python"]}]}
    )
    service, fake = _service({"model-a"}, payload)

    ideas = await service.generate_ideas("healthcare", "python")

    # One retry per model: a is tried twice before b is reached.
    assert fake.attempts == ["model-a", "model-a", "model-b"]
    assert ideas[0].title == "t"


async def test_raises_when_every_model_fails() -> None:
    service, fake = _service({"model-a", "model-b"}, None)

    with pytest.raises(GeminiUnavailable):
        await service.generate_ideas("healthcare", "python")

    assert fake.attempts == ["model-a", "model-a", "model-b", "model-b"]


async def test_unparsable_response_raises_a_parse_error() -> None:
    service, _ = _service(set(), payload=None)

    with pytest.raises(GeminiParseError):
        await service.generate_ideas("healthcare", "python")


def test_context_grounds_the_mentor_in_one_project() -> None:
    project = Project(
        id="p1", title="Triage Bot", summary="Sorts patients", problem_solved="Queues",
        feasibility=8, tech_stack=["FastAPI", "React"], interests="healthcare", skills="python",
    )
    project.steps = [
        RoadmapStep(phase="Phase 1", position=0, title="Set up repo", is_done=True),
        RoadmapStep(phase="Phase 1", position=1, title="Design schema", is_done=False),
    ]
    project.messages = [MentorMessage(role="user", content="hello")]

    context = build_context(project)

    assert "Triage Bot" in context
    assert "FastAPI, React" in context
    assert "Completed steps (1): Set up repo" in context
    assert "Remaining steps (1): Design schema" in context
    assert "user: hello" in context


def test_fallback_serves_the_seeded_example_project() -> None:
    ideas = fallback_ideas()

    assert len(ideas) == 3
    assert ideas[0].title.startswith("Voice-First Medication")
    assert "FastAPI" in ideas[0].tech_stack
    assert all(1 <= i.feasibility <= 10 for i in ideas)


def test_fallback_roadmap_is_phased_and_ordered() -> None:
    steps = fallback_roadmap()

    assert len(steps) >= 8
    assert steps[0].phase.startswith("Phase 1")
    assert steps[-1].phase.startswith("Phase 4")


def test_fallback_answer_never_fabricates_guidance() -> None:
    answer = fallback_answer("What database should I use?")

    assert "temporarily unreachable" in answer
    assert "saved" in answer
