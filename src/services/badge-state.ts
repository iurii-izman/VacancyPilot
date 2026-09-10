/**
 * Centralized badge-state helpers for chrome.storage.local.
 *
 * Content scripts cannot access Dexie directly, so badge state
 * (score + status) is persisted to chrome.storage.local under
 * stable keys. This module is the single source of truth for
 * badge key construction, persistence, and cleanup.
 */

import { withWriteGuard } from './reset-guard';

/** Stable prefix for badge state keys in chrome.storage.local. */
export const BADGE_KEY_PREFIX = "badge_v1_hh_";

/** Shape persisted to chrome.storage.local for each vacancy. */
export interface BadgeState {
  score?: number;
  status: string;
}

/**
 * Build the chrome.storage.local key for a vacancy.
 */
export function badgeStorageKey(vacancyId: string): string {
  return `${BADGE_KEY_PREFIX}${vacancyId}`;
}

/**
 * Persist badge state (score + status) to chrome.storage.local.
 * Silently ignores errors — badge updates are non-critical.
 */
export async function persistBadgeState(
  vacancyId: string,
  state: BadgeState,
): Promise<void> {
  try {
    const key = badgeStorageKey(vacancyId);
    await withWriteGuard(() => chrome.storage.local.set({ [key]: state }));
  } catch {
    // Non-critical.
  }
}

/**
 * Remove the badge state key for a specific vacancy id.
 */
export async function removeBadgeState(
  sourceVacancyId: string,
  options: { allowDuringReset?: boolean } = {},
): Promise<void> {
  const remove = () =>
    chrome.storage.local.remove(`${BADGE_KEY_PREFIX}${sourceVacancyId}`);
  if (options.allowDuringReset) await remove();
  else await withWriteGuard(remove);
}

/**
 * Remove all badge state keys from chrome.storage.local.
 */
export async function removeAllBadgeStates(): Promise<void> {
  await withWriteGuard(async () => {
    const all = await chrome.storage.local.get(null);
    const badgeKeys = Object.keys(all).filter((k) =>
      k.startsWith(BADGE_KEY_PREFIX),
    );
    if (badgeKeys.length > 0) {
      await chrome.storage.local.remove(badgeKeys);
    }
  });
}
