"""Authenticated, short-lived preview receipts.

Preview receipts bind an explicit user review to the exact provider plan that
may later be executed.  They contain only identifiers and fingerprints: no
prompt, payload, API key, client token, or candidate content is ever placed in
the receipt.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
import time
from collections.abc import Mapping
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.security.keyring import KeyringBackend, OSKeyring, SecretSlot


class ReceiptClock(Protocol):
    def __call__(self) -> float: ...


def _now() -> float:
    return time.time()


class PreviewReceiptClaims(BaseModel):
    """The non-sensitive signed claims carried by a preview receipt."""

    model_config = ConfigDict(extra='forbid')

    version: int = Field(default=1, ge=1, le=1)
    kind: str = Field(min_length=1, max_length=64)
    issued_at: int = Field(ge=0)
    expires_at: int = Field(ge=0)
    nonce: str = Field(min_length=16, max_length=128)
    provider_plan_hash: str = Field(pattern=r'^[0-9a-f]{64}$')
    subject_ids: dict[str, str] = Field(min_length=1, max_length=8)
    provider: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1, max_length=128)
    privacy_policy_fingerprint: str = Field(pattern=r'^[0-9a-f]{64}$')
    domain_identity: str = Field(min_length=1, max_length=64)


class ReceiptVerificationError(ValueError):
    """Raised when a receipt is absent, malformed, invalid, or stale."""


class ReceiptKeyUnavailableError(RuntimeError):
    """Raised when the companion cannot access its receipt signing key."""


def _canonical_json(value: Mapping[str, Any]) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(',', ':'),
        ensure_ascii=False,
    ).encode('utf-8')


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode('ascii').rstrip('=')


def _b64decode(value: str) -> bytes:
    if not value or len(value) > 32768:
        raise ReceiptVerificationError('Receipt is malformed')
    try:
        return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
    except (ValueError, binascii.Error) as exc:
        raise ReceiptVerificationError('Receipt is malformed') from exc


class ReceiptSigner:
    """HMAC-SHA256 receipt signer with constant-time verification."""

    MAX_TTL_SECONDS = 15 * 60
    MAX_RECEIPT_LENGTH = 65536

    def __init__(
        self,
        key: bytes | str | None = None,
        *,
        keyring: KeyringBackend | None = None,
        time_provider: ReceiptClock = _now,
        ttl_seconds: int = 5 * 60,
    ) -> None:
        self._key = key.encode('utf-8') if isinstance(key, str) else key
        self._keyring = keyring
        self._time = time_provider
        self._ttl_seconds = max(1, min(ttl_seconds, self.MAX_TTL_SECONDS))

    @classmethod
    def from_keyring(
        cls,
        keyring: KeyringBackend | None = None,
        *,
        time_provider: ReceiptClock = _now,
        ttl_seconds: int = 5 * 60,
    ) -> ReceiptSigner:
        backend = keyring or OSKeyring()
        raw = backend.get_secret(SecretSlot.RECEIPT_SIGNING_KEY)
        return cls(raw, keyring=backend, time_provider=time_provider, ttl_seconds=ttl_seconds)

    @property
    def available(self) -> bool:
        return bool(self._load_key())

    def receipt_expiry(self) -> int:
        """Return the server-clock expiry used for the next receipt."""
        return int(self._time()) + self._ttl_seconds

    def _load_key(self) -> bytes | None:
        if self._key:
            return self._key
        if self._keyring is None:
            return None
        raw = self._keyring.get_secret(SecretSlot.RECEIPT_SIGNING_KEY)
        if not raw:
            return None
        self._key = raw.encode('utf-8')
        return self._key

    def issue(
        self,
        *,
        kind: str,
        provider_plan_hash: str,
        subject_ids: Mapping[str, str],
        provider: str,
        model: str,
        privacy_policy_fingerprint: str,
        domain_identity: str = 'companion',
    ) -> str | None:
        """Issue an in-memory receipt, or ``None`` when the key is unavailable."""
        key = self._load_key()
        if not key:
            return None
        issued_at = int(self._time())
        claims = PreviewReceiptClaims(
            kind=kind,
            issued_at=issued_at,
            expires_at=issued_at + self._ttl_seconds,
            nonce=secrets.token_urlsafe(18),
            provider_plan_hash=provider_plan_hash,
            subject_ids=dict(subject_ids),
            provider=provider,
            model=model,
            privacy_policy_fingerprint=privacy_policy_fingerprint,
            domain_identity=domain_identity,
        )
        payload = _b64encode(_canonical_json(claims.model_dump()))
        signature = hmac.new(key, payload.encode('ascii'), hashlib.sha256).digest()
        return f'{payload}.{_b64encode(signature)}'

    def verify(
        self,
        receipt: str | None,
        *,
        kind: str,
        provider_plan_hash: str,
        subject_ids: Mapping[str, str],
        provider: str,
        model: str,
        privacy_policy_fingerprint: str,
        domain_identity: str = 'companion',
    ) -> PreviewReceiptClaims:
        key = self._load_key()
        if not key:
            raise ReceiptKeyUnavailableError('RECEIPT_SIGNING_KEY_UNAVAILABLE')
        if not receipt or len(receipt) > self.MAX_RECEIPT_LENGTH:
            raise ReceiptVerificationError('PREVIEW_RECEIPT_REQUIRED')

        parts = receipt.split('.')
        if len(parts) != 2:
            raise ReceiptVerificationError('PREVIEW_RECEIPT_INVALID')
        payload_b64, signature_b64 = parts
        payload = _b64decode(payload_b64)
        supplied_signature = _b64decode(signature_b64)
        # Reject non-canonical base64url spellings.  Without this check, a
        # change to unused padding bits in the final character can decode to
        # the same bytes and would not count as a tampered envelope.
        if _b64encode(payload) != payload_b64 or _b64encode(supplied_signature) != signature_b64:
            raise ReceiptVerificationError('PREVIEW_RECEIPT_INVALID')
        expected_signature = hmac.new(key, payload_b64.encode('ascii'), hashlib.sha256).digest()
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise ReceiptVerificationError('PREVIEW_RECEIPT_INVALID')
        try:
            raw_claims = json.loads(payload.decode('utf-8'))
            claims = PreviewReceiptClaims.model_validate(raw_claims)
        except (UnicodeDecodeError, json.JSONDecodeError, ValidationError) as exc:
            raise ReceiptVerificationError('PREVIEW_RECEIPT_INVALID') from exc

        now = int(self._time())
        if claims.expires_at <= now or claims.issued_at > now + 30:
            raise ReceiptVerificationError('PREVIEW_RECEIPT_EXPIRED')
        expected_subjects = dict(subject_ids)
        if (
            claims.kind != kind
            or claims.provider_plan_hash != provider_plan_hash
            or claims.subject_ids != expected_subjects
            or claims.provider != provider
            or claims.model != model
            or claims.privacy_policy_fingerprint != privacy_policy_fingerprint
            or claims.domain_identity != domain_identity
        ):
            raise ReceiptVerificationError('PREVIEW_RECEIPT_STALE')
        return claims


def ensure_receipt_signing_key(
    keyring: KeyringBackend | None = None,
) -> bool:
    """Create the dedicated receipt key during Companion bootstrap only.

    Preview paths never call this function.  A failure is reported as False so
    the service can remain available for disclosure while execution fails
    closed.
    """
    backend = keyring or OSKeyring()
    try:
        if backend.get_secret(SecretSlot.RECEIPT_SIGNING_KEY):
            return True
        backend.set_secret(SecretSlot.RECEIPT_SIGNING_KEY, secrets.token_urlsafe(32))
        return bool(backend.get_secret(SecretSlot.RECEIPT_SIGNING_KEY))
    except Exception:
        return False
