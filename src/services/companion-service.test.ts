/**
 * Tests for companion service — AOPS-04.
 *
 * Tests pairing flow, disconnect, status detection, Ops Mode toggle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/services/operating-mode', () => ({
  setOpsModeIntent: vi.fn(async (enabled: boolean) => {
    const current = await chrome.storage.local.get('app_settings_v1');
    const settings = (current.app_settings_v1 ?? {}) as Record<string, unknown>;
    const companion = (settings.companion ?? {}) as Record<string, unknown>;
    await chrome.storage.local.set({
      app_settings_v1: { ...settings, companion: { ...companion, opsModeEnabled: enabled } },
    });
  }),
}));

const mockStorage = new Map<string, unknown>();
const storageWrites: Array<Record<string, unknown>> = [];

function setupMocks() {
  mockStorage.clear();
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (keys?: string | string[] | Record<string, unknown>) => {
          const result: Record<string, unknown> = {};
          if (typeof keys === 'string') {
            result[keys] = mockStorage.get(keys);
          } else if (Array.isArray(keys)) {
            for (const key of keys) {
              result[key] = mockStorage.get(key);
            }
          } else if (keys) {
            for (const key of Object.keys(keys)) {
              result[key] = mockStorage.get(key) ?? keys[key];
            }
          }
          return result;
        },
        set: async (items: Record<string, unknown>) => {
          storageWrites.push(items);
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
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    permissions: {
      request: vi.fn().mockResolvedValue(true),
      contains: vi.fn().mockResolvedValue(true),
    },
  });
}

// Default settings structure
const defaultSettings = {
  schemaVersion: 1,
  onboardingCompleted: false,
  general: { showPageBadge: true, searchHighlightsEnabled: true, searchHighlightsShowViewed: true, searchHighlightsShowSavedRejected: true, searchHighlightsShowScore: true, searchHighlightsShowViewCount: true, trackVisitMarks: true, rejectedSearchCardBehavior: 'dim', toolbarClickBehavior: 'popup', closePopupAfterOpeningSidePanel: true },
  privacy: { aiEnabled: false, strictPrivacyMode: true, allowResumeHighlightsToAI: false, allowFullDescriptionToAI: false, redactContacts: true },
  ai: { dailyRequestLimit: 10, maxInputChars: 3000, enableCache: true },
  n8n: { enabled: false, hmacSecretSet: false, enabledEvents: [], dailyEventLimit: 10 },
  labs: { enabled: false, guidedApplyEnabled: false, killSwitchEnabled: false, dailyActionLimit: 5 },
  companion: { opsModeEnabled: false, baseUrl: 'http://127.0.0.1:8765/api/v1' },
};

function seedSettings(overrides: Record<string, unknown> = {}) {
  mockStorage.set('app_settings_v1', { ...defaultSettings, ...overrides });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function connectedResponses(pairStatus: Response = jsonResponse({ data: { paired: true }, meta: {} })) {
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  fetchMock
    .mockResolvedValueOnce(jsonResponse({
      data: { status: 'ok', service_version: '0.1.0', api_version: '1', db: 'ok' },
      meta: { request_id: 'request-health' },
    }))
    .mockResolvedValueOnce(pairStatus);
  return fetchMock;
}

describe('companion service', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMocks();
    storageWrites.length = 0;
    seedSettings();
  });

  describe('setOpsModeEnabled', () => {
    it('persists opsModeEnabled flag in settings', async () => {
      const { setOpsModeEnabled } = await import('./companion-service');
      const { loadSettings } = await import('@/db/settings-bridge');

      await setOpsModeEnabled(true);
      const settings = await loadSettings();
      expect(settings.companion.opsModeEnabled).toBe(true);
    });

    it('disabling ops mode persists false', async () => {
      seedSettings({ companion: { ...defaultSettings.companion, opsModeEnabled: true } });
      const { setOpsModeEnabled } = await import('./companion-service');
      const { loadSettings } = await import('@/db/settings-bridge');

      await setOpsModeEnabled(false);
      const settings = await loadSettings();
      expect(settings.companion.opsModeEnabled).toBe(false);
    });
  });

  describe('requestLocalhostPermission', () => {
    it('returns true when permission is granted', async () => {
      const { requestLocalhostPermission } = await import('./companion-service');
      const result = await requestLocalhostPermission();
      expect(result).toBe(true);
    });
  });

  describe('disconnectCompanion', () => {
    it('clears local token even when companion is unreachable', async () => {
      const { disconnectCompanion } = await import('./companion-service');
      const { loadClientToken } = await import('@/db/companion-auth-bridge');

      // Pre-seed a token
      const token = 'a'.repeat(64);
      await chrome.storage.local.set({ companion_client_token_v1: token });
      expect(await loadClientToken()).toBe(token);

      const result = await disconnectCompanion();
      // The revoke will fail (no fetch mock), but local clean-up succeeds
      expect(result.success).toBe(true);
      expect(await loadClientToken()).toBeNull();
    });
  });

  describe('detectCompanionStatus', () => {
    it('returns unavailable when ops mode is disabled', async () => {
      const { detectCompanionStatus } = await import('./companion-service');
      const result = await detectCompanionStatus();
      expect(result.status).toBe('unavailable');
    });

    it('returns unavailable when companion is not reachable', async () => {
      seedSettings({ companion: { ...defaultSettings.companion, opsModeEnabled: true } });
      const { detectCompanionStatus } = await import('./companion-service');
      const result = await detectCompanionStatus();
      // No fetch mock — will get network error → unavailable
      expect(result.status).toBe('unavailable');
    });

    it('loads the stored token before deriving connected status', async () => {
      seedSettings({ companion: { ...defaultSettings.companion, opsModeEnabled: true } });
      await chrome.storage.local.set({ companion_client_token_v1: 'a'.repeat(64) });
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: { status: 'ok', service_version: '0.1.0', api_version: '1', db: 'ok' },
          meta: { request_id: 'request-1' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            data: { paired: true },
            meta: { request_id: 'request-2' },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        );

      const { detectCompanionStatus } = await import('./companion-service');
      const result = await detectCompanionStatus();
      expect(result.status).toBe('connected');
      expect(result.versionInfo?.compatible).toBe(true);
    });

    it('does not write settings during a steady-state status check', async () => {
      seedSettings({ companion: { ...defaultSettings.companion, opsModeEnabled: true } });
      await chrome.storage.local.set({ companion_client_token_v1: 'a'.repeat(64) });
      storageWrites.length = 0;
      connectedResponses();

      const { detectCompanionStatus } = await import('./companion-service');
      await detectCompanionStatus();

      expect(storageWrites).toHaveLength(0);
    });

    it('coalesces simultaneous probes and reuses the short-lived result', async () => {
      seedSettings({ companion: { ...defaultSettings.companion, opsModeEnabled: true } });
      await chrome.storage.local.set({ companion_client_token_v1: 'a'.repeat(64) });
      const fetchMock = connectedResponses();

      const { detectCompanionStatus, invalidateCompanionStatusCache } = await import('./companion-service');
      const [first, second] = await Promise.all([
        detectCompanionStatus(),
        detectCompanionStatus(),
      ]);
      expect(first.status).toBe('connected');
      expect(second.status).toBe('connected');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await detectCompanionStatus();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      fetchMock
        .mockResolvedValueOnce(jsonResponse({
          data: { status: 'ok', service_version: '0.1.0', api_version: '1', db: 'ok' },
          meta: { request_id: 'request-health-2' },
        }))
        .mockResolvedValueOnce(jsonResponse({ data: { paired: true }, meta: {} }));
      await detectCompanionStatus({ force: true });
      expect(fetchMock).toHaveBeenCalledTimes(4);

      invalidateCompanionStatusCache();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({
          data: { status: 'ok', service_version: '0.1.0', api_version: '1', db: 'ok' },
          meta: { request_id: 'request-health-3' },
        }))
        .mockResolvedValueOnce(jsonResponse({ data: { paired: true }, meta: {} }));
      await detectCompanionStatus();
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it('keeps a paired token and reports a temporary error on 429', async () => {
      seedSettings({ companion: { ...defaultSettings.companion, opsModeEnabled: true } });
      const token = 'a'.repeat(64);
      await chrome.storage.local.set({ companion_client_token_v1: token });
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({
          data: { status: 'ok', service_version: '0.1.0', api_version: '1', db: 'ok' },
          meta: {},
        }))
        .mockResolvedValueOnce(jsonResponse({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', request_id: 'request-429' } }, 429));

      const { detectCompanionStatus } = await import('./companion-service');
      const result = await detectCompanionStatus();

      expect(result.status).toBe('error');
      expect(result.error).toBe('Too many requests');
      expect(mockStorage.get('companion_client_token_v1')).toBe(token);
    });

    it('retains the existing stale-token recovery contract for 401', async () => {
      seedSettings({ companion: { ...defaultSettings.companion, opsModeEnabled: true } });
      await chrome.storage.local.set({ companion_client_token_v1: 'a'.repeat(64) });
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({
          data: { status: 'ok', service_version: '0.1.0', api_version: '1', db: 'ok' },
          meta: {},
        }))
        .mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication is required', request_id: 'request-401' } }, 401));

      const { detectCompanionStatus } = await import('./companion-service');
      const result = await detectCompanionStatus();

      expect(result.status).toBe('unpaired');
      expect(result.error).toContain('Pairing recovery is available');
      expect(mockStorage.get('companion_client_token_v1')).toBeUndefined();
    });
  });
});
