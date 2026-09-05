"""Stateless helpers for owner-only project mutations.

Project pages are intentionally shareable without an account.  The raw edit
capability is returned exactly once, when a project is created, while only its
SHA-256 digest is stored.  A leaked database therefore cannot be used to edit
projects, and existing/demo projects without a digest remain read-only.
"""

from __future__ import annotations

import hashlib
import secrets

from fastapi import HTTPException, status

from app.models import Project

EDIT_TOKEN_BYTES = 32
EDIT_TOKEN_MAX_LENGTH = 256


def issue_edit_token() -> tuple[str, str]:
    """Return ``(raw capability, digest for storage)``.

    The token has 256 bits of entropy.  It must only be sent to the creator;
    subsequent reads expose neither the raw value nor its digest.
    """
    token = secrets.token_urlsafe(EDIT_TOKEN_BYTES)
    return token, _token_digest(token)


def _token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_project_edit_token(project: Project, token: str | None) -> None:
    """Reject a missing or invalid edit capability with a uniform response."""
    stored_digest = project.edit_token_hash
    candidate = token.strip() if token else ""

    # Hash a bounded candidate even when the project is read-only.  Keeping the
    # comparison shape uniform avoids exposing whether a shared project has an
    # owner token, while the length cap prevents needlessly hashing huge input.
    if len(candidate) > EDIT_TOKEN_MAX_LENGTH:
        candidate = ""
    candidate_digest = _token_digest(candidate)
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
