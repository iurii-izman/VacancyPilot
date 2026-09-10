import { db } from "./database";
import type { Job } from "@/models/job";
import type { Profile } from "@/models/profile";
import type { Resume } from "@/models/resume";
import type { CoverLetter } from "@/models/cover-letter";
import type { VisitMark } from "@/models/visit-mark";
import { withWriteGuard } from "@/services/reset-guard";

/**
 * Thin CRUD helpers for key domain entities.
 *
 * These are convenience wrappers around Dexie tables.
 * Complex queries should be added here as the product grows.
 */

// ---- Job repository ----

export const jobRepo = {
  list: () => db.jobs.toArray(),

  getById: (id: string) => db.jobs.get(id as Job["id"]),

  /** Insert or update a job (upsert by id). */
  save: (job: Job) => withWriteGuard(() => db.jobs.put(job)),

  /** Bulk upsert — useful for import/search triage. */
  bulkSave: (jobs: Job[]) => withWriteGuard(() => db.jobs.bulkPut(jobs)),

  delete: (id: string) => withWriteGuard(() => db.jobs.delete(id as Job["id"])),

  /** Count jobs by status. */
  countByStatus: (status: string) =>
    db.jobs.where("status").equals(status).count(),

  /** Find jobs by company. */
  listByCompany: (companyId: string) =>
    db.jobs.where("companyId").equals(companyId).toArray(),

  /** Find jobs updated after a given timestamp. */
  listUpdatedAfter: (iso: string) =>
    db.jobs.where("updatedAt").above(iso).toArray(),

  /** Find a job by source and source vacancy id via compound index. Returns undefined if not found. */
  findBySourceVacancy: (source: string, sourceVacancyId: string) =>
    db.jobs
      .where("[source+sourceVacancyId]")
      .equals([source, sourceVacancyId])
      .first(),
};

// ---- Profile repository ----

export const profileRepo = {
  list: () => db.profiles.toArray(),

  getById: (id: string) => db.profiles.get(id as Profile["id"]),

  save: (profile: Profile) => withWriteGuard(() => db.profiles.put(profile)),

  delete: (id: string) => withWriteGuard(() => db.profiles.delete(id as Profile["id"])),
};

// ---- Resume repository ----

export const resumeRepo = {
  list: () => db.resumes.toArray(),

  getById: (id: string) => db.resumes.get(id as Resume["id"]),

  /** List resumes for a given profile. */
  listByProfile: (profileId: string) =>
    db.resumes.where("profileId").equals(profileId).toArray(),

  save: (resume: Resume) => withWriteGuard(() => db.resumes.put(resume)),

  delete: (id: string) => withWriteGuard(() => db.resumes.delete(id as Resume["id"])),
};

// ---- Cover Letter repository ----

export const coverLetterRepo = {
  /** List all letters for a given job. */
  listByJob: (jobId: string) =>
    db.coverLetters.where("jobId").equals(jobId).toArray(),

  /** Get a single letter by id. */
  getById: (id: string) => db.coverLetters.get(id as CoverLetter["id"]),

  /** Insert or update a cover letter (upsert by id). */
  save: (letter: CoverLetter) => withWriteGuard(() => db.coverLetters.put(letter)),

  /** Delete a letter by id. */
  delete: (id: string) => withWriteGuard(() => db.coverLetters.delete(id as CoverLetter["id"])),
};

// ---- Visit Mark repository ----

export const visitMarkRepo = {
  list: () => db.visitMarks.toArray(),

  getById: (id: string) => db.visitMarks.get(id as VisitMark["id"]),

  findBySourceId: (sourceId: string) =>
    db.visitMarks
      .where("[source+sourceId]")
      .equals(["hh", sourceId])
      .first(),

  save: (mark: VisitMark) => withWriteGuard(() => db.visitMarks.put(mark)),

  delete: (id: string) => withWriteGuard(() => db.visitMarks.delete(id as VisitMark["id"])),

  deleteBySourceId: async (sourceId: string) => {
    return withWriteGuard(async () => {
      const existing = await visitMarkRepo.findBySourceId(sourceId);
      if (!existing) return 0;
      await db.visitMarks.delete(existing.id);
      return 1;
    });
  },
};
