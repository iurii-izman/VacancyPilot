/**
 * AI input builders — construct safe, redacted, privacy-aware payloads
 * for AI providers from local domain models.
 *
 * These functions never call AI directly. They produce input contracts
 * that can be previewed, cached, and sent only with explicit user action.
 */

import type { Job } from "@/models/job";
import type { Profile } from "@/models/profile";
import type { Resume } from "@/models/resume";
import type { AppSettings } from "@/models/settings";
import type { VacancyAnalysisInput, CoverLetterInput } from "@/models/ai";
import type {
  CoverLetterMode,
  CoverLetterConstraints,
} from "@/models/cover-letter";
import {
  redactBaseText,
  redactContacts,
  redactProviderValue,
  truncateDescription,
} from "./redaction";

// ── Vacancy Analysis builder ──────────────────────────────────────────

export interface BuildVacancyInputOptions {
  /** Per-request override: force include description (even in Strict mode). */
  forceDescription?: boolean;
  /** Per-request override: force include resume highlights (even in Strict mode). */
  forceResumeHighlights?: boolean;
}

/**
 * Build a VacancyAnalysisInput from domain models.
 *
 * Privacy rules:
 * - Standard Privacy: includes redacted descriptionClean, optional resumeHighlights.
 * - Strict Privacy: excludes descriptionClean and resumeHighlights by default.
 *   Overrides `forceDescription` / `forceResumeHighlights` allow per-request opt-in.
 */
export function buildVacancyAnalysisInput(
  job: Job,
  profile: Profile,
  settings: AppSettings,
  resume?: Resume,
  options?: BuildVacancyInputOptions,
): VacancyAnalysisInput {
  const isStrict = settings.privacy.strictPrivacyMode;

  // Determine whether to include descriptionClean
  const includeDescription =
    (!isStrict && settings.privacy.allowFullDescriptionToAI !== false) ||
    (isStrict && options?.forceDescription === true);

  // Determine whether to include resumeHighlights
  const includeResumeHighlights =
    settings.privacy.allowResumeHighlightsToAI === true &&
    (!isStrict || options?.forceResumeHighlights === true) &&
    resume != null &&
    resume.highlightsText.length > 0;

  const rawDescription = includeDescription ? job.descriptionClean : "";
  const applyPrivacy = createPrivacyRedactor(settings);
  const maxInputChars = boundedMaxInputChars(settings.ai.maxInputChars);
  const sanitize = (value: unknown, maxStringChars?: number): string =>
    String(
      redactProviderValue(value, {
        redactContacts: settings.privacy.redactContacts,
        maxStringChars,
      }),
    );

  return {
    job: {
      title: sanitize(job.title, 500),
      company: sanitize(job.companyName, 500),
      salaryRaw: sanitizeOptional(job.salaryRaw, 200, settings.privacy.redactContacts),
      city: sanitizeOptional(job.city, 200, settings.privacy.redactContacts),
      workMode: sanitize(job.workMode, 64),
      experienceRaw: sanitizeOptional(job.experienceRaw, 500, settings.privacy.redactContacts),
      skills: job.skills.slice(0, 50).map((skill) => sanitize(skill, 200)),
      descriptionClean: rawDescription
        ? truncateDescription(
            applyPrivacy(rawDescription),
            maxInputChars,
          )
        : "",
    },
    profile: {
      summary: applyPrivacy(profile.summary),
      targetTitles: profile.targetTitles
        .slice(0, 20)
        .map((value) => sanitize(value, 200)),
      mustHaveSkills: profile.mustHaveSkills
        .slice(0, 30)
        .map((value) => sanitize(value, 200)),
      niceToHaveSkills: profile.niceToHaveSkills
        .slice(0, 30)
        .map((value) => sanitize(value, 200)),
    },
    resumeHighlights: includeResumeHighlights
      ? truncateDescription(applyPrivacy(resume!.highlightsText), maxInputChars)
      : undefined,
    strictPrivacy: isStrict,
  };
}

// ── Cover Letter builder ──────────────────────────────────────────────

