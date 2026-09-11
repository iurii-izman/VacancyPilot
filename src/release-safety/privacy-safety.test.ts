/**
 * Privacy Payload Safety Tests — ITER-015.
 *
 * Verify that AI-bound payloads never include sensitive data
 * (emails, phones, URLs, tokens) and that Strict Privacy mode
 * correctly excludes description and resume highlights.
 *
 * Tests against the AI input builders and redaction helpers.
 */

import { describe, it, expect } from "vitest";
import { buildVacancyAnalysisInput } from "@/services/ai-input-builders";
import { redactText } from "@/services/redaction";
import { generateVacancyAnalysisPreview } from "@/services/payload-preview";
import type { Job } from "@/models/job";
import type { Profile } from "@/models/profile";
import type { Resume } from "@/models/resume";
import type { AppSettings } from "@/models/settings";

// ── Test data factories ──────────────────────────────────────────────────

function makeSettings(overrides?: Partial<AppSettings>): AppSettings {
  return {
    schemaVersion: 1,
    general: {
      showPageBadge: true,
      trackVisitMarks: true,
      rejectedSearchCardBehavior: "dim",
      toolbarClickBehavior: "popup",
      closePopupAfterOpeningSidePanel: true,
    },
    privacy: {
      aiEnabled: true,
      strictPrivacyMode: false,
      allowResumeHighlightsToAI: true,
      allowFullDescriptionToAI: true,
      redactContacts: true,
    },
    ai: {
      dailyRequestLimit: 20,
      maxInputChars: 5000,
      enableCache: false,
    },
    n8n: {
      enabled: false,
      hmacSecretSet: false,
      enabledEvents: [],
      dailyEventLimit: 0,
    },
    labs: {
      enabled: false,
      guidedApplyEnabled: false,
      killSwitchEnabled: false,
      dailyActionLimit: 0,
    },
    ...overrides,
  } as AppSettings;
}

