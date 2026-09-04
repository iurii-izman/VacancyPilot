// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const job = vi.hoisted(() => ({
  id: "hh_navigation_001",
  source: "hh" as const,
  sourceVacancyId: "navigation-001",
  sourceUrl: "https://hh.ru/vacancy/navigation-001",
  title: "Navigation Regression Vacancy",
  companyId: "company-navigation",
  companyName: "Navigation Test Company",
  workMode: "remote" as const,
  descriptionClean: "Synthetic vacancy used for navigation regression coverage.",
  descriptionHash: "navigation-hash",
  skills: ["TypeScript"],
  status: "new" as const,
  statusHistory: [],
  firstSeenAt: "2026-09-01T00:00:00.000Z",
  lastSeenAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
}));

vi.mock("@/db/repositories", () => ({
  jobRepo: {
    list: vi.fn().mockResolvedValue([job]),
    getById: vi.fn().mockImplementation((id: string) => Promise.resolve(id === job.id ? job : undefined)),
  },
}));

vi.mock("@/services/companion-service", () => ({
  detectCompanionStatus: vi.fn().mockResolvedValue({ status: "unavailable" }),
  getOpsClient: vi.fn(),
}));

import { ApplicationWorkspace } from "./ApplicationOpsWorkspace";
import { detectCompanionStatus, getOpsClient } from "@/services/companion-service";

describe("Application Workspace navigation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
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
      job.title,
    );
    expect(container.textContent).toContain(job.companyName);
    expect(container.textContent).toContain(
      "Viewing this card does not create an application or mark it Applied.",
    );

    const debugTab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Debug",
    );
    await act(async () => debugTab?.click());
    expect(container.textContent).toContain(`ID: ${job.id}`);

    const backButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "← Back to Inbox",
    );
    await act(async () => backButton?.click());
    expect(container.querySelector("#inbox-title")?.textContent).toBe("Inbox");
    expect(container.textContent).toContain(job.title);
    expect(container.textContent).toContain("Status: New");
  });

  it("opens a direct link for a Companion-only vacancy without creating an application", async () => {
    window.history.replaceState({}, "", "?vacancyId=remote-001");
    vi.mocked(detectCompanionStatus).mockResolvedValue({ status: "connected" });
    vi.mocked(getOpsClient).mockReturnValue({
      listVacancies: vi.fn().mockResolvedValue({
        data: [{
          id: "companion-vacancy-001",
          source: "hh",
          source_vacancy_id: "remote-001",
          url: "https://hh.ru/vacancy/remote-001",
          title: "Companion-only Vacancy",
          company_id: "company-remote",
          company_name: "Remote Company",
          salary_min: null,
          salary_max: null,
          currency: null,
          work_mode: "remote",
          experience: null,
          description: "Full remote vacancy description",
          skills: ["TypeScript"],
          first_seen_at: "2026-09-01T00:00:00.000Z",
          last_seen_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
          archived: false,
          revision: 1,
          description_hash: "remote-hash",
        }],
        meta: { request_id: "test", total: 1, limit: 100, offset: 0 },
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
