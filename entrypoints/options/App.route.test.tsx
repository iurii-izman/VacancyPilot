import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { ApplicationWorkspace } from "@/components/ApplicationOpsWorkspace";
import { getInitialSectionFromHash, SectionContent } from "./App";

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

  it("defaults unknown hashes to Command Center and preserves onboarding handling", () => {
    expect(getInitialSectionFromHash("#unknown")).toBe("command");
    expect(getInitialSectionFromHash("#onboarding")).toBe("onboarding");
  });
});
