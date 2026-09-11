import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpsWorkItem } from "@/adapters/companion/ops-projection-types";
import type { OpsCapabilities } from "@/services/ops-capabilities";

const client = vi.hoisted(() => ({ getOpsWorkItems: vi.fn() }));

vi.mock("@/services/companion-service", () => ({
  getOpsClient: vi.fn(),
}));

vi.mock("@/services/ops-capabilities", () => ({
  getOpsCapabilities: vi.fn(),
}));

import { getOpsClient } from "@/services/companion-service";
import { getOpsCapabilities } from "@/services/ops-capabilities";
import { readOpsSidePanelProjection } from "./App";

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

const item: OpsWorkItem = {
  authority: "ops",
  vacancy_state: "active",
  vacancy: {
    vacancy_id: "companion-sidepanel-001",
    hh_vacancy_id: "hh-sidepanel-001",
    source: "hh",
    source_url: null,
    title: "Side Panel projection",
    company_id: null,
    company_name: "Side Panel Company",
    salary_min: null,
    salary_max: null,
    currency: null,
    city: null,
    work_mode: null,
    experience: null,
    description: null,
    description_hash: null,
    skills: [],
    published_at: null,
    first_seen_at: "2026-09-01T00:00:00Z",
    last_seen_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    archived: false,
    revision: 1,
    hydration_state: "partial",
  },
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

describe("Side Panel Ops authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOpsCapabilities).mockResolvedValue(capabilities);
    vi.mocked(getOpsClient).mockReturnValue(client as never);
    client.getOpsWorkItems.mockResolvedValue({ data: [item] });
  });

  it("returns a Companion view with distinct vacancy identities", async () => {
    const result = await readOpsSidePanelProjection("hh-sidepanel-001");

    expect(result.item?.authority).toBe("ops");
    expect(result.item?.vacancyId).toEqual({
      companionVacancyId: "companion-sidepanel-001",
      hhVacancyId: "hh-sidepanel-001",
    });
    expect(client.getOpsWorkItems).toHaveBeenCalledWith({
      view: "vacancies",
      source_vacancy_id: "hh-sidepanel-001",
      archived: false,
      limit: 1,
    });
  });

  it("reports Companion failure instead of fabricating a local absence", async () => {
    client.getOpsWorkItems.mockRejectedValueOnce(new Error("offline"));

    const result = await readOpsSidePanelProjection("hh-sidepanel-001");

    expect(result.item).toBeUndefined();
    expect(result.error).toContain("unavailable");
  });
});
