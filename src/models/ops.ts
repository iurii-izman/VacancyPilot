/**
 * Shared type definitions for AOPS-05 migration cache, outbox, and meta tables.
 *
 * These types live in their own module so every Dexie, repository, migration,
 * export, delete, and test surface imports from a single source.
 */

// ── Ops Meta ────────────────────────────────────────────────────────────────

/** Mutable key-value metadata for Ops Mode bookkeeping. Never stores secrets. */
export interface OpsMeta {
  key: string;
  /** Arbitrary versioned non-secret metadata. */
  value: unknown;
  updatedAt: string;
}

/** Well-known opsMeta keys for migration and mode tracking. */
export const OPS_META_KEYS = {
  /** Records the current authority mode: "standalone" | "migration" | "ops". */
  AUTHORITY_MODE: 'authority_mode',
  /** Timestamp of the last completed migration import. */
  LAST_MIGRATION_AT: 'last_migration_at',
  /** Stable hash/fingerprint of the last imported snapshot. */
  LAST_MIGRATION_SNAPSHOT_HASH: 'last_migration_snapshot_hash',
  /** Counts by entity type recorded at the last migration import. */
  LAST_MIGRATION_COUNTS: 'last_migration_counts',
  /** The migration checkpoint token returned by the companion. */
  LAST_MIGRATION_CHECKPOINT: 'last_migration_checkpoint',
  /** Incrementing cursor for outbox sequence ordering. */
  OUTBOX_SEQUENCE: 'outbox_sequence',
} as const;

export type AuthorityMode = 'standalone' | 'migration' | 'ops';

// ── Sync Outbox ─────────────────────────────────────────────────────────────

export type OutboxOperation =
  | 'upsert'
  | 'patch'
  | 'delete';

/** Well-known entity types that may pass through the outbox. */
export type OutboxEntityType =
  | 'vacancy'
  | 'application'
  | 'cover_letter'
  | 'application_event'
  | 'letter_version';

/** Terminal states — the operation will not be retried automatically. */
export type OutboxTerminalStatus =
  | 'committed'
  | 'dead'
  | 'conflict';

export type OutboxStatus =
  | 'pending'
  | 'retrying'
  | OutboxTerminalStatus;

/**
 * A single outbox entry representing an operation that must be delivered
 * to the companion.
 *
 * Invariants:
 * - ``idempotencyKey`` is stable across retries — repeating the same entry
 *   must produce the same companion result.
 * - ``payload`` never contains raw pairing tokens, HH credentials, or AI keys.
 * - ``lastError`` stores a sanitized error code, never a stack trace or
 *   provider output.
 */
export interface SyncOutboxEntry {
  /** Stable UUID primary key. */
  id: string;
  /** Monotonic local FIFO sequence. */
  sequence: number;
  /** Versioned entity/command type. */
  entityType: OutboxEntityType;
  /** Target operation. */
  operation: OutboxOperation;
  /** Versioned sanitized command payload — never secrets or raw tokens. */
  payload: unknown;
  /** Schema discriminator for the command payload. */
  payloadVersion: number;
  /**
   * Stable retry key. The same key must yield the same companion result
   * so the outbox can safely re-send after a network interruption.
   */
  idempotencyKey: string;
  /** Nullable optimistic revision for revision-checked operations. */
  expectedRevision: number | null;
  /** UTC creation time. */
  createdAt: string;
  /** Bounded retry count (0 on first attempt). */
  retryCount: number;
  /** Earliest UTC time the next retry is allowed. */
  nextAttemptAt: string;
  /** Sanitized error code from the last failed attempt, if any. */
  lastError: string | null;
  /** Current lifecycle status. */
  status: OutboxStatus;
}

// ── Ops Cache ───────────────────────────────────────────────────────────────

/**
 * Sanitized read-model cache entry.
 *
 * In Ops Mode the companion holds canonical data; the extension may cache
 * projections locally for UI responsiveness. Cache entries never include
 * secrets.
 */
export interface OpsCacheEntry {
  /** Stable cache key — typically ``"{entityType}:{entityId}"``. */
  key: string;
  /** Cached contract/entity type. */
  entityType: OutboxEntityType;
  /** Stable entity ID from the companion. */
  entityId: string;
  /** Versioned sanitized response payload. */
  payload: unknown;
  /**
   * Server revision represented by this cache entry.
   * Used to detect staleness on next read.
   */
  revision: number;
  /** UTC refresh time. */
  updatedAt: string;
  /** Optional freshness boundary — after this time the entry should be re-fetched. */
  expiresAt: string | null;
}
