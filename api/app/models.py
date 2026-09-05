"""IdeaForge schema.

Five tables covering the whole demo path: a student's generation request
(`IdeaSet`) yields three `Idea` rows; choosing one creates a `Project`, which
owns its `RoadmapStep` list and its `MentorMessage` history.

Primary keys are random URL-safe tokens, not sequential integers. Project URLs
are shared with professors and there is no auth, so sequential ids would let
anyone enumerate every student's project by counting.
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

    idea_set: Mapped[IdeaSet] = relationship(back_populates="ideas")

    __table_args__ = (
        # Every list query is WHERE idea_set_id = ? ORDER BY position.
        Index("ix_ideas_set_position", "idea_set_id", "position"),
    )


class Project(Base):
    """A chosen idea, promoted to something the student is actually building.

    Idea fields are copied rather than joined: the project page is the shared
    artefact and must keep rendering even if the parent idea set is pruned.
    """

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    source_idea_id: Mapped[str | None] = mapped_column(
        ForeignKey("ideas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    problem_solved: Mapped[str] = mapped_column(Text, nullable=False, default="")
    feasibility: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tech_stack: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    interests: Mapped[str] = mapped_column(Text, nullable=False, default="")
    skills: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

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
