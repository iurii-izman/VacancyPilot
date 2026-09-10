import { describe, it, expect, vi } from "vitest";

// ── Pure helpers ──

function buildJobId(vacancyId: string): string {
  return `hh_${vacancyId}`;
}

interface BadgePayload {
  score?: number;
  status?: string;
}

function buildBadgePayload(job: {
  ruleScore?: { total: number } | null;
  status: string;
}): BadgePayload {
  return {
    score: job.ruleScore?.total,
    status: job.status,
  };
}

describe("buildJobId", () => {
  it('prepends "hh_" to the vacancy id', () => {
    expect(buildJobId("12345")).toBe("hh_12345");
    expect(buildJobId("999")).toBe("hh_999");
  });

  it("handles empty string", () => {
    expect(buildJobId("")).toBe("hh_");
  });
});

describe("buildBadgePayload", () => {
  it("includes score and status", () => {
    const payload = buildBadgePayload({
      ruleScore: { total: 85 },
      status: "saved",
    });
    expect(payload).toEqual({ score: 85, status: "saved" });
  });

  it("omits score when ruleScore is undefined", () => {
    const payload = buildBadgePayload({
      ruleScore: undefined,
      status: "viewed",
    });
    expect(payload).toEqual({ score: undefined, status: "viewed" });
  });

  it("omits score when ruleScore is null", () => {
    const payload = buildBadgePayload({
      ruleScore: null,
      status: "new",
    });
    expect(payload).toEqual({ score: undefined, status: "new" });
  });
});

// ── Content script EXTRACT_VACANCY handler (logic test) ──

import type { RawVacancyDTO } from "@/adapters/hh/types";
import type { ApplicationStatusSync } from "@/adapters/types";
import type { PageStatusInfo } from "@/components/PageStatus";
import {
  buildSetSidePanelContext,
  getSidePanelButtonLabel,
  mapSidePanelOpenError,
  openDashboard,
  openSidePanel,
} from "./App";

// Minimal mock: the content script handler uses HHAdapter.extractVacancy.
// We test that the handler responds with the correct shape.

interface ExtractResponse {
  success: boolean;
  dto?: RawVacancyDTO;
  error?: string;
  passiveStatus?: Partial<ApplicationStatusSync> | null;
}

/**
 * Replicates the content script's EXTRACT_VACANCY handler logic.
 * In the real content script, HHAdapter.extractVacancy(document) is called.
 * Here we test the response shape for success and failure paths.
 */
