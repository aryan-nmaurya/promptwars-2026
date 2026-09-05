"""Deterministic content used when every Gemini model is unavailable.

This exists so a network blip during a live demo degrades the product instead
of breaking it. The output is honest about being a template - it never pretends
to be model output - but it keeps every downstream screen functional.
"""

from __future__ import annotations

from app.services.gemini import GeneratedIdea, GeneratedStep

_TEMPLATE_NOTE = "Generated offline while the AI service was unreachable."


def fallback_ideas(interests: str, skills: str) -> list[GeneratedIdea]:
    """Three generic-but-usable ideas seeded from the student's own words."""
    topic = interests.strip() or "your field"
    stack = [s.strip() for s in skills.replace(",", " ").split() if s.strip()][:4]
    stack = stack or ["Python", "FastAPI", "PostgreSQL"]
    shapes = [
        ("Tracker", "records and visualises activity over time"),
        ("Assistant", "answers questions and recommends next actions"),
        ("Analyser", "ingests data and surfaces patterns worth acting on"),
    ]
    return [
        GeneratedIdea(
            title=f"{topic.title()} {name}",
            summary=f"A {name.lower()} for {topic} that {what}. {_TEMPLATE_NOTE}",
            problem_solved=f"People working in {topic} lack a simple tool that {what}.",
            feasibility=7,
            tech_stack=stack,
        )
        for name, what in shapes
    ]


def fallback_roadmap(title: str) -> list[GeneratedStep]:
    """A four-phase plan that applies to essentially any student project."""
    plan: list[tuple[str, str, str]] = [
        ("Phase 1: Foundation", "Set up the repository", "Initialise the repo, add a README and pin dependencies."),
        ("Phase 1: Foundation", "Design the data model", "Sketch the tables and relationships you need."),
        ("Phase 1: Foundation", "Stand up the database", "Run migrations and confirm you can read and write."),
        ("Phase 2: Core build", "Build the main workflow", f"Implement the single path that makes {title} useful."),
        ("Phase 2: Core build", "Expose an API", "Add endpoints with validation on every input."),
        ("Phase 2: Core build", "Build the primary screen", "Wire the interface to the API with loading and error states."),
        ("Phase 3: Hardening", "Write tests", "Cover one success and one failure case per endpoint."),
        ("Phase 3: Hardening", "Handle failures", "Return clear errors and log the real detail server-side."),
        ("Phase 3: Hardening", "Check accessibility", "Verify keyboard navigation, labels and contrast."),
        ("Phase 4: Delivery", "Deploy", "Ship it and confirm it works from a clean browser."),
        ("Phase 4: Delivery", "Write the documentation", "Explain what it does, how to run it and why you built it."),
        ("Phase 4: Delivery", "Prepare the demo", "Script the three-minute walkthrough and rehearse it."),
    ]
    return [GeneratedStep(phase=phase, title=step_title, detail=detail) for phase, step_title, detail in plan]


def fallback_answer(question: str) -> str:
    """Honest placeholder - never fabricates project-specific guidance."""
    return (
        "The AI mentor is temporarily unreachable, so I cannot answer "
        f'"{question.strip()[:120]}" right now. Your project, roadmap and progress '
        "are saved - reload this page in a moment and ask again."
    )
