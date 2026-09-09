import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── OnboardingSection safety and content tests ──
// Verifies that the OnboardingSection is a step-oriented wizard
// with onboarding-specific disclosures and delegates shared
// trust/safety content to TrustSafetySummary.

const sourcePath = resolve(__dirname, "OnboardingSection.tsx");
let source = "";

describe("OnboardingSection — step wizard structure", () => {
  beforeAll(() => {
    source = readFileSync(sourcePath, "utf-8");
  });

  it("includes a welcome heading and introduction", () => {
    expect(source).toMatch(/Welcome to VacancyPilot/);
    expect(source).toMatch(/walks you through setup/);
  });

  it("has a step-oriented structure", () => {
    expect(source).toMatch(/Safety & Trust/);
    expect(source).toMatch(/Create Your Profile/);
    expect(source).toMatch(/Add Resume Highlights/);
    expect(source).toMatch(/Review Your First Vacancy/);
    expect(source).toMatch(/Configure AI/);
    expect(source).not.toMatch(/Enable Labs/);
  });

  it("has step state management (expanded/done)", () => {
    expect(source).toMatch(/expandedSteps/);
    expect(source).toMatch(/doneSteps/);
  });

  it("marks steps done only after collapse and hides the done chip while expanded", () => {
    expect(source).toMatch(/wasExpanded/);
    expect(source).toMatch(/isDone && !isExpanded/);
  });

  it("delegates shared trust/safety content to TrustSafetySummary", () => {
    expect(source).toMatch(/TrustSafetySummary/);
  });
});

describe("OnboardingSection — onboarding-specific disclosures", () => {
  beforeAll(() => {
    source = readFileSync(sourcePath, "utf-8");
  });

  it("explains permissions used (spec §18.1.3)", () => {
    expect(source).toMatch(/Permissions Used/);
    expect(source).toMatch(/storage/);
    expect(source).toMatch(/sidePanel/);
    expect(source).toMatch(/activeTab/);
  });

  it("explains how AI works (spec §18.1.5)", () => {
    expect(source).toMatch(/How AI Works/);
    expect(source).toMatch(/opt-in/);
    expect(source).toMatch(/payload preview/);
    expect(source).toMatch(/Strict Privacy mode/);
    expect(source).toMatch(/currently/);
    expect(source).toMatch(/supports.*OpenAI and Mock/);
  });

  it("does not present deferred n8n setup as part of onboarding", () => {
    expect(source).not.toMatch(/How n8n/);
    expect(source).not.toMatch(/n8n webhook/);
  });

  it("explains API key security warning (spec §18.1.8)", () => {
    expect(source).toMatch(/API Key Security/);
    expect(source).toMatch(/plaintext/);
    expect(source).toMatch(/not a secure vault/);
  });

  it("keeps deferred Labs out of the first-run path", () => {
    expect(source).not.toMatch(/Enable Labs/);
    expect(source).not.toMatch(/Settings → n8n/);
  });

  it("includes setup action steps", () => {
    expect(source).toMatch(/Create Your Profile/);
    expect(source).toMatch(/Add Resume Highlights/);
    expect(source).toMatch(/Configure AI/);
    expect(source).not.toMatch(/Enable Labs/);
  });

  it("has onboarding completion flow", () => {
    expect(source).toMatch(/onboardingCompleted/);
    expect(source).toMatch(/Start Using VacancyPilot/);
  });

  it("contains no forbidden patterns", () => {
    expect(source).not.toMatch(/fetch\(.*hh\.ru/);
    expect(source).not.toMatch(/XMLHttpRequest/);
  });
});

describe("OnboardingSection — import", () => {
  it("can be imported without errors", () => {
    expect(async () => {
      await import("./OnboardingSection");
    }).not.toThrow();
  });
});
