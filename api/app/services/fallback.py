"""Seeded example content, used for two purposes.

1. `scripts/seed.py` writes it to the database as the demo project.
2. When every Gemini model fails, the routers serve it directly, so a student
   sees a real, coherent project instead of an error page.

Defining it once means the fallback path is exactly what the demo shows, and
callers always mark the result with `used_fallback=True` so the UI can say so
honestly rather than passing seeded content off as freshly generated.
"""

from __future__ import annotations

from app.services.gemini import GeneratedIdea, GeneratedStep

DEMO_INTERESTS = "healthcare and accessibility for elderly patients"
DEMO_SKILLS = "python, react, postgresql"

DEMO_IDEAS: list[dict[str, object]] = [
    {
        "id": "demo-idea-voice",
        "title": "Voice-First Medication Reminder and Tracking Dashboard",
        "summary": (
            "A web application that lets elderly patients confirm each daily medication "
            "using simple voice commands or large visual buttons. Carers see adherence "
            "history remotely through a companion view."
        ),
        "problem_solved": (
            "Elderly patients with low vision or dexterity issues struggle with complex "
            "smartphone apps, which leads to missed medication doses."
        ),
        "feasibility": 9,
        "tech_stack": ["Python", "FastAPI", "React", "PostgreSQL", "Web Speech API"],
    },
    {
        "id": "demo-idea-therapy",
        "title": "Accessible Post-Op Physical Therapy Companion",
        "summary": (
            "An interactive companion that guides patients through exercises prescribed "
            "after surgery, using high-contrast visuals and audio instructions. Progress "
            "is shared with the physiotherapist."
        ),
        "problem_solved": (
            "Patients discharged after surgery forget or abandon their exercise plan, and "
            "clinicians have no visibility until the next appointment."
        ),
        "feasibility": 8,
        "tech_stack": ["Python", "FastAPI", "React", "PostgreSQL"],
    },
    {
        "id": "demo-idea-reports",
        "title": "Plain-Language Medical Report Explainer",
        "summary": (
            "A tool that turns discharge summaries and lab reports into plain language at "
            "a chosen reading level, with the clinical terms kept alongside."
        ),
        "problem_solved": (
            "Patients receive reports written for clinicians and cannot act on advice they "
            "do not understand."
        ),
        "feasibility": 7,
        "tech_stack": ["Python", "FastAPI", "React", "PostgreSQL"],
    },
]

DEMO_STEPS: list[tuple[str, str, str, bool]] = [
    ("Phase 1: Foundation", "Initialise the PostgreSQL database and define the schema",
     "Create tables for patients, medications and adherence events.", True),
    ("Phase 1: Foundation", "Set up the FastAPI backend server",
     "Add a health endpoint and wire up async database sessions.", True),
    ("Phase 1: Foundation", "Scaffold the React frontend",
     "Create the project shell with routing and a high-contrast theme.", True),
    ("Phase 2: Core workflow", "Build the medication CRUD endpoints",
     "Validate every request body and paginate the list endpoint.", False),
    ("Phase 2: Core workflow", "Build the daily medication list screen",
     "Show today's doses with large touch targets and clear state.", False),
    ("Phase 2: Core workflow", "Record an adherence event when a dose is confirmed",
     "Write the event and update the screen optimistically.", False),
    ("Phase 3: Voice and accessibility", "Add Web Speech API voice confirmation",
     "Let the patient say 'taken' to confirm the highlighted dose.", False),
    ("Phase 3: Voice and accessibility", "Provide a non-voice fallback path",
     "Voice must never be the only way to complete an action.", False),
    ("Phase 3: Voice and accessibility", "Audit contrast and keyboard navigation",
     "Verify 4.5:1 text contrast and that every control is reachable.", False),
    ("Phase 4: Carer view and delivery", "Build the carer adherence dashboard",
     "Summarise the last 30 days per medication.", False),
    ("Phase 4: Carer view and delivery", "Write tests for both paths",
     "One success and one failure case per endpoint.", False),
    ("Phase 4: Carer view and delivery", "Deploy and rehearse the demo",
     "Ship it, then script the three-minute walkthrough.", False),
]

DEMO_CONVERSATION: list[tuple[str, str]] = [
    ("user", "I just finished the database step. What exactly should I do next?"),
    (
        "assistant",
        "Your next step is 'Set up the FastAPI backend server'. Concretely: create a "
        "backend/ directory, install fastapi, uvicorn and asyncpg, then add a health "
        "endpoint so you can prove the server and database talk to each other before "
        "you build any real feature. Getting that thin slice working end to end is "
        "worth more than a perfect schema.",
    ),
]


def fallback_ideas() -> list[GeneratedIdea]:
    """The three seeded ideas, as if Gemini had returned them."""
    return [
        GeneratedIdea(
            title=str(spec["title"]),
            summary=str(spec["summary"]),
            problem_solved=str(spec["problem_solved"]),
            feasibility=int(spec["feasibility"]),  # type: ignore[arg-type]
            tech_stack=list(spec["tech_stack"]),  # type: ignore[arg-type]
        )
        for spec in DEMO_IDEAS
    ]


def fallback_roadmap() -> list[GeneratedStep]:
    """The seeded twelve-step, four-phase build plan."""
    return [
        GeneratedStep(phase=phase, title=title, detail=detail)
        for phase, title, detail, _done in DEMO_STEPS
    ]


def fallback_answer(question: str) -> str:
    """Honest placeholder - never fabricates project-specific guidance."""
    return (
        "The AI mentor is temporarily unreachable, so I cannot answer "
        f'"{question.strip()[:120]}" right now. Your project, roadmap and progress '
        "are saved - reload this page in a moment and ask again."
    )
