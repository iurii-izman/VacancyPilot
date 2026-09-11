import { describe, expect, it } from "vitest";

import { defaultSettings } from "@/db/settings-bridge";
import type { VacancyAnalysisInput } from "@/models/ai";
import {
  buildProviderRequestPlan,
  buildStandaloneOperationKey,
} from "./ai-plan";

function settings() {
  const value = defaultSettings();
  value.privacy.aiEnabled = true;
  value.privacy.strictPrivacyMode = false;
  value.privacy.allowFullDescriptionToAI = true;
  value.ai.provider = "openai";
  value.ai.model = "gpt-4o";
  return value;
}

function input(): VacancyAnalysisInput {
  return {
    job: {
      title: "TypeScript Engineer",
      company: "Synthetic Co",
      salaryRaw: "1000 USD",
      city: "Chisinau",
      workMode: "remote",
      experienceRaw: "3 years",
      skills: ["TypeScript", "React"],
      descriptionClean: "Build safe local-first tools.",
    },
    profile: {
      summary: "Builds reliable browser applications.",
      targetTitles: ["Frontend Engineer"],
      mustHaveSkills: ["TypeScript"],
      niceToHaveSkills: ["React"],
    },
    resumeHighlights: "Delivered a synthetic project.",
    strictPrivacy: false,
  };
}

describe("standalone canonical provider plans", () => {
  it("is deterministic and excludes budget-only changes", () => {
    const first = buildProviderRequestPlan(
      "vacancy_analysis",
      input(),
      settings(),
      { job_id: "job-1", profile_id: "profile-1" },
    );
    const changedBudget = settings();
    changedBudget.ai.dailyRequestLimit = 1;
    const second = buildProviderRequestPlan(
      "vacancy_analysis",
      input(),
      changedBudget,
      { profile_id: "profile-1", job_id: "job-1" },
    );

    expect(first.providerPlanHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.providerPlanHash).toBe(second.providerPlanHash);
    expect(first.messages).toEqual(second.messages);
    expect(first.providerAffectingOptions.sdkRetries).toBe(0);
  });

  it("binds privacy, model and exact prompt semantics", () => {
    const first = buildProviderRequestPlan(
      "vacancy_analysis",
      input(),
      settings(),
      { job_id: "job-1", profile_id: "profile-1" },
    );
    const strict = settings();
    strict.privacy.strictPrivacyMode = true;
    strict.privacy.allowFullDescriptionToAI = false;
    const second = buildProviderRequestPlan(
      "vacancy_analysis",
      input(),
      strict,
      { job_id: "job-1", profile_id: "profile-1" },
    );
    const changedModel = settings();
    changedModel.ai.model = "gpt-4o-mini";
    const third = buildProviderRequestPlan(
      "vacancy_analysis",
      input(),
      changedModel,
      { job_id: "job-1", profile_id: "profile-1" },
    );

    expect(second.providerPlanHash).not.toBe(first.providerPlanHash);
    expect(third.providerPlanHash).not.toBe(first.providerPlanHash);
    expect(second.dynamicPayload.job).toMatchObject({ descriptionClean: "" });
    expect(second.messages[1].content).not.toContain("Build safe local-first tools.");
    expect(second.messages[1].content).not.toContain("Delivered a synthetic project.");
  });

  it("uses a semantic key and makes explicit retry a new operation", () => {
    const plan = buildProviderRequestPlan(
      "vacancy_analysis",
      input(),
      settings(),
      { job_id: "job-1", profile_id: "profile-1" },
    );
    expect(buildStandaloneOperationKey(plan)).toBe(buildStandaloneOperationKey(plan));
    expect(buildStandaloneOperationKey(plan, "retry-1")).not.toBe(
      buildStandaloneOperationKey(plan),
    );
  });
});
