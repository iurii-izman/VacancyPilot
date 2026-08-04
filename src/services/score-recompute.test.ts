import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/models/job";
import type { Profile } from "@/models/profile";
import type { AppSettings } from "@/models/settings";

// ── Mock storage ──

const mockJobStore = new Map<string, Job>();
const mockProfileStore = new Map<string, Profile>();
const mockChromeStorage = new Map<string, unknown>();

let mockSettings: AppSettings = {
  schemaVersion: 1,
  onboardingCompleted: false,
  general: {
    defaultProfileId: undefined,
    showPageBadge: true,
    trackVisitMarks: true,
    rejectedSearchCardBehavior: "dim",
    language: "en",
    theme: "system",
    autosaveViewedJobs: false,
    toolbarClickBehavior: "popup",
    closePopupAfterOpeningSidePanel: true,
  },
  ai: {
    provider: undefined,
    dailyRequestLimit: 10,
    maxInputChars: 4000,
    enableStreaming: false,
    enableCache: true,
  },
  privacy: {
    aiEnabled: false,
    n8nEnabled: false,
    strictPrivacyMode: false,
    showPayloadPreviewAlways: false,
    allowResumeHighlightsToAI: false,
    allowFullDescriptionToAI: false,
    redactContacts: true,
    debugHtmlMode: false,
  },
  n8n: {
    enabled: false,
    hmacSecretSet: false,
    enabledEvents: [],
    dailyEventLimit: 100,
  },
  labs: {
    enabled: false,
    guidedApplyEnabled: false,
    killSwitchEnabled: false,
    dailyActionLimit: 50,
  },
  companion: {
    opsModeEnabled: false,
    baseUrl: "http://127.0.0.1:8765/api/v1",
    lastServiceVersion: null,
    lastApiVersion: null,
    lastApiCompatible: false,
    lastConnectedAt: null,
  },
};

function resetMocks() {
  mockJobStore.clear();
  mockProfileStore.clear();
  mockChromeStorage.clear();
  mockSettings = {
    schemaVersion: 1,
    onboardingCompleted: false,
    general: {
      defaultProfileId: undefined,
      showPageBadge: true,
      trackVisitMarks: true,
      rejectedSearchCardBehavior: "dim",
      language: "en",
      theme: "system",
      autosaveViewedJobs: false,
      toolbarClickBehavior: "popup",
      closePopupAfterOpeningSidePanel: true,
    },
    ai: {
      provider: undefined,
      dailyRequestLimit: 10,
      maxInputChars: 4000,
      enableStreaming: false,
      enableCache: true,
    },
    privacy: {
      aiEnabled: false,
      n8nEnabled: false,
      strictPrivacyMode: false,
      showPayloadPreviewAlways: false,
      allowResumeHighlightsToAI: false,
      allowFullDescriptionToAI: false,
      redactContacts: true,
      debugHtmlMode: false,
    },
    n8n: {
      enabled: false,
      hmacSecretSet: false,
      enabledEvents: [],
      dailyEventLimit: 100,
    },
    labs: {
      enabled: false,
      guidedApplyEnabled: false,
      killSwitchEnabled: false,
      dailyActionLimit: 50,
    },
    companion: {
      opsModeEnabled: false,
      baseUrl: "http://127.0.0.1:8765/api/v1",
      lastServiceVersion: null,
      lastApiVersion: null,
      lastApiCompatible: false,
      lastConnectedAt: null,
    },
  };
}

vi.mock("@/db/repositories", () => ({
  jobRepo: {
    getById: async (id: string) => mockJobStore.get(id),
    save: async (job: Job) => {
      mockJobStore.set(job.id, job);
    },
  },
  profileRepo: {
    getById: async (id: string) => mockProfileStore.get(id),
    list: async () => Array.from(mockProfileStore.values()),
  },
}));

vi.mock("@/db/settings-bridge", () => ({
  loadSettings: async () => mockSettings,
  saveSettings: async () => {},
}));

