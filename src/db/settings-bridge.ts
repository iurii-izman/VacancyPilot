import type { AppSettings } from "@/models/settings";
import { withWriteGuard } from "@/services/reset-guard";

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.length <= maxLength ? value : undefined;
}

function normalizeSettings(storedValue: unknown): AppSettings {
  const defaults = defaultSettings();
  const stored = asRecord(storedValue);
  const general = asRecord(stored.general);
  const privacy = asRecord(stored.privacy);
  const ai = asRecord(stored.ai);
  const n8n = asRecord(stored.n8n);
  const labs = asRecord(stored.labs);
  const companion = asRecord(stored.companion);
  const provider = ai.provider === "openai" || ai.provider === "deepseek" || ai.provider === "openrouter" || ai.provider === "mock"
    ? ai.provider
    : undefined;
  const rejectedBehavior = general.rejectedSearchCardBehavior === "hide" || general.rejectedSearchCardBehavior === "none" || general.rejectedSearchCardBehavior === "dim"
    ? general.rejectedSearchCardBehavior
    : defaults.general.rejectedSearchCardBehavior;
  const enabledEvents = Array.isArray(n8n.enabledEvents)
    ? n8n.enabledEvents.filter((event): event is string => typeof event === "string" && event.length <= 100).slice(0, 100)
    : defaults.n8n.enabledEvents;
  const webhookUrl = boundedString(n8n.webhookUrl, 2_048);

  return {
    schemaVersion: defaults.schemaVersion,
    onboardingCompleted: stored.onboardingCompleted === true,
    general: {
      defaultProfileId: boundedString(general.defaultProfileId, 256),
      showPageBadge: general.showPageBadge !== false,
      searchHighlightsEnabled: general.searchHighlightsEnabled !== false,
      searchHighlightsShowViewed: general.searchHighlightsShowViewed !== false,
      searchHighlightsShowSavedRejected: general.searchHighlightsShowSavedRejected !== false,
      searchHighlightsShowScore: general.searchHighlightsShowScore !== false,
      searchHighlightsShowViewCount: general.searchHighlightsShowViewCount !== false,
      trackVisitMarks: general.trackVisitMarks !== false,
      rejectedSearchCardBehavior: rejectedBehavior,
      toolbarClickBehavior: general.toolbarClickBehavior === "sidePanel" ? "sidePanel" : defaults.general.toolbarClickBehavior,
      closePopupAfterOpeningSidePanel: general.closePopupAfterOpeningSidePanel !== false,
    },
    privacy: {
      aiEnabled: privacy.aiEnabled === true,
      strictPrivacyMode: privacy.strictPrivacyMode !== false,
      allowResumeHighlightsToAI: privacy.allowResumeHighlightsToAI === true,
      allowFullDescriptionToAI: privacy.allowFullDescriptionToAI === true,
      redactContacts: privacy.redactContacts !== false,
    },
    ai: {
      provider,
      model: boundedString(ai.model, 256),
      dailyRequestLimit: boundedInteger(ai.dailyRequestLimit, defaults.ai.dailyRequestLimit, 0, 1_000),
      maxInputChars: boundedInteger(ai.maxInputChars, defaults.ai.maxInputChars, 256, 100_000),
      enableCache: ai.enableCache !== false,
    },
    n8n: {
      enabled: n8n.enabled === true,
      webhookUrl,
      hmacSecretSet: n8n.hmacSecretSet === true,
      enabledEvents,
      dailyEventLimit: boundedInteger(n8n.dailyEventLimit, defaults.n8n.dailyEventLimit, 0, 1_000),
    },
    labs: {
      enabled: labs.enabled === true,
      guidedApplyEnabled: labs.guidedApplyEnabled === true,
      killSwitchEnabled: labs.killSwitchEnabled === true,
      dailyActionLimit: boundedInteger(labs.dailyActionLimit, defaults.labs.dailyActionLimit, 0, 100),
    },
    companion: {
      opsModeEnabled: companion.opsModeEnabled === true,
      // The local dogfood companion is the only supported server boundary.
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
  return normalizeSettings(result[SETTINGS_KEY]);
}

/**
 * Persist settings to chrome.storage.local.
 */
export async function saveSettings(
  settings: AppSettings,
  options: { allowDuringReset?: boolean } = {},
): Promise<void> {
  const write = () =>
    chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
  if (options.allowDuringReset) {
    await write();
  } else {
    await withWriteGuard(write);
  }
}
