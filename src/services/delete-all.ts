import { db, TABLE_NAMES } from "@/db";
import type { TableName } from "@/db";
import { visitMarkRepo } from "@/db/repositories";
import { invalidateCache } from "./ai-cache";
import { removeBadgeState, removeAllBadgeStates } from "./badge-state";
import { deleteAllApiKeys } from "@/db/api-key-bridge";

/**
 * Safe delete-all-data service.
 *
 * - Clears all Dexie/IndexedDB tables (product domain data).
 * - Clears known product keys from chrome.storage.local.
 * - Does NOT delete unknown storage keys to avoid side effects
 *   with other extensions or browser features.
 * - No network calls, no extensions API beyond storage.
 */

/** Known product keys in chrome.storage.local that should be wiped. */
const PRODUCT_STORAGE_KEYS = ["app_settings_v1"];

export interface DeleteJobDataResult {
  coverLettersDeleted: number;
  applicationsDeleted: number;
  eventsDeleted: number;
  hrTimelineDeleted: number;
  visitMarksDeleted: number;
}

export interface DeleteAiCacheAndEventLogResult {
  cacheEntriesDeleted: number;
  eventLogEntriesDeleted: number;
}

/**
 * Wipe all product data: IndexedDB tables + chrome.storage.local.
 *
 * This is a destructive, irreversible operation.
 * Callers must present a confirmation flow before invoking.
 */
export async function deleteAllData(): Promise<void> {
  // 1. Clear all Dexie tables (TABLE_NAMES now reflects the current schema v6)
  await Promise.all(
    TABLE_NAMES.map((name) => db.table(name as TableName).clear()),
  );

  // 2. Remove known product keys from chrome.storage.local
  await chrome.storage.local.remove(PRODUCT_STORAGE_KEYS);

  // 3. Remove all API keys
  await deleteAllApiKeys();

  // 4. Remove all badge state keys
  await removeAllBadgeStates();
}

/**
 * Delete one saved job and its directly related local records.
 *
 * Removes:
 * - the job itself
 * - related cover letters
 * - related application records
 * - related event log entries
 * - HR timeline entries linked through deleted applications
 * - the matching local visit mark for the same vacancy, if present
 */
export async function deleteJobData(
  jobId: string,
): Promise<DeleteJobDataResult> {
  const job = await db.jobs.get(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  // Collect application IDs to cascade-delete linked HR timeline entries
  const appIds = (
    await db.applications.where("jobId").equals(jobId).toArray()
  ).map((a) => a.id);

  const [coverLettersDeleted, applicationsDeleted, eventsDeleted] =
    await Promise.all([
      db.coverLetters.where("jobId").equals(jobId).delete(),
      db.applications.where("jobId").equals(jobId).delete(),
      db.events.where("jobId").equals(jobId).delete(),
    ]);

  // Cascade-delete HR timeline entries linked to deleted applications
  const hrTimelineResults = await Promise.all(
    appIds.map((appId) =>
      db.hrTimeline.where("applicationId").equals(appId).delete(),
    ),
  );
  const hrTimelineDeleted = hrTimelineResults.reduce((sum, n) => sum + n, 0);
  const visitMarksDeleted = await visitMarkRepo.deleteBySourceId(
    job.sourceVacancyId,
  );

  await db.jobs.delete(jobId);

  // Remove badge state for this vacancy
  await removeBadgeState(job.sourceVacancyId);

  return {
    coverLettersDeleted,
    applicationsDeleted,
    eventsDeleted,
    hrTimelineDeleted,
    visitMarksDeleted,
  };
}

/**
 * Delete cached AI results and event log entries while keeping
 * core jobs/profiles/settings intact.
 */
export async function deleteAiCacheAndEventLog(): Promise<DeleteAiCacheAndEventLogResult> {
  const [cacheEntriesDeleted, eventLogEntriesDeleted] = await Promise.all([
    invalidateCache(),
    db.events.count(),
  ]);

  await db.events.clear();

  return {
    cacheEntriesDeleted,
    eventLogEntriesDeleted,
  };
}

/**
 * Check whether any product data currently exists.
 * Useful for UI state — e.g., disabling the delete button when there's nothing to delete.
 */
export async function hasData(): Promise<boolean> {
  for (const name of TABLE_NAMES) {
    const count = await db.table(name as TableName).count();
    if (count > 0) return true;
  }
  return false;
}

/**
 * Collect a count overview of all tables for the delete confirmation UI.
 */
export async function getDataCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await Promise.all(
    TABLE_NAMES.map(async (name) => {
      counts[name] = await db.table(name as TableName).count();
    }),
  );
  return counts;
}
