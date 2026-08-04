/**
 * Ops repositories — AOPS-05.
 *
 * Thin CRUD helpers for syncOutbox, opsCache, and opsMeta Dexie tables.
 * These tables only hold sanitized data; secrets are never stored here.
 */

import { db } from "./database";
import type {
  SyncOutboxEntry,
  OpsCacheEntry,
  OpsMeta,
  AuthorityMode,
} from "@/models/ops";
import { OPS_META_KEYS } from "@/models/ops";

const SENSITIVE_KEY = /^(?:(?:pairing|client|access|refresh)_?token|password|secret|api[_-]?key|authorization|cookie)$/i;

/** Reject credential-shaped fields before any Ops payload reaches Dexie. */
export function assertSanitizedOpsPayload(payload: unknown): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        if (SENSITIVE_KEY.test(key)) {
          throw new Error(`Ops payload contains forbidden sensitive field: ${key}`);
        }
        visit(nested);
      }
    }
  };
  visit(payload);
}

// ── Ops Meta Repository ─────────────────────────────────────────────────────

export const opsMetaRepo = {
  get: (key: string) => db.opsMeta.get(key),

  put: (meta: OpsMeta) => db.opsMeta.put(meta),

  delete: (key: string) => db.opsMeta.delete(key),

  /** Read the current authority mode. Returns "standalone" by default. */
  getAuthorityMode: async (): Promise<AuthorityMode> => {
    const row = await db.opsMeta.get(OPS_META_KEYS.AUTHORITY_MODE);
    if (!row) return "standalone";
    const mode = row.value;
    if (mode === "migration" || mode === "ops") return mode;
    return "standalone";
  },

  /** Persist an authority mode transition. */
  setAuthorityMode: async (mode: AuthorityMode): Promise<void> => {
    await db.opsMeta.put({
      key: OPS_META_KEYS.AUTHORITY_MODE,
      value: mode,
      updatedAt: new Date().toISOString(),
    });
  },

  /** Get a numeric metadata value, or 0 when not present. */
  getNumber: async (key: string): Promise<number> => {
    const row = await db.opsMeta.get(key);
    if (!row) return 0;
    return typeof row.value === "number" ? row.value : 0;
  },

  /** Get a string metadata value, or empty when not present. */
  getString: async (key: string): Promise<string> => {
    const row = await db.opsMeta.get(key);
    if (!row) return "";
    return typeof row.value === "string" ? row.value : "";
  },
};

// ── Outbox Repository ────────────────────────────────────────────────────────

export const outboxRepo = {
  /** Enqueue a new outbox entry. Always returns the created entry. */
  enqueue: async (
    entry: Omit<SyncOutboxEntry, "id" | "sequence" | "idempotencyKey" | "createdAt" | "retryCount" | "lastError" | "status" | "nextAttemptAt"> &
      Partial<Pick<SyncOutboxEntry, "id" | "idempotencyKey">>,
  ): Promise<SyncOutboxEntry> => {
    if (!Number.isInteger(entry.payloadVersion) || entry.payloadVersion < 1) {
      throw new Error("Outbox payloadVersion must be a positive integer");
    }
    assertSanitizedOpsPayload(entry.payload);
    return db.transaction("rw", db.opsMeta, db.syncOutbox, async () => {
      const now = new Date().toISOString();
      const sequence = (await opsMetaRepo.getNumber(OPS_META_KEYS.OUTBOX_SEQUENCE)) + 1;
      const id = entry.id ?? crypto.randomUUID();
      const full: SyncOutboxEntry = {
        ...entry,
        id,
        sequence,
        idempotencyKey: entry.idempotencyKey ?? id,
        createdAt: now,
        retryCount: 0,
        lastError: null,
        status: "pending",
        nextAttemptAt: now,
      };
      await db.opsMeta.put({
        key: OPS_META_KEYS.OUTBOX_SEQUENCE,
        value: sequence,
        updatedAt: now,
      });
      await db.syncOutbox.add(full);
      return full;
    });
  },

  /** List entries in FIFO order (oldest first) filtered by status. */
  listPending: () =>
    db.syncOutbox
      .where("status")
      .anyOf(["pending", "retrying"])
      .filter((e) => e.nextAttemptAt <= new Date().toISOString())
      .sortBy("sequence"),

  /** Count pending entries that are eligible for delivery. */
  countPending: async (): Promise<number> => {
    const now = new Date().toISOString();
    return db.syncOutbox
      .where("status")
      .anyOf(["pending", "retrying"])
      .filter((e) => e.nextAttemptAt <= now)
      .count();
  },

  /** Count terminal entries (dead, conflict) visible to the user. */
  countBlocked: async (): Promise<number> => {
    return db.syncOutbox
      .where("status")
      .anyOf(["dead", "conflict"])
      .count();
  },

  /** Mark an entry as committed and remove it. */
  commit: (id: string) => db.syncOutbox.delete(id),

  /** Mark an entry as dead (permanent failure, no auto-retry). */
  markDead: async (id: string, error: string): Promise<void> => {
    await db.syncOutbox.update(id, {
      status: "dead",
      lastError: error,
    });
  },

  /** Mark an entry as conflict (revision/idempotency conflict visible to user). */
  markConflict: async (id: string, error: string): Promise<void> => {
    await db.syncOutbox.update(id, {
      status: "conflict",
      lastError: error,
    });
  },

  /** Schedule a retry with bounded exponential backoff and jitter. */
  scheduleRetry: async (id: string, errorCode: string): Promise<void> => {
    const entry = await db.syncOutbox.get(id);
    if (!entry) return;

    const retryCount = entry.retryCount + 1;
    // Bounded exponential backoff with jitter:
    // baseDelay = min(500ms * 2^retryCount, 300_000ms) with ±15% jitter
    const baseMs = Math.min(500 * Math.pow(2, retryCount), 300_000);
    const jitter = baseMs * 0.15 * (Math.random() * 2 - 1);
    const delayMs = Math.max(500, Math.round(baseMs + jitter));

    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    await db.syncOutbox.update(id, {
      retryCount,
      lastError: errorCode,
      status: "retrying",
      nextAttemptAt,
    });
  },

  /** List terminal entries (dead/conflict) for user inspection. */
  listTerminal: () =>
    db.syncOutbox
      .where("status")
      .anyOf(["dead", "conflict"])
      .toArray(),

  /** Reset a terminal entry back to pending for manual retry. */
  retryManual: async (id: string): Promise<void> => {
    const now = new Date().toISOString();
    await db.syncOutbox.update(id, {
      status: "pending",
      retryCount: 0,
      lastError: null,
      nextAttemptAt: now,
    });
  },
};

// ── Ops Cache Repository ─────────────────────────────────────────────────────

export const opsCacheRepo = {
  /** Upsert a cache entry by key. */
  put: (entry: OpsCacheEntry) => {
    assertSanitizedOpsPayload(entry.payload);
    return db.opsCache.put(entry);
  },

  /** Get a cache entry by key. */
  get: (key: string) => db.opsCache.get(key),

  /** Delete a cache entry by key. */
  delete: (key: string) => db.opsCache.delete(key),

  /** Delete all cache entries. */
  clear: () => db.opsCache.clear(),

  /** List cache entries by entity type. */
  listByType: (entityType: string) =>
    db.opsCache.where("entityType").equals(entityType).toArray(),
};
