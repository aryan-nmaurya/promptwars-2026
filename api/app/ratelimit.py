"""Per-IP rate limiter.

In-memory and therefore per-instance: on Vercel each warm Lambda keeps its own
counters, so the effective limit is `limit x instances`. That is fine as a
cheap abuse brake. If you need a real global limit, back this with Upstash
Redis - the dependency signature stays the same.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Final

from fastapi import Depends, HTTPException, Request, status

_HITS: Final[defaultdict[str, deque[float]]] = defaultdict(deque)
_MAX_TRACKED_IPS: Final[int] = 10_000


def client_ip(request: Request) -> str:
    """Real client IP behind Vercel's proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def reset_rate_limit() -> None:
    """Clear all counters. Used by tests."""
    _HITS.clear()


class RateLimiter:
    """Sliding-window limiter. Use as `Depends(RateLimiter(60, 60))`."""

    def __init__(self, limit: int = 60, window_seconds: float = 60.0) -> None:
        if limit < 1:
            raise ValueError("limit must be >= 1")
        self.limit = limit
        self.window = window_seconds

    async def __call__(self, request: Request) -> None:
        now = time.monotonic()
        ip = client_ip(request)

        if len(_HITS) > _MAX_TRACKED_IPS and ip not in _HITS:
            _HITS.clear()  # crude eviction; bounded memory beats precision here

        bucket = _HITS[ip]
        cutoff = now - self.window
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

        if len(bucket) >= self.limit:
            retry_after = max(1, int(self.window - (now - bucket[0])) + 1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded",
                headers={"Retry-After": str(retry_after)},
            )

        bucket.append(now)


#: Default brake applied to the example router. Tune per-route as needed.
default_rate_limit = Depends(RateLimiter(limit=120, window_seconds=60.0))
