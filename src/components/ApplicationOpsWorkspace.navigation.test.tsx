// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const opsItem = vi.hoisted(() => ({
  authority: "ops" as const,
  vacancy_state: "active" as const,
  vacancy: {
    vacancy_id: "companion-navigation-001",
    hh_vacancy_id: "navigation-001",
    source: "hh",
    source_url: "https://hh.ru/vacancy/navigation-001",
    title: "Navigation Regression Vacancy",
    company_id: "company-navigation",
    company_name: "Navigation Test Company",
    salary_min: null,
    salary_max: null,
    currency: null,
    city: "Chisinau",
    work_mode: "remote",
    experience: null,
    description: "Authoritative Companion vacancy used for navigation regression coverage.",
    description_hash: "navigation-hash",
    skills: ["TypeScript"],
    published_at: null,
    first_seen_at: "2026-09-01T00:00:00.000Z",
    last_seen_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    archived: false,
    revision: 1,
    hydration_state: "partial" as const,
  },
  applications: [],
  application_state: "none",
  analysis: {
    run_id: null,
    state: "not_analyzed" as const,
    status: null,
    repair_status: null,
    ready: false,
    score: null,
    decision: null,
    confidence: null,
    created_at: null,
  },
  analysis_state: "not_analyzed" as const,
  follow_ups: [],
  follow_up_state: "none",
  active_follow_up_count: 0,
  provenance: { hits: [] },
  availability: {
    application: "available" as const,
    analysis: "available" as const,
    follow_up: "available" as const,
    provenance: "available" as const,
  },
}));

