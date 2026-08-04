export interface AppSettings {
  schemaVersion: number;

  /** True after the user completes the first-run onboarding flow. */
  onboardingCompleted: boolean;

  general: {
    defaultProfileId?: string;
    language: "ru" | "en";
    theme: "system" | "light" | "dark";
    showPageBadge: boolean;
    searchHighlightsEnabled?: boolean;
    searchHighlightsShowViewed?: boolean;
    searchHighlightsShowSavedRejected?: boolean;
    searchHighlightsShowScore?: boolean;
    searchHighlightsShowViewCount?: boolean;
    trackVisitMarks: boolean;
    rejectedSearchCardBehavior: "dim" | "hide" | "none";
    autosaveViewedJobs: boolean;
    toolbarClickBehavior: "popup" | "sidePanel";
    closePopupAfterOpeningSidePanel: boolean;
  };

  privacy: {
    aiEnabled: boolean;
    n8nEnabled: boolean;
    strictPrivacyMode: boolean;
    showPayloadPreviewAlways: boolean;
    allowResumeHighlightsToAI: boolean;
    allowFullDescriptionToAI: boolean;
    redactContacts: boolean;
    debugHtmlMode: boolean;
    dataRetentionDays?: number;
  };

  ai: {
    provider?: "openai" | "deepseek" | "openrouter" | "mock";
    model?: string;
    dailyRequestLimit: number;
    maxInputChars: number;
    enableStreaming: boolean;
    enableCache: boolean;
  };

  n8n: {
    enabled: boolean;
    webhookUrl?: string;
    hmacSecretSet: boolean;
    enabledEvents: string[];
    dailyEventLimit: number;
  };

  labs: {
    enabled: boolean;
    guidedApplyEnabled: boolean;
    killSwitchEnabled: boolean;
    dailyActionLimit: number;
  };

  /** Companion/Ops Mode settings — AOPS-04. Persisted in chrome.storage.local only. */
  companion: {
    /** Whether the user has opted into Ops Mode. */
    opsModeEnabled: boolean;
    /** Companion base URL. */
    baseUrl: string;
    /** Last known companion service version from /health. */
    lastServiceVersion: string | null;
    /** Last known companion API version from /health. */
    lastApiVersion: string | null;
    /** Whether the last handshake reported API compatibility. */
    lastApiCompatible: boolean;
    /** ISO-8601 timestamp of the last successful connection. */
    lastConnectedAt: string | null;
  };
}
