/**
 * LLM Provider Factory — selects the right provider based on user settings.
 *
 * Single entry point for all LLMProvider resolution. Every call site that
 * needs an AI provider goes through this factory.
 *
 * Section 12.1: one real provider first, then add more.
 * Section 12.2: BYOK — each provider reads its own API key locally.
 */

import type { LLMProvider } from "@/models/ai";
import type { AppSettings } from "@/models/settings";
import { MockLLMProvider } from "./ai-provider";
import { OpenAILLMProvider } from "./ai-provider-openai";

/**
 * Create an LLMProvider instance based on the current settings.
 *
 * - 'openai' → OpenAILLMProvider (reads API key from chrome.storage.local)
 * - 'mock' → MockLLMProvider (deterministic, no network, no API key)
 * - undefined → throws (AI not configured)
 * - other → throws with a message pointing to settings
 *
 * Throws if the provider is not yet implemented (deepseek, openrouter)
 * or if AI is disabled.
 */
export function getLLMProvider(settings: AppSettings): LLMProvider {
  if (!settings.privacy.aiEnabled) {
    throw new Error(
      "AI features are disabled. Enable AI in Settings → AI.",
    );
  }

  const provider = settings.ai.provider;

  if (!provider) {
    throw new Error(
      "No AI provider selected. Choose a provider in Settings → AI.",
    );
  }

  switch (provider) {
    case "openai":
      return new OpenAILLMProvider(settings.ai.model);
    case "mock":
      return new MockLLMProvider();
    case "deepseek":
    case "openrouter":
      throw new Error(
        `${providerLabel(provider)} is not yet implemented. Use OpenAI or Mock for now.`,
      );
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

/**
 * Check whether a provider type is implemented and ready for use.
 * Does not check API key availability — only whether the provider
 * implementation exists.
 */
export function isProviderImplemented(
  provider: AppSettings["ai"]["provider"],
): boolean {
  if (!provider) return false;
  return provider === "openai" || provider === "mock";
}

/**
 * Get a human-readable label for a provider type.
 */
export function providerLabel(
  provider: AppSettings["ai"]["provider"],
): string {
  if (!provider) return "None";
  const labels: Record<string, string> = {
    openai: "OpenAI",
    deepseek: "DeepSeek",
    openrouter: "OpenRouter",
    mock: "Mock",
  };
  return labels[provider] ?? provider;
}

/**
 * Check whether the user has a valid AI setup (enabled + provider selected +
 * implemented). Returns { ready: true } or { ready: false, reason: string }.
 *
 * Does NOT check API key availability — that is checked at request time
 * by the individual provider.
 */
export function checkAIReadiness(
  settings: AppSettings,
): { ready: true } | { ready: false; reason: string } {
  if (!settings.privacy.aiEnabled) {
    return { ready: false, reason: "AI is disabled in settings." };
  }

  if (!settings.ai.provider) {
    return { ready: false, reason: "No AI provider selected." };
  }

  if (!isProviderImplemented(settings.ai.provider)) {
    return {
      ready: false,
      reason: `${providerLabel(settings.ai.provider)} is not yet implemented.`,
    };
  }

  return { ready: true };
}
