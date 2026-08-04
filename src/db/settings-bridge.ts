import type { AppSettings } from "@/models/settings";

/**
 * chrome.storage.local bridge for application settings.
 *
 * Settings and toggles live in chrome.storage.local (spec section 8.3).
 * API keys are stored separately and never placed in IndexedDB.
 *
 * This module is the single boundary for reading/writing AppSettings.
 * All other code must go through these functions — never access
 * chrome.storage.local directly for settings.
 */

const SETTINGS_KEY = "app_settings_v1";

/** Factory for default settings used on first launch. */
export function defaultSettings(): AppSettings {
  return {
    schemaVersion: 1,
    onboardingCompleted: false,

    general: {
      language: "ru",
      theme: "system",
      showPageBadge: true,
      searchHighlightsEnabled: true,
      searchHighlightsShowViewed: true,
      searchHighlightsShowSavedRejected: true,
      searchHighlightsShowScore: true,
      searchHighlightsShowViewCount: true,
      trackVisitMarks: true,
      rejectedSearchCardBehavior: "dim",
      autosaveViewedJobs: true,
      toolbarClickBehavior: "popup",
      closePopupAfterOpeningSidePanel: true,
    },

    privacy: {
      aiEnabled: false,
      n8nEnabled: false,
      strictPrivacyMode: true,
      showPayloadPreviewAlways: true,
      allowResumeHighlightsToAI: false,
      allowFullDescriptionToAI: false,
      redactContacts: true,
      debugHtmlMode: false,
    },

    ai: {
      dailyRequestLimit: 10,
      maxInputChars: 3000,
      enableStreaming: false,
      enableCache: true,
    },

    n8n: {
      enabled: false,
      hmacSecretSet: false,
      enabledEvents: [],
      dailyEventLimit: 10,
    },

    labs: {
      enabled: false,
      guidedApplyEnabled: false,
      killSwitchEnabled: false,
      dailyActionLimit: 5,
    },

    companion: {
      opsModeEnabled: false,
      baseUrl: "http://127.0.0.1:8765/api/v1",
      lastServiceVersion: null,
      lastApiVersion: null,
      lastApiCompatible: false,
      lastConnectedAt: null,
    },
  };
}

function normalizeSettings(
  stored: Partial<AppSettings> | undefined,
): AppSettings {
  const defaults = defaultSettings();

  return {
    ...defaults,
    ...stored,
    general: {
      ...defaults.general,
      ...stored?.general,
    },
    privacy: {
      ...defaults.privacy,
      ...stored?.privacy,
    },
    ai: {
      ...defaults.ai,
      ...stored?.ai,
    },
    n8n: {
      ...defaults.n8n,
      ...stored?.n8n,
    },
    labs: {
      ...defaults.labs,
      ...stored?.labs,
    },
    companion: {
      ...defaults.companion,
      ...stored?.companion,
      baseUrl: defaults.companion.baseUrl,
    },
  };
}

/**
 * Load settings from chrome.storage.local.
 * Returns default settings if none have been saved yet.
 */
export async function loadSettings(): Promise<AppSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<AppSettings> | undefined;
  return normalizeSettings(stored);
}

/**
 * Persist settings to chrome.storage.local.
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
