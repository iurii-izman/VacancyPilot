"""SQLite-backed single-flight and provider-attempt budget primitives."""

from __future__ import annotations

import hashlib
import json
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import Engine, text
from sqlalchemy.orm import Session


def _utcnow() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def build_operation_key(
    *,
    operation_kind: str,
    subject_ids: dict[str, str],
    provider_plan_hash: str,
    domain_identity: str = 'companion',
    retry_id: str | None = None,
) -> str:
    """Build a semantic idempotency key shared by all Companion entrypoints."""
    canonical = json.dumps(
        {
            'domain_identity': domain_identity,
            'operation_kind': operation_kind,
            'provider_plan_hash': provider_plan_hash,
            'subject_ids': subject_ids,
            # A retry is a new explicit user operation, not a prompt semantic.
            'retry_id': retry_id or '',
        },
        sort_keys=True,
        separators=(',', ':'),
    )
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


@dataclass(frozen=True)
class ClaimResult:
    execution_id: str
    owner_token: str | None
    state: str
    run_id: str | None = None
    error_category: str | None = None
    claimed: bool = False


@dataclass(frozen=True)
class AttemptResult:
    """Result of the committed provider-attempt reservation decision."""

    execution_id: str
    attempt_id: str | None
    attempt_number: int
    allowed: bool
    reason: str | None = None


class ProviderCoordinationError(RuntimeError):
    """Base class for safe provider coordination failures."""


class ProviderOperationInFlightError(ProviderCoordinationError):
    pass


class ProviderOutcomeUnknownError(ProviderCoordinationError):
    pass


