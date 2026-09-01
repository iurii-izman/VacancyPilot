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
  jobRepo: { list: vi.fn().mockResolvedValue([job]) },
}));

vi.mock("@/services/companion-service", () => ({
  detectCompanionStatus: vi.fn().mockResolvedValue({ status: "unavailable" }),
}));

import { ApplicationWorkspace } from "./ApplicationOpsWorkspace";

describe("Application Workspace navigation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
});
