import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── PermissionsSection safety and content tests ──
// Verifies permission disclosure matches real manifest (spec §19.6).

const sourcePath = resolve(__dirname, "PermissionsSection.tsx");
let source = "";

describe("PermissionsSection — manifest alignment", () => {
  beforeAll(() => {
    source = readFileSync(sourcePath, "utf-8");
  });

  it("lists required permissions from the real manifest", () => {
    expect(source).toMatch(/"storage"/);
    expect(source).toMatch(/"sidePanel"/);
    expect(source).toMatch(/"activeTab"/);
  });

  it("states that no host permissions are declared in the current build", () => {
    expect(source).toMatch(/no declared host permissions/i);
    expect(source).toMatch(/https:\/\/hh\.ru\/\*/);
  });

  it("discloses the narrow optional OpenAI runtime host access", () => {
    expect(source).toMatch(/Optional Runtime Host Access/);
    expect(source).toMatch(/https:\/\/api\.openai\.com\/\*/);
    expect(source).toMatch(/requested only when you confirm an AI action/i);
    expect(source).toMatch(/clipboardWrite/);
    expect(source).toMatch(/alarms/);
  });

  it("provides explanation for every permission", () => {
    const permissionEntries = source.match(/permission:/g);
    expect(permissionEntries).toBeTruthy();
    expect(permissionEntries!.length).toBeGreaterThanOrEqual(3);
  });

  it("includes access revocation instructions", () => {
    expect(source).toMatch(/How to Revoke Access/);
    expect(source).toMatch(/chrome:\/\/extensions\//);
    expect(source).toMatch(/remove the extension/i);
  });

  it("does not request forbidden permissions", () => {
    expect(source).not.toMatch(/"cookies"/);
    expect(source).not.toMatch(/"webRequest"/);
    expect(source).not.toMatch(/"nativeMessaging"/);
    expect(source).not.toMatch(/<all_urls>/);
  });

  it("contains no forbidden patterns", () => {
    expect(source).not.toMatch(/fetch\(.*hh\.ru/);
    expect(source).not.toMatch(/XMLHttpRequest/);
  });

  it("keeps AI and deferred integrations out of declared permissions", () => {
    expect(source).toMatch(/OpenAI/);
    expect(source).toMatch(/deferred integrations/i);
    expect(source).toMatch(/opt-in/i);
  });

  it("documents toolbar icon behavior and popup overlap constraints", () => {
    expect(source).toMatch(/Toolbar Icon Behavior/);
    expect(source).toMatch(/Popup: clicking the extension icon opens the compact popup/i);
    expect(source).toMatch(/Side Panel: clicking the extension icon opens VacancyPilot/i);
    expect(source).toMatch(/cannot\s+make the popup draggable/i);
    expect(source).toMatch(/Chrome side panel side:/i);
  });
});

describe("PermissionsSection — import", () => {
  it("can be imported without errors", () => {
    expect(async () => {
      await import("./PermissionsSection");
    }).not.toThrow();
  });
});
