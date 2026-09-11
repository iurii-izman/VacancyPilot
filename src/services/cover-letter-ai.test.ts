import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockJobRepo,
  mockProfileRepo,
  mockResumeRepo,
  mockProvider,
  mockSettings,
} = vi.hoisted(() => ({
  mockJobRepo: {
    getById: vi.fn(),
  },
  mockProfileRepo: {
    getById: vi.fn(),
  },
  mockResumeRepo: {
    getById: vi.fn(),
  },
  mockProvider: {
    generateCoverLetter: vi.fn(),
  },
  mockSettings: {
    schemaVersion: 1,
    onboardingCompleted: true,
    general: {
      showPageBadge: true,
      trackVisitMarks: true,
      rejectedSearchCardBehavior: "dim" as const,
      toolbarClickBehavior: "popup" as const,
      closePopupAfterOpeningSidePanel: true,
    },
    privacy: {
      aiEnabled: true,
      strictPrivacyMode: true,
      allowResumeHighlightsToAI: false,
      allowFullDescriptionToAI: false,
      redactContacts: true,
    },
    ai: {
      provider: "openai" as const,
      model: "gpt-4o-mini",
      dailyRequestLimit: 10,
      maxInputChars: 3000,
      enableCache: true,
    },
    n8n: {
      enabled: false,
      webhookUrl: undefined,
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
  },
}));

vi.mock("@/db/repositories", () => ({
  jobRepo: mockJobRepo,
  profileRepo: mockProfileRepo,
  resumeRepo: mockResumeRepo,
}));

vi.mock("@/db/settings-bridge", () => ({
  loadSettings: vi.fn(async () => mockSettings),
}));

vi.mock("./ai-provider-factory", () => ({
  checkAIReadiness: vi.fn(() => ({ ready: true })),
  getLLMProvider: vi.fn(() => mockProvider),
  providerLabel: vi.fn(() => "OpenAI"),
}));

vi.mock("./ai-provider-permissions", () => ({
  hasProviderOriginAccess: vi.fn(async () => false),
  ensureProviderOriginAccess: vi.fn(async () => ({
    granted: true,
    requested: true,
    origin: "https://api.openai.com/*",
  })),
}));

vi.mock("./ai-cache", () => ({
  checkCoverLetterCache: vi.fn(),
  storeCoverLetterCache: vi.fn(async () => "cache_ref_1"),
}));

vi.mock("./ai-budget", async () => {
  const actual =
    await vi.importActual<typeof import("./ai-budget")>("./ai-budget");
  return {
    ...actual,
    checkAiBudget: vi.fn(async () => ({
      allowed: true,
      used: 0,
      limit: 10,
      remaining: 10,
      isExhausted: false,
    })),
    reserveAiProviderAttempt: vi.fn(async (params: {
      operationKey: string;
      operationKind: "vacancy_analysis" | "cover_letter";
      provider: string;
      model: string;
      providerPlanHash: string;
    }) => ({
      reservationId: "attempt_1",
      operationKey: params.operationKey,
      operationKind: params.operationKind,
      provider: params.provider,
      model: params.model,
      providerPlanHash: params.providerPlanHash,
      ownerToken: "owner_1",
      attemptNumber: 1,
      dayKey: "2026-09-10",
    })),
    completeAiProviderExecution: vi.fn(async () => undefined),
    markAiProviderOutcomeUnknown: vi.fn(async () => undefined),
    recordAiRequest: vi.fn(async () => "event_1"),
  };
});

import {
  previewCoverLetterPayload,
  buildCoverLetterAiCostSummary,
  generateCoverLetterDraft,
} from "./cover-letter-ai";
import { checkCoverLetterCache, storeCoverLetterCache } from "./ai-cache";
import { ensureProviderOriginAccess } from "./ai-provider-permissions";
import { getLLMProvider } from "./ai-provider-factory";
import { recordAiRequest } from "./ai-budget";

describe("cover-letter-ai", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockJobRepo.getById.mockResolvedValue({
      id: "hh_1",
      source: "hh",
      sourceVacancyId: "1",
      sourceUrl: "https://hh.ru/vacancy/1",
      title: "Frontend Engineer",
      companyId: "c1",
      companyName: "Acme",
      workMode: "remote",
      descriptionClean: "Build product UI",
      descriptionHash: "hash",
      skills: ["React", "TypeScript", "CSS"],
      status: "saved",
      statusHistory: [],
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    mockProfileRepo.getById.mockResolvedValue({
      id: "p1",
      name: "Main",
      summary: "Frontend developer with React and TypeScript experience.",
      targetTitles: ["Frontend Engineer"],
      mustHaveSkills: ["React", "TypeScript"],
      niceToHaveSkills: ["Testing"],
      avoidKeywords: [],
      preferredWorkModes: ["remote"],
      letterPrefs: {
        defaultMode: "hh_standard",
        defaultConstraints: {
          noEmoji: true,
          noMarkdown: true,
          noSpecialChars: false,
          maxChars: 1000,
        },
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    mockResumeRepo.getById.mockResolvedValue(undefined);
    mockProvider.generateCoverLetter.mockResolvedValue("Generated letter");
  });

  it("prepares a preview-ready cover letter request", async () => {
    const prepared = await previewCoverLetterPayload({
      jobId: "hh_1",
      profileId: "p1",
      mode: "hh_standard",
      constraints: {
        noEmoji: true,
        noMarkdown: true,
        noSpecialChars: false,
        maxChars: 1000,
      },
    });

    expect(prepared.provider).toBe("openai");
    expect(prepared.model).toBe("gpt-4o-mini");
    expect(prepared.preview.estimatedTokens).toBeGreaterThan(0);
    expect(prepared.preview.includedFields.length).toBeGreaterThan(0);
    expect(prepared.optionalOriginGranted).toBe(false);
  });

  it("returns cached draft without network, permission request, or budget charge", async () => {
    vi.mocked(checkCoverLetterCache).mockResolvedValue({
      hit: true,
      letter: "Cached draft",
      value: "Cached draft",
      entry: null,
      inputHash: "hash_1",
    });

    const prepared = await previewCoverLetterPayload({
      jobId: "hh_1",
      profileId: "p1",
      mode: "hh_standard",
      constraints: {
        noEmoji: true,
        noMarkdown: true,
        noSpecialChars: false,
        maxChars: 1000,
      },
    });

    const result = await generateCoverLetterDraft(prepared, "hh_1");
    expect(result.fromCache).toBe(true);
    expect(result.bodyText).toBe("Cached draft");
    expect(mockProvider.generateCoverLetter).not.toHaveBeenCalled();
    expect(ensureProviderOriginAccess).not.toHaveBeenCalled();
    expect(recordAiRequest).not.toHaveBeenCalled();
  });

  it("generates, stores cache, and records a request when no cache hit exists", async () => {
    vi.mocked(checkCoverLetterCache).mockResolvedValue({
      hit: false,
      letter: null,
      value: null,
      entry: null,
      inputHash: "hash_2",
    });

    const prepared = await previewCoverLetterPayload({
      jobId: "hh_1",
      profileId: "p1",
      mode: "hh_standard",
      constraints: {
        noEmoji: true,
        noMarkdown: true,
        noSpecialChars: false,
        maxChars: 1000,
      },
    });

    const result = await generateCoverLetterDraft(prepared, "hh_1");
    expect(result.fromCache).toBe(false);
    expect(result.bodyText).toBe("Generated letter");
    expect(ensureProviderOriginAccess).toHaveBeenCalledWith("openai");
    expect(storeCoverLetterCache).toHaveBeenCalledWith(
      expect.objectContaining({
        inputHash: "hash_2",
        provider: "openai",
        model: "gpt-4o-mini",
      }),
    );
    expect(recordAiRequest).toHaveBeenCalledWith("cover_letter", "hh_1");
  });

  it("builds a cost summary from the prepared request", async () => {
    const prepared = await previewCoverLetterPayload({
      jobId: "hh_1",
      profileId: "p1",
      mode: "hh_standard",
      constraints: {
        noEmoji: true,
        noMarkdown: true,
        noSpecialChars: false,
        maxChars: 1000,
      },
    });

    const summary = buildCoverLetterAiCostSummary(prepared);
    expect(summary.provider).toBe("openai");
    expect(summary.model).toBe("gpt-4o-mini");
    expect(summary.inputTokens).toBe(prepared.preview.estimatedTokens);
  });

  // ── Preview isolation ──────────────────────────────────────────────

  it("Preview AI Payload does not request optional host permission", async () => {
    await previewCoverLetterPayload({
      jobId: "hh_1",
      profileId: "p1",
      mode: "hh_standard",
      constraints: {
        noEmoji: true,
        noMarkdown: true,
        noSpecialChars: false,
        maxChars: 1000,
      },
    });

    // Preview must never call ensureProviderOriginAccess (which can request)
    expect(ensureProviderOriginAccess).not.toHaveBeenCalled();
  });

  it("Preview AI Payload does not call fetch/OpenAI provider", async () => {
    await previewCoverLetterPayload({
      jobId: "hh_1",
      profileId: "p1",
      mode: "hh_standard",
      constraints: {
        noEmoji: true,
        noMarkdown: true,
        noSpecialChars: false,
        maxChars: 1000,
      },
    });

    // Preview must never get a provider (which would be used for API calls)
    expect(getLLMProvider).not.toHaveBeenCalled();
    expect(mockProvider.generateCoverLetter).not.toHaveBeenCalled();
  });

  it("Preview AI Payload does not increment usage", async () => {
    await previewCoverLetterPayload({
      jobId: "hh_1",
      profileId: "p1",
      mode: "hh_standard",
      constraints: {
        noEmoji: true,
        noMarkdown: true,
        noSpecialChars: false,
        maxChars: 1000,
      },
    });

    // Preview must never record an AI request
    expect(recordAiRequest).not.toHaveBeenCalled();
  });
});
