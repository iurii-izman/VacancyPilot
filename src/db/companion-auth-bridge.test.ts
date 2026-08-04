/**
 * Tests for companion auth bridge — AOPS-04.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadClientToken, saveClientToken, deleteClientToken } from './companion-auth-bridge';

const mockStorage = new Map<string, unknown>();

beforeEach(() => {
  mockStorage.clear();
});

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: async (keys?: string | string[] | Record<string, unknown>) => {
        const result: Record<string, unknown> = {};
        if (typeof keys === 'string') {
          result[keys] = mockStorage.get(keys) ?? undefined;
        } else if (Array.isArray(keys)) {
          for (const key of keys) {
            result[key] = mockStorage.get(key) ?? undefined;
          }
        } else if (keys) {
          for (const key of Object.keys(keys)) {
            result[key] = mockStorage.get(key) ?? keys[key];
          }
        }
        return result;
      },
      set: async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) {
          mockStorage.set(key, value);
        }
      },
      remove: async (keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const key of keyList) {
          mockStorage.delete(key);
        }
      },
    },
  },
});

describe('companion auth bridge', () => {
  const token = 'a'.repeat(64);

  it('loadClientToken returns null when no token is stored', async () => {
    const token = await loadClientToken();
    expect(token).toBeNull();
  });

  it('saveClientToken / loadClientToken round-trips', async () => {
    await saveClientToken(token);
    const loaded = await loadClientToken();
    expect(loaded).toBe(token);
  });

  it('deleteClientToken removes the token', async () => {
    await saveClientToken(token);
    await deleteClientToken();
    expect(await loadClientToken()).toBeNull();
  });

  it('client token is stored under a separate key from app settings', async () => {
    await saveClientToken(token);
    // The token must NOT be in app_settings_v1
    const settingsResult = await chrome.storage.local.get('app_settings_v1');
    expect(settingsResult.app_settings_v1).toBeUndefined();

    // The token IS in its own key
    const tokenResult = await chrome.storage.local.get('companion_client_token_v1');
    expect(tokenResult.companion_client_token_v1).toBe(token);
  });

  it('saveClientToken overwrites existing token', async () => {
    await saveClientToken('a'.repeat(64));
    await saveClientToken('b'.repeat(64));
    expect(await loadClientToken()).toBe('b'.repeat(64));
  });

  it('deleteClientToken is idempotent', async () => {
    await deleteClientToken(); // no-op on empty storage
    expect(await loadClientToken()).toBeNull();
  });

  it('rejects malformed tokens and ignores malformed stored values', async () => {
    await expect(saveClientToken('not-a-token')).rejects.toThrow('Invalid companion client token');
    await chrome.storage.local.set({ companion_client_token_v1: 'not-a-token' });
    expect(await loadClientToken()).toBeNull();
  });
});
