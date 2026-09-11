import type { Job, JobStatus } from "@/models/job";
import type { RawVacancyDTO } from "@/adapters/hh/types";
import { db } from "@/db/database";
import { jobRepo } from "@/db/repositories";
import { createStatusChange } from "./status-transitions";
import { createEventLogEntry } from "./event-log-helper";
import {
  canonicalizeHhVacancyUrl,
  isCanonicalHhVacancyReference,
} from "./hh-vacancy-url";
import { assertResetWritable, withWriteGuard } from "./reset-guard";

const SOURCE_HH = "hh" as const;

/**
 * Build a stable job id from source and vacancy id.
 * Format: "hh_123456"
 */
function buildJobId(sourceVacancyId: string): string {
  return `${SOURCE_HH}_${sourceVacancyId}`;
}

/**
 * Simple 32-bit string hash (djb2 variant).
 * Used for descriptionHash to detect description changes.
 */
function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/**
 * Generate a company id from a company name and optional employer ID.
 * When a real employer ID is available (parsed from /employer/<id>), prefer it
 * over a name-based slug, which is collision-prone.
 */
function companyIdFromName(
  name: string,
  sourceCompanyId?: string | null,
): string {
  if (sourceCompanyId) {
    return `${SOURCE_HH}_co_emp_${sourceCompanyId}`;
  }
  const slug = name
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `${SOURCE_HH}_co_${slug}`;
}

/**
 * Parse experienceRaw string into a numeric minimum years value.
 *
 * Supported RU patterns:
 *   "1–3 года", "3–6 лет", "1-3 года", "3-6 лет"     → lower bound
 *   "более 6 лет", "более 5 лет"                      → 6, 5
 *   "от 1 года", "от 3 лет"                           → 1, 3
 *   "6+ лет"                                           → 6
 *   "не требуется", "нет опыта", "без опыта"          → 0
 *
 * Supported EN patterns:
 *   "1–3 years", "3–6 years"                           → lower bound
 *   "5+ years"                                         → 5
 *   "more than 5 years", "more than 10 years"          → 5, 10
 *   "no experience", "not required"                    → 0
 *
 * Returns undefined when the string cannot be parsed.
 */
export function parseExperienceMinYears(
  raw: string | null | undefined,
): number | undefined {
  if (!raw) return undefined;

  const s = raw.trim().toLowerCase();
  if (!s) return undefined;

  // ── No experience patterns ──
  if (
    /^(не\s+требуется|нет\s+опыта|без\s+опыта|no\s+experience|not\s+required)$/i.test(
      s,
    )
  ) {
    return 0;
  }

  // ── "more than X" patterns (check before range to avoid false matches on en-dash) ──
  const moreThanMatch = s.match(/more\s+than\s+(\d+)/i);
  if (moreThanMatch) return parseInt(moreThanMatch[1], 10);

  // ── "более X" patterns ──
  const boleeMatch = s.match(/более\s+(\d+)/i);
  if (boleeMatch) return parseInt(boleeMatch[1], 10);

  // ── "от X" patterns ──
  const otMatch = s.match(/^от\s+(\d+)/i);
  if (otMatch) return parseInt(otMatch[1], 10);

  // ── "X+" patterns ──
  const plusMatch = s.match(/^(\d+)\s*\+/);
  if (plusMatch) return parseInt(plusMatch[1], 10);

  // ── Range patterns: "X–Y", "X-Y", "X — Y" ──
  const rangeMatch = s.match(/(\d+)\s*[–\-—]\s*(\d+)/);
  if (rangeMatch) {
    const lower = parseInt(rangeMatch[1], 10);
    const upper = parseInt(rangeMatch[2], 10);
    // Return the lower bound — this represents minimum required years.
    if (!Number.isNaN(lower) && !Number.isNaN(upper)) return lower;
  }

  // ── Single number patterns: "3 года", "5 лет", "2 years" ──
  const singleMatch = s.match(/^(\d+)\s*(года?|лет|years?)/i);
  if (singleMatch) return parseInt(singleMatch[1], 10);

  return undefined;
}

/**
 * Find an existing job by source vacancy id via the repository.
 * Returns undefined if no match.
 */
async function findExistingJob(
  sourceVacancyId: string,
): Promise<Job | undefined> {
  return jobRepo.findBySourceVacancy(SOURCE_HH, sourceVacancyId);
}