vi.mock("@/db/repositories", () => ({
  jobRepo: {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/services/companion-service", () => ({
  detectCompanionStatus: vi.fn().mockResolvedValue({ status: "unavailable" }),
  getOpsClient: vi.fn().mockReturnValue({
    listHHSearchProfiles: vi.fn().mockResolvedValue({ data: [] }),
  }),
}));

vi.mock("@/db/settings-bridge", () => ({
  loadSettings: vi.fn().mockResolvedValue({
    privacy: {
      aiEnabled: true,
      strictPrivacyMode: true,
      allowResumeHighlightsToAI: false,
      allowFullDescriptionToAI: false,
      redactContacts: true,
    },
    ai: {
      provider: "openai",
      model: "gpt-4o",
      dailyRequestLimit: 10,
      maxInputChars: 3000,
      enableCache: true,
    },
  }),
}));

vi.mock("@/services/ops-capabilities", () => ({
  getOpsCapabilities: vi.fn().mockResolvedValue({
    mode: { effectiveMode: "ops", requestedOpsMode: true, authorityMode: "ops" },
    companion: { status: "connected" },
    canUseFullV4: true,
    canHydrateVacancy: true,
    canUseSearchProfiles: true,
    canUseOpsAnalytics: true,
    canRunApplicationFactory: true,
    canUseOpsFollowups: true,
    canUseGuidedApplyMutation: false,
  }),
  capabilityMessage: vi.fn(() => "Capability unavailable"),
}));

import { ApplicationCard, ApplicationWorkspace, needsFullVacancyHydration } from "./ApplicationOpsWorkspace";
import { fromOps } from "@/models/work-item";
import { jobRepo } from "@/db/repositories";
import { detectCompanionStatus, getOpsClient } from "@/services/companion-service";

describe("Application Workspace navigation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.mocked(getOpsClient).mockReturnValue({
      listHHSearchProfiles: vi.fn().mockResolvedValue({ data: [] }),
      getOpsWorkItems: vi.fn().mockResolvedValue({
        data: [opsItem],
        meta: { request_id: "test", total: 1, limit: 100, offset: 0, view: "vacancies", summary: {
          vacancies_total: 1, vacancies_without_application: 1, applications_total: 0,
          analysis_not_analyzed: 1, analysis_running: 0, analysis_ready: 0,
          analysis_invalid: 0, analysis_failed: 0, ready_to_review: 0, followups_due: 0,
        } },
      }),
    } as never);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("does not hydrate an already-full vacancy before the provider-free preview", () => {
    expect(needsFullVacancyHydration({ descriptionClean: "x".repeat(200) })).toBe(false);
    expect(needsFullVacancyHydration({ descriptionClean: "x".repeat(199) })).toBe(true);
  });

  it("previews an already-full vacancy without an upstream hydration call", async () => {
    const hydrateVacancy = vi.fn();
    const previewFullV4 = vi.fn().mockResolvedValue({
      data: {
        provider: "preview-only",
        model: "local-preview",
        token_estimate: null,
        estimated_cost_usd: null,
        prompt_version: "test",
        input_hash: "test-hash",
        cache_hit: true,
        privacy_mode: "strict",
        language: "en",
        what_is_sent: [],
        what_is_not_sent: [],
      },
      meta: {},
    });
    vi.mocked(getOpsClient).mockReturnValue({ hydrateVacancy, previewFullV4 } as never);

    const fullItem = {
      ...opsItem,
      vacancy: { ...opsItem.vacancy, description: "x".repeat(200), hydration_state: "full" as const },
    };
    await act(async () => {
      root.render(createElement(ApplicationCard, { item: fromOps(fullItem) }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const previewButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Preview Full V4",
    );
    await act(async () => {
      previewButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(hydrateVacancy).not.toHaveBeenCalled();
    expect(previewFullV4).toHaveBeenCalledWith(
      opsItem.vacancy.vacancy_id,
      expect.objectContaining({ policy: expect.any(Object) }),
    );
    expect(container.textContent).toContain("Preview only — no provider call was made.");
  });

  it("opens the clicked vacancy card and returns to Inbox without mutating the job", async () => {
    await act(async () => {
      root.render(createElement(ApplicationWorkspace));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open application card",
    );
    expect(openButton).toBeDefined();

    await act(async () => {
      openButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector("#application-card-title")?.textContent).toBe(
      opsItem.vacancy.title,
    );
    expect(jobRepo.list).not.toHaveBeenCalled();
    expect(container.textContent).toContain(opsItem.vacancy.company_name);
    expect(container.textContent).toContain(
      "Viewing this card does not create an application or mark it Applied.",
    );

    const debugTab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Debug",
    );
    await act(async () => debugTab?.click());
    expect(container.textContent).toContain(`Companion vacancy ID: ${opsItem.vacancy.vacancy_id}`);

    const backButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "← Back to Inbox",
    );
    await act(async () => backButton?.click());
    expect(container.querySelector("#inbox-title")?.textContent).toBe("Inbox");
    expect(container.textContent).toContain(opsItem.vacancy.title);
    expect(container.textContent).toContain("Application: Not applied");
  });

  it("opens a direct link for a Companion-only vacancy without creating an application", async () => {
    window.history.replaceState({}, "", "?vacancyId=remote-001");
    vi.mocked(detectCompanionStatus).mockResolvedValue({ status: "connected" });
    vi.mocked(getOpsClient).mockReturnValue({
      getOpsWorkItems: vi.fn().mockResolvedValue({
        data: [{
          ...opsItem,
          vacancy: {
            ...opsItem.vacancy,
            vacancy_id: "companion-vacancy-001",
            hh_vacancy_id: "remote-001",
            source_url: "https://hh.ru/vacancy/remote-001",
            title: "Companion-only Vacancy",
            company_id: "company-remote",
            company_name: "Remote Company",
            description: "Full remote vacancy description",
            description_hash: "remote-hash",
          },
        }],
        meta: { request_id: "test", total: 1, limit: 100, offset: 0, view: "vacancies", summary: {
          vacancies_total: 1, vacancies_without_application: 1, applications_total: 0,
          analysis_not_analyzed: 1, analysis_running: 0, analysis_ready: 0,
          analysis_invalid: 0, analysis_failed: 0, ready_to_review: 0, followups_due: 0,
        } },
      }),
    } as never);

    await act(async () => {
      root.render(createElement(ApplicationWorkspace));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector("#application-card-title")?.textContent).toBe("Companion-only Vacancy");
    expect(container.textContent).toContain("Remote Company");
    expect(container.textContent).toContain("Viewing this card does not create an application or mark it Applied.");
  });
});
