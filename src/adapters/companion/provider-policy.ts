import type { AppSettings } from "@/models/settings";
import type { CompanionProviderPolicy } from "./vacancy-types";

/**
 * Translate the extension's current explicit privacy settings to the
 * Companion wire contract. Companion V4 currently executes OpenAI only;
 * another local provider never gets silently substituted.
 */
export function buildCompanionProviderPolicy(
  settings: AppSettings,
): CompanionProviderPolicy {
  const companionProviderEnabled = settings.ai.provider === "openai";
  return {
    policy_version: "fix3-v1",
    ai_enabled: settings.privacy.aiEnabled && companionProviderEnabled,
    provider: "openai",
    model: settings.ai.model?.trim() || undefined,
    privacy_mode: settings.privacy.strictPrivacyMode ? "strict" : "standard",
    allow_resume_highlights_to_ai:
      settings.privacy.allowResumeHighlightsToAI,
    allow_full_description_to_ai:
      settings.privacy.allowFullDescriptionToAI,
    redact_contacts: settings.privacy.redactContacts,
    max_input_chars: Math.max(
      256,
      Math.min(12_000, Number.isFinite(settings.ai.maxInputChars) ? settings.ai.maxInputChars : 3_000),
    ),
    daily_request_limit: Math.max(
      0,
      Math.min(1_000, Math.floor(settings.ai.dailyRequestLimit)),
    ),
    cache_enabled: settings.ai.enableCache,
  };
}
