/**
 * Outbox processing service — AOPS-05.
 *
 * Drains the Dexie ``syncOutbox`` table by delivering queued operations
 * to the companion. Implements the AOPS-05 outbox contract:
 *
 * - Stable operation ID / idempotency key.
 * - Entity type, operation, payload version, base revision, created time,
 *   attempt count, next attempt, and last safe error code.
 * - FIFO processing with bounded exponential backoff and jitter.
 * - Retry only for retryable transport/5xx/429-like local conditions.
 * - No retry for validation, auth, or revision conflicts.
 * - Explicit dead/conflict state visible to the user.
 * - Online flush after reconnect and manual retry.
 * - Deletion only after acknowledged idempotent success.
 * - No secrets/raw pairing token in payloads.
 */

import { CompanionError } from "@/adapters/companion/ops-client";
import { outboxRepo, opsCacheRepo } from "@/db/ops-repository";
import { db } from "@/db";
import type { SyncOutboxEntry, OutboxEntityType } from "@/models/ops";

// ── Classification ───────────────────────────────────────────────────────────

/** Return true when the error code represents a retryable condition. */
export function isRetryableError(code: string): boolean {
  switch (code) {
    case "NETWORK_ERROR":
    case "TIMEOUT":
    case "ABORTED":
    case "GATEWAY_TIMEOUT":
    case "SERVICE_UNAVAILABLE":
    case "RATE_LIMITED":
      return true;
    default:
      return false;
  }
}

/** Return true when the error code represents a permanent conflict. */
export function isConflictError(code: string): boolean {
  switch (code) {
    case "REVISION_CONFLICT":
    case "IDEMPOTENCY_CONFLICT":
    case "CONFLICT":
      return true;
    default:
      return false;
  }
}

/** Return true when the error code represents a non-retryable validation/auth failure. */
export function isNonRetryableError(code: string): boolean {
  return !isRetryableError(code) && !isConflictError(code);
}

/**
 * Classification result for a delivery attempt.
 *
 * - ``"committed"`` — companion acknowledged success; entry can be removed.
 * - ``"retry"`` — transient error; schedule backoff retry.
 * - ``"dead"`` — permanent non-retryable error; mark dead.
 * - ``"conflict"`` — revision or idempotency conflict; mark for user review.
 */
export type DeliveryOutcome = "committed" | "retry" | "dead" | "conflict";

/** Classify the outcome of a delivery attempt from the error or success. */
export function classifyDelivery(
  success: boolean,
  errorCode?: string,
): DeliveryOutcome {
  if (success) return "committed";
  if (!errorCode) return "retry";
  if (isConflictError(errorCode)) return "conflict";
  if (isNonRetryableError(errorCode)) return "dead";
  return "retry";
}

// ── Delivery ─────────────────────────────────────────────────────────────────

/**
 * Attempt to deliver a single outbox entry to the companion.
 *
 * The entry's payload is sent as a POST to the companion. The companion
 * uses the idempotency key to ensure the operation is safe to retry.
 *
 * Returns the delivery outcome.
 */
async function deliverEntry(
  transport: OutboxTransport,
  entry: SyncOutboxEntry,
): Promise<{ outcome: DeliveryOutcome; errorCode: string | null }> {
  try {
    await transport.deliver(entry);
    return { outcome: "committed", errorCode: null };
  } catch (err) {
    if (err instanceof CompanionError) {
      return { outcome: classifyDelivery(false, err.code), errorCode: err.code };
    }
    return { outcome: "retry", errorCode: "NETWORK_ERROR" };
  }
}

/** Entity-specific APIs register a transport; AOPS-05 never invents a generic endpoint. */
export interface OutboxTransport {
  deliver(entry: SyncOutboxEntry): Promise<void>;
}

// ── Outbox Processor ─────────────────────────────────────────────────────────

/**
 * Drain the outbox by delivering all eligible entries to the companion.
 *
 * Processes entries in FIFO order. Each entry is delivered exactly once
 * per call; retry scheduling uses backoff. Entries that fail with
 * non-retryable errors are marked dead or conflict for user visibility.
 *
 * Returns a summary of what happened.
 */
