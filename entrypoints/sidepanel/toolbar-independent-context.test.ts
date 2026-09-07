import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const background = readFileSync(join(ROOT, "entrypoints", "background.ts"), "utf8");
const sidePanel = readFileSync(join(ROOT, "entrypoints", "sidepanel", "App.tsx"), "utf8");
const content = readFileSync(join(ROOT, "entrypoints", "vacancy.content.ts"), "utf8");

describe("toolbar-independent HH vacancy context", () => {
  it("self-registers on page load and derives identity from sender.tab", () => {
    expect(content).toContain("void registerVacancyContext()");
    expect(background).toContain('message.type === "REGISTER_VACANCY_CONTEXT"');
    expect(background).toContain("const tab = sender.tab");
    expect(background).toContain("contextStorageKey(tab.id)");
    expect(background).not.toContain("senderVacancyId");
  });

  it("opens from the badge before any asynchronous lookup", () => {
    const handler = background.slice(background.indexOf('message.type === "OPEN_SIDE_PANEL"'));
    const openIndex = handler.indexOf("chrome.sidePanel.open({ tabId })");

    expect(openIndex).toBeGreaterThan(-1);
    expect(handler.slice(0, openIndex)).toContain("sender.tab?.id");
    expect(handler.slice(0, openIndex)).toContain("chrome.storage.session.set");
    expect(handler.slice(0, openIndex)).not.toMatch(/await|\.then\(|chrome\.tabs\.(query|get)/);
  });

  it("resolves page kind through the live content script, not a tab URL", () => {
    expect(content).toContain('message.type === "GET_PAGE_CONTEXT"');
    expect(background).toContain('type: "GET_PAGE_CONTEXT"');
    expect(sidePanel).not.toMatch(/chrome\.tabs\.(get|query)\s*\(/);
    expect(sidePanel).not.toContain("tab.url");
    expect(background).not.toContain("sender.tab?.url");
  });

  it("binds the badge-opened tab by window and retains a session fallback", () => {
    expect(background).toContain("sidePanelBindingStorageKey(windowId)");
    expect(background).toContain("contextMatchesTab(context, targetTabId, targetWindowId)");
    expect(background).toContain("message.windowId");
    expect(background).not.toContain("activeContext");
  });
});
