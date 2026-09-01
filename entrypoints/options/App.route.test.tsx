import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { ApplicationWorkspace } from "@/components/ApplicationOpsWorkspace";
import { SectionContent } from "./App";

describe("Options route wiring", () => {
  it("uses the selection-aware application workspace for Inbox", () => {
    const route = SectionContent({ section: "inbox" });

    expect(isValidElement(route)).toBe(true);
    expect((route as ReactElement).type).toBe(ApplicationWorkspace);
  });
});
