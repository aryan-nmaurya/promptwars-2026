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
        "core_features": [
            "Daily medication schedule",
            "Large-button dose confirmation",
            "Voice dose confirmation",
            "Adherence history for carers",
        ],
        "stretch_goals": ["Missed-dose notifications", "Multi-language voice prompts"],
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
        "core_features": [
            "Clinician-authored exercise plans",
            "Accessible guided exercise sessions",
            "Patient completion tracking",
            "Physiotherapist progress view",
        ],
        "stretch_goals": ["Camera-assisted form feedback"],
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
        "core_features": [
            "Medical report text upload",
            "Plain-language explanation",
            "Clinical term cross-references",
            "Selectable reading level",
        ],
        "stretch_goals": ["Document OCR", "Downloadable patient summary"],
    },
]

DEMO_STEPS: list[tuple[str, str, str, bool]] = [
    (
        "Phase 1: Foundation",
        "Initialise the PostgreSQL database and define the schema",
        "Create tables for patients, medications and adherence events.",
        True,
    ),
    (
        "Phase 1: Foundation",
        "Set up the FastAPI backend server",
        "Add a health endpoint and wire up async database sessions.",
        True,
    ),
    (
        "Phase 1: Foundation",
        "Scaffold the React frontend",
        "Create the project shell with routing and a high-contrast theme.",
        True,
    ),
    (
        "Phase 2: Core workflow",
        "Build the medication CRUD endpoints",
        "Validate every request body and paginate the list endpoint.",
        False,
    ),
    (
        "Phase 2: Core workflow",
        "Build the daily medication list screen",
        "Show today's doses with large touch targets and clear state.",
        False,
    ),
    (
        "Phase 2: Core workflow",
        "Record an adherence event when a dose is confirmed",
        "Write the event and update the screen optimistically.",
        False,
    ),
    (
        "Phase 3: Voice and accessibility",
        "Add Web Speech API voice confirmation",
        "Let the patient say 'taken' to confirm the highlighted dose.",
        False,
    ),
    (
        "Phase 3: Voice and accessibility",
        "Provide a non-voice fallback path",
        "Voice must never be the only way to complete an action.",
        False,
    ),
    (
        "Phase 3: Voice and accessibility",
        "Audit contrast and keyboard navigation",
        "Verify 4.5:1 text contrast and that every control is reachable.",
        False,
    ),
    (
        "Phase 4: Carer view and delivery",
        "Build the carer adherence dashboard",
        "Summarise the last 30 days per medication.",
        False,
    ),
    (
        "Phase 4: Carer view and delivery",
        "Write tests for both paths",
        "One success and one failure case per endpoint.",
        False,
    ),
    (
        "Phase 4: Carer view and delivery",
        "Deploy and rehearse the demo",
        "Ship it, then script the three-minute walkthrough.",
        False,
    ),
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
            core_features=list(spec["core_features"]),  # type: ignore[arg-type]
            stretch_goals=list(spec["stretch_goals"]),  # type: ignore[arg-type]
        )
        for spec in DEMO_IDEAS
    ]


def fallback_roadmap(
    *,
    title: str | None = None,
    summary: str = "",
    tech_stack: list[str] | None = None,
    core_features: list[str] | None = None,
) -> list[GeneratedStep]:
    """Return a coherent roadmap scoped to the selected project.

    Calling without a title intentionally retains the hand-written demo plan
    used by the seed script. Runtime fallback always supplies a title, so an
    unrelated medication roadmap can never leak into another project.
    """
    if not title:
        return [
            GeneratedStep(phase=phase, title=step_title, detail=detail)
            for phase, step_title, detail, _done in DEMO_STEPS
        ]

    project_title = title.strip()[:160] or "the selected project"
    stack = ", ".join((tech_stack or [])[:8]) or "the chosen technology stack"
    features = [feature.strip()[:220] for feature in (core_features or []) if feature.strip()]
    if not features:
        features = [
            "the primary user workflow",
            "persistent project data",
            "validation and recovery states",
            "a useful progress or results view",
        ]

    steps: list[GeneratedStep] = [
        GeneratedStep(
            phase="Phase 1: Foundation",
            title=f"Freeze the scope for {project_title}",
            detail=(
                "Write a pass/fail acceptance check for every core feature and mark stretch "
                f"work out of scope. Use this project summary as the boundary: {summary[:400]}"
            ),
        ),
        GeneratedStep(
            phase="Phase 1: Foundation",
            title="Set up the repository and development environment",
            detail=f"Create a reproducible local setup for {stack}, including an example env file.",
        ),
        GeneratedStep(
            phase="Phase 1: Foundation",
            title="Design the data and interface contracts",
            detail="Define the smallest data model, API boundaries and screen flow needed by the core scope.",
        ),
    ]

    for feature in features[:3]:
        steps.append(
            GeneratedStep(
                phase="Phase 2: Core workflow",
                title=f"Implement {feature}",
                detail=(
                    "Build one end-to-end happy path and verify it against the feature's "
                    "acceptance check before adding polish."
                ),
            )
        )
    steps.append(
        GeneratedStep(
            phase="Phase 2: Core workflow",
            title="Connect the end-to-end user journey",
            detail="Join the core screens, API operations and persisted state into one demoable flow.",
        )
    )

    for feature in features[3:6]:
        steps.append(
            GeneratedStep(
                phase="Phase 3: Complete and verify",
                title=f"Implement {feature}",
                detail="Complete this promised feature and record the files that prove it works.",
            )
        )
    steps.extend(
        [
            GeneratedStep(
                phase="Phase 3: Complete and verify",
                title="Test the critical success and failure paths",
                detail="Automate at least one success and one meaningful failure case for each core workflow.",
            ),
            GeneratedStep(
                phase="Phase 3: Complete and verify",
                title="Harden accessibility, validation and error recovery",
                detail="Check keyboard use, readable states, input boundaries and recoverable dependency failures.",
            ),
            GeneratedStep(
                phase="Phase 4: Delivery",
                title="Document setup, architecture and scope coverage",
                detail="Write a README that lets a reviewer run the project and trace every core feature.",
            ),
            GeneratedStep(
                phase="Phase 4: Delivery",
                title=f"Deploy and rehearse the {project_title} demo",
                detail="Deploy an immutable build, run a smoke test, and rehearse the three-minute core journey.",
            ),
        ]
    )
    return steps


def fallback_answer(question: str) -> str:
    """Honest placeholder - never fabricates project-specific guidance."""
    return (
        "The AI mentor is temporarily unreachable, so I cannot answer "
        f'"{question.strip()[:120]}" right now. Your project, roadmap and progress '
        "are saved - reload this page in a moment and ask again."
    )
