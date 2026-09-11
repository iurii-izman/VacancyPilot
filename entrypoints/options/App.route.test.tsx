import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { ApplicationWorkspace } from "@/components/ApplicationOpsWorkspace";
import { getInitialSectionFromHash, resolveHash, SECTION_GROUPS, SectionContent } from "./App";

describe("Options route wiring", () => {
  it("uses the selection-aware application workspace for Inbox", () => {
    const route = SectionContent({ section: "inbox" });

    expect(isValidElement(route)).toBe(true);
    expect((route as ReactElement).type).toBe(ApplicationWorkspace);
  });

  it("keeps the canonical inbox section available for vacancy deep links", () => {
    expect((SectionContent({ section: "inbox" }) as ReactElement).type).toBe(ApplicationWorkspace);
    const deepLink = new URL("chrome-extension://test/options.html?vacancyId=136022615#inbox");
    expect(deepLink.searchParams.get("vacancyId")).toBe("136022615");
    expect(getInitialSectionFromHash(deepLink.hash)).toBe("inbox");
  });

  it("defaults unknown hashes to Today and preserves onboarding handling", () => {
    expect(getInitialSectionFromHash("#unknown")).toBe("today");
    expect(getInitialSectionFromHash("#onboarding")).toBe("onboarding");
  });

  it("exposes exactly six primary navigation entries", () => {
    expect(SECTION_GROUPS.flatMap((group) => group.sections).map((item) => item.id)).toEqual([
      "today",
      "discovery",
      "inbox",
      "pipeline",
      "candidate",
      "settings",
    ]);
  });

  it("maps legacy hashes to canonical workspaces and subviews", () => {
    expect(resolveHash("#command").section).toBe("today");
    expect(resolveHash("#applications").section).toBe("inbox");
    expect(resolveHash("#vacancies")).toEqual({ section: "pipeline" });
    expect(resolveHash("#summary")).toEqual({ section: "pipeline", pipelineTab: "performance" });
    expect(resolveHash("#profiles")).toEqual({ section: "candidate", candidateTab: "profile" });
    expect(resolveHash("#resumes")).toEqual({ section: "candidate", candidateTab: "resume" });
    expect(resolveHash("#privacy")).toEqual({ section: "settings", settingsTab: "privacy" });
    expect(resolveHash("#permissions")).toEqual({ section: "settings", settingsTab: "permissions" });
    expect(resolveHash("#labs")).toEqual({ section: "settings", settingsTab: "advanced" });
  });
});