class ProviderCoordinator:
    """Serialize claim/budget mutations with SQLite ``BEGIN IMMEDIATE``.

    No network work occurs while the database transaction is held.  Durable
    state is committed before the caller crosses the provider dispatch line.
    """

    def __init__(self, session: Session | Engine) -> None:
        if isinstance(session, Engine):
            self._engine = session
        else:
            bind = session.get_bind()
            if not isinstance(bind, Engine):
                raise TypeError('ProviderCoordinator requires a SQLite Engine-backed session')
            self._engine = bind

    def claim_operation(
        self,
        *,
        operation_key: str,
        operation_kind: str,
        subject_key: str,
        provider_plan_hash: str,
        provider: str,
        model: str,
        domain_identity: str = 'companion',
    ) -> ClaimResult:
        owner_token = secrets.token_urlsafe(18)
        now = _utcnow()
        with self._transaction() as connection:
            row = (
                connection.execute(
                    text(
                        'SELECT id, state, owner_token, run_id, error_category, attempt_count '
                        'FROM provider_executions WHERE operation_key = :operation_key'
                    ),
                    {'operation_key': operation_key},
                )
                .mappings()
                .first()
            )
            if row is not None:
                state = str(row['state'])
                if state == 'completed' and row['run_id']:
                    return ClaimResult(
                        execution_id=str(row['id']),
                        owner_token=None,
                        state=state,
                        run_id=str(row['run_id']),
                        error_category=row['error_category'],
                    )
                if state == 'outcome_unknown':
                    raise ProviderOutcomeUnknownError('PROVIDER_OUTCOME_UNKNOWN')
                if state in {'claimed', 'dispatching', 'repairing'}:
                    raise ProviderOperationInFlightError('PROVIDER_OPERATION_IN_FLIGHT')
                if state == 'failed':
                    # A failed dispatched operation is not automatically
                    # replayable; callers need an explicit retry_id.
                    return ClaimResult(
                        execution_id=str(row['id']),
                        owner_token=None,
                        state=state,
                        run_id=str(row['run_id']) if row['run_id'] else None,
                        error_category=row['error_category'],
                    )
                if state in {'failed_before_dispatch', 'budget_blocked'}:
                    connection.execute(
                        text(
                            'UPDATE provider_executions SET state = :state, '
                            'owner_token = :owner_token, error_category = NULL, '
                            'updated_at = :now WHERE id = :id'
                        ),
                        {
                            'state': 'claimed',
                            'owner_token': owner_token,
                            'now': now,
                            'id': row['id'],
                        },
                    )
                    return ClaimResult(
                        execution_id=str(row['id']),
                        owner_token=owner_token,
                        state='claimed',
                        claimed=True,
                    )

            execution_id = secrets.token_hex(16)
            connection.execute(
                text(
                    'INSERT INTO provider_executions '
                    '(id, operation_key, operation_kind, domain_identity, subject_key, '
                    'provider_plan_hash, provider, model, state, owner_token, attempt_count, '
                    'run_id, error_category, created_at, updated_at) '
                    'VALUES (:id, :operation_key, :operation_kind, :domain_identity, '
                    ':subject_key, :provider_plan_hash, :provider, :model, :state, '
                    ':owner_token, 0, NULL, NULL, :now, :now)'
                ),
                {
                    'id': execution_id,
                    'operation_key': operation_key,
                    'operation_kind': operation_kind,
                    'domain_identity': domain_identity,
                    'subject_key': subject_key,
                    'provider_plan_hash': provider_plan_hash,
                    'provider': provider,
                    'model': model,
                    'state': 'claimed',
                    'owner_token': owner_token,
                    'now': now,
                },
            )
            return ClaimResult(
                execution_id=execution_id,
                owner_token=owner_token,
                state='claimed',
                claimed=True,
            )

    def wait_for_terminal(
        self,
        *,
        operation_key: str,
        timeout_seconds: float = 30.0,
    ) -> ClaimResult | None:
        """Observe a duplicate operation until its owner reaches a terminal state.

        The observer holds no transaction while waiting.  A successful owner
        therefore lets duplicate callers return the same persisted run; an
        unknown outcome remains a safe explicit error rather than a second
        provider dispatch.
        """
        deadline = time.monotonic() + max(0.0, timeout_seconds)
        while True:
            with self._engine.connect() as connection:
                row = (
                    connection.execute(
                        text(
                            'SELECT id, state, run_id, error_category FROM provider_executions '
                            'WHERE operation_key = :operation_key'
                        ),
                        {'operation_key': operation_key},
                    )
                    .mappings()
                    .first()
                )
            if row is None:
                return None
            state = str(row['state'])
            if state not in {'claimed', 'dispatching', 'repairing'}:
                return ClaimResult(
                    execution_id=str(row['id']),
                    owner_token=None,
                    state=state,
                    run_id=str(row['run_id']) if row['run_id'] else None,
                    error_category=row['error_category'],
                    claimed=False,
                )
            if time.monotonic() >= deadline:
                return None
            time.sleep(0.01)

    def reserve_and_mark_dispatching(
        self,
        *,
        execution_id: str,
        owner_token: str,
        scope: str,
        day_key: str,
        daily_limit: int,
        attempt_number: int | None = None,
    ) -> AttemptResult:
        """Atomically reserve one real provider attempt and persist dispatching."""
        now = _utcnow()
        with self._transaction() as connection:
            execution = (
                connection.execute(
                    text(
                        'SELECT state, owner_token, attempt_count FROM provider_executions '
                        'WHERE id = :id'
                    ),
                    {'id': execution_id},
                )
                .mappings()
                .first()
            )
            if execution is None or execution['owner_token'] != owner_token:
                raise ProviderOperationInFlightError('PROVIDER_OPERATION_NOT_OWNED')
            if execution['state'] not in {'claimed', 'repairing'}:
                if execution['state'] == 'outcome_unknown':
                    raise ProviderOutcomeUnknownError('PROVIDER_OUTCOME_UNKNOWN')
                raise ProviderOperationInFlightError('PROVIDER_OPERATION_NOT_READY')

            number = attempt_number or int(execution['attempt_count']) + 1
            existing_attempt = (
                connection.execute(
                    text(
                        'SELECT id, state FROM provider_attempts '
                        'WHERE execution_id = :execution_id AND attempt_number = :attempt_number'
                    ),
                    {'execution_id': execution_id, 'attempt_number': number},
                )
                .mappings()
                .first()
            )
            if existing_attempt is not None:
                if existing_attempt['state'] in {'reserved', 'consumed'}:
                    raise ProviderOperationInFlightError('PROVIDER_OPERATION_IN_FLIGHT')
                number = int(execution['attempt_count']) + 1

            current = connection.execute(
                text(
                    'SELECT COUNT(*) FROM provider_attempts '
                    'WHERE scope = :scope AND day_key = :day_key '
                    "AND state IN ('reserved', 'consumed')"
                ),
                {'scope': scope, 'day_key': day_key},
            ).scalar_one()
            if int(current) >= max(0, daily_limit):
                connection.execute(
                    text(
                        'UPDATE provider_executions SET state = :state, '
                        'error_category = :error_category, updated_at = :now WHERE id = :id'
                    ),
                    {
                        'state': 'budget_blocked',
                        'error_category': 'AI_BUDGET_EXCEEDED',
                        'now': now,
                        'id': execution_id,
                    },
                )
                # Budget denial is a durable business outcome, not an
                # exceptional transaction failure.  Returning normally lets
                # the transaction context commit the non-in-flight state
                # before the service translates it into its public error.
                return AttemptResult(
                    execution_id=execution_id,
                    attempt_id=None,
                    attempt_number=number,
                    allowed=False,
                    reason='AI_BUDGET_EXCEEDED',
                )

            attempt_id = secrets.token_hex(16)
            connection.execute(
                text(
                    'INSERT INTO provider_attempts '
                    '(id, execution_id, attempt_number, scope, day_key, state, '
                    'dispatched_at, released_at, created_at, updated_at) '
                    'VALUES (:id, :execution_id, :attempt_number, :scope, :day_key, '
                    "'consumed', :now, NULL, :now, :now)"
                ),
                {
                    'id': attempt_id,
                    'execution_id': execution_id,
                    'attempt_number': number,
                    'scope': scope,
                    'day_key': day_key,
                    'now': now,
                },
            )
            connection.execute(
                text(
                    'UPDATE provider_executions SET state = :state, attempt_count = :count, '
                    'updated_at = :now WHERE id = :id'
                ),
                {
                    'state': 'dispatching',
                    'count': number,
                    'now': now,
                    'id': execution_id,
                },
            )
            return AttemptResult(execution_id, attempt_id, number, True)

    def release_before_dispatch(
        self,
        *,
        execution_id: str,
        owner_token: str,
        reason: str,
    ) -> None:
        now = _utcnow()
        with self._transaction() as connection:
            execution = (
                connection.execute(
                    text('SELECT state, owner_token FROM provider_executions WHERE id = :id'),
                    {'id': execution_id},
                )
                .mappings()
                .first()
            )
            if execution is None or execution['owner_token'] != owner_token:
                raise ProviderOperationInFlightError('PROVIDER_OPERATION_NOT_OWNED')
            if execution['state'] not in {'claimed', 'dispatching', 'repairing'}:
                raise ProviderOperationInFlightError('PROVIDER_OPERATION_NOT_READY')
            connection.execute(
                text(
                    "UPDATE provider_attempts SET state = 'released', released_at = :now, "
                    "updated_at = :now WHERE execution_id = :id AND state = 'consumed' "
                    'AND attempt_number = (SELECT MAX(attempt_number) FROM provider_attempts '
                    'WHERE execution_id = :id)'
                ),
                {'now': now, 'id': execution_id},
            )
            updated = connection.execute(
                text(
                    'UPDATE provider_executions SET state = :state, error_category = :reason, '
                    'updated_at = :now WHERE id = :id AND owner_token = :owner_token'
                ),
                {
                    'state': 'failed_before_dispatch',
                    'reason': _safe_category(reason),
                    'now': now,
                    'id': execution_id,
                    'owner_token': owner_token,
                },
            )
            if updated.rowcount != 1:
                raise ProviderOperationInFlightError('PROVIDER_OPERATION_NOT_OWNED')

    def mark_repairing(self, *, execution_id: str, owner_token: str) -> None:
        with self._transaction() as connection:
            updated = connection.execute(
                text(
                    "UPDATE provider_executions SET state = 'repairing', updated_at = :now "
                    "WHERE id = :id AND owner_token = :owner_token AND state = 'dispatching'"
                ),
                {'now': _utcnow(), 'id': execution_id, 'owner_token': owner_token},
            )
            if updated.rowcount != 1:
                raise ProviderOperationInFlightError('PROVIDER_OPERATION_NOT_READY')

    def finish(
        self,
        *,
        execution_id: str,
        owner_token: str,
        run_id: str,
        success: bool,
        error_category: str | None = None,
    ) -> None:
        with self._transaction() as connection:
            updated = connection.execute(
                text(
                    'UPDATE provider_executions SET state = :state, run_id = :run_id, '
                    'error_category = :error_category, updated_at = :now '
                    'WHERE id = :id AND owner_token = :owner_token'
                ),
                {
                    'state': 'completed' if success else 'failed',
                    'run_id': run_id,
                    'error_category': _safe_category(error_category) if error_category else None,
                    'now': _utcnow(),
                    'id': execution_id,
                    'owner_token': owner_token,
                },
            )
            if updated.rowcount != 1:
                raise ProviderOperationInFlightError('PROVIDER_OPERATION_NOT_OWNED')

    def mark_outcome_unknown(
        self,
        *,
        execution_id: str,
        owner_token: str,
        error_category: str = 'PROVIDER_OUTCOME_UNKNOWN',
    ) -> None:
        with self._transaction() as connection:
            updated = connection.execute(
                text(
                    "UPDATE provider_executions SET state = 'outcome_unknown', "
                    'error_category = :error_category, updated_at = :now '
                    'WHERE id = :id AND owner_token = :owner_token'
                ),
                {
                    'error_category': _safe_category(error_category),
                    'now': _utcnow(),
                    'id': execution_id,
                    'owner_token': owner_token,
                },
            )
            if updated.rowcount != 1:
                raise ProviderOperationInFlightError('PROVIDER_OPERATION_NOT_OWNED')

    def daily_usage(self, *, scope: str = 'companion', day_key: str | None = None) -> int:
        key = day_key or datetime.now(UTC).date().isoformat()
        with self._engine.connect() as connection:
            value = connection.execute(
                text(
                    'SELECT COUNT(*) FROM provider_attempts WHERE scope = :scope '
                    "AND day_key = :day_key AND state IN ('reserved', 'consumed')"
                ),
                {'scope': scope, 'day_key': key},
            ).scalar_one()
            return int(value)

    def _transaction(self):
        connection = self._engine.connect()
        try:
            connection.exec_driver_sql('BEGIN IMMEDIATE')
        except Exception:
            connection.close()
            raise

        class _TransactionContext:
            def __enter__(self):
                return connection

            def __exit__(self, exc_type, exc, tb):
                try:
                    if exc_type is None:
                        connection.commit()
                    else:
                        connection.rollback()
                finally:
                    connection.close()
                return False

        return _TransactionContext()


def _safe_category(value: str) -> str:
    """Keep coordination rows free of provider/private text."""
    safe = ''.join(ch for ch in value if ch.isalnum() or ch in {'_', '-', ':'})
    return safe[:128] or 'PROVIDER_ERROR'