export async function drainOutbox(
  transport: OutboxTransport,
): Promise<{
  committed: number;
  retried: number;
  dead: number;
  conflict: number;
  remaining: number;
}> {
  const entries = await outboxRepo.listPending();
  if (entries.length === 0) {
    return { committed: 0, retried: 0, dead: 0, conflict: 0, remaining: 0 };
  }

  let committed = 0;
  let retried = 0;
  let dead = 0;
  let conflict = 0;

  for (const entry of entries) {
    const { outcome, errorCode } = await deliverEntry(transport, entry);

    switch (outcome) {
      case "committed": {
        await outboxRepo.commit(entry.id);
        committed++;
        break;
      }
      case "retry": {
        await outboxRepo.scheduleRetry(entry.id, errorCode ?? "NETWORK_ERROR");
        retried++;
        break;
      }
      case "dead": {
        await outboxRepo.markDead(entry.id, errorCode ?? "PERMANENT_ERROR");
        dead++;
        break;
      }
      case "conflict": {
        await outboxRepo.markConflict(
          entry.id,
          errorCode ?? "CONFLICT",
        );
        conflict++;
        break;
      }
    }
  }

  // Count remaining pending
  const remaining = await outboxRepo.countPending();

  return { committed, retried, dead, conflict, remaining };
}

/**
 * Call this when the companion connection is established or re-established
 * to flush any pending outbox entries.
 *
 * This is safe to call from the companion status detection flow — if Ops
 * Mode is not enabled, it returns immediately without attempting delivery.
 */
export async function flushOutboxOnReconnect(transport: OutboxTransport): Promise<{
  drained: boolean;
  summary: {
    committed: number;
    retried: number;
    dead: number;
    conflict: number;
    remaining: number;
  } | null;
}> {
  const { detectCompanionStatus } = await import(
    "@/services/companion-service"
  );
  const { opsMetaRepo } = await import("@/db/ops-repository");

  const mode = await opsMetaRepo.getAuthorityMode();
  if (mode !== "ops") {
    return { drained: false, summary: null };
  }

  const status = await detectCompanionStatus();
  if (status.status !== "connected") {
    return { drained: false, summary: null };
  }

  const summary = await drainOutbox(transport);
  return { drained: true, summary };
}

/**
 * Manually retry a dead/conflict outbox entry.
 *
 * Resets the entry to ``pending`` and then attempts delivery immediately.
 */
export async function manualRetry(
  transport: OutboxTransport,
  entryId: string,
): Promise<DeliveryOutcome> {
  await outboxRepo.retryManual(entryId);

  // Fetch the entry from Dexie after reset
  const entry = await db.syncOutbox.get(entryId);
  if (!entry) return "dead";

  const { outcome, errorCode } = await deliverEntry(transport, entry);
  if (outcome === "committed") {
    await outboxRepo.commit(entry.id);
  } else if (outcome === "retry") {
    await outboxRepo.scheduleRetry(entry.id, errorCode ?? "NETWORK_ERROR");
  } else if (outcome === "conflict") {
    await outboxRepo.markConflict(entry.id, errorCode ?? "CONFLICT");
  } else {
    await outboxRepo.markDead(entry.id, errorCode ?? "PERMANENT_ERROR");
  }
  return outcome;
}

// ── Cache helpers ────────────────────────────────────────────────────────────

/**
 * Upsert an entry into the opsCache read-model store.
 *
 * Only sanitized read models may be stored. The caller is responsible
 * for ensuring the payload contains no credentials.
 */
export async function cacheReadModel(
  key: string,
  entityType: string,
  entityId: string,
  payload: unknown,
  revision: number,
  expiresAt?: string,
): Promise<void> {
  await opsCacheRepo.put({
    key,
    entityType: entityType as OutboxEntityType,
    entityId,
    payload,
    revision,
    updatedAt: new Date().toISOString(),
    expiresAt: expiresAt ?? null,
  });
}