/** Build a sanitized in-memory job without persisting it. */
export function buildJobFromDTO(dto: RawVacancyDTO): Job {
  const sourceVacancyId = (dto.sourceVacancyId ?? "").trim();
  if (!sourceVacancyId) {
    throw new Error("Cannot build vacancy: sourceVacancyId is missing");
  }
  if (!isCanonicalHhVacancyReference(sourceVacancyId, dto.sourceUrl)) {
    throw new Error("Cannot build vacancy: sourceUrl is not a canonical HH vacancy URL");
  }
  const now = new Date().toISOString();
  const descriptionClean = dto.descriptionText ?? "";
  const sourceUrl = canonicalizeHhVacancyUrl(dto.sourceUrl) as string;

  return {
    id: buildJobId(sourceVacancyId),
    source: SOURCE_HH,
    sourceVacancyId,
    sourceUrl,
    canonicalUrl: undefined,

    title: dto.title ?? "",
    companyId: companyIdFromName(
      dto.companyName ?? "unknown",
      dto.sourceCompanyId,
    ),
    companyName: dto.companyName ?? "",

    salaryRaw: dto.salaryRaw ?? undefined,
    salaryMin: dto.salaryMin ?? undefined,
    salaryMax: dto.salaryMax ?? undefined,
    salaryCurrency: dto.salaryCurrency ?? undefined,
    salaryGross: undefined,

    city: dto.city ?? undefined,
    workMode: dto.workMode ?? "unknown",
    experienceRaw: dto.experienceRaw ?? undefined,
    experienceMinYears: parseExperienceMinYears(dto.experienceRaw),
    employmentType: dto.employmentType ?? undefined,
    schedule: dto.schedule ?? undefined,

    descriptionClean,
    descriptionHash: hashString(descriptionClean),
    skills: dto.skills ?? [],

    status: "saved",
    statusHistory: [createStatusChange(undefined, "saved", "system")],

    firstSeenAt: now,
    lastSeenAt: now,
    updatedAt: now,
  };
}

/**
 * Persist a new event log entry to the database.
 */
async function persistEvent(
  type: "job_saved" | "status_changed",
  jobId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await withWriteGuard(async () => {
    const entry = createEventLogEntry(type, payload, { jobId });
    await db.events.put(entry);
  });
}

// ---- Public tracker API ----

export const tracker = {
  /**
   * Save or update a job from a parsed vacancy DTO.
   *
   * - If the job already exists (matched by source + sourceVacancyId),
   *   preserves the existing status and updates other fields.
   * - If new, creates a job with status 'saved'.
   * - Logs a job_saved event in both cases.
   * - Throws if sourceVacancyId is missing or empty.
   *
   * Returns the saved Job.
   */
  async saveFromDTO(dto: RawVacancyDTO): Promise<Job> {
    assertResetWritable();
    const sourceVacancyId = (dto.sourceVacancyId ?? "").trim();
    if (!sourceVacancyId) {
      throw new Error("Cannot save vacancy: sourceVacancyId is missing");
    }
    if (!isCanonicalHhVacancyReference(sourceVacancyId, dto.sourceUrl)) {
      throw new Error("Cannot save vacancy: sourceUrl is not a canonical HH vacancy URL");
    }

    const existing = await findExistingJob(sourceVacancyId);

    if (existing) {
      const now = new Date().toISOString();
      const descriptionClean = dto.descriptionText ?? existing.descriptionClean;
      const sourceUrl = canonicalizeHhVacancyUrl(dto.sourceUrl);
      const updated: Job = {
        ...existing,
        sourceUrl: sourceUrl ?? existing.sourceUrl,
        title: dto.title ?? existing.title,
        companyName: dto.companyName ?? existing.companyName,
        // Upgrade companyId when a real employer ID becomes available
        companyId: dto.sourceCompanyId
          ? companyIdFromName(
              dto.companyName ?? existing.companyName,
              dto.sourceCompanyId,
            )
          : existing.companyId,
        salaryRaw: dto.salaryRaw ?? existing.salaryRaw,
        salaryMin: dto.salaryMin ?? existing.salaryMin,
        salaryMax: dto.salaryMax ?? existing.salaryMax,
        salaryCurrency: dto.salaryCurrency ?? existing.salaryCurrency,
        city: dto.city ?? existing.city,
        workMode: dto.workMode ?? existing.workMode,
        experienceRaw: dto.experienceRaw ?? existing.experienceRaw,
        experienceMinYears:
          dto.experienceRaw != null
            ? parseExperienceMinYears(dto.experienceRaw)
            : existing.experienceMinYears,
        employmentType: dto.employmentType ?? existing.employmentType,
        schedule: dto.schedule ?? existing.schedule,
        descriptionClean,
        descriptionHash: hashString(descriptionClean),
        skills: dto.skills ?? existing.skills,
        lastSeenAt: now,
        updatedAt: now,
      };

      await jobRepo.save(updated);
      await persistEvent("job_saved", updated.id, {
        title: updated.title,
        companyName: updated.companyName,
        action: "updated",
      });

      return updated;
    }

    // New job
    const job = buildJobFromDTO(dto);
    await jobRepo.save(job);
    await persistEvent("job_saved", job.id, {
      title: job.title,
      companyName: job.companyName,
      action: "created",
    });

    return job;
  },

  /**
   * Update the status of a saved job.
   *
   * - Appends a StatusChange to statusHistory.
   * - Persists the job and logs a status_changed event.
   * - Returns the updated Job, or null if the job was not found.
   */
  async updateStatus(
    jobId: string,
    newStatus: JobStatus,
    note?: string,
  ): Promise<Job | null> {
    assertResetWritable();
    const job = await jobRepo.getById(jobId);
    if (!job) return null;

    const now = new Date().toISOString();
    const change = createStatusChange(job.status, newStatus, "user", note);

    const updated: Job = {
      ...job,
      status: newStatus,
      statusHistory: [...job.statusHistory, change],
      updatedAt: now,
    };

    await jobRepo.save(updated);
    await persistEvent("status_changed", jobId, {
      from: change.from,
      to: change.to,
      note: change.note,
    });

    return updated;
  },
};
