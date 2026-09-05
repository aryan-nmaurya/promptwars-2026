"""Authentication service: password hashing and session tokens.

Standard library only — zero extra dependencies.
- Password hashing: PBKDF2-HMAC-SHA256 with 600,000 iterations (OWASP recommendation)
  and 16-byte cryptographically secure salt.
- Sessions: High-entropy URL-safe tokens stored only as SHA-256 digests.
- Constant-time comparisons and dummy verification to mitigate timing attacks.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime, timedelta

PBKDF2_ITERATIONS = 600_000
SALT_BYTES = 16
SESSION_TOKEN_BYTES = 32
# The raw token lives in the browser's localStorage, which any injected script
# can read. Thirty days made a single leak effectively permanent; seven bounds
# it, and logging in issues a fresh token rather than extending the old one.
SESSION_TTL_DAYS = 7

# Strict RFC 5322-compliant basic pattern avoiding catastrophic backtracking
EMAIL_PATTERN = re.compile(
    r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*(?:\.[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)+$"
)

# Pre-computed dummy salt for timing equalization on missing accounts
_DUMMY_SALT = "0" * 32
_DUMMY_HASH = "0" * 64


def normalize_email(email: str) -> str:
    """Strip and lowercase an email address."""
    return email.strip().lower()


def is_valid_email(email: str) -> bool:
    """Validate email format and length."""
    normalized = normalize_email(email)
    if len(normalized) > 320 or len(normalized) < 3:
        return False
    return bool(EMAIL_PATTERN.match(normalized))


def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    """Derive PBKDF2-HMAC-SHA256 hash.

    Returns ``(derived_hash_hex, salt_hex)``.
    """
    salt_bytes = secrets.token_bytes(SALT_BYTES) if salt is None else salt
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt_bytes,
        PBKDF2_ITERATIONS,
    )
    return derived.hex(), salt_bytes.hex()


def verify_password(password: str, salt_hex: str, expected_hash_hex: str) -> bool:
    """Verify password against salt and hash using constant-time comparison."""
    try:
        salt_bytes = bytes.fromhex(salt_hex)
    except ValueError:
        return False

    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt_bytes,
        PBKDF2_ITERATIONS,
    )
    return hmac.compare_digest(derived.hex(), expected_hash_hex)


def dummy_verify_password(password: str) -> bool:
    """Run full PBKDF2 computation to ensure identical response timing for nonexistent emails."""
    verify_password(password, _DUMMY_SALT, _DUMMY_HASH)
    return False


def hash_session_token(token: str) -> str:
    """Return SHA-256 digest of session token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_session_token() -> tuple[str, str, datetime]:
    """Generate a new session token.

    Returns ``(raw_token, token_hash, expires_at)``.
    The raw token is returned once to the caller and never stored.
    """
    raw_token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
    token_hash = hash_session_token(raw_token)
    expires_at = datetime.now(UTC) + timedelta(days=SESSION_TTL_DAYS)
    return raw_token, token_hash, expires_at
