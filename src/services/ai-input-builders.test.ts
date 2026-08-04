import { describe, it, expect } from "vitest";
import type { Job } from "@/models/job";
import type { Profile } from "@/models/profile";
import type { Resume } from "@/models/resume";
import type { AppSettings } from "@/models/settings";
import {
  buildVacancyAnalysisInput,
  buildCoverLetterInput,
} from "./ai-input-builders";

// ── shared test data ──────────────────────────────────────────────────

function makeSettings(
  overrides?: Partial<AppSettings["privacy"]>,
): AppSettings {
  return {
    schemaVersion: 1,
    onboardingCompleted: false,
    general: {
      language: "ru",
      theme: "system",
      showPageBadge: true,
      trackVisitMarks: true,
      rejectedSearchCardBehavior: "dim",
      autosaveViewedJobs: true,
      toolbarClickBehavior: "popup",
      closePopupAfterOpeningSidePanel: true,
    },
    privacy: {
      aiEnabled: true,
      n8nEnabled: false,
      strictPrivacyMode: false,
      showPayloadPreviewAlways: true,
      allowResumeHighlightsToAI: true,
      allowFullDescriptionToAI: true,
      redactContacts: true,
      debugHtmlMode: false,
      ...overrides,
    },
    ai: {
      dailyRequestLimit: 10,
      maxInputChars: 3000,
      enableStreaming: false,
      enableCache: true,
    },
    n8n: {
      enabled: false,
      hmacSecretSet: false,
      enabledEvents: [],
      dailyEventLimit: 10,
    },
    labs: {
      enabled: false,
      guidedApplyEnabled: false,
      killSwitchEnabled: false,
      dailyActionLimit: 10,
    },
    companion: {
      opsModeEnabled: false,
      baseUrl: "http://127.0.0.1:8765/api/v1",
      lastServiceVersion: null,
      lastApiVersion: null,
      lastApiCompatible: false,
      lastConnectedAt: null,
    },
  };
}

