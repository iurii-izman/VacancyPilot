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
      showPageBadge: true,
      searchHighlightsEnabled: true,
      searchHighlightsShowViewed: true,
      searchHighlightsShowSavedRejected: true,
      searchHighlightsShowScore: true,
      searchHighlightsShowViewCount: true,
      trackVisitMarks: true,
      rejectedSearchCardBehavior: "dim",
      toolbarClickBehavior: "popup",
      closePopupAfterOpeningSidePanel: true,
    },

    privacy: {
      aiEnabled: false,
      strictPrivacyMode: true,
      allowResumeHighlightsToAI: false,
      allowFullDescriptionToAI: false,
      redactContacts: true,
    },

    ai: {
      dailyRequestLimit: 10,
      maxInputChars: 3000,
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
    },
  };
}

function normalizeSettings(
  stored: (Partial<AppSettings> & Record<string, unknown>) | undefined,
): AppSettings {
  const defaults = defaultSettings();
  const storedGeneral = (stored?.general ?? {}) as Record<string, unknown>;
  const storedPrivacy = (stored?.privacy ?? {}) as Record<string, unknown>;
  const storedAi = (stored?.ai ?? {}) as Record<string, unknown>;
  const storedCompanion = (stored?.companion ?? {}) as Record<string, unknown>;

  return {
    schemaVersion: defaults.schemaVersion,
    onboardingCompleted: stored?.onboardingCompleted === true,
    general: {
      ...defaults.general,
      defaultProfileId: typeof storedGeneral.defaultProfileId === "string" ? storedGeneral.defaultProfileId : undefined,
      showPageBadge: storedGeneral.showPageBadge !== false,
      searchHighlightsEnabled: storedGeneral.searchHighlightsEnabled !== false,
      searchHighlightsShowViewed: storedGeneral.searchHighlightsShowViewed !== false,
      searchHighlightsShowSavedRejected: storedGeneral.searchHighlightsShowSavedRejected !== false,
      searchHighlightsShowScore: storedGeneral.searchHighlightsShowScore !== false,
      searchHighlightsShowViewCount: storedGeneral.searchHighlightsShowViewCount !== false,
      trackVisitMarks: storedGeneral.trackVisitMarks !== false,
      rejectedSearchCardBehavior: storedGeneral.rejectedSearchCardBehavior === "hide" || storedGeneral.rejectedSearchCardBehavior === "none" ? storedGeneral.rejectedSearchCardBehavior : defaults.general.rejectedSearchCardBehavior,
      toolbarClickBehavior: storedGeneral.toolbarClickBehavior === "sidePanel" ? "sidePanel" : defaults.general.toolbarClickBehavior,
      closePopupAfterOpeningSidePanel: storedGeneral.closePopupAfterOpeningSidePanel !== false,
    },
    privacy: {
      ...defaults.privacy,
      aiEnabled: storedPrivacy.aiEnabled === true,
      strictPrivacyMode: storedPrivacy.strictPrivacyMode !== false,
      allowResumeHighlightsToAI: storedPrivacy.allowResumeHighlightsToAI === true,
      allowFullDescriptionToAI: storedPrivacy.allowFullDescriptionToAI === true,
      redactContacts: storedPrivacy.redactContacts !== false,
    },
    ai: {
      ...defaults.ai,
      provider: storedAi.provider === "openai" || storedAi.provider === "deepseek" || storedAi.provider === "openrouter" || storedAi.provider === "mock" ? storedAi.provider : undefined,
      model: typeof storedAi.model === "string" ? storedAi.model : undefined,
      dailyRequestLimit: typeof storedAi.dailyRequestLimit === "number" ? storedAi.dailyRequestLimit : defaults.ai.dailyRequestLimit,
      maxInputChars: typeof storedAi.maxInputChars === "number" ? storedAi.maxInputChars : defaults.ai.maxInputChars,
      enableCache: storedAi.enableCache !== false,
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
      opsModeEnabled: storedCompanion.opsModeEnabled === true,
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
  const stored = result[SETTINGS_KEY] as (Partial<AppSettings> & Record<string, unknown>) | undefined;
  return normalizeSettings(stored);
}

/**
 * Persist settings to chrome.storage.local.
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
