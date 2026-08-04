// @vitest-environment happy-dom

/**
 * Tests for the Ops vacancy intake service — AOPS-06.
 *
 * Covers:
 * - buildIntakePayload: sanitized VacancyIntakeV1 fields (currency, no
 *   forbidden fields, no raw DTO leakage).
 * - enqueueVacancyIntake: only in Ops mode, including fallback-identity
 *   captures, with a content-derived idempotency key.
 * - mirrorSaveToOps: never throws, standalone mode is a no-op.
 * - deliverVacancyIntake: sends the intake payload with the stable key.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawVacancyDTO } from "@/adapters/hh/types";
import type { SyncOutboxEntry } from "@/models/ops";

// ── Mocks ───────────────────────────────────────────────────────────────────

const outboxRepo = {
  enqueue: vi.fn(),
  listPending: vi.fn(),
  countPending: vi.fn(),
  commit: vi.fn(),
  scheduleRetry: vi.fn(),
  markDead: vi.fn(),
  markConflict: vi.fn(),
  retryManual: vi.fn(),
};

const opsCacheRepo = {
  put: vi.fn(),
  get: vi.fn(),
};

const opsMetaRepo = {
  getAuthorityMode: vi.fn(),
};

vi.mock("@/db/ops-repository", () => ({
  outboxRepo,
  opsCacheRepo,
  opsMetaRepo,
}));

vi.mock("@/services/companion-service", () => ({
  getOpsClient: vi.fn(),
}));

vi.mock("@/adapters/companion/ops-client", () => ({
  OpsClient: class OpsClient {},
  CompanionError: class CompanionError extends Error {},
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function sampleDto(overrides: Partial<RawVacancyDTO> = {}): RawVacancyDTO {
  return {
    sourceVacancyId: "hh-100",
    sourceUrl: "https://hh.ru/vacancy/12345",
    title: "Senior Frontend Engineer",
    companyName: "Acme Corp",
    salaryRaw: "250 000-350 000 ₽",
    salaryMin: 250000,
    salaryMax: 350000,
    salaryCurrency: "RUB",
    city: "Москва",
    workMode: "remote",
    experienceRaw: "3–6 лет",
    employmentType: "full",
    schedule: "full",
    descriptionHtml: "<p>React</p>",
    descriptionText: "Разработка frontend на React и TypeScript.",
    skills: ["React", "TypeScript"],
    sourceCompanyId: "comp-1",
    extractedAt: "2026-08-04T10:00:00Z",
    selectorVersion: "0.3.1",
    warnings: [],
    ...overrides,
  };
}

async function loadService() {
  return import("./ops-intake");
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("ops-intake buildIntakePayload", () => {
  it("maps normalized DTO fields to VacancyIntakeV1", async () => {
    const { buildIntakePayload } = await loadService();
    const payload = buildIntakePayload(sampleDto());

    expect(payload.schema_version).toBe(1);
    expect(payload.source).toBe("hh");
    expect(payload.source_vacancy_id).toBe("hh-100");
    expect(payload.url).toBe("https://hh.ru/vacancy/12345");
    expect(payload.title).toBe("Senior Frontend Engineer");
    expect(payload.company_name).toBe("Acme Corp");
    expect(payload.salary_min).toBe(250000);
    expect(payload.salary_max).toBe(350000);
    expect(payload.currency).toBe("RUB");
    expect(payload.work_mode).toBe("remote");
    expect(payload.city).toBe("Москва");
    expect(payload.experience).toBe("3–6 лет");
    expect(payload.description).toBe("Разработка frontend на React и TypeScript.");
    expect(payload.skills).toEqual(["React", "TypeScript"]);
    expect(payload.capture_source).toBe("extension:0.3.1");
    expect(payload.parser_version).toBe("0.3.1");
  });

  it("never includes raw DOM blobs, cookies, or session data", async () => {
    const { buildIntakePayload } = await loadService();
    const payload = buildIntakePayload(sampleDto());

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("descriptionHtml");
    expect(serialized).not.toContain("<p>");
    expect(serialized).not.toContain("salaryRaw");
    expect(serialized).not.toContain("employmentType");
    expect(serialized).not.toContain("schedule");
    expect(serialized).not.toContain("warnings");
  });

  it("nulls missing optional fields instead of inventing values", async () => {
    const { buildIntakePayload } = await loadService();
    const payload = buildIntakePayload(
      sampleDto({ salaryMin: null, salaryMax: null, city: null, workMode: null }),
    );

    expect(payload.salary_min).toBeNull();
    expect(payload.salary_max).toBeNull();
    expect(payload.city).toBeNull();
    expect(payload.work_mode).toBeNull();
    expect(payload.currency).toBe("RUB");
  });

  it("maps partly-remote work mode to hybrid", async () => {
    const { buildIntakePayload } = await loadService();
    const payload = buildIntakePayload(sampleDto({ workMode: "hybrid" as const }));
    expect(payload.work_mode).toBe("hybrid");
  });
});

describe("ops-intake enqueueVacancyIntake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    opsMetaRepo.getAuthorityMode.mockResolvedValue("ops");
  });

  it("queues a sanitized intake with a content-derived idempotency key", async () => {
    const { enqueueVacancyIntake } = await loadService();
    const ok = await enqueueVacancyIntake(sampleDto());

    expect(ok).toBe(true);
    expect(outboxRepo.enqueue).toHaveBeenCalledTimes(1);
    const entry = outboxRepo.enqueue.mock.calls[0][0];
    expect(entry.entityType).toBe("vacancy");
    expect(entry.operation).toBe("upsert");
    expect(entry.payloadVersion).toBe(1);
    expect(entry.payload.source_vacancy_id).toBe("hh-100");
    expect(entry.idempotencyKey).toMatch(/^intake:hh:hh-100:[0-9a-z]+$/);
  });

  it("derives a different key when content changes", async () => {
    const { enqueueVacancyIntake } = await loadService();
    await enqueueVacancyIntake(sampleDto());
    const firstKey = outboxRepo.enqueue.mock.calls[0][0].idempotencyKey;

    await enqueueVacancyIntake(sampleDto({ title: "Senior Frontend (React)" }));
    const secondKey = outboxRepo.enqueue.mock.calls[1][0].idempotencyKey;

    expect(secondKey).not.toBe(firstKey);
  });

  it("derives the same key for identical content (retry-safe)", async () => {
    const { enqueueVacancyIntake } = await loadService();
    await enqueueVacancyIntake(sampleDto());
    const firstKey = outboxRepo.enqueue.mock.calls[0][0].idempotencyKey;

    await enqueueVacancyIntake(sampleDto());
    const secondKey = outboxRepo.enqueue.mock.calls[1][0].idempotencyKey;

    expect(secondKey).toBe(firstKey);
  });

  it("does nothing in standalone mode", async () => {
    opsMetaRepo.getAuthorityMode.mockResolvedValue("standalone");
    const { enqueueVacancyIntake } = await loadService();
    const ok = await enqueueVacancyIntake(sampleDto());

    expect(ok).toBe(false);
    expect(outboxRepo.enqueue).not.toHaveBeenCalled();
  });

  it("queues a capture without a source id for companion fallback identity", async () => {
    const { enqueueVacancyIntake } = await loadService();
    const ok = await enqueueVacancyIntake(sampleDto({ sourceVacancyId: null }));

    expect(ok).toBe(true);
    expect(outboxRepo.enqueue).toHaveBeenCalledTimes(1);
    expect(outboxRepo.enqueue.mock.calls[0][0].payload.source_vacancy_id).toBe("");
  });
});

describe("ops-intake mirrorSaveToOps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    opsMetaRepo.getAuthorityMode.mockResolvedValue("ops");
  });

  it("never throws and reports enqueued in ops mode", async () => {
    const { mirrorSaveToOps } = await loadService();
    const result = await mirrorSaveToOps(sampleDto());

    expect(result.enqueued).toBe(true);
    expect(result.mode).toBe("ops");
  });

  it("reports not-enqueued without throwing when queuing fails", async () => {
    opsMetaRepo.getAuthorityMode.mockRejectedValue(new Error("db closed"));
    const { mirrorSaveToOps } = await loadService();

    const result = await mirrorSaveToOps(sampleDto());
    expect(result.enqueued).toBe(false);
  });

  it("is a no-op in standalone mode", async () => {
    opsMetaRepo.getAuthorityMode.mockResolvedValue("standalone");
    const { mirrorSaveToOps } = await loadService();

    const result = await mirrorSaveToOps(sampleDto());
    expect(result.enqueued).toBe(false);
    expect(outboxRepo.enqueue).not.toHaveBeenCalled();
  });
});

describe("ops-intake deliverVacancyIntake", () => {
  const entry: SyncOutboxEntry = {
    id: "entry-1",
    sequence: 1,
    entityType: "vacancy",
    operation: "upsert",
    payload: {
      schema_version: 1,
      source: "hh",
      source_vacancy_id: "hh-100",
      title: "Frontend Engineer",
    },
    payloadVersion: 1,
    idempotencyKey: "intake:hh:hh-100:abc123",
    expectedRevision: null,
    createdAt: "2026-08-04T00:00:00Z",
    retryCount: 0,
    nextAttemptAt: "2026-08-04T00:00:00Z",
    lastError: null,
    status: "pending",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs the payload to /vacancies/intake with the stable key", async () => {
    const { getOpsClient } = await import("@/services/companion-service");
    const intakeData = {
      result: "created",
      vacancy_id: "v-1",
      revision: 1,
      first_seen_at: "2026-08-04T00:00:00Z",
      last_seen_at: "2026-08-04T00:00:00Z",
      snapshot_id: "s-1",
      duplicate: false,
      description_hash: "hash-1",
    };
    const triageData = {
      vacancy_id: "v-1",
      revision: 1,
      verdict: "needs_input",
      recommendation: "needs_input",
      score: 0,
      engine: "stage-a-no-llm-v1",
      hard_gates: [],
      components: [],
      risk_flags: [],
      fit_reasons: [],
      caps_applied: [],
    };
    const authenticatedPost = vi
      .fn()
      .mockResolvedValueOnce({ data: intakeData, meta: {} })
      .mockResolvedValueOnce({ data: triageData, meta: {} });
    (getOpsClient as ReturnType<typeof vi.fn>).mockReturnValue({
      authenticatedPost,
      hasToken: true,
    });

    const { deliverVacancyIntake } = await loadService();
    await deliverVacancyIntake(entry);

    expect(authenticatedPost).toHaveBeenCalledWith(
      "/vacancies/intake",
      entry.payload,
      undefined,
      { idempotencyKey: "intake:hh:hh-100:abc123" },
    );
    expect(authenticatedPost).toHaveBeenCalledWith("/vacancies/v-1/triage", {});
    expect(opsCacheRepo.put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "vacancy_intake:hh-100",
        payload: expect.objectContaining({ triage: triageData }),
      }),
    );
  });
});

describe("ops-intake result cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("readCachedIntake returns the stored result or null", async () => {
    const { readCachedIntake, cacheIntakeResult } = await loadService();

    opsCacheRepo.get.mockResolvedValue(null);
    expect(await readCachedIntake("hh-100")).toBeNull();

    opsCacheRepo.get.mockResolvedValue(null);
    await cacheIntakeResult("hh-100", {
      vacancy_id: "v-1",
      revision: 2,
      result: "updated",
      description_hash: "abc",
    });

    opsCacheRepo.get.mockResolvedValue({
      payload: { result: "updated", revision: 2, vacancy_id: "v-1" },
    });
    expect(await readCachedIntake("hh-100")).toEqual({
      result: "updated",
      revision: 2,
      vacancy_id: "v-1",
    });
  });
});
