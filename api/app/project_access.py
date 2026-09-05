"""Stateless helpers for owner-only project mutations.

Project pages are intentionally shareable without an account.  The raw edit
capability is returned exactly once, when a project is created, while only its
SHA-256 digest is stored.  A leaked database therefore cannot be used to edit
projects, and existing/demo projects without a digest remain read-only.

There are two ways to prove ownership, and a caller needs either one:

* **The browser capability.**  The anonymous path.  Whoever holds the token
  created this project, whether or not they ever made an account.
* **The account.**  Once a project has a ``user_id``, the signed-in owner can
  edit it from any device.  Without this the capability - issued once, stored
  in one browser - would be the only key that exists, so signing in on a new
  machine would list projects that could not be touched.
"""

from __future__ import annotations

import hashlib
import secrets

from fastapi import HTTPException, status

from app.models import Project, User

EDIT_TOKEN_BYTES = 32
EDIT_TOKEN_MAX_LENGTH = 256


def issue_edit_token() -> tuple[str, str]:
    """Return ``(raw capability, digest for storage)``.

    The token has 256 bits of entropy.  It must only be sent to the creator;
    subsequent reads expose neither the raw value nor its digest.
    """
    token = secrets.token_urlsafe(EDIT_TOKEN_BYTES)
    return token, token_digest(token)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def user_owns_project(project: Project, user: User | None) -> bool:
    """True when the signed-in user is the recorded owner of this project."""
    return user is not None and project.user_id is not None and project.user_id == user.id


def authorize_project_write(project: Project, token: str | None, user: User | None = None) -> None:
    """Allow the write if the caller holds the capability OR owns the account.

    The account check runs first and short-circuits, so a signed-in owner never
    depends on a browser token they may never have had.
    """
    if user_owns_project(project, user):
        return
    verify_project_edit_token(project, token)


def verify_project_edit_token(project: Project, token: str | None) -> None:
    """Reject a missing or invalid edit capability with a uniform response."""
    stored_digest = project.edit_token_hash
    candidate = token.strip() if token else ""

    # Hash a bounded candidate even when the project is read-only.  Keeping the
    # comparison shape uniform avoids exposing whether a shared project has an
    # owner token, while the length cap prevents needlessly hashing huge input.
    if len(candidate) > EDIT_TOKEN_MAX_LENGTH:
        candidate = ""
    candidate_digest = token_digest(candidate)
    expected_digest = stored_digest or ("0" * 64)

    if (
        not stored_digest
        or not candidate
        or not secrets.compare_digest(candidate_digest, expected_digest)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This shared project is read-only",
        )