function makeJob(overrides?: Partial<Job>): Job {
  return {
    id: "hh_1",
    source: "hh",
    sourceVacancyId: "1",
    sourceUrl: "https://hh.ru/vacancy/1",
    title: "Senior Frontend Developer",
    companyId: "hh_co_1",
    companyName: "Acme Corp",
    salaryRaw: "200 000 – 300 000 ₽",
    salaryMin: 200000,
    salaryMax: 300000,
    salaryCurrency: "RUB",
    city: "Москва",
    workMode: "remote",
    experienceRaw: "3–6 лет",
    experienceMinYears: 3,
    descriptionClean:
      "Мы ищем опытного разработчика. Требования: React, TypeScript, Node.js. Звоните +7 (999) 123-45-67 или пишите hr@acme.ru.",
    descriptionHash: "abc123",
    skills: ["React", "TypeScript", "Node.js", "CSS", "HTML"],
    status: "viewed",
    statusHistory: [],
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeProfile(overrides?: Partial<Profile>): Profile {
  return {
    id: "profile_1",
    name: "Мой профиль",
    summary:
      "Frontend-разработчик с 5-летним опытом. Специализируюсь на React и TypeScript. Контакты: dev@example.com.",
    targetTitles: ["Frontend Developer", "Senior React Developer"],
    mustHaveSkills: ["React", "TypeScript"],
    niceToHaveSkills: ["Node.js", "GraphQL"],
    avoidKeywords: [],
    preferredWorkModes: ["remote"],
    preferredCities: ["Москва"],
    salaryExpectationMin: 180000,
    salaryCurrency: "RUB",
    letterPrefs: {
      defaultMode: "hh_standard",
      defaultConstraints: {
        noEmoji: true,
        noMarkdown: true,
        noSpecialChars: false,
        maxChars: 1000,
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeResume(overrides?: Partial<Resume>): Resume {
  return {
    id: "resume_1",
    profileId: "profile_1",
    title: "Моё резюме",
    highlightsText:
      "5 лет React; разработал high-load dashboard; лидировал команду из 3 человек.",
    skills: ["React", "TypeScript", "Node.js"],
    language: "ru",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── buildVacancyAnalysisInput tests ───────────────────────────────────

describe("buildVacancyAnalysisInput", () => {
  // ── Standard Privacy ──────────────────────────────────────────────

  describe("Standard Privacy", () => {
    it("includes all job fields and descriptionClean", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: false });
      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.job.title).toBe(job.title);
      expect(input.job.company).toBe(job.companyName);
      expect(input.job.salaryRaw).toBe(job.salaryRaw);
      expect(input.job.city).toBe(job.city);
      expect(input.job.workMode).toBe(job.workMode);
      expect(input.job.experienceRaw).toBe(job.experienceRaw);
      expect(input.job.skills).toEqual(job.skills);
      expect(input.job.descriptionClean.length).toBeGreaterThan(0);
      expect(input.strictPrivacy).toBe(false);
    });

    it("includes profile fields", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: false });
      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.profile.summary.length).toBeGreaterThan(0);
      expect(input.profile.targetTitles).toEqual(profile.targetTitles);
      expect(input.profile.mustHaveSkills).toEqual(profile.mustHaveSkills);
      expect(input.profile.niceToHaveSkills).toEqual(profile.niceToHaveSkills);
    });

    it("includes resumeHighlights when allowResumeHighlightsToAI is true", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume();
      const settings = makeSettings({
        strictPrivacyMode: false,
        allowResumeHighlightsToAI: true,
      });
      const input = buildVacancyAnalysisInput(job, profile, settings, resume);

      expect(input.resumeHighlights).toBeDefined();
      expect(input.resumeHighlights!.length).toBeGreaterThan(0);
    });

    it("excludes resumeHighlights when setting is false", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume();
      const settings = makeSettings({
        strictPrivacyMode: false,
        allowResumeHighlightsToAI: false,
      });
      const input = buildVacancyAnalysisInput(job, profile, settings, resume);

      expect(input.resumeHighlights).toBeUndefined();
    });

    it("excludes resumeHighlights when resume is undefined", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({
        strictPrivacyMode: false,
        allowResumeHighlightsToAI: true,
      });
      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.resumeHighlights).toBeUndefined();
    });

    it("excludes resumeHighlights when highlightsText is empty", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume({ highlightsText: "" });
      const settings = makeSettings({
        strictPrivacyMode: false,
        allowResumeHighlightsToAI: true,
      });
      const input = buildVacancyAnalysisInput(job, profile, settings, resume);

      expect(input.resumeHighlights).toBeUndefined();
    });

    it("redacts contacts from descriptionClean", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: false });
      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.job.descriptionClean).not.toContain("hr@acme.ru");
      expect(input.job.descriptionClean).toContain("[email redacted]");
      expect(input.job.descriptionClean).not.toContain("+7");
    });

    it("redacts contacts from profile summary", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: false });
      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.profile.summary).not.toContain("dev@example.com");
      expect(input.profile.summary).toContain("[email redacted]");
    });

    it("redacts contacts from resumeHighlights", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume({
        highlightsText: "Контакты: me@dev.ru, 89991234567.",
      });
      const settings = makeSettings({
        strictPrivacyMode: false,
        allowResumeHighlightsToAI: true,
      });
      const input = buildVacancyAnalysisInput(job, profile, settings, resume);

      expect(input.resumeHighlights).not.toContain("me@dev.ru");
      expect(input.resumeHighlights).toContain("[email redacted]");
    });

    it("keeps contact data when redactContacts is false", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume({
        highlightsText: "Контакты: me@dev.ru, 89991234567.",
      });
      const settings = makeSettings({
        strictPrivacyMode: false,
        allowResumeHighlightsToAI: true,
        redactContacts: false,
      });
      const input = buildVacancyAnalysisInput(job, profile, settings, resume);

      expect(input.job.descriptionClean).toContain("hr@acme.ru");
      expect(input.profile.summary).toContain("dev@example.com");
      expect(input.resumeHighlights).toContain("me@dev.ru");
      expect(input.resumeHighlights).toContain("89991234567");
    });
  });

  // ── Strict Privacy ────────────────────────────────────────────────

  describe("Strict Privacy", () => {
    it("excludes descriptionClean by default", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: true });
      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.job.descriptionClean).toBe("");
      expect(input.strictPrivacy).toBe(true);
    });

    it("includes title, company, salary, city, workMode, skills", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: true });
      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.job.title).toBe(job.title);
      expect(input.job.company).toBe(job.companyName);
      expect(input.job.salaryRaw).toBe(job.salaryRaw);
      expect(input.job.workMode).toBe(job.workMode);
      expect(input.job.skills).toEqual(job.skills);
    });

    it("excludes resumeHighlights even when allowed", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume();
      const settings = makeSettings({
        strictPrivacyMode: true,
        allowResumeHighlightsToAI: true,
      });
      const input = buildVacancyAnalysisInput(job, profile, settings, resume);

      expect(input.resumeHighlights).toBeUndefined();
    });

    it("includes descriptionClean when forceDescription override is true", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: true });
      const input = buildVacancyAnalysisInput(
        job,
        profile,
        settings,
        undefined,
        {
          forceDescription: true,
        },
      );

      expect(input.job.descriptionClean.length).toBeGreaterThan(0);
      expect(input.strictPrivacy).toBe(true);
    });

    it("includes resumeHighlights when forceResumeHighlights override is true", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume();
      const settings = makeSettings({
        strictPrivacyMode: true,
        allowResumeHighlightsToAI: true,
      });
      const input = buildVacancyAnalysisInput(job, profile, settings, resume, {
        forceResumeHighlights: true,
      });

      expect(input.resumeHighlights).toBeDefined();
    });

    it("still excludes resumeHighlights with forceResumeHighlights if allowResumeHighlightsToAI is false", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume();
      const settings = makeSettings({
        strictPrivacyMode: true,
        allowResumeHighlightsToAI: false,
      });
      const input = buildVacancyAnalysisInput(job, profile, settings, resume, {
        forceResumeHighlights: true,
      });

      expect(input.resumeHighlights).toBeUndefined();
    });

    it("includes profile summary and skills in strict mode", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: true });
      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.profile.summary.length).toBeGreaterThan(0);
      expect(input.profile.mustHaveSkills).toEqual(profile.mustHaveSkills);
      expect(input.profile.niceToHaveSkills).toEqual(profile.niceToHaveSkills);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles job with empty descriptionClean", () => {
      const job = makeJob({ descriptionClean: "", descriptionHash: "0" });
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: false });
      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.job.descriptionClean).toBe("");
    });

    it("handles missing optional job fields", () => {
      const job = makeJob({
        salaryRaw: undefined,
        salaryMin: undefined,
        salaryMax: undefined,
        city: undefined,
        experienceRaw: undefined,
      });
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: false });
      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.job.salaryRaw).toBeUndefined();
      expect(input.job.city).toBeUndefined();
      expect(input.job.experienceRaw).toBeUndefined();
      expect(input.job.title).toBe(job.title);
    });

    it("includes experienceRaw when present", () => {
      const job = makeJob({ experienceRaw: "Более 5 лет" });
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: false });
      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.job.experienceRaw).toBe("Более 5 лет");
    });
  });
});

