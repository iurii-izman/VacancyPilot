import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE_DIR = join(__dirname, "..", "..");

describe("navigation handoff safety", () => {
  it("opens the side panel directly from the badge message handler", () => {
    const source = readFileSync(join(BASE_DIR, "entrypoints", "background.ts"), "utf8");
    const handler = source.slice(source.indexOf('message.type === "OPEN_SIDE_PANEL"'));
    const openIndex = handler.indexOf("chrome.sidePanel.open({ tabId })");

    expect(openIndex).toBeGreaterThan(-1);
    expect(handler.slice(0, openIndex)).toContain("sender.tab?.id");
    expect(handler.slice(0, openIndex)).not.toMatch(/await|\.then\(|chrome\.tabs\.(query|get)/);
    expect(source).not.toContain("resolveWindowId");
    expect(source).not.toContain("openPanelInWindow");
  });
});
