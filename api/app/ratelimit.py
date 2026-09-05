"""Per-session and per-IP rate limiting.

Two buckets, both enforced:

* **Session** - an anonymous id the browser generates once and stores locally,
  sent as `x-session-id`. This is the tight limit, because it identifies one
  student rather than one network.
* **IP** - a looser ceiling that catches someone rotating session ids. It has
  to be loose: a university NAT puts a whole campus behind one address, and an
  IP-only limit would let one student lock out the room.

A header is used rather than a cookie deliberately. The web app and the API are
on different origins, so any cookie the API set would be third-party - blocked
outright by Safari and being phased out in Chrome. A header carries the same
anonymous identifier and works reliably cross-origin, so there is no session
cookie in this system to attach Secure/SameSite to.

In-memory and therefore per-instance: on Vercel each warm function keeps its
own counters, so the real ceiling is `limit x instances`. It is an abuse brake,
not a quota. Swap in Upstash Redis for a global limit; the signature is the same.
"""

from __future__ import annotations

import re
import time
from collections import defaultdict, deque
from typing import Final

from fastapi import Depends, HTTPException, Request, status

_HITS: Final[defaultdict[str, deque[float]]] = defaultdict(deque)
_MAX_TRACKED_KEYS: Final[int] = 10_000

SESSION_HEADER = "x-session-id"
_VALID_SESSION = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def client_ip(request: Request) -> str:
    """Real client IP behind Vercel's proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def session_id(request: Request) -> str:
    """Anonymous per-browser id, or the IP when the header is absent or malformed."""
    raw = request.headers.get(SESSION_HEADER, "").strip()
    if _VALID_SESSION.match(raw):
        return raw
    return f"ip:{client_ip(request)}"


def reset_rate_limit() -> None:
    """Clear all counters. Used by tests."""
    _HITS.clear()


def _consume(key: str, limit: int, window: float) -> float | None:
    """Record a hit. Returns seconds to wait if the bucket is full, else None."""
    now = time.monotonic()
    if len(_HITS) > _MAX_TRACKED_KEYS and key not in _HITS:
        _HITS.clear()  # crude eviction; bounded memory beats precision here

    bucket = _HITS[key]
    cutoff = now - window
    while bucket and bucket[0] <= cutoff:
        bucket.popleft()

    if len(bucket) >= limit:
        return window - (now - bucket[0])
    bucket.append(now)
    return None


class RateLimiter:
    """Sliding-window limiter over both the session and the IP bucket."""

    def __init__(
        self,
        limit: int = 60,
        window_seconds: float = 60.0,
        ip_limit: int | None = None,
        scope: str = "default",
    ) -> None:
        if limit < 1:
            raise ValueError("limit must be >= 1")
        self.limit = limit
        self.window = window_seconds
        # Default: five sessions' worth, so a shared campus IP is not the
        # binding constraint for a single well-behaved student.
        self.ip_limit = ip_limit if ip_limit is not None else limit * 5
        self.scope = scope

    async def __call__(self, request: Request) -> None:
        for key, limit in (
            (f"{self.scope}:s:{session_id(request)}", self.limit),
            (f"{self.scope}:i:{client_ip(request)}", self.ip_limit),
        ):
            retry_after = _consume(key, limit, self.window)
            if retry_after is not None:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded",
                    headers={"Retry-After": str(max(1, int(retry_after) + 1))},
                )


#: Default brake for non-AI routes.
default_rate_limit = Depends(RateLimiter(limit=120, window_seconds=60.0))
