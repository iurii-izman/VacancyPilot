"""Bounded local rate limiter for pairing and protected calls.

Uses a sliding-window in-memory store.  Not distributed — correct for a
single-process local companion bound to loopback.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from threading import Lock
from typing import Protocol


class TimeProvider(Protocol):
    def __call__(self) -> float: ...


def _default_time() -> float:
    return time.time()


@dataclass
class _Window:
    """Sliding-window bucket for a single key."""

    timestamps: list[float] = field(default_factory=list)


@dataclass
class RateLimitConfig:
    """Configuration for a single rate limit."""

    max_requests: int
    window_seconds: float
    max_keys: int = 128


class RateLimiter:
    """Thread-safe in-memory rate limiter.

    Usage::

        limiter = RateLimiter(config=RateLimitConfig(max_requests=5, window_seconds=60))
        if not limiter.allow('127.0.0.1'):
            raise HTTPException(429)
    """

    def __init__(
        self,
        config: RateLimitConfig,
        *,
        time_provider: TimeProvider = _default_time,
    ) -> None:
        self._config = config
        self._time = time_provider
        self._buckets: dict[str, _Window] = {}
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        """Return True when *key* is under the rate limit."""
        with self._lock:
            now = self._time()
            cutoff = now - self._config.window_seconds

            # The key population is bounded, so a complete expiry sweep is
            # predictable and prevents empty attacker-created buckets from
            # surviving for the lifetime of the process.
            for bucket_key, bucket in list(self._buckets.items()):
                bucket.timestamps = [ts for ts in bucket.timestamps if ts > cutoff]
                if not bucket.timestamps:
                    del self._buckets[bucket_key]

            window = self._buckets.get(key)
            if window is None:
                if len(self._buckets) >= self._config.max_keys:
                    return False
                window = _Window()
                self._buckets[key] = window

            if len(window.timestamps) >= self._config.max_requests:
                return False

            window.timestamps.append(now)
            return True

    def reset(self, key: str | None = None) -> None:
        """Clear rate-limit state for *key*, or all keys when None."""
        with self._lock:
            if key is not None:
                self._buckets.pop(key, None)
            else:
                self._buckets.clear()


# ── Pre-configured limiters ──────────────────────────────────────────────

# Pairing endpoints get a tight limit to prevent brute-force.
PAIRING_RATE_LIMIT = RateLimitConfig(max_requests=10, window_seconds=60)

# General protected endpoints get a moderate limit.
PROTECTED_RATE_LIMIT = RateLimitConfig(max_requests=100, window_seconds=60)
