"""Pydantic v2 schemas.

`ApiModel` fixes serialisation behaviour once. Everything crossing the wire
inherits from it, so no route can accidentally accept unknown keys or leak an
ORM attribute that was never meant to be public.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

T = TypeVar("T")

MAX_INTERESTS = 500
MAX_SKILLS = 500
MAX_QUESTION = 1000


class ApiModel(BaseModel):
    """Base for every request and response body."""

    model_config = ConfigDict(
        from_attributes=True,
        extra="forbid",
        str_strip_whitespace=True,
        validate_assignment=True,
    )


class HealthResponse(ApiModel):
    status: str = Field(examples=["ok"])
    db: bool
    gemini: bool


class ErrorResponse(ApiModel):
    """The only error shape this API returns."""

    error: str


class PageMeta(ApiModel):
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)


class Page(ApiModel, Generic[T]):
    items: list[T]
    meta: PageMeta


# --- Auth --------------------------------------------------------------------


class UserRead(ApiModel):
    id: str
    email: str
    created_at: datetime
    onboarding_completed_at: datetime | None = None


class AdoptedProject(ApiModel):
    project_id: str
    edit_token: str


class SignupRequest(ApiModel):
    email: Annotated[str, Field(min_length=3, max_length=320)]
    password: Annotated[str, Field(min_length=10, max_length=200)]
    adopted_projects: list[AdoptedProject] = Field(default_factory=list)


class LoginRequest(ApiModel):
    email: Annotated[str, Field(min_length=3, max_length=320)]
    password: Annotated[str, Field(min_length=1, max_length=200)]


class AuthResponse(ApiModel):
    user: UserRead
    session_token: str


class UserUpdate(ApiModel):
    onboarding_completed: bool


# --- Ideas -------------------------------------------------------------------

NonEmpty = Annotated[str, Field(min_length=2)]


class IdeaSetCreate(ApiModel):
    """What the student types on the landing form."""

    interests: Annotated[str, Field(min_length=2, max_length=MAX_INTERESTS)]
    skills: Annotated[str, Field(min_length=2, max_length=MAX_SKILLS)]


class IdeaRead(ApiModel):
    id: str
    position: int
    title: str
    summary: str
    problem_solved: str
    feasibility: int = Field(ge=0, le=10)
    tech_stack: list[str]
    core_features: list[str] = Field(default_factory=list)
    stretch_goals: list[str] = Field(default_factory=list)


class IdeaSetRead(ApiModel):
    id: str
    interests: str
    skills: str
    created_at: datetime
    used_fallback: bool = False
    ideas: list[IdeaRead]


# --- Projects ----------------------------------------------------------------


class ProjectCreate(ApiModel):
    """Promote one generated idea into a project with a roadmap."""

    idea_id: NonEmpty


class RepositoryEvaluate(ApiModel):
    """A public GitHub repository to compare with the frozen project plan."""

    github_url: Annotated[str, Field(min_length=19, max_length=500)]


class RepositorySnapshot(ApiModel):
    url: str
    full_name: str
    commit_sha: str
    default_branch: str


class EvaluationScores(ApiModel):
    """Category scores, where `null` means the evidence could not support one.

    A number here is a measurement. When the analyzed files contain nothing
    that speaks to a category - no tests, no README, no security control - the
    honest answer is to report nothing rather than a guess, and to leave that
    category out of the weighted total instead of scoring it zero.
    """

    #: Always assessable: it is derived from the frozen plan, which always exists.
    feature_completion: int = Field(ge=0, le=100)
    architecture: int | None = Field(default=None, ge=0, le=100)
    code_quality: int | None = Field(default=None, ge=0, le=100)
    testing: int | None = Field(default=None, ge=0, le=100)
    documentation: int | None = Field(default=None, ge=0, le=100)
    security: int | None = Field(default=None, ge=0, le=100)


class EvidenceReference(ApiModel):
    path: Annotated[str, Field(min_length=1, max_length=500)]
    reason: Annotated[str, Field(min_length=1, max_length=500)]


class PlannedVsBuiltItem(ApiModel):
    planned_item: Annotated[str, Field(min_length=1, max_length=300)]
    status: Literal["implemented", "partial", "not_found", "insufficient_evidence"]
    confidence: float = Field(ge=0, le=1)
    evidence: list[EvidenceReference] = Field(default_factory=list, max_length=5)
    gap: Annotated[str | None, Field(max_length=800)] = None

    @model_validator(mode="after")
    def evidence_matches_status(self) -> PlannedVsBuiltItem:
        """Positive claims need evidence; gaps need an actionable explanation."""
        if self.status in ("implemented", "partial") and not self.evidence:
            raise ValueError("implemented and partial items require repository evidence")
        if self.status != "implemented" and not self.gap:
            raise ValueError("non-implemented items require a gap explanation")
        return self


class EvaluationFix(ApiModel):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    why: Annotated[str, Field(min_length=1, max_length=500)]
    how: Annotated[str, Field(min_length=1, max_length=800)]


class EvaluationCoverage(ApiModel):
    tree_complete: bool
    files_considered: int = Field(ge=0)
    files_analyzed: int = Field(ge=0)
    bytes_analyzed: int = Field(ge=0)


class EvaluationRead(ApiModel):
    id: str
    repository: RepositorySnapshot
    #: Weighted across the assessed categories only, so an unassessed category
    #: neither drags the total down nor is quietly counted as if it passed.
    overall_score: int = Field(ge=0, le=100)
    scores: EvaluationScores
    #: Category names reported as `null` above, so the UI can say why.
    unassessed_categories: list[str] = Field(default_factory=list, max_length=6)
    planned_vs_built: list[PlannedVsBuiltItem] = Field(min_length=1, max_length=12)
    top_fixes: list[EvaluationFix] = Field(max_length=3)
    coverage: EvaluationCoverage
    limitations: list[str] = Field(default_factory=list, max_length=10)
    created_at: datetime


class RoadmapStepRead(ApiModel):
    id: str
    phase: str
    position: int
    title: str
    detail: str
    is_done: bool


class StepUpdate(ApiModel):
    is_done: bool


class ProjectSummary(ApiModel):
    """Row shape for the paginated list - no steps, no messages."""

    id: str
    title: str
    summary: str
    feasibility: int
    tech_stack: list[str]
    created_at: datetime


class ProjectRead(ApiModel):
    id: str
    user_id: str | None = None
    title: str
    summary: str
    problem_solved: str
    feasibility: int
    tech_stack: list[str]
    core_features: list[str] = Field(default_factory=list)
    stretch_goals: list[str] = Field(default_factory=list)
    created_at: datetime
    used_fallback: bool = False
    steps: list[RoadmapStepRead]
    steps_total: int
    steps_done: int
    latest_evaluation: EvaluationRead | None = None


class ProjectCreated(ApiModel):
    """Creation returns the raw edit capability exactly once."""

    project: ProjectRead
    edit_token: str


# --- Mentor ------------------------------------------------------------------


class MentorAsk(ApiModel):
    question: Annotated[str, Field(min_length=3, max_length=MAX_QUESTION)]


class MentorMessageRead(ApiModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class MentorReply(ApiModel):
    question: MentorMessageRead
    answer: MentorMessageRead
