// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpsProjectionQuery, OpsWorkItem, OpsWorkItemResponse } from "@/adapters/companion/ops-projection-types";
import { db, ensureMigrationsBootstrapped } from "@/db";
import { jobRepo } from "@/db/repositories";
import { getOpsClient } from "@/services/companion-service";
import { getOpsCapabilities, type OpsCapabilities } from "@/services/ops-capabilities";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const client = vi.hoisted(() => ({
  getOpsWorkItems: vi.fn(),
  getAnalyticsSummary: vi.fn(),
  listHHSearchProfiles: vi.fn(),
}));

const capabilities: OpsCapabilities = {
  mode: { effectiveMode: "ops", requestedOpsMode: true, authorityMode: "ops" },
  companion: { status: "connected" },
  canUseFullV4: true,
  canHydrateVacancy: true,
  canUseSearchProfiles: true,
  canUseOpsAnalytics: true,
  canRunApplicationFactory: true,
  canUseOpsFollowups: true,
  canUseGuidedApplyMutation: false,
};

vi.mock("@/db/repositories", () => ({
  jobRepo: {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/services/companion-service", () => ({
  getOpsClient: vi.fn(),
}));

vi.mock("@/services/ops-capabilities", () => ({
  getOpsCapabilities: vi.fn(),
  capabilityMessage: vi.fn(() => "Capability unavailable"),
}));

import { Inbox, OpsPipelineWorkspace, TodayWorkspace } from "./ApplicationOpsWorkspace";

const summary = {
  vacancies_total: 1,
  vacancies_without_application: 1,
  applications_total: 1,
  analysis_not_analyzed: 1,
  analysis_running: 0,
  analysis_ready: 0,
  analysis_invalid: 0,
  analysis_failed: 0,
  ready_to_review: 1,
  followups_due: 0,
};

const vacancy: OpsWorkItem["vacancy"] = {
  vacancy_id: "companion-authority-001",
  hh_vacancy_id: "hh-authority-001",
  source: "hh",
  source_url: "https://hh.ru/vacancy/hh-authority-001",
  title: "Authoritative Ops vacancy",
  company_id: "company-authority-001",
  company_name: "Authority Test Company",
  salary_min: null,
  salary_max: null,
  currency: null,
  city: "Chisinau",
  work_mode: "remote",
  experience: null,
  description: "Companion-owned vacancy",
  description_hash: "authority-hash",
  skills: [],
  published_at: null,
  first_seen_at: "2026-09-01T00:00:00Z",
  last_seen_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  archived: false,
  revision: 1,
  hydration_state: "partial",
};

const noApplication: OpsWorkItem = {
  authority: "ops",
  vacancy_state: "active",
  vacancy,
  applications: [],
  application_state: "none",
  analysis: {
    run_id: null,
    state: "not_analyzed",
    status: null,
    repair_status: null,
    ready: false,
    score: null,
    decision: null,
    confidence: null,
    created_at: null,
  },
  analysis_state: "not_analyzed",
  follow_ups: [],
  follow_up_state: "none",
  active_follow_up_count: 0,
  provenance: { hits: [] },
  availability: {
    application: "available",
    analysis: "available",
    follow_up: "available",
    provenance: "available",
  },
};

const application = {
  application_id: "companion-application-001",
  vacancy_id: vacancy.vacancy_id,
  status: "applied",
  decision: "apply",
  score: 88,
  confidence: 0.9,
  applied_at: "2026-09-02T00:00:00Z",
  next_action_at: null,
  revision: 1,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
};

const withApplication: OpsWorkItem = {
  ...noApplication,
  applications: [application],
  application_state: "applied",
};

function response(data: OpsWorkItem[], view: OpsProjectionQuery["view"] = "vacancies"): OpsWorkItemResponse {
  return {
    data,
    meta: {
      request_id: "authority-test-request",
      total: view === "applications" ? data.length : 1,
      limit: 100,
      offset: 0,
      view: view ?? "vacancies",
      summary,
    },
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("Ops presentation authority", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getOpsCapabilities).mockResolvedValue(capabilities);
    vi.mocked(getOpsClient).mockReturnValue(client as never);
    client.listHHSearchProfiles.mockResolvedValue({ data: [] });
    client.getAnalyticsSummary.mockResolvedValue({ data: { applications_applied: 1 } });
    client.getOpsWorkItems.mockImplementation(async (query: OpsProjectionQuery) => {
      if (query.view === "summary") return response([], "summary");
      if (query.view === "applications") return response([withApplication], "applications");
      return response([noApplication], "vacancies");
    });
    await ensureMigrationsBootstrapped();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders a vacancy-only Inbox row as Not applied without reading Dexie", async () => {
    const jobsBefore = await db.jobs.toArray();
    const applicationsBefore = await db.applications.toArray();

    await act(async () => root.render(createElement(Inbox)));
    await settle();

    expect(container.textContent).toContain("Application: Not applied");
    expect(container.textContent).toContain("Analysis: Not analyzed");
    expect(container.textContent).not.toContain("Status: New");
    expect(jobRepo.list).not.toHaveBeenCalled();
    expect(await db.jobs.toArray()).toEqual(jobsBefore);
    expect(await db.applications.toArray()).toEqual(applicationsBefore);

    const status = container.querySelector("select[aria-label='Filter by status']") as HTMLSelectElement;
    status.value = "none";
    await act(async () => {
      status.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const vacancyQueries = client.getOpsWorkItems.mock.calls
      .map(([query]) => query as OpsProjectionQuery)
      .filter((query) => query.view === "vacancies");
    expect(vacancyQueries.at(-1)?.application_status).toBe("none");
  });

  it("renders Ops Pipeline from Applications only", async () => {
    await act(async () => root.render(createElement(OpsPipelineWorkspace)));
    await settle();

    expect(container.textContent).toContain("companion-application-001");
    expect(container.textContent).toContain("Applied");
    expect(container.textContent).not.toContain("No Applications recorded");
    expect(client.getOpsWorkItems).toHaveBeenCalledWith(
      expect.objectContaining({ view: "applications" }),
    );
    expect(jobRepo.list).not.toHaveBeenCalled();
  });

  it("uses complete Companion summary and analytics sources for Today", async () => {
    await act(async () => root.render(createElement(TodayWorkspace)));
    await settle();

    expect(container.textContent).toContain("New to review");
    expect(container.textContent).toContain("Applied");
    expect(container.textContent).toContain("complete Companion read sources");
    expect(client.getOpsWorkItems).toHaveBeenCalledWith(
      expect.objectContaining({ view: "summary" }),
    );
    expect(client.getAnalyticsSummary).toHaveBeenCalledTimes(1);
    expect(jobRepo.list).not.toHaveBeenCalled();
  });
});