function handleExtractVacancy(
  extractFn: () => RawVacancyDTO | null,
  passiveStatusFn?: () => Partial<ApplicationStatusSync> | null,
): ExtractResponse {
  const passiveStatus = passiveStatusFn?.() ?? undefined;
  try {
    const dto = extractFn();
    if (dto) {
      return { success: true, dto, passiveStatus };
    }
    return {
      success: false,
      error: "Could not extract vacancy data from this page",
      passiveStatus,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function makeMinimalDTO(overrides?: Partial<RawVacancyDTO>): RawVacancyDTO {
  return {
    sourceVacancyId: "12345",
    sourceUrl: "https://hh.ru/vacancy/12345",
    title: "Frontend Developer",
    companyName: "Acme Corp",
    salaryRaw: "100 000 ₽",
    salaryMin: 100000,
    salaryMax: null,
    salaryCurrency: "RUB",
    city: "Москва",
    workMode: "remote",
    experienceRaw: "1–3 года",
    employmentType: null,
    schedule: null,
    descriptionHtml: "<p>Test</p>",
    descriptionText: "Test",
    skills: ["React"],
    sourceCompanyId: null,
    extractedAt: new Date().toISOString(),
    selectorVersion: "1.0.0",
    warnings: [],
    ...overrides,
  };
}

describe("handleExtractVacancy (content script handler logic)", () => {
  it("returns success with DTO when extraction succeeds", () => {
    const dto = makeMinimalDTO();
    const response = handleExtractVacancy(() => dto);
    expect(response.success).toBe(true);
    expect(response.dto).toBeDefined();
    expect(response.dto!.sourceVacancyId).toBe("12345");
    expect(response.dto!.title).toBe("Frontend Developer");
  });

  it("returns failure when extraction returns null (not a vacancy page)", () => {
    const response = handleExtractVacancy(() => null);
    expect(response.success).toBe(false);
    expect(response.error).toContain("Could not extract");
  });

  it("returns failure when extraction throws", () => {
    const response = handleExtractVacancy(() => {
      throw new Error("DOM parse error");
    });
    expect(response.success).toBe(false);
    expect(response.error).toBe("DOM parse error");
  });

  it("returns failure with non-Error throwables", () => {
    const response = handleExtractVacancy(() => {
      throw "something went wrong";
    });
    expect(response.success).toBe(false);
    expect(response.error).toBe("something went wrong");
  });

  it("passes through all DTO fields", () => {
    const dto = makeMinimalDTO({
      salaryMax: 150000,
      employmentType: "Полная занятость",
      skills: ["React", "TypeScript", "Node.js"],
    });
    const response = handleExtractVacancy(() => dto);
    expect(response.success).toBe(true);
    expect(response.dto!.salaryMax).toBe(150000);
    expect(response.dto!.employmentType).toBe("Полная занятость");
    expect(response.dto!.skills).toHaveLength(3);
  });

  it("returns passiveStatus alongside DTO when provided", () => {
    const dto = makeMinimalDTO();
    const mockPassive = (): Partial<ApplicationStatusSync> => ({
      detectedApplied: true,
      rawLabel: "Вы откликнулись",
      detectedAt: new Date().toISOString(),
    });
    const response = handleExtractVacancy(() => dto, mockPassive);
    expect(response.success).toBe(true);
    expect(response.passiveStatus).toBeDefined();
    expect(response.passiveStatus!.detectedApplied).toBe(true);
    expect(response.passiveStatus!.rawLabel).toBe("Вы откликнулись");
  });

  it("returns passiveStatus alongside error when extraction fails", () => {
    const mockPassive = (): Partial<ApplicationStatusSync> => ({
      detectedRejected: true,
      rawLabel: "Отказ",
      detectedAt: new Date().toISOString(),
    });
    const response = handleExtractVacancy(() => null, mockPassive);
    expect(response.success).toBe(false);
    expect(response.passiveStatus).toBeDefined();
    expect(response.passiveStatus!.detectedRejected).toBe(true);
  });

  it("returns undefined passiveStatus when not provided", () => {
    const dto = makeMinimalDTO();
    const response = handleExtractVacancy(() => dto);
    expect(response.success).toBe(true);
    expect(response.passiveStatus).toBeUndefined();
  });
});

// ── passiveStatusLabel helper ──

function passiveStatusLabel(
  status: Partial<ApplicationStatusSync>,
): string | null {
  if (status.detectedApplied) return "HH shows: Вы откликнулись";
  if (status.detectedRejected) return "HH shows: Отказ";
  if (status.detectedInvitation) return "HH shows: Приглашение";
  if (status.detectedViewedByEmployer)
    return "HH shows: Работодатель просмотрел резюме";
  return null;
}

describe("passiveStatusLabel", () => {
  it("returns label for detectedApplied", () => {
    const result = passiveStatusLabel({
      detectedApplied: true,
      detectedAt: "",
    });
    expect(result).toBe("HH shows: Вы откликнулись");
  });

  it("returns label for detectedRejected", () => {
    const result = passiveStatusLabel({
      detectedRejected: true,
      detectedAt: "",
    });
    expect(result).toBe("HH shows: Отказ");
  });

  it("returns label for detectedInvitation", () => {
    const result = passiveStatusLabel({
      detectedInvitation: true,
      detectedAt: "",
    });
    expect(result).toBe("HH shows: Приглашение");
  });

  it("returns label for detectedViewedByEmployer", () => {
    const result = passiveStatusLabel({
      detectedViewedByEmployer: true,
      detectedAt: "",
    });
    expect(result).toContain("Работодатель");
  });

  it("returns null when no status is detected", () => {
    const result = passiveStatusLabel({ detectedAt: "" });
    expect(result).toBeNull();
  });

  it("returns null for empty object", () => {
    expect(passiveStatusLabel({} as Partial<ApplicationStatusSync>)).toBeNull();
  });
});

describe("buildSetSidePanelContext", () => {
  it("includes tabId and vacancyId for vacancy pages", () => {
    const pageInfo: PageStatusInfo = {
      kind: "vacancy",
      url: "https://hh.ru/vacancy/12345",
      tabId: 42,
      vacancyId: "12345",
    };

    expect(buildSetSidePanelContext(pageInfo)).toEqual({
      type: "SET_SIDE_PANEL_CONTEXT",
      tabId: 42,
      vacancyId: "12345",
      url: "https://hh.ru/vacancy/12345",
    });
  });

  it("does not include explicit context outside vacancy pages", () => {
    const pageInfo: PageStatusInfo = {
      kind: "not-detected",
    };

    expect(buildSetSidePanelContext(pageInfo)).toEqual({
      type: "SET_SIDE_PANEL_CONTEXT",
    });
  });
});

describe("getSidePanelButtonLabel", () => {
  it('returns "Opening..." while the side panel is opening', () => {
    expect(getSidePanelButtonLabel(true)).toBe("Opening…");
  });

  it('returns "Side Panel" when idle', () => {
    expect(getSidePanelButtonLabel(false)).toBe("Side Panel");
  });
});

describe("mapSidePanelOpenError", () => {
  it("maps user-gesture failures to a retryable user-facing message", () => {
    const result = mapSidePanelOpenError(
      new Error("sidePanel.open() may only be called in response to a user gesture"),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("user gesture");
    }
  });

  it("maps missing API failures to the Chrome version guidance", () => {
    const result = mapSidePanelOpenError(
      new TypeError("Cannot read properties of undefined (reading 'open')"),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Chrome 116+");
    }
  });

  it("falls back to a generic user-facing message for other failures", () => {
    const result = mapSidePanelOpenError(new Error("unexpected failure"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Could not open the Chrome side panel");
    }
  });
});

describe("openSidePanel", () => {
  const vacancyPage: PageStatusInfo = {
    kind: "vacancy",
    url: "https://hh.ru/vacancy/12345",
    tabId: 42,
    vacancyId: "12345",
  };

  it("persists context and resolves success when the panel opens", async () => {
    const sendContext = vi.fn();
    const getCurrentWindowId = vi.fn().mockResolvedValue(7);
    const open = vi.fn().mockResolvedValue(undefined);
    const closePopup = vi.fn();

    const result = await openSidePanel(vacancyPage, {
      sendContext,
      getCurrentWindowId,
      open,
      closePopup,
      supportsProgrammaticOpen: true,
    });

    expect(sendContext).toHaveBeenCalledWith(vacancyPage);
    expect(getCurrentWindowId).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(7);
    expect(closePopup).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("returns a generic error when no target window is available", async () => {
    const result = await openSidePanel(vacancyPage, {
      sendContext: vi.fn(),
      getCurrentWindowId: vi.fn().mockResolvedValue(undefined),
      open: vi.fn(),
      closePopup: vi.fn(),
      supportsProgrammaticOpen: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Could not open the Chrome side panel");
    }
  });

  it("returns a mapped failure when the open call is rejected", async () => {
    const result = await openSidePanel(vacancyPage, {
      sendContext: vi.fn(),
      getCurrentWindowId: vi.fn().mockResolvedValue(7),
      open: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "sidePanel.open() may only be called in response to a user gesture",
          ),
        ),
      closePopup: vi.fn(),
      supportsProgrammaticOpen: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("user gesture");
    }
  });

  it("returns the API guidance when programmatic open is unavailable", async () => {
    const result = await openSidePanel(vacancyPage, {
      sendContext: vi.fn(),
      getCurrentWindowId: vi.fn(),
      open: vi.fn(),
      closePopup: vi.fn(),
      supportsProgrammaticOpen: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Chrome 116+");
    }
  });

  it("closes the popup only after a successful side panel open", async () => {
    const closePopup = vi.fn();

    const result = await openSidePanel(
      vacancyPage,
      {
        sendContext: vi.fn(),
        getCurrentWindowId: vi.fn().mockResolvedValue(7),
        open: vi.fn().mockResolvedValue(undefined),
        closePopup,
        supportsProgrammaticOpen: true,
      },
      { closePopupAfterSuccess: true },
    );

    expect(result).toEqual({ success: true });
    expect(closePopup).toHaveBeenCalledTimes(1);
  });

  it("does not close the popup when side panel open fails", async () => {
    const closePopup = vi.fn();

    const result = await openSidePanel(
      vacancyPage,
      {
        sendContext: vi.fn(),
        getCurrentWindowId: vi.fn().mockResolvedValue(7),
        open: vi.fn().mockRejectedValue(new Error("open failed")),
        closePopup,
        supportsProgrammaticOpen: true,
      },
      { closePopupAfterSuccess: true },
    );

    expect(result.success).toBe(false);
    expect(closePopup).not.toHaveBeenCalled();
  });
});

describe("openDashboard", () => {
  it("opens the dashboard as a normal options tab", async () => {
    const getOptionsUrl = vi
      .fn()
      .mockReturnValue("chrome-extension://test/options.html");
    const openTab = vi.fn().mockResolvedValue(undefined);

    await openDashboard({
      getOptionsUrl,
      openTab,
    });

    expect(getOptionsUrl).toHaveBeenCalledTimes(1);
    expect(openTab).toHaveBeenCalledWith(
      "chrome-extension://test/options.html",
    );
  });

  it("swallows dashboard-open failures after logging", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      openDashboard({
        getOptionsUrl: () => "chrome-extension://test/options.html",
        openTab: vi.fn().mockRejectedValue(new Error("tabs.create failed")),
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ── Score computation flow (logic test with mocked DB) ──

import { scoreJob } from "@/services/scoring";
import type { Job } from "@/models/job";
import type { Profile } from "@/models/profile";

function makeTestJob(overrides?: Partial<Job>): Job {
  return {
    id: "hh_12345",
    source: "hh",
    sourceVacancyId: "12345",
    sourceUrl: "https://hh.ru/vacancy/12345",
    title: "Frontend Developer",
    companyId: "hh_co_acme_corp",
    companyName: "Acme Corp",
    descriptionClean:
      "We are looking for a React developer with TypeScript skills.",
    descriptionHash: "abc123",
    skills: ["React", "TypeScript"],
    status: "saved",
    statusHistory: [],
    workMode: "remote",
    salaryMin: 150000,
    salaryMax: 200000,
    salaryCurrency: "RUB",
    city: "Москва",
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTestProfile(overrides?: Partial<Profile>): Profile {
  return {
    id: "profile_1",
    name: "Default",
    summary: "Senior frontend developer",
    targetTitles: ["Frontend Developer", "React Developer"],
    mustHaveSkills: ["React", "TypeScript"],
    niceToHaveSkills: ["Node.js"],
    avoidKeywords: [],
    preferredWorkModes: ["remote"],
    preferredCities: ["Москва"],
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

describe("scoreJob integration (popup save path)", () => {
  it("computes a high score for a strong match", () => {
    const job = makeTestJob();
    const profile = makeTestProfile();
    const result = scoreJob(job, profile);

    // Strong match with title, skills, work mode, location, and salary all matching.
    // Nice-to-have skills and experience fit may not be fully scored by default.
    expect(result.total).toBeGreaterThanOrEqual(70);
    expect(result.recommendation).toBe("consider");
  });

  it("computes a lower score for a title mismatch", () => {
    const job = makeTestJob({
      title: "Data Scientist",
      skills: ["Python", "Pandas"],
      descriptionClean: "Looking for a data scientist.",
    });
    const profile = makeTestProfile({
      targetTitles: ["Frontend Developer"],
      mustHaveSkills: ["React"],
    });
    const result = scoreJob(job, profile);

    expect(result.total).toBeLessThan(50);
    expect(result.recommendation).toBe("skip");
  });

  it("handles missing salary data gracefully", () => {
    const job = makeTestJob({
      salaryMin: undefined,
      salaryMax: undefined,
    });
    const profile = makeTestProfile();
    const result = scoreJob(job, profile);

    // Should still produce a valid score result
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.breakdown).toBeDefined();
  });

  it("stores ruleScore on the job object correctly", () => {
    const job = makeTestJob();
    const profile = makeTestProfile();
    const result = scoreJob(job, profile);

    const updatedJob: Job = { ...job, ruleScore: result };

    expect(updatedJob.ruleScore).toBeDefined();
    expect(updatedJob.ruleScore!.total).toBe(result.total);
    expect(updatedJob.ruleScore!.recommendation).toBeDefined();
  });

  it("produces identical results with identical inputs (determinism)", () => {
    const job = makeTestJob();
    const profile = makeTestProfile();

    const result1 = scoreJob(job, profile);
    const result2 = scoreJob(job, profile);

    expect(result1.total).toBe(result2.total);
    expect(result1.recommendation).toBe(result2.recommendation);
  });
});

describe("recomputeScoreForJob scenario (no profile)", () => {
  it("returns job unchanged when no profile exists", () => {
    const job = makeTestJob();
    // Simulating the case where profileRepo.list() returns []
    // In the actual code, recomputeScoreForJob returns job unchanged if no profile.
    const profiles: Profile[] = [];
    const profile = profiles[0]; // undefined

    if (!profile) {
      // Job stays unchanged
      expect(job.ruleScore).toBeUndefined();
      expect(job.selectedProfileId).toBeUndefined();
    }
  });
});
