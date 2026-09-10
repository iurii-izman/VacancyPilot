/**
 * chrome.storage.local bridge for API keys.
 *
 * API keys are stored separately from AppSettings and never placed in IndexedDB
 * (spec sections 8.3, 20.2).
 *
 * Each provider gets its own storage key to keep the data model flat and
 * avoid accidental cross-provider exposure during delete/reset flows.
 *
 * This module is the single boundary for reading/writing API keys.
 * All other code must go through these functions — never access
 * chrome.storage.local directly for API keys.
 */

import type { AppSettings } from '@/models/settings';
import { withWriteGuard } from '@/services/reset-guard';

type AIProvider = NonNullable<AppSettings['ai']['provider']>;

const KEY_PREFIX = 'vp_api_key_';

function storageKey(provider: AIProvider): string {
  return `${KEY_PREFIX}${provider}`;
}

/**
 * Store an API key for a specific provider.
 * Passing an empty string clears the key.
 */
export async function saveApiKey(
  provider: AIProvider,
  key: string,
): Promise<void> {
  await withWriteGuard(async () => {
    const trimmed = key.trim();
    if (trimmed.length === 0) {
      await chrome.storage.local.remove(storageKey(provider));
    } else {
      await chrome.storage.local.set({ [storageKey(provider)]: trimmed });
    }
  });
}

/**
 * Retrieve the API key for a provider.
 * Returns undefined when no key has been saved.
 */
export async function getApiKey(
  provider: AIProvider,
): Promise<string | undefined> {
  const result = await chrome.storage.local.get(storageKey(provider));
  const value = result[storageKey(provider)];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Check whether a provider has a stored API key.
 */
export async function hasApiKey(provider: AIProvider): Promise<boolean> {
  const key = await getApiKey(provider);
  return key !== undefined;
}

/**
 * Delete the API key for a specific provider.
 */
export async function deleteApiKey(provider: AIProvider): Promise<void> {
  await withWriteGuard(() => chrome.storage.local.remove(storageKey(provider)));
}

/**
 * Delete API keys for ALL known providers.
 * Used by the "delete all data" / factory-reset flows.
 */
export async function deleteAllApiKeys(): Promise<void> {
  const providers: AIProvider[] = ['openai', 'deepseek', 'openrouter', 'mock'];
  const keys = providers.map((p) => storageKey(p));
  await withWriteGuard(() => chrome.storage.local.remove(keys));
}

/**
 * Get a masked preview of an API key for display purposes.
 * Example: "sk-abc...xyz" (shows first 6 and last 4 characters).
 */
export function maskApiKey(key: string): string {
  if (key.length <= 10) return '*'.repeat(key.length);
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
