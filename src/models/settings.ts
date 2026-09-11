export interface AppSettings {
  schemaVersion: number;

  /** True after the user completes the first-run onboarding flow. */
  onboardingCompleted: boolean;

  general: {
    defaultProfileId?: string;
    showPageBadge: boolean;
    searchHighlightsEnabled?: boolean;
    searchHighlightsShowViewed?: boolean;
    searchHighlightsShowSavedRejected?: boolean;
    searchHighlightsShowScore?: boolean;
    searchHighlightsShowViewCount?: boolean;
    trackVisitMarks: boolean;
    rejectedSearchCardBehavior: "dim" | "hide" | "none";
    toolbarClickBehavior: "popup" | "sidePanel";
    closePopupAfterOpeningSidePanel: boolean;
  };

  privacy: {
    aiEnabled: boolean;
    strictPrivacyMode: boolean;
    allowResumeHighlightsToAI: boolean;
    allowFullDescriptionToAI: boolean;
    redactContacts: boolean;
  };

  ai: {
    provider?: "openai" | "deepseek" | "openrouter" | "mock";
    model?: string;
    dailyRequestLimit: number;
    maxInputChars: number;
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
  };
}
