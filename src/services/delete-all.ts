import { db, TABLE_NAMES } from "@/db";
import type { TableName } from "@/db";
import { invalidateCache } from "./ai-cache";
import { removeBadgeState } from "./badge-state";
import { defaultSettings, saveSettings } from "@/db/settings-bridge";
import { getOperatingMode } from "./operating-mode";
import { resetCompanionClientState } from "./companion-service";
import { withResetGuard } from "./reset-guard";

export const RESET_BLOCKED_OUTCOME_UNKNOWN = "RESET_BLOCKED_OUTCOME_UNKNOWN";
const UNSAFE_EXECUTION_STATES = new Set(["claimed", "dispatching", "repairing", "outcome_unknown"]);
const HR_DRAFT_PREFIX = "hr_draft_v1_";
const BADGE_PREFIX = "badge_v1_hh_";
const TARGET_KEYS = new Set([
  "jobId", "job_id", "sourceVacancyId", "source_vacancy_id", "vacancyId", "vacancy_id",
  "sourceId", "source_id", "entityId", "entity_id",
]);
type TransactionRunner = (mode: "rw", ...args: unknown[]) => Promise<unknown>;
async function runTransaction(
  mode: "rw",
  ...args: unknown[]
): Promise<unknown> {
  const transaction = (db as unknown as { transaction?: unknown }).transaction;
  if (typeof transaction === "function") {
    return (transaction as TransactionRunner).call(db, mode, ...args);
  }
  const scope = args.at(-1);
  if (typeof scope === "function") return (scope as () => Promise<unknown>)();
  throw new Error("Database transaction scope is missing");
}

export class ResetBlockedError extends Error {
  readonly code = RESET_BLOCKED_OUTCOME_UNKNOWN;

  constructor(message = "Reset is blocked while an AI/provider operation is in flight or has an unknown outcome") {
    super(`${RESET_BLOCKED_OUTCOME_UNKNOWN}: ${message}`);
    this.name = "ResetBlockedError";
  }
}

export interface DeleteJobDataResult {
  coverLettersDeleted: number;
  applicationsDeleted: number;
  eventsDeleted: number;
  hrTimelineDeleted: number;
  visitMarksDeleted: number;
  cacheEntriesDeleted: number;
  outboxEntriesDeleted: number;
  labsEntriesDeleted: number;
}

export interface DeleteAiCacheAndEventLogResult {
  cacheEntriesDeleted: number;
  eventLogEntriesDeleted: number;
}

function containsTarget(value: unknown, jobId: string, sourceVacancyId: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsTarget(item, jobId, sourceVacancyId));
  for (const [key, nested] of Object.entries(value)) {
    if (TARGET_KEYS.has(key) && (nested === jobId || nested === sourceVacancyId)) return true;
    if (nested && typeof nested === "object" && containsTarget(nested, jobId, sourceVacancyId)) return true;
  }
  return false;
}

async function assertNoUnsafeExecutions(): Promise<void> {
  const rows = await db.table("aiExecution" as TableName).toArray() as Array<{ state?: unknown }>;
  if (rows.some((row) => typeof row.state === "string" && UNSAFE_EXECUTION_STATES.has(row.state))) {
    throw new ResetBlockedError();
  }
}

async function clearExtensionStorage(): Promise<void> {
  const local = chrome.storage.local;
  if (typeof local.clear === "function") {
    await local.clear();
  } else {
    // Test/legacy Chrome shims may not expose clear; remove every known
    // product namespace key in that case.
    const all = await local.get(null);
    const keys = Object.keys(all).filter((key) =>
      key === "app_settings_v1" || key === "companion_client_token_v1" || key.startsWith("vp_api_key_") || key.startsWith(BADGE_PREFIX) || key.startsWith(HR_DRAFT_PREFIX) || key.startsWith("vp_context_tab_") || key.startsWith("vp_side_panel_binding_window_"),
    );
    if (keys.length) await local.remove(keys);
  }
  if (chrome.storage.session && typeof chrome.storage.session.clear === "function") {
    await chrome.storage.session.clear();
  }
}

async function broadcastReset(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "VACANCYPILOT_RESET" });
  } catch {
    // Content scripts can be absent during a tab reload; the write barrier
    // still protects local storage and the next script generation is clean.
  }
}

/** Wipe extension-local data and restore safe Standalone defaults. */
export async function deleteAllData(): Promise<void> {
  const mode = await getOperatingMode();
  await withResetGuard(async () => {
    // Ops authority remains in Companion/SQLite. Local browser caches and the
    // token are cleared, but this operation never calls revoke/delete remotely.
    if (mode.effectiveMode === "standalone") await assertNoUnsafeExecutions();
    await broadcastReset();
    const tables = TABLE_NAMES.map((name) => db.table(name as TableName));
    await runTransaction("rw", ...tables, async () => {
      await Promise.all(tables.map((table) => table.clear()));
    });
    await clearExtensionStorage();
    resetCompanionClientState();
    await saveSettings(defaultSettings(), { allowDuringReset: true });
  });
}