// ── buildCoverLetterInput tests ───────────────────────────────────────

describe("buildCoverLetterInput", () => {
  it("builds cover letter input with job and profile fields", () => {
    const job = makeJob();
    const profile = makeProfile();
    const resume = makeResume();
    const settings = makeSettings();
    const input = buildCoverLetterInput(job, profile, settings, resume);

    expect(input.job.title).toBe(job.title);
    expect(input.job.company).toBe(job.companyName);
    expect(input.job.skills).toEqual(job.skills);
    expect(input.job.topRequirements.length).toBeGreaterThan(0);
    expect(input.profile.summary.length).toBeGreaterThan(0);
    expect(input.resumeHighlights.length).toBeGreaterThan(0);
    expect(input.mode).toBe(profile.letterPrefs.defaultMode);
    expect(input.constraints).toEqual(profile.letterPrefs.defaultConstraints);
    expect(input.language).toBe("ru");
  });

  it("derives topRequirements from matching skills", () => {
    const job = makeJob({ skills: ["React", "TypeScript", "Vue", "Angular"] });
    const profile = makeProfile({ mustHaveSkills: ["React", "TypeScript"] });
    const settings = makeSettings();
    const input = buildCoverLetterInput(job, profile, settings);

    expect(input.job.topRequirements).toContain("React");
    expect(input.job.topRequirements).toContain("TypeScript");
  });

  it("falls back to first 5 skills when no mustHave match", () => {
    const job = makeJob({
      skills: ["Python", "Django", "Flask", "FastAPI", "SQL", "Docker"],
    });
    const profile = makeProfile({ mustHaveSkills: ["React", "TypeScript"] });
    const settings = makeSettings();
    const input = buildCoverLetterInput(job, profile, settings);

    expect(input.job.topRequirements).toContain("Python");
    expect(input.job.topRequirements).toContain("Django");
    expect(input.job.topRequirements).toContain("Flask");
    expect(input.job.topRequirements).toContain("FastAPI");
    expect(input.job.topRequirements).toContain("SQL");
    expect(input.job.topRequirements).not.toContain("Docker");
  });

  it("accepts custom mode, constraints, and language", () => {
    const job = makeJob();
    const profile = makeProfile();
    const settings = makeSettings();
    const input = buildCoverLetterInput(job, profile, settings, undefined, {
      mode: "en",
      constraints: { noEmoji: false, noMarkdown: false, noSpecialChars: false },
      language: "en",
    });

    expect(input.mode).toBe("en");
    expect(input.constraints.noEmoji).toBe(false);
    expect(input.language).toBe("en");
  });

  it("handles missing resume gracefully", () => {
    const job = makeJob();
    const profile = makeProfile();
    const settings = makeSettings();
    const input = buildCoverLetterInput(job, profile, settings);

    expect(input.resumeHighlights).toBe("");
  });

  it("redacts contacts from profile summary", () => {
    const job = makeJob();
    const profile = makeProfile();
    const settings = makeSettings();
    const input = buildCoverLetterInput(job, profile, settings);

    expect(input.profile.summary).not.toContain("dev@example.com");
    expect(input.profile.summary).toContain("[email redacted]");
  });

  it("redacts contacts from resumeHighlights", () => {
    const job = makeJob();
    const profile = makeProfile();
    const resume = makeResume({
      highlightsText: "Email: me@dev.ru, Phone: +7 (999) 123-45-67.",
    });
    const settings = makeSettings();
    const input = buildCoverLetterInput(job, profile, settings, resume);

    expect(input.resumeHighlights).not.toContain("me@dev.ru");
    expect(input.resumeHighlights).not.toContain("+7");
    expect(input.resumeHighlights).toContain("[email redacted]");
    expect(input.resumeHighlights).toContain("[phone redacted]");
  });

  it("keeps contacts in cover-letter input when redactContacts is false", () => {
    const job = makeJob();
    const profile = makeProfile();
    const resume = makeResume({
      highlightsText: "Email: me@dev.ru, Phone: +7 (999) 123-45-67.",
    });
    const settings = makeSettings({ redactContacts: false });
    const input = buildCoverLetterInput(job, profile, settings, resume);

    expect(input.profile.summary).toContain("dev@example.com");
    expect(input.resumeHighlights).toContain("me@dev.ru");
    expect(input.resumeHighlights).toContain("+7");
  });

  it("uses resume language when no language override", () => {
    const job = makeJob();
    const profile = makeProfile();
    const resume = makeResume({ language: "en" });
    const settings = makeSettings();
    const input = buildCoverLetterInput(job, profile, settings, resume);

    expect(input.language).toBe("en");
  });

  it("handles empty skills in job", () => {
    const job = makeJob({ skills: [] });
    const profile = makeProfile();
    const settings = makeSettings();
    const input = buildCoverLetterInput(job, profile, settings);

    expect(input.job.topRequirements).toBe("не указаны");
  });

  // ── Privacy gates ───────────────────────────────────────────

  describe("privacy — strictPrivacyMode", () => {
    it("excludes resumeHighlights in strict privacy by default", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume({
        highlightsText: "React expert, 5 years experience.",
      });
      const settings = makeSettings({
        strictPrivacyMode: true,
        allowResumeHighlightsToAI: true,
      });
      const input = buildCoverLetterInput(job, profile, settings, resume);

      expect(input.resumeHighlights).toBe("");
    });

    it("includes resumeHighlights in strict privacy when forceResumeHighlights is true", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume({
        highlightsText: "React expert, 5 years experience.",
      });
      const settings = makeSettings({
        strictPrivacyMode: true,
        allowResumeHighlightsToAI: true,
      });
      const input = buildCoverLetterInput(job, profile, settings, resume, {
        forceResumeHighlights: true,
      });

      expect(input.resumeHighlights).toContain("React expert");
    });

    it("still includes profile summary in strict privacy", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({ strictPrivacyMode: true });
      const input = buildCoverLetterInput(job, profile, settings);

      expect(input.profile.summary.length).toBeGreaterThan(0);
    });
  });

  describe("privacy — allowResumeHighlightsToAI", () => {
    it("excludes resumeHighlights when allowResumeHighlightsToAI is false", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume({
        highlightsText: "React expert, 5 years experience.",
      });
      const settings = makeSettings({
        strictPrivacyMode: false,
        allowResumeHighlightsToAI: false,
      });
      const input = buildCoverLetterInput(job, profile, settings, resume);

      expect(input.resumeHighlights).toBe("");
    });

    it("includes resumeHighlights when allowResumeHighlightsToAI is true (standard mode)", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume({
        highlightsText: "React expert, 5 years experience.",
      });
      const settings = makeSettings({
        strictPrivacyMode: false,
        allowResumeHighlightsToAI: true,
      });
      const input = buildCoverLetterInput(job, profile, settings, resume);

      expect(input.resumeHighlights).toContain("React expert");
    });

    it("returns empty string when resume is undefined", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({
        strictPrivacyMode: false,
        allowResumeHighlightsToAI: true,
      });
      const input = buildCoverLetterInput(job, profile, settings);

      expect(input.resumeHighlights).toBe("");
    });

    it("returns empty string when resume highlightsText is empty", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume({ highlightsText: "" });
      const settings = makeSettings({
        strictPrivacyMode: false,
        allowResumeHighlightsToAI: true,
      });
      const input = buildCoverLetterInput(job, profile, settings, resume);

      expect(input.resumeHighlights).toBe("");
    });
  });
});
