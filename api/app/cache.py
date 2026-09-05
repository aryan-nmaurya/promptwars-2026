"""Tiny in-process TTL cache.

Serverless instances are short-lived, so this is a best-effort saving: it stops
a student who hits "regenerate" repeatedly, or reloads the form, from paying for
an identical Gemini call within the window. It is deliberately not a shared
cache - correctness never depends on a hit.
"""

from __future__ import annotations

import hashlib
import time
from typing import Generic, TypeVar

T = TypeVar("T")

MAX_ENTRIES = 256


def cache_key(*parts: str) -> str:
    """Stable hash of normalised inputs, so casing and spacing do not split keys."""
    normalised = "\x1f".join(part.strip().casefold() for part in parts)
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()[:32]


class TTLCache(Generic[T]):
    """Single-process dict cache with per-entry expiry."""

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._entries: dict[str, tuple[float, T]] = {}

    def get(self, key: str) -> T | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at < time.monotonic():
            self._entries.pop(key, None)
            return None
        return value

    def set(self, key: str, value: T) -> None:
        if len(self._entries) >= MAX_ENTRIES:
            self._evict_expired()
        if len(self._entries) >= MAX_ENTRIES:
            self._entries.pop(next(iter(self._entries)), None)
        self._entries[key] = (time.monotonic() + self._ttl, value)

    def _evict_expired(self) -> None:
        now = time.monotonic()
        for key in [k for k, (expires, _) in self._entries.items() if expires < now]:
            self._entries.pop(key, None)

    def clear(self) -> None:
        self._entries.clear()

    def __len__(self) -> int:
        return len(self._entries)