function makeJob(overrides?: Partial<Job>): Job {
  return {
    id: "hh_123",
    source: "hh",
    sourceVacancyId: "123",
    sourceUrl: "https://hh.ru/vacancy/123",
    title: "Senior Frontend Developer",
    companyId: "comp_1",
    companyName: "Acme Corp",
    salaryRaw: "200 000 – 300 000 ₽",
    salaryMin: 200000,
    salaryMax: 300000,
    salaryCurrency: "RUB",
    city: "Москва",
    workMode: "remote",
    experienceRaw: "3–6 лет",
    descriptionClean:
      "Contact hr@acme.ru. Call +7 (999) 123-45-67. Visit https://acme.ru/jobs.",
    descriptionHash: "abc123",
    skills: ["React", "TypeScript", "Node.js"],
    status: "new",
    statusHistory: [],
    firstSeenAt: "2025-01-01T00:00:00.000Z",
    lastSeenAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeProfile(overrides?: Partial<Profile>): Profile {
  return {
    id: "prof_1",
    name: "Default",
    summary: "Frontend-разработчик. Email: me@personal.ru.",
    targetTitles: ["Frontend Developer"],
    mustHaveSkills: ["React", "TypeScript"],
    niceToHaveSkills: ["Node.js"],
    avoidKeywords: [],
    preferredWorkModes: ["remote"],
    preferredCities: ["Москва"],
    salaryExpectationMin: 200000,
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
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeResume(overrides?: Partial<Resume>): Resume {
  return {
    id: "res_1",
    profileId: "prof_1",
    title: "Frontend Resume",
    highlightsText: "5 лет React. Контакты: +7 (999) 111-22-33.",
    skills: ["React", "TypeScript"],
    language: "ru",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── Sensitive data patterns ──────────────────────────────────────────────

const SENSITIVE_EMAILS = ["hr@acme.ru", "me@personal.ru", "john@example.com"];

// Reference patterns used in tests below — kept for documentation.
void (["+7 (999) 123-45-67", "+7 (999) 111-22-33", "89991234567"] as const);
void (["https://acme.ru/jobs", "http://example.com"] as const);
void ([
  "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYSJ9.sig",
  "sk_test_abc123def456ghi789jkl012mno345pqr",
  "bearer abc123token",
] as const);

// ── Tests: AI input builders privacy ─────────────────────────────────────

describe("privacy safety — AI input builders", () => {
  describe("vacancy analysis input is free of sensitive data", () => {
    it("does not contain email addresses in job fields", () => {
      const job = makeJob({
        descriptionClean:
          "Contact hr@acme.ru for details. Also reach john@example.com.",
      });
      const profile = makeProfile({ summary: "No emails here." });
      const settings = makeSettings();

      const input = buildVacancyAnalysisInput(job, profile, settings);

      const payload = JSON.stringify(input);
      for (const email of SENSITIVE_EMAILS.slice(0, 1)) {
        expect(payload).not.toContain(email);
      }
      // Also check specific email from description
      expect(payload).not.toContain("hr@acme.ru");
      expect(payload).not.toContain("john@example.com");
    });

    it("does not contain phone numbers in job fields", () => {
      const job = makeJob({
        descriptionClean: "Звоните +7 (999) 123-45-67 или 8 999 123 45 67.",
      });
      const profile = makeProfile({ summary: "No phones." });
      const settings = makeSettings();

      const input = buildVacancyAnalysisInput(job, profile, settings);

      const payload = JSON.stringify(input);
      expect(payload).not.toMatch(/999.*123.*45.*67/);
    });

    it("does not contain URLs in job fields (AI-bound)", () => {
      const job = makeJob({
        descriptionClean:
          "Apply at https://acme.ru/jobs or https://hh.ru/vacancy/123.",
      });
      const profile = makeProfile({ summary: "No URLs." });
      const settings = makeSettings();

      const input = buildVacancyAnalysisInput(job, profile, settings);

      const payload = JSON.stringify(input);
      expect(payload).not.toContain("https://");
      expect(payload).not.toContain("http://");
    });

    it("does not contain token-like patterns", () => {
      const job = makeJob({
        descriptionClean:
          "Token: eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYSJ9.sig for API access.",
      });
      const profile = makeProfile({ summary: "No tokens." });
      const settings = makeSettings();

      const input = buildVacancyAnalysisInput(job, profile, settings);

      const payload = JSON.stringify(input);
      expect(payload).not.toContain("eyJ");
    });

    it("redacts emails from profile summary", () => {
      const job = makeJob({
        descriptionClean: "Чистое описание без чувствительных данных.",
      });
      const profile = makeProfile({
        summary: "Меня зовут Иван. Email: ivan@company.ru.",
      });
      const settings = makeSettings();

      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.profile.summary).not.toContain("ivan@company.ru");
      expect(input.profile.summary).toContain("[email redacted]");
    });

    it("redacts phones from resume highlights", () => {
      const job = makeJob({
        descriptionClean: "Чистое описание.",
      });
      const profile = makeProfile({ summary: "Чистый профиль." });
      const resume = makeResume({
        highlightsText: "Опыт 5 лет. Телефон: +7 (999) 111-22-33.",
      });
      const settings = makeSettings({
        privacy: {
          aiEnabled: true,
          strictPrivacyMode: false,
          allowResumeHighlightsToAI: true,
          allowFullDescriptionToAI: true,
          redactContacts: true,
        },
      });

      const input = buildVacancyAnalysisInput(job, profile, settings, resume);

      expect(input.resumeHighlights).toBeDefined();
      expect(input.resumeHighlights).not.toMatch(/999.*111.*22.*33/);
      expect(input.resumeHighlights).toContain("[phone redacted]");
    });
  });

  describe("strict privacy mode", () => {
    it("excludes descriptionClean in strict privacy", () => {
      const job = makeJob({
        descriptionClean: "Contact hr@acme.ru. Confidential details here.",
      });
      const profile = makeProfile();
      const settings = makeSettings({
        privacy: {
          aiEnabled: true,
          strictPrivacyMode: true,
          allowResumeHighlightsToAI: true,
          allowFullDescriptionToAI: false,
          redactContacts: true,
        },
      });

      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.job.descriptionClean).toBe("");
    });

    it("excludes resumeHighlights in strict privacy by default", () => {
      const job = makeJob();
      const profile = makeProfile();
      const resume = makeResume({
        highlightsText: "Sensitive resume data here.",
      });
      const settings = makeSettings({
        privacy: {
          aiEnabled: true,
          strictPrivacyMode: true,
          allowResumeHighlightsToAI: true,
          allowFullDescriptionToAI: false,
          redactContacts: true,
        },
      });

      const input = buildVacancyAnalysisInput(job, profile, settings, resume);

      expect(input.resumeHighlights).toBeUndefined();
    });

    it("sets strictPrivacy flag in the input", () => {
      const job = makeJob();
      const profile = makeProfile();
      const settings = makeSettings({
        privacy: {
          aiEnabled: true,
          strictPrivacyMode: true,
          allowResumeHighlightsToAI: true,
          allowFullDescriptionToAI: false,
          redactContacts: true,
        },
      });

      const input = buildVacancyAnalysisInput(job, profile, settings);

      expect(input.strictPrivacy).toBe(true);
    });
  });
});

// ── Tests: Redaction functions ───────────────────────────────────────────

describe("privacy safety — redaction functions", () => {
  describe("redactText strips all sensitive patterns", () => {
    it("removes email addresses", () => {
      const input = "Contact hr@acme.ru or john@example.com.";
      const result = redactText(input);
      expect(result).not.toContain("@");
      expect(result).toContain("[email redacted]");
    });

    it("removes phone numbers", () => {
      const input = "Call +7 (999) 123-45-67 or 8 999 123 45 67.";
      const result = redactText(input);
      expect(result).not.toMatch(/\d{3}.*\d{3}.*\d{2}.*\d{2}/);
      expect(result).toContain("[phone redacted]");
    });

    it("removes URLs", () => {
      const input = "Visit https://example.com/page for details.";
      const result = redactText(input);
      expect(result).not.toContain("https://");
      expect(result).toContain("[url redacted]");
    });

    it("removes JWT tokens", () => {
      const input =
        "Auth: eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYSJ9.signature_here.";
      const result = redactText(input);
      expect(result).not.toContain("eyJ");
      expect(result).toContain("[token redacted]");
    });

    it("removes API key patterns", () => {
      const input = "key=sk_4a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p.";
      const result = redactText(input);
      expect(result).not.toContain("sk_");
      expect(result).toContain("[token redacted]");
    });
  });

  describe("redactText preserves safe content", () => {
    it("passes through clean vacancy description", () => {
      const input =
        "Мы ищем React-разработчика в команду. Опыт от 3 лет. Знание TypeScript обязательно.";
      const result = redactText(input);
      expect(result).toBe(input);
    });

    it("passes through clean profile summary", () => {
      const input =
        "Frontend-разработчик с 5-летним опытом. Специализация: React, TypeScript, Node.js.";
      const result = redactText(input);
      expect(result).toBe(input);
    });
  });
});

// ── Tests: Payload preview privacy ───────────────────────────────────────

describe("privacy safety — payload preview", () => {
  it("reports excluded fields in preview", () => {
    const job = makeJob({
      descriptionClean: "",
    });
    const profile = makeProfile();
    const resume = makeResume({
      highlightsText: "",
    });
    const settings = makeSettings();

    const input = buildVacancyAnalysisInput(job, profile, settings, resume);
    const preview = generateVacancyAnalysisPreview(input);

    // Static exclusions must always be present
    expect(preview.excludedFields).toContain("Полный HTML");
    expect(preview.excludedFields).toContain("Cookies");
    expect(preview.excludedFields).toContain("Личные заметки");
    expect(preview.excludedFields).toContain("Вся база вакансий");
    expect(preview.excludedFields).toContain("История переписки");
  });

  it("never includes 'cookies', 'session', or 'token' in includedFields labels", () => {
    const job = makeJob();
    const profile = makeProfile();
    const settings = makeSettings();

    const input = buildVacancyAnalysisInput(job, profile, settings);
    const preview = generateVacancyAnalysisPreview(input);

    const labels = preview.includedFields.map((f) => f.label.toLowerCase());
    for (const label of labels) {
      expect(label).not.toMatch(/cookie|session|token|пароль|password/i);
    }
  });
});

// ── Tests: AI payload does not contain excluded data types ───────────────

describe("privacy safety — AI payload field exclusions", () => {
  it("VacancyAnalysisInput never includes raw HTML", () => {
    // The VacancyAnalysisInput type does not have an HTML field.
    // Verify that the built payload has no field named 'html', 'rawHtml', etc.
    const job = makeJob();
    const profile = makeProfile();
    const settings = makeSettings();

    const input = buildVacancyAnalysisInput(job, profile, settings);
    const keys = Object.keys(input).concat(Object.keys(input.job));

    const forbiddenKeys = [
      "html",
      "rawHtml",
      "descriptionHtml",
      "cookies",
      "session",
    ];
    for (const key of forbiddenKeys) {
      expect(keys).not.toContain(key);
    }
  });

  it("VacancyAnalysisInput does not expose unfiltered personal data fields", () => {
    const profile = makeProfile({
      // Set fields that might contain PII
      summary: "Иван Иванов, email: ivan@personal.ru.",
    });
    const job = makeJob();
    const settings = makeSettings();

    const input = buildVacancyAnalysisInput(job, profile, settings);

    // Profile summary should be redacted
    expect(input.profile.summary).not.toContain("@");
    expect(input.profile.summary).toContain("[email redacted]");
  });
});
