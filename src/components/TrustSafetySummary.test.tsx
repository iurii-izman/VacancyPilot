import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── TrustSafetySummary safety and content tests ──
// Verifies that the shared trust/safety component discloses all
// required product boundaries, data handling, and principles.

const sourcePath = resolve(__dirname, "TrustSafetySummary.tsx");
let source = "";

describe("TrustSafetySummary — content disclosure", () => {
  beforeAll(() => {
    source = readFileSync(sourcePath, "utf-8");
  });

  it("discloses what VacancyPilot does", () => {
    expect(source).toMatch(/What VacancyPilot Does/);
    expect(source).toMatch(/Extracts vacancy data/);
    expect(source).toMatch(/Scores vacancies/);
    expect(source).toMatch(/Tracks your application status/);
  });

  it("discloses what VacancyPilot does NOT do", () => {
    expect(source).toMatch(/What VacancyPilot Does NOT Do/);
    expect(source).toMatch(/auto-submit/);
    expect(source).toMatch(/auto-click/);
    expect(source).toMatch(/CAPTCHA/);
    expect(source).toMatch(/telemetry/);
  });

  it("discloses where data is stored (full mode)", () => {
    expect(source).toMatch(/Where Data Is Stored/);
    expect(source).toMatch(/IndexedDB/);
    expect(source).toMatch(/chrome\.storage\.local/);
    expect(source).toMatch(/Standalone data is stored/);
  });

  it("discloses key principles", () => {
    expect(source).toMatch(/Key Principles/);
    expect(source).toMatch(/Local-first/);
    expect(source).toMatch(/Read-first/);
    expect(source).toMatch(/User in control/);
    expect(source).toMatch(/Works without AI/);
    expect(source).toMatch(/Privacy by default/);
    expect(source).toMatch(/Core vs Labs/);
  });

  it("supports compact and full levels", () => {
    expect(source).toMatch(/TrustLevel/);
    expect(source).toMatch(/"compact"/);
    expect(source).toMatch(/"full"/);
  });

  it("contains no forbidden patterns", () => {
    expect(source).not.toMatch(/fetch\(.*hh\.ru/);
  });
});

describe("TrustSafetySummary — import", () => {
  it("can be imported without errors", () => {
    expect(async () => {
      await import("./TrustSafetySummary");
    }).not.toThrow();
  });
});
