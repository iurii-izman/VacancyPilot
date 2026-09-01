import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── PrivacyDisclosureSection safety and content tests ──
// Verifies privacy disclosures match privacy-policy-checklist.

const sourcePath = resolve(__dirname, "PrivacyDisclosureSection.tsx");
let source = "";

describe("PrivacyDisclosureSection — content disclosure", () => {
  beforeAll(() => {
    source = readFileSync(sourcePath, "utf-8");
  });

  it("discloses what data is stored locally", () => {
    expect(source).toMatch(/Data Stored Locally/);
    expect(source).toMatch(/Vacancy data/);
    expect(source).toMatch(/Status history/);
    expect(source).toMatch(/Profiles/);
    expect(source).toMatch(/Cover letters/);
    expect(source).toMatch(/Settings/);
    expect(source).toMatch(/Event log/);
    expect(source).toMatch(/AI cache/);
  });

  it("discloses what data is NOT stored", () => {
    expect(source).toMatch(/Data NOT Stored/);
    expect(source).toMatch(/login credentials/);
    expect(source).toMatch(/session cookies/);
    expect(source).toMatch(/Browsing history/);
    expect(source).toMatch(/Device identifiers/);
  });

  it("discloses what is sent to AI provider", () => {
    expect(source).toMatch(/AI Provider/);
    expect(source).toMatch(/redacted vacancy text/);
    expect(source).toMatch(/NOT sent/);
    expect(source).toMatch(/Payload preview/);
  });

  it("discloses what is sent to n8n webhook", () => {
    expect(source).toMatch(/n8n Webhook/);
    expect(source).toMatch(/event type/);
    expect(source).toMatch(/NOT sent/);
  });

  it("discloses no other external communication", () => {
    expect(source).toMatch(/No Other External/);
    expect(source).toMatch(/No analytics/);
    expect(source).toMatch(/crash reporting/);
    expect(source).toMatch(/developer-operated cloud backend/);
    expect(source).toMatch(/third-party advertising/);
  });

  it("discloses data minimization measures", () => {
    expect(source).toMatch(/Data Minimization/);
    expect(source).toMatch(/Redaction/);
    expect(source).toMatch(/Strict Privacy mode/);
    expect(source).toMatch(/HTML stripping/);
  });

  it("discloses user controls", () => {
    expect(source).toMatch(/Your Controls/);
    expect(source).toMatch(/Export/);
    expect(source).toMatch(/Delete all/);
    expect(source).toMatch(/AI disable/);
    expect(source).toMatch(/n8n disable/);
    expect(source).toMatch(/Labs kill switch/);
    expect(source).toMatch(/Permission management/);
  });

  it("discloses security measures", () => {
    expect(source).toMatch(/Security/);
    expect(source).toMatch(/browser.*security model/);
    expect(source).toMatch(/plaintext/);
    expect(source).toMatch(/never exported/);
    expect(source).toMatch(/Manifest V3/);
  });

  it("contains no forbidden patterns", () => {
    expect(source).not.toMatch(/fetch\(.*hh\.ru/);
    expect(source).not.toMatch(/XMLHttpRequest/);
  });
});

describe("PrivacyDisclosureSection — import", () => {
  it("can be imported without errors", () => {
    expect(async () => {
      await import("./PrivacyDisclosureSection");
    }).not.toThrow();
  });
});