/** Delete one saved vacancy and all locally linked records in one transaction. */
export async function deleteJobData(jobId: string): Promise<DeleteJobDataResult> {
  const mode = await getOperatingMode();
  if (mode.effectiveMode === "ops") {
    throw new Error("OPS_LOCAL_DELETE_ONLY: per-vacancy deletion is unavailable while Companion is authoritative");
  }

  return withResetGuard(async () => {
    await assertNoUnsafeExecutions();
    const job = await db.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    const sourceVacancyId = job.sourceVacancyId;
    let result: DeleteJobDataResult = {
      coverLettersDeleted: 0,
      applicationsDeleted: 0,
      eventsDeleted: 0,
      hrTimelineDeleted: 0,
      visitMarksDeleted: 0,
      cacheEntriesDeleted: 0,
      outboxEntriesDeleted: 0,
      labsEntriesDeleted: 0,
    };

    await runTransaction("rw", db.jobs, db.coverLetters, db.applications, db.events, db.hrTimeline, db.visitMarks, db.aiCache, db.opsCache, db.syncOutbox, db.labsActions, db.meta, async () => {
      const applications = await db.applications.where("jobId").equals(jobId).toArray();
      const applicationIds = new Set(applications.map((application) => application.id));
      const [coverLetters, events, timeline, labs, cache, outbox, opsCache, metaRows] = await Promise.all([
        db.coverLetters.where("jobId").equals(jobId).toArray(),
        db.events.where("jobId").equals(jobId).toArray(),
        db.hrTimeline.toArray(),
        db.labsActions.toArray(),
        db.aiCache.toArray(),
        db.syncOutbox.toArray(),
        db.opsCache.toArray(),
        db.meta.toArray(),
      ]);
      const timelineIds = timeline.filter((entry) => applicationIds.has(entry.applicationId)).map((entry) => entry.id);
      const labIds = labs.filter((entry) => entry.jobId === jobId).map((entry) => entry.id);
      const linkedMetaRows = metaRows.filter((row) =>
        (row.key.startsWith("ai_analysis_") || row.key.startsWith("ai_cover_letter_")) &&
        containsTarget(row.value, jobId, sourceVacancyId),
      );
      const linkedResultRefs = new Set(
        linkedMetaRows.map((row) =>
          row.key.startsWith("ai_analysis_")
            ? row.key.slice("ai_analysis_".length)
            : row.key.slice("ai_cover_letter_".length),
        ),
      );
      const linkedCache = cache.filter((entry) => linkedResultRefs.has(entry.resultRefId));
      const linkedMetaKeys = metaRows
        .filter((row) => linkedMetaRows.includes(row))
        .map((row) => row.key);
      const targetOutbox = outbox.filter((entry) => containsTarget(entry.payload, jobId, sourceVacancyId));
      const unsafeOutbox = targetOutbox.filter((entry) => !["pending", "retrying", "dead", "conflict"].includes(entry.status));
      if (unsafeOutbox.length) throw new ResetBlockedError("a linked outbox operation is in flight");
      const targetOpsCache = opsCache.filter((entry) => entry.entityId === jobId || entry.entityId === sourceVacancyId || containsTarget(entry.payload, jobId, sourceVacancyId));

      const visitMarks = await db.visitMarks.where("sourceId").equals(sourceVacancyId).toArray();
      result = {
        coverLettersDeleted: coverLetters.length,
        applicationsDeleted: applications.length,
        eventsDeleted: events.length,
        hrTimelineDeleted: timelineIds.length,
        visitMarksDeleted: visitMarks.length,
        cacheEntriesDeleted: linkedCache.length,
        outboxEntriesDeleted: targetOutbox.length,
        labsEntriesDeleted: labIds.length,
      };
      await db.coverLetters.where("jobId").equals(jobId).delete();
      await db.applications.where("jobId").equals(jobId).delete();
      await db.events.where("jobId").equals(jobId).delete();
      if (timelineIds.length) await db.hrTimeline.bulkDelete(timelineIds);
      if (visitMarks.length) await db.visitMarks.bulkDelete(visitMarks.map((entry) => entry.id));
      if (linkedCache.length) await db.aiCache.bulkDelete(linkedCache.map((entry) => entry.id));
      if (targetOutbox.length) await db.syncOutbox.bulkDelete(targetOutbox.map((entry) => entry.id));
      if (labIds.length) await db.labsActions.bulkDelete(labIds);
      if (linkedMetaKeys.length) await db.meta.bulkDelete(linkedMetaKeys);
      if (targetOpsCache.length) await db.opsCache.bulkDelete(targetOpsCache.map((entry) => entry.key));
      await db.jobs.delete(jobId);
    });
    await chrome.storage.local.remove(`${HR_DRAFT_PREFIX}${jobId}`);
    await removeBadgeState(sourceVacancyId, { allowDuringReset: true });
    return result;
  });
}

export async function deleteAiCacheAndEventLog(): Promise<DeleteAiCacheAndEventLogResult> {
  return withResetGuard(async () => {
    const cacheEntriesDeleted = await invalidateCache(undefined, { allowDuringReset: true });
    const eventLogEntriesDeleted = await db.events.count();
    await db.events.clear();
    return { cacheEntriesDeleted, eventLogEntriesDeleted };
  });
}

export async function hasData(): Promise<boolean> {
  for (const name of TABLE_NAMES) {
    if (await db.table(name as TableName).count() > 0) return true;
  }
  return false;
}

export async function getDataCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await Promise.all(TABLE_NAMES.map(async (name) => {
    counts[name] = await db.table(name as TableName).count();
  }));
  return counts;
}
