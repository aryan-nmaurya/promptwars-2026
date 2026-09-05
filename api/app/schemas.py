"""Pydantic v2 schemas.

`ApiModel` fixes serialisation behaviour once. Everything crossing the wire
inherits from it, so no route can accidentally accept unknown keys or leak an
ORM attribute that was never meant to be public.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

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


class IdeaSetRead(ApiModel):
    id: str
    interests: str
    skills: str
    created_at: datetime
    ideas: list[IdeaRead]


# --- Projects ----------------------------------------------------------------


class ProjectCreate(ApiModel):
    """Promote one generated idea into a project with a roadmap."""

    idea_id: NonEmpty


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
    title: str
    summary: str
    problem_solved: str
    feasibility: int
    tech_stack: list[str]
    interests: str
    skills: str
    created_at: datetime
    steps: list[RoadmapStepRead]
    steps_total: int
    steps_done: int


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
