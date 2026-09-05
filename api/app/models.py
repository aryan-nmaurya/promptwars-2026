"""IdeaForge schema.

Six tables covering the whole product loop: a student's generation request
(`IdeaSet`) yields three `Idea` rows; choosing one creates a `Project`, which
owns its `RoadmapStep` list, `MentorMessage` history, and repository evaluations.

Primary keys are random URL-safe tokens, not sequential integers. Project URLs
are shared read-only with professors, so sequential ids would let anyone
enumerate every student's project by counting. A separate capability protects writes.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

TOKEN_BYTES = 12


def new_id() -> str:
    """Unguessable, URL-safe primary key (~16 chars)."""
    return secrets.token_urlsafe(TOKEN_BYTES)


class Base(DeclarativeBase):
    """Declarative base. `Base.metadata` drives migration."""


class IdeaSet(Base):
    """One 'generate ideas for me' request and its Gemini output."""

    __tablename__ = "idea_sets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    interests: Mapped[str] = mapped_column(Text, nullable=False)
    skills: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    # True when Gemini was unreachable and seeded content was served instead.
    # Persisted so the UI can be honest about it on a later page load.
    used_fallback: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    ideas: Mapped[list[Idea]] = relationship(
        back_populates="idea_set",
        cascade="all, delete-orphan",
        order_by="Idea.position",
        lazy="selectin",  # one extra query, never N+1
    )


class Idea(Base):
    """One of the three generated ideas. Becomes a Project only if chosen."""

    __tablename__ = "ideas"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    idea_set_id: Mapped[str] = mapped_column(
        ForeignKey("idea_sets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    problem_solved: Mapped[str] = mapped_column(Text, nullable=False, default="")
    feasibility: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tech_stack: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    # The frozen scope that a later repository evaluation compares against.
    core_features: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    stretch_goals: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    idea_set: Mapped[IdeaSet] = relationship(back_populates="ideas")

    __table_args__ = (
        # Every list query is WHERE idea_set_id = ? ORDER BY position.
        Index("ix_ideas_set_position", "idea_set_id", "position"),
    )


class User(Base):
    """Registered user account."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    password_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    sessions: Mapped[list[Session]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    projects: Mapped[list[Project]] = relationship(
        back_populates="user",
        lazy="selectin",
    )


class Session(Base):
    """Authenticated user session token."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[User] = relationship(back_populates="sessions")


class Project(Base):
    """A chosen idea, promoted to something the student is actually building.

    Idea fields are copied rather than joined: the project page is the shared
    artefact and must keep rendering even if the parent idea set is pruned.
    """

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_idea_id: Mapped[str | None] = mapped_column(
        ForeignKey("ideas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    problem_solved: Mapped[str] = mapped_column(Text, nullable=False, default="")
    feasibility: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tech_stack: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    core_features: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    stretch_goals: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    interests: Mapped[str] = mapped_column(Text, nullable=False, default="")
    skills: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Only a SHA-256 digest is stored. The raw capability is returned once to
    # the creating browser and is required for every mutation and AI call.
    edit_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    used_fallback: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user: Mapped[User | None] = relationship(back_populates="projects")
    steps: Mapped[list[RoadmapStep]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="RoadmapStep.position",
        lazy="selectin",
    )
    messages: Mapped[list[MentorMessage]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="MentorMessage.created_at",
        lazy="selectin",
    )
    evaluations: Mapped[list[Evaluation]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="Evaluation.created_at",
        passive_deletes=True,
        lazy="raise",
    )


class RoadmapStep(Base):
    """One checkable step inside a phase of the build plan."""

    __tablename__ = "roadmap_steps"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    phase: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    project: Mapped[Project] = relationship(back_populates="steps")

    __table_args__ = (Index("ix_steps_project_position", "project_id", "position"),)


class MentorMessage(Base):
    """A turn in the mentor conversation. `role` is 'user' or 'assistant'."""

    __tablename__ = "mentor_messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Python-side, not server_default=func.now(): Postgres' now() is
    # TRANSACTION start time, so a question and its answer written in one
    # transaction would share a timestamp and the chat would render in
    # arbitrary order. This gives each row its true creation instant.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    project: Mapped[Project] = relationship(back_populates="messages")

    __table_args__ = (Index("ix_messages_project_created", "project_id", "created_at"),)


class Evaluation(Base):
    """Immutable analysis of one repository commit against a project plan."""

    __tablename__ = "evaluations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    repository_url: Mapped[str] = mapped_column(String(500), nullable=False)
    repository_full_name: Mapped[str] = mapped_column(String(300), nullable=False)
    commit_sha: Mapped[str] = mapped_column(String(64), nullable=False)
    evaluator_version: Mapped[str] = mapped_column(String(32), nullable=False)
    overall_score: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped[Project] = relationship(back_populates="evaluations")

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "repository_full_name",
            "commit_sha",
            "evaluator_version",
            name="uq_evaluations_project_repo_commit_version",
        ),
        Index("ix_evaluations_project_created", "project_id", "created_at"),
    )