export interface BuildCoverLetterOptions {
  mode?: CoverLetterMode;
  constraints?: CoverLetterConstraints;
  language?: "ru" | "en" | "ro";
  /** Per-request override: force include resume highlights (even in Strict mode). */
  forceResumeHighlights?: boolean;
}

const DEFAULT_COVER_CONSTRAINTS: CoverLetterConstraints = {
  noEmoji: true,
  noMarkdown: true,
  noSpecialChars: false,
  maxChars: 1000,
};

/**
 * Build a CoverLetterInput from domain models.
 *
 * Privacy rules (aligned with buildVacancyAnalysisInput):
 * - Standard Privacy: includes redacted resumeHighlights when allowResumeHighlightsToAI is true.
 * - Strict Privacy: excludes resumeHighlights by default.
 *   Override `forceResumeHighlights` allows per-request opt-in.
 *
 * Top requirements are selected from the job's skills list.
 * If the job has no explicit topRequirements field, we derive them
 * from skills intersecting with profile's mustHaveSkills.
 */
export function buildCoverLetterInput(
  job: Job,
  profile: Profile,
  settings: AppSettings,
  resume?: Resume,
  options?: BuildCoverLetterOptions,
): CoverLetterInput {
  const isStrict = settings.privacy.strictPrivacyMode;
  const topRequirements = deriveTopRequirements(job, profile);
  const applyPrivacy = createPrivacyRedactor(settings);
  const sanitize = (value: unknown, maxStringChars?: number): string =>
    String(
      redactProviderValue(value, {
        redactContacts: settings.privacy.redactContacts,
        maxStringChars,
      }),
    );

  // Gate resumeHighlights behind privacy settings (same logic as buildVacancyAnalysisInput).
  const includeResumeHighlights =
    settings.privacy.allowResumeHighlightsToAI === true &&
    (!isStrict || options?.forceResumeHighlights === true) &&
    resume != null &&
    resume.highlightsText.length > 0;

  return {
    job: {
      title: sanitize(job.title, 500),
      company: sanitize(job.companyName, 500),
      topRequirements: sanitize(topRequirements, 800),
      skills: job.skills.slice(0, 50).map((skill) => sanitize(skill, 200)),
    },
    profile: {
      summary: applyPrivacy(profile.summary),
    },
    resumeHighlights: includeResumeHighlights
      ? truncateDescription(
          applyPrivacy(resume!.highlightsText),
          boundedMaxInputChars(settings.ai.maxInputChars),
        )
      : "",
    mode: options?.mode ?? profile.letterPrefs.defaultMode,
    constraints:
      options?.constraints ??
      profile.letterPrefs.defaultConstraints ??
      DEFAULT_COVER_CONSTRAINTS,
    language: options?.language ?? resume?.language ?? "ru",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function createPrivacyRedactor(
  settings: AppSettings,
): (text: string) => string {
  return (text: string) => {
    const baseRedacted = redactBaseText(text);
    return settings.privacy.redactContacts
      ? redactContacts(baseRedacted)
      : baseRedacted;
  };
}

function boundedMaxInputChars(value: number): number {
  return Math.max(256, Math.min(12_000, Number.isFinite(value) ? value : 3_000));
}

function sanitizeOptional(
  value: unknown,
  maxStringChars: number,
  redactContactsEnabled: boolean,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(
    redactProviderValue(value, {
      redactContacts: redactContactsEnabled,
      maxStringChars,
    }),
  );
}

/**
 * Derive top requirements text for the cover letter prompt.
 *
 * Priority: skills from the job that intersect with profile's mustHaveSkills.
 * Falls back to first 5 job skills.
 */
function deriveTopRequirements(job: Job, profile: Profile): string {
  const mustHaveSet = new Set(
    profile.mustHaveSkills.map((s) => s.toLowerCase()),
  );
  const matching = job.skills.filter((s) => mustHaveSet.has(s.toLowerCase()));

  if (matching.length > 0) {
    return matching.slice(0, 8).join(", ");
  }

  // Fallback: first 5 skills from the job
  return job.skills.slice(0, 5).join(", ") || "не указаны";
}
