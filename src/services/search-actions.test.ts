/**
 * Search quick actions unit tests — ITER-035.
 *
 * Tests the quick save/reject service functions with mocked Dexie
 * and chrome.storage.local.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job, JobStatus } from "@/models/job";
import type { EventLog } from "@/models/event-log";
import type { RawSearchItemDTO } from "@/adapters/types";
import type { BadgeState } from "./badge-state";
import { createStatusChange } from "./status-transitions";

// ── Mock stores ────────────────────────────────────────────────────────────

const mockJobStore = new Map<string, Job>();
const mockEventStore = new Map<string, EventLog>();
const mockBadgeStore = new Map<string, BadgeState>();
const mockProfileStore = new Map<string, unknown>();

function resetMockStores() {
  mockJobStore.clear();
  mockEventStore.clear();
  mockBadgeStore.clear();
  mockProfileStore.clear();
}

// ── Mock database ──────────────────────────────────────────────────────────

vi.mock("@/db/database", () => ({
  db: {
    events: {
      put: async (entry: EventLog) => {
        mockEventStore.set(entry.id, entry);
      },
    },
  },
}));

vi.mock("@/db/repositories", () => ({
  jobRepo: {
    getById: async (id: string) => mockJobStore.get(id) ?? undefined,
    save: async (job: Job) => {
      mockJobStore.set(job.id, job);
    },
    findBySourceVacancy: async (source: string, sourceVacancyId: string) => {
      for (const job of mockJobStore.values()) {
        if (job.source === source && job.sourceVacancyId === sourceVacancyId) {
          return job;
        }
      }
      return undefined;
    },
  },
  profileRepo: {
    getById: async (id: string) => mockProfileStore.get(id) ?? undefined,
    list: async () => Array.from(mockProfileStore.values()),
  },
}));

// ── Mock badge-state ───────────────────────────────────────────────────────

vi.mock("./badge-state", () => ({
  persistBadgeState: async (vacancyId: string, state: BadgeState) => {
    mockBadgeStore.set(vacancyId, { ...state });
  },
  badgeStorageKey: (vacancyId: string) => `badge_v1_hh_${vacancyId}`,
  BADGE_KEY_PREFIX: "badge_v1_hh_",
  removeBadgeState: async () => {},
  removeAllBadgeStates: async () => {},
}));

// ── Mock settings-bridge ───────────────────────────────────────────────────

vi.mock("@/db/settings-bridge", () => ({
  loadSettings: async () => ({
    schemaVersion: 1,
    general: {
      showPageBadge: true,
      trackVisitMarks: true,
      rejectedSearchCardBehavior: "dim",
      toolbarClickBehavior: "popup",
      closePopupAfterOpeningSidePanel: true,
    },
    privacy: {
      aiEnabled: false,
      strictPrivacyMode: true,
      allowResumeHighlightsToAI: false,
      allowFullDescriptionToAI: false,
      redactContacts: true,
    },
    ai: {
      dailyRequestLimit: 10,
      maxInputChars: 3000,
      enableCache: true,
    },
    n8n: {
      enabled: false,
      hmacSecretSet: false,
      enabledEvents: [],
      dailyEventLimit: 10,
    },
    labs: {
      enabled: false,
      guidedApplyEnabled: false,
      killSwitchEnabled: false,
      dailyActionLimit: 5,
    },
  }),
  saveSettings: async () => {},
  defaultSettings: () => ({}),
}));

import { quickSaveSearchCard, quickRejectSearchCard } from "./search-actions";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSearchCard(
  overrides: Partial<RawSearchItemDTO> = {},
): RawSearchItemDTO {
  return {
    sourceId: "12345678",
    title: "Senior Frontend Developer",
    companyName: "Acme Corp",
    url: "https://hh.ru/vacancy/12345678",
    salaryRaw: "200 000 – 300 000 ₽",
    city: "Москва",
    experienceRaw: "3–6 лет",
    workMode: "remote",
    publicationDate: null,
    ...overrides,
  };
}

function makeExistingJob(overrides: Partial<Job> = {}): Job {
  const now = new Date().toISOString();
  return {
    id: "hh_12345678",
    source: "hh",
    sourceVacancyId: "12345678",
    sourceUrl: "https://hh.ru/vacancy/12345678",
    title: "Senior Frontend Developer",
    companyId: "hh_co_acme_corp",
    companyName: "Acme Corp",
    descriptionClean: "Job description",
    descriptionHash: "abc123",
    skills: ["React", "TypeScript"],
    status: "saved",
    statusHistory: [createStatusChange(undefined, "saved", "system")],
    workMode: "remote",
    firstSeenAt: now,
    lastSeenAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ── Tests: quickSaveSearchCard ─────────────────────────────────────────────

describe("quickSaveSearchCard", () => {
  beforeEach(() => {
    resetMockStores();
  });

  it("creates a new job from search card data", async () => {
    const card = makeSearchCard();
    const result = await quickSaveSearchCard(card);

    expect(result.jobId).toBe("hh_12345678");
    expect(result.status).toBe("saved");
    expect(mockJobStore.has("hh_12345678")).toBe(true);
  });

  it("creates a job with status saved", async () => {
    const card = makeSearchCard();
    const result = await quickSaveSearchCard(card);

    const job = mockJobStore.get("hh_12345678");
    expect(job?.status).toBe("saved");
    expect(result.status).toBe("saved");
  });

  it("persists badge state after save", async () => {
    const card = makeSearchCard();
    await quickSaveSearchCard(card);

    expect(mockBadgeStore.has("12345678")).toBe(true);
    const badgeState = mockBadgeStore.get("12345678");
    expect(badgeState?.status).toBe("saved");
  });

  it("does not overwrite existing job with sparse search card data", async () => {
    const existing = makeExistingJob({
      title: "Original Full Title",
      descriptionClean: "Full original description",
      skills: ["React", "TypeScript", "Node.js"],
      salaryMin: 200000,
      salaryMax: 300000,
    });
    mockJobStore.set(existing.id, existing);

    const card = makeSearchCard({ title: "Short Title" });
    const result = await quickSaveSearchCard(card);

    // Should return existing data, not overwrite
    const job = mockJobStore.get("hh_12345678");
    expect(job?.title).toBe("Original Full Title");
    expect(job?.descriptionClean).toBe("Full original description");
    expect(job?.skills).toEqual(["React", "TypeScript", "Node.js"]);
    expect(result.jobId).toBe("hh_12345678");
  });

  it("preserves existing job status on re-save from search", async () => {
    const existing = makeExistingJob({ status: "applied" as JobStatus });
    mockJobStore.set(existing.id, existing);

    const card = makeSearchCard();
    const result = await quickSaveSearchCard(card);

    const job = mockJobStore.get("hh_12345678");
    expect(job?.status).toBe("applied");
    expect(result.status).toBe("applied");
  });

  it("refreshes badge state for existing job", async () => {
    const existing = makeExistingJob({ status: "viewed" as JobStatus });
    mockJobStore.set(existing.id, existing);

    const card = makeSearchCard();
    await quickSaveSearchCard(card);

    const badgeState = mockBadgeStore.get("12345678");
    expect(badgeState?.status).toBe("viewed");
  });

  it("uses workMode from search card", async () => {
    const card = makeSearchCard({ workMode: "office" });
    await quickSaveSearchCard(card);

    const job = mockJobStore.get("hh_12345678");
    expect(job?.workMode).toBe("office");
  });

  it("handles card with minimal data", async () => {
    const card = makeSearchCard({
      salaryRaw: null,
      city: null,
      experienceRaw: null,
      workMode: null,
      companyName: null,
      title: null,
    });
    const result = await quickSaveSearchCard(card);

    expect(result.jobId).toBe("hh_12345678");
    const job = mockJobStore.get("hh_12345678");
    expect(job?.title).toBe("");
    expect(job?.workMode).toBe("unknown");
  });

  it("logs events for new job creation", async () => {
    const card = makeSearchCard();
    await quickSaveSearchCard(card);

    const events = Array.from(mockEventStore.values());
    const savedEvents = events.filter((e) => e.type === "job_saved");
    expect(savedEvents.length).toBeGreaterThanOrEqual(1);
    expect(savedEvents[0]?.jobId).toBe("hh_12345678");
  });
});

// ── Tests: quickRejectSearchCard ───────────────────────────────────────────

describe("quickRejectSearchCard", () => {
  beforeEach(() => {
    resetMockStores();
  });

  it("creates a new rejected job when none exists", async () => {
    const card = makeSearchCard();
    const result = await quickRejectSearchCard(card);

    expect(result.jobId).toBe("hh_12345678");
    expect(result.status).toBe("rejected_by_me");
    expect(mockJobStore.has("hh_12345678")).toBe(true);
  });

  it("persists rejected badge state", async () => {
    const card = makeSearchCard();
    await quickRejectSearchCard(card);

    const badgeState = mockBadgeStore.get("12345678");
    expect(badgeState?.status).toBe("rejected_by_me");
  });

  it("transitions existing job to rejected_by_me", async () => {
    const existing = makeExistingJob({ status: "saved" as JobStatus });
    mockJobStore.set(existing.id, existing);

    const card = makeSearchCard();
    const result = await quickRejectSearchCard(card);

    expect(result.status).toBe("rejected_by_me");
    const job = mockJobStore.get("hh_12345678");
    expect(job?.status).toBe("rejected_by_me");
    expect(job?.statusHistory).toHaveLength(2);
    expect(job?.statusHistory[1].from).toBe("saved");
    expect(job?.statusHistory[1].to).toBe("rejected_by_me");
    expect(job?.statusHistory[1].source).toBe("user");
  });

  it("does nothing extra if already rejected", async () => {
    const existing = makeExistingJob({
      status: "rejected_by_me" as JobStatus,
      statusHistory: [
        createStatusChange(undefined, "saved", "system"),
        createStatusChange("saved", "rejected_by_me", "user"),
      ],
    });
    mockJobStore.set(existing.id, existing);

    const card = makeSearchCard();
    const result = await quickRejectSearchCard(card);

    expect(result.status).toBe("rejected_by_me");
    const job = mockJobStore.get("hh_12345678");
    // Status history should NOT have grown
    expect(job?.statusHistory).toHaveLength(2);
  });

  it("logs status_changed event for transition", async () => {
    const existing = makeExistingJob({ status: "saved" as JobStatus });
    mockJobStore.set(existing.id, existing);

    const card = makeSearchCard();
    await quickRejectSearchCard(card);

    const events = Array.from(mockEventStore.values());
    const statusEvents = events.filter((e) => e.type === "status_changed");
    expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    expect(statusEvents[0]?.payloadPreview).toMatchObject({
      from: "saved",
      to: "rejected_by_me",
    });
  });

  it("logs events even for new rejected jobs", async () => {
    const card = makeSearchCard();
    await quickRejectSearchCard(card);

    const events = Array.from(mockEventStore.values());
    const savedEvents = events.filter((e) => e.type === "job_saved");
    const statusEvents = events.filter((e) => e.type === "status_changed");
    expect(savedEvents.length).toBeGreaterThanOrEqual(1);
    expect(statusEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Cross-action tests ─────────────────────────────────────────────────────

describe("search quick actions — cross-action", () => {
  beforeEach(() => {
    resetMockStores();
  });

  it("save then reject transitions status correctly", async () => {
    const card = makeSearchCard();

    // Save first
    const saveResult = await quickSaveSearchCard(card);
    expect(saveResult.status).toBe("saved");

    // Then reject
    const rejectResult = await quickRejectSearchCard(card);
    expect(rejectResult.status).toBe("rejected_by_me");

    const job = mockJobStore.get("hh_12345678");
    expect(job?.status).toBe("rejected_by_me");
    expect(job?.statusHistory).toHaveLength(2);
  });

  it("reject then save from search does not undo rejection", async () => {
    const card = makeSearchCard();

    // Reject first
    await quickRejectSearchCard(card);

    // Then try to save from search
    const saveResult = await quickSaveSearchCard(card);

    // Should preserve rejected status
    const job = mockJobStore.get("hh_12345678");
    expect(job?.status).toBe("rejected_by_me");
    expect(saveResult.status).toBe("rejected_by_me");
  });
});