// Mock chrome.storage.local
vi.stubGlobal("chrome", {
  storage: {
    local: {
      set: async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) {
          mockChromeStorage.set(key, value);
        }
      },
      get: async (keys: string | string[] | null) => {
        if (keys === null) return Object.fromEntries(mockChromeStorage);
        const keyList = typeof keys === "string" ? [keys] : keys;
        const result: Record<string, unknown> = {};
        for (const k of keyList) {
          if (mockChromeStorage.has(k)) result[k] = mockChromeStorage.get(k);
        }
        return result;
      },
    },
  },
});

import { recomputeScoreForJob } from "./score-recompute";

// ── Helpers ──

function makeJob(overrides?: Partial<Job>): Job {
  return {
    id: "hh_12345",
    source: "hh",
    sourceVacancyId: "12345",
    sourceUrl: "https://hh.ru/vacancy/12345",
    title: "Frontend Developer",
    companyId: "hh_co_test",
    companyName: "Test Inc",
    descriptionClean: "Looking for a React developer with TypeScript skills.",
    descriptionHash: "abc",
    skills: ["React", "TypeScript", "JavaScript"],
    status: "saved",
    statusHistory: [],
    workMode: "remote",
    city: "Moscow",
    salaryMin: 150000,
    salaryMax: 250000,
    salaryCurrency: "RUB",
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeProfile(overrides?: Partial<Profile>): Profile {
  return {
    id: "profile_1",
    name: "Default",
    summary: "Senior frontend developer",
    targetTitles: ["Frontend Developer", "React Developer"],
    mustHaveSkills: ["React", "TypeScript"],
    niceToHaveSkills: ["Node.js"],
    avoidKeywords: [],
    preferredWorkModes: ["remote"],
    preferredCities: ["Moscow"],
    salaryExpectationMin: 130000,
    salaryCurrency: "RUB",
    letterPrefs: {
      defaultMode: "tg_short",
      defaultConstraints: {
        noEmoji: false,
        noMarkdown: false,
        noSpecialChars: false,
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ──

describe("recomputeScoreForJob", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("returns null for non-existent job", async () => {
    const result = await recomputeScoreForJob("hh_nonexistent");
    expect(result).toBeNull();
  });

  it("returns job unchanged when no profile exists", async () => {
    mockJobStore.set("hh_12345", makeJob());
    const result = await recomputeScoreForJob("hh_12345");
    expect(result).not.toBeNull();
    expect(result!.ruleScore).toBeUndefined();
  });

  it("computes and stores score using job.selectedProfileId", async () => {
    const job = makeJob({ selectedProfileId: "profile_1" });
    mockJobStore.set(job.id, job);
    mockProfileStore.set("profile_1", makeProfile());

    const result = await recomputeScoreForJob("hh_12345");

    expect(result).not.toBeNull();
    expect(result!.ruleScore).toBeDefined();
    expect(result!.ruleScore!.total).toBeGreaterThanOrEqual(0);
    expect(result!.selectedProfileId).toBe("profile_1");

    // Verify persisted to store
    const stored = mockJobStore.get("hh_12345");
    expect(stored!.ruleScore).toBeDefined();
    expect(stored!.ruleScore!.total).toBe(result!.ruleScore!.total);
  });

  it("computes and stores score using explicit profileId", async () => {
    const job = makeJob();
    mockJobStore.set(job.id, job);
    mockProfileStore.set("profile_2", makeProfile({ id: "profile_2" }));

    const result = await recomputeScoreForJob("hh_12345", "profile_2");

    expect(result).not.toBeNull();
    expect(result!.ruleScore).toBeDefined();
    expect(result!.selectedProfileId).toBe("profile_2");
  });

  it("falls back to settings default profile", async () => {
    const job = makeJob();
    mockJobStore.set(job.id, job);
    mockProfileStore.set(
      "profile_default",
      makeProfile({ id: "profile_default" }),
    );
    mockSettings.general.defaultProfileId = "profile_default";

    const result = await recomputeScoreForJob("hh_12345");

    expect(result).not.toBeNull();
    expect(result!.ruleScore).toBeDefined();
    expect(result!.selectedProfileId).toBe("profile_default");
  });

  it("falls back to first available profile", async () => {
    const job = makeJob();
    mockJobStore.set(job.id, job);
    mockProfileStore.set("profile_a", makeProfile({ id: "profile_a" }));

    const result = await recomputeScoreForJob("hh_12345");

    expect(result).not.toBeNull();
    expect(result!.ruleScore).toBeDefined();
    expect(result!.selectedProfileId).toBe("profile_a");
  });

  it("persists badge state to chrome.storage.local", async () => {
    const job = makeJob({ selectedProfileId: "profile_1" });
    mockJobStore.set(job.id, job);
    mockProfileStore.set("profile_1", makeProfile());

    await recomputeScoreForJob("hh_12345");

    const badge = mockChromeStorage.get("badge_v1_hh_12345") as
      | { score: number; status: string }
      | undefined;

    expect(badge).toBeDefined();
    expect(badge!.score).toBeGreaterThanOrEqual(0);
    expect(badge!.status).toBe("saved");
  });

  it("explicit profileId takes priority over job.selectedProfileId", async () => {
    const job = makeJob({ selectedProfileId: "profile_old" });
    mockJobStore.set(job.id, job);
    mockProfileStore.set("profile_old", makeProfile({ id: "profile_old" }));
    mockProfileStore.set(
      "profile_new",
      makeProfile({
        id: "profile_new",
        targetTitles: ["Backend Developer"],
        mustHaveSkills: ["Go"],
      }),
    );

    const result = await recomputeScoreForJob("hh_12345", "profile_new");

    expect(result).not.toBeNull();
    expect(result!.selectedProfileId).toBe("profile_new");
  });

  it("produces deterministic results", async () => {
    const job = makeJob({ selectedProfileId: "profile_1" });
    mockJobStore.set(job.id, job);
    mockProfileStore.set("profile_1", makeProfile());

    const result1 = await recomputeScoreForJob("hh_12345");
    const result2 = await recomputeScoreForJob("hh_12345");

    expect(result1!.ruleScore!.total).toBe(result2!.ruleScore!.total);
    expect(result1!.ruleScore!.recommendation).toBe(
      result2!.ruleScore!.recommendation,
    );
  });

  it("supports recompute-refresh: fresh DB read returns updated score", async () => {
    // Simulates the ProfileTab → recomputeScoreForJob → side-panel-refresh flow.
    // After recompute, a fresh read from the mock store should return the job
    // with ruleScore populated and selectedProfileId updated.
    const job = makeJob();
    mockJobStore.set(job.id, job);
    mockProfileStore.set("profile_1", makeProfile());

    // 1. Recompute with explicit profileId (as ProfileTab does).
    const recomputed = await recomputeScoreForJob("hh_12345", "profile_1");
    expect(recomputed).not.toBeNull();
    expect(recomputed!.ruleScore).toBeDefined();
    expect(recomputed!.selectedProfileId).toBe("profile_1");

    // 2. Simulate side panel refresh — re-read the job from the store.
    const refreshed = mockJobStore.get("hh_12345");
    expect(refreshed).toBeDefined();
    expect(refreshed!.ruleScore).toBeDefined();
    expect(refreshed!.ruleScore!.total).toBe(recomputed!.ruleScore!.total);
    expect(refreshed!.selectedProfileId).toBe("profile_1");
  });

  it("supports recompute-refresh: switching profiles updates the score", async () => {
    // Simulates ProfileTab switching from one profile to another.
    const job = makeJob();
    mockJobStore.set(job.id, job);
    mockProfileStore.set("profile_a", makeProfile({ id: "profile_a" }));
    mockProfileStore.set(
      "profile_b",
      makeProfile({
        id: "profile_b",
        targetTitles: ["Backend Developer"],
        mustHaveSkills: ["Go"],
      }),
    );

    // Select profile A.
    const resultA = await recomputeScoreForJob("hh_12345", "profile_a");
    expect(resultA!.selectedProfileId).toBe("profile_a");

    // Switch to profile B.
    const resultB = await recomputeScoreForJob("hh_12345", "profile_b");
    expect(resultB!.selectedProfileId).toBe("profile_b");

    // Scores should differ because profiles have different target titles/skills.
    expect(resultB!.ruleScore!.total).not.toBe(resultA!.ruleScore!.total);

    // Fresh read should reflect the latest profile.
    const refreshed = mockJobStore.get("hh_12345");
    expect(refreshed!.selectedProfileId).toBe("profile_b");
    expect(refreshed!.ruleScore!.total).toBe(resultB!.ruleScore!.total);
  });
});
