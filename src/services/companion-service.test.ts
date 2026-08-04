/**
 * Tests for companion service — AOPS-04.
 *
 * Tests pairing flow, disconnect, status detection, Ops Mode toggle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockStorage = new Map<string, unknown>();

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
  general: { language: 'ru', theme: 'system', showPageBadge: true, searchHighlightsEnabled: true, searchHighlightsShowViewed: true, searchHighlightsShowSavedRejected: true, searchHighlightsShowScore: true, searchHighlightsShowViewCount: true, trackVisitMarks: true, rejectedSearchCardBehavior: 'dim', autosaveViewedJobs: true, toolbarClickBehavior: 'popup', closePopupAfterOpeningSidePanel: true },
  privacy: { aiEnabled: false, n8nEnabled: false, strictPrivacyMode: true, showPayloadPreviewAlways: true, allowResumeHighlightsToAI: false, allowFullDescriptionToAI: false, redactContacts: true, debugHtmlMode: false },
  ai: { dailyRequestLimit: 10, maxInputChars: 3000, enableStreaming: false, enableCache: true },
  n8n: { enabled: false, hmacSecretSet: false, enabledEvents: [], dailyEventLimit: 10 },
  labs: { enabled: false, guidedApplyEnabled: false, killSwitchEnabled: false, dailyActionLimit: 5 },
  companion: { opsModeEnabled: false, baseUrl: 'http://127.0.0.1:8765/api/v1', lastServiceVersion: null, lastApiVersion: null, lastApiCompatible: false, lastConnectedAt: null },
};

function seedSettings(overrides: Record<string, unknown> = {}) {
  mockStorage.set('app_settings_v1', { ...defaultSettings, ...overrides });
}

describe('companion service', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMocks();
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
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: { status: 'ok', service_version: '0.1.0', api_version: '1', db: 'ok' },
          meta: { request_id: 'request-1' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );

      const { detectCompanionStatus } = await import('./companion-service');
      const result = await detectCompanionStatus();
      expect(result.status).toBe('connected');
      expect(result.versionInfo?.compatible).toBe(true);
    });
  });
});
