// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncOutboxEntry } from "@/models/ops";

const entry: SyncOutboxEntry = {
  id: "operation-1",
  sequence: 1,
  entityType: "vacancy",
  operation: "upsert",
  payload: { schemaVersion: 1, sourceVacancyId: "123" },
  payloadVersion: 1,
  idempotencyKey: "operation-1",
  expectedRevision: null,
  createdAt: "2026-08-04T00:00:00Z",
  retryCount: 0,
  nextAttemptAt: "2026-08-04T00:00:00Z",
  lastError: null,
  status: "pending",
};

const repo = {
  listPending: vi.fn(),
  countPending: vi.fn(),
  commit: vi.fn(),
  scheduleRetry: vi.fn(),
  markDead: vi.fn(),
  markConflict: vi.fn(),
  retryManual: vi.fn(),
};

vi.mock("@/db/ops-repository", () => ({
  outboxRepo: repo,
  opsCacheRepo: { put: vi.fn() },
  opsMetaRepo: { getAuthorityMode: vi.fn().mockResolvedValue("ops") },
}));

vi.mock("@/db", () => ({
  db: { syncOutbox: { get: vi.fn().mockResolvedValue(entry) } },
}));

const { CompanionError } = await import("@/adapters/companion/ops-client");
const { drainOutbox } = await import("./outbox-service");

beforeEach(() => {
  vi.clearAllMocks();
  repo.listPending.mockResolvedValue([entry]);
  repo.countPending.mockResolvedValue(1);
});

describe("outbox processor", () => {
  it("retries the same stable idempotency key after a transport failure", async () => {
    const seenKeys: string[] = [];
    const transport = {
      deliver: vi.fn(async (operation: SyncOutboxEntry) => {
        seenKeys.push(operation.idempotencyKey);
        if (seenKeys.length === 1) {
          throw new CompanionError("NETWORK_ERROR", "offline", "request-1");
        }
      }),
    };

    await drainOutbox(transport);
    await drainOutbox(transport);

    expect(seenKeys).toEqual(["operation-1", "operation-1"]);
    expect(repo.scheduleRetry).toHaveBeenCalledWith("operation-1", "NETWORK_ERROR");
    expect(repo.commit).toHaveBeenCalledWith("operation-1");
  });

  it("retains revision conflicts for explicit user resolution", async () => {
    const transport = {
      deliver: vi.fn(async () => {
        throw new CompanionError("REVISION_CONFLICT", "stale", "request-2", 409);
      }),
    };

    const result = await drainOutbox(transport);

    expect(result.conflict).toBe(1);
    expect(repo.markConflict).toHaveBeenCalledWith("operation-1", "REVISION_CONFLICT");
    expect(repo.commit).not.toHaveBeenCalled();
  });
});
