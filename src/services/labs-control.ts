import { loadSettings } from "@/db/settings-bridge";
import { labsActionRepo } from "@/db/labs-repository";
import type { LabsActionType, LabsActionLog } from "@/models/labs-action-log";
import { getOperatingMode } from "@/services/operating-mode";

/**
 * Labs safety control plane.
 *
 * Central gate for all Labs features. Every Labs code path must call
 * isLabsEnabled() / isGuidedApplyEnabled() before executing.
 *
 * Rules (from spec sections 3.7, 19.7, 23.2):
 * - Labs are off by default on a clean install.
 * - A single kill switch suppresses all Labs features.
 * - guided-apply toggle gates guided-apply specifically.
 * - Daily action budget caps the number of Labs actions per calendar day.
 * - Every Labs action is logged locally.
 */

/** Midnight UTC for the current calendar day. */
function startOfTodayUTC(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

function countsTowardDailyBudget(action: LabsActionLog): boolean {
  return action.details.countsTowardBudget === true;
}

/**
 * Check whether any Labs feature can be used.
 * Returns false if master toggle is off OR kill switch is active.
 */
export async function isLabsEnabled(): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.labs.enabled) return false;
  if (settings.labs.killSwitchEnabled) return false;
  return true;
}

/**
 * Check whether guided-apply is currently allowed.
 * Requires master toggle on, guided-apply toggle on, and kill switch off.
 */
export async function isGuidedApplyEnabled(): Promise<boolean> {
  const labsEnabled = await isLabsEnabled();
  if (!labsEnabled) return false;
  const settings = await loadSettings();
  return settings.labs.guidedApplyEnabled;
}

/**
 * Check how many Labs actions remain in today's budget.
 * Returns the remaining count (0 means budget exhausted).
 */
export async function getRemainingDailyBudget(): Promise<number> {
  const settings = await loadSettings();
  const limit = settings.labs.dailyActionLimit;
  const todayStart = startOfTodayUTC();
  const actionsToday = await labsActionRepo.listSince(todayStart);
  const usedToday = actionsToday.filter(countsTowardDailyBudget).length;
  return Math.max(0, limit - usedToday);
}

/**
 * Check whether at least one action remains in today's budget.
 * Convenience wrapper around getRemainingDailyBudget().
 */
export async function hasDailyBudget(): Promise<boolean> {
  const remaining = await getRemainingDailyBudget();
  return remaining > 0;
}

/**
 * Full gate check for a guided-apply action.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export async function checkGuidedApplyGate(): Promise<
  | { allowed: true }
  | { allowed: false; reason: string }
> {
  const settings = await loadSettings();

  if (!settings.labs.enabled) {
    return { allowed: false, reason: "Labs master toggle is off" };
  }

  if (settings.labs.killSwitchEnabled) {
    return { allowed: false, reason: "Labs kill switch is active" };
  }

  if (!settings.labs.guidedApplyEnabled) {
    return { allowed: false, reason: "Guided apply is disabled" };
  }

  const remaining = await getRemainingDailyBudget();
  if (remaining <= 0) {
    return { allowed: false, reason: "Daily action budget exhausted" };
  }

  return { allowed: true };
}

/**
 * Gate the final Guided Apply local status/application mutation.
 * Preparation remains manual and clipboard-only; Ops authority cannot be
 * changed from this local mutation path.
 */
export async function checkGuidedApplyMutationGate(): Promise<
  | { allowed: true }
  | { allowed: false; reason: string }
> {
  const labsGate = await checkGuidedApplyGate();
  if (!labsGate.allowed) return labsGate;
  const mode = await getOperatingMode();
  if (mode.effectiveMode === "ops") {
    return {
      allowed: false,
      reason: "Guided Apply local mutation is unavailable in Ops Mode until Fix 2",
    };
  }
  return { allowed: true };
}

/**
 * Record a Labs action to the local log.
 * Does NOT perform any gating — callers must gate before calling this.
 */
export async function recordLabsAction(
  type: LabsActionType,
  details: {
    tabId?: number;
    vacancyUrl?: string;
    jobId?: string;
    [key: string]: unknown;
  } = {},
): Promise<LabsActionLog> {
  const entry: LabsActionLog = {
    id: crypto.randomUUID(),
    type,
    tabId: details.tabId,
    vacancyUrl: details.vacancyUrl,
    jobId: details.jobId,
    details,
    createdAt: new Date().toISOString(),
  };
  await labsActionRepo.save(entry);
  return entry;
}

/**
 * Get the full Labs action log, newest first.
 */
export function getActionLog(): Promise<LabsActionLog[]> {
  return labsActionRepo.list();
}

/**
 * Get the count of Labs actions executed today.
 */
export async function getTodayActionCount(): Promise<number> {
  const todayStart = startOfTodayUTC();
  return labsActionRepo.countSince(todayStart);
}
