"""Pairing lifecycle: challenge, confirmation, and client token management.

The pairing flow:

1. ``POST /pair/start`` — creates a short-lived six-digit code displayed
   out-of-band by the companion.  Returns a challenge ID (UUID).
2. ``POST /pair/confirm`` — accepts the challenge ID + code.  Returns a
   random client token exactly once.
3. ``POST /pair/revoke`` — invalidates the current client token.

The client token is stored as a SHA-256 hash in SQLite, never in plaintext.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import text
from sqlalchemy.orm import Session

# ── Client token hashing ─────────────────────────────────────────────────


def hash_client_token(token: str) -> str:
    """Return a SHA-256 hex digest of *token*.

    The caller must never log or store the raw *token* after hashing.
    """
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def generate_client_token() -> str:
    """Return a cryptographically random 256-bit hex token."""
    return secrets.token_hex(32)


# ── Pairing code ─────────────────────────────────────────────────────────


def generate_pairing_code() -> str:
    """Return a six-digit numeric pairing code (000000–999999)."""
    return f'{secrets.randbelow(1_000_000):06d}'


# ── Protocol for time (testable) ─────────────────────────────────────────


class TimeProvider(Protocol):
    """Callable that returns the current Unix timestamp."""

    def __call__(self) -> float: ...


def _default_time() -> float:
    return time.time()


# ── Challenge store ──────────────────────────────────────────────────────


@dataclass
class PairingChallenge:
    """In-memory pairing challenge. Single-use, short-lived."""

    challenge_id: str
    code: str
    created_at: float
    attempts: int = 0


# ── Pairing service ──────────────────────────────────────────────────────


class PairingService:
    """Manages the pairing lifecycle.

    Challenges are stored in memory (volatile — restart clears them).
    Client tokens are hashed and persisted in the settings table through
    the ``settings`` key ``pairing_client_token_hash``.
    """

    _CHALLENGE_TTL_SECONDS = 300  # 5 minutes
    _MAX_ATTEMPTS = 5
    _MAX_ACTIVE_CHALLENGES = 50
    _TOKEN_SETTINGS_KEY = 'pairing_client_token_hash'

    def __init__(
        self,
        *,
        time_provider: TimeProvider = _default_time,
    ) -> None:
        self._time = time_provider
        self._challenges: dict[str, PairingChallenge] = {}

    # ── Challenge lifecycle ──────────────────────────────────────────

    def start_challenge(self) -> tuple[str, str]:
        """Create a new challenge. Returns (challenge_id, code).

        The code must be displayed out-of-band by the companion process
        (stdout or a platform notification), never returned to an
        arbitrary web caller.
        """
        self._purge_expired()
        if len(self._challenges) >= self._MAX_ACTIVE_CHALLENGES:
            raise PairingCapacityError
        challenge_id = secrets.token_hex(16)
        code = generate_pairing_code()
        self._challenges[challenge_id] = PairingChallenge(
            challenge_id=challenge_id,
            code=code,
            created_at=self._time(),
        )
        return challenge_id, code

    def confirm_challenge(
        self,
        challenge_id: str,
        code: str,
        db: Session,
    ) -> str | None:
        """Validate code against challenge. Returns a new client token or None.

        The token is hashed and persisted atomically.  Returns None when:
        - challenge_id is unknown or expired
        - code is wrong (increments attempt counter)
        - challenge is already used
        - max attempts exceeded
        - a client token is already paired
        """
        self._purge_expired()
        challenge = self._challenges.get(challenge_id)

        if challenge is None:
            return None

        if not hmac.compare_digest(challenge.code, code):
            challenge.attempts += 1
            if challenge.attempts >= self._MAX_ATTEMPTS:
                del self._challenges[challenge_id]
            return None

        # Code correct — single-use: remove the challenge.
        del self._challenges[challenge_id]

        # Reject if already paired.
        if self._get_stored_hash(db) is not None:
            return None

        token = generate_client_token()
        token_hash = hash_client_token(token)
        self._store_hash(db, token_hash)
        return token

    def revoke(self, db: Session) -> None:
        """Invalidate the current client token.  Idempotent."""
        db.execute(
            text('DELETE FROM settings WHERE key = :key'),
            {'key': self._TOKEN_SETTINGS_KEY},
        )

    def verify_token(self, token: str, db: Session) -> bool:
        """Return True when *token* matches the stored hash."""
        stored = self._get_stored_hash(db)
        if stored is None:
            return False
        return hmac.compare_digest(hash_client_token(token), stored)

    # ── Persistence helpers ──────────────────────────────────────────

    def _get_stored_hash(self, db: Session) -> str | None:
        row = db.execute(
            text('SELECT value_json FROM settings WHERE key = :key'),
            {'key': self._TOKEN_SETTINGS_KEY},
        ).fetchone()
        if row is None:
            return None
        return str(row[0])

    def _store_hash(self, db: Session, token_hash: str) -> None:
        db.execute(
            text(
                'INSERT OR REPLACE INTO settings '
                '(key, value_json, revision, created_at, updated_at) '
                'VALUES (:key, :value, 1, :now, :now)'
            ),
            {
                'key': self._TOKEN_SETTINGS_KEY,
                'value': token_hash,
                'now': _utcnow_str(),
            },
        )

    # ── Housekeeping ─────────────────────────────────────────────────

    def _purge_expired(self) -> None:
        now = self._time()
        expired = [
            cid
            for cid, ch in self._challenges.items()
            if now - ch.created_at > self._CHALLENGE_TTL_SECONDS
        ]
        for cid in expired:
            del self._challenges[cid]


def _utcnow_str() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


class PairingCapacityError(RuntimeError):
    """Raised when the bounded active-challenge store is full."""


# ── Singleton pairing service ──────────────────────────────────────────────

# The pairing service must be a module-level singleton so that the in-memory
# challenge store is shared across all route handlers.  Without this, each
# ``POST /pair/start`` call would create a challenge visible only to its
# own ``PairingService`` instance, and ``POST /pair/confirm`` would never
# find it.
_pairing_service: PairingService = PairingService()


def get_pairing_service() -> PairingService:
    """Return the singleton pairing service instance."""
    return _pairing_service
