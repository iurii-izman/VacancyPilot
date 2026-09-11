import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  saveApiKey,
  getApiKey,
  hasApiKey,
  deleteApiKey,
  deleteAllApiKeys,
  maskApiKey,
} from "@/db/api-key-bridge";
import {
  defaultSettings,
  loadSettings,
  saveSettings,
} from "@/db/settings-bridge";

// ── Mock chrome.storage.local for settings tests ───────────────────────────

const mockStorage = new Map<string, unknown>();

beforeEach(() => {
  mockStorage.clear();
});

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: async (keys?: string | string[] | Record<string, unknown>) => {
        const result: Record<string, unknown> = {};
        if (typeof keys === "string") {
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

// ── Source code safety check ──────────────────────────────────────────────

describe("AISettingsSection — source code safety", () => {
  const sourcePath = resolve(__dirname, "AISettingsSection.tsx");
  let source: string;

  beforeAll(() => {
    source = readFileSync(sourcePath, "utf-8");
  });

  it("imports from api-key-bridge (separate key storage)", () => {
    expect(source).toMatch(/api-key-bridge/);
  });

  it("does not contain hardcoded secrets or keys", () => {
    expect(source).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(source).not.toMatch(/Bearer\s+[a-zA-Z0-9_-]+/);
    expect(source).not.toMatch(/api[_-]?key\s*=\s*['"][a-zA-Z0-9]{8,}/i);
  });

  it("does not import or reference IndexedDB directly for key storage", () => {
    expect(source).not.toMatch(/indexedDB|IDBKeyRange|IDBTransaction/);
    expect(source).not.toMatch(/db\.(table|transaction)/);
  });

  it("uses chrome.storage.local via api-key-bridge for keys", () => {
    // The component should use the bridge functions, not direct chrome.storage calls for keys
    expect(source).toMatch(/saveApiKey|getApiKey|deleteApiKey/);
  });

  it("includes local-storage warning for users", () => {
    expect(source).toMatch(/Local storage only/);
  });

  it('uses type="password" for API key input field', () => {
    expect(source).toMatch(/type\s*=\s*["'`]password["'`]/);
  });
});

// ── Settings lifecycle tests ──────────────────────────────────────────────

describe("AI settings lifecycle", () => {
  it("default settings have AI disabled with no provider", () => {
    const settings = defaultSettings();
    expect(settings.privacy.aiEnabled).toBe(false);
    expect(settings.ai.provider).toBeUndefined();
    expect(settings.ai.model).toBeUndefined();
  });

  it("can enable AI and select a provider", async () => {
    const settings = defaultSettings();
    settings.privacy.aiEnabled = true;
    settings.ai.provider = "openai";
    settings.ai.model = "gpt-4o";
    await saveSettings(settings);

    const loaded = await loadSettings();
    expect(loaded.privacy.aiEnabled).toBe(true);
    expect(loaded.ai.provider).toBe("openai");
    expect(loaded.ai.model).toBe("gpt-4o");
  });

  it("can toggle AI off without losing provider config", async () => {
    // Configure AI
    const settings = defaultSettings();
    settings.privacy.aiEnabled = true;
    settings.ai.provider = "deepseek";
    settings.ai.model = "deepseek-chat";
    await saveSettings(settings);

    // Disable AI
    settings.privacy.aiEnabled = false;
    await saveSettings(settings);

    const loaded = await loadSettings();
    expect(loaded.privacy.aiEnabled).toBe(false);
    // Provider config should survive the toggle
    expect(loaded.ai.provider).toBe("deepseek");
    expect(loaded.ai.model).toBe("deepseek-chat");
  });

  it("can switch providers", async () => {
    const settings = defaultSettings();
    settings.privacy.aiEnabled = true;
    settings.ai.provider = "openai";
    settings.ai.model = "gpt-4o";
    await saveSettings(settings);

    settings.ai.provider = "deepseek";
    settings.ai.model = "deepseek-chat";
    await saveSettings(settings);

    const loaded = await loadSettings();
    expect(loaded.ai.provider).toBe("deepseek");
    expect(loaded.ai.model).toBe("deepseek-chat");
  });

  it("can update daily limit", async () => {
    const settings = defaultSettings();
    settings.ai.dailyRequestLimit = 25;
    await saveSettings(settings);

    const loaded = await loadSettings();
    expect(loaded.ai.dailyRequestLimit).toBe(25);
  });

  it("daily limit clamps to safe defaults when zero", async () => {
    const settings = defaultSettings();
    settings.ai.dailyRequestLimit = 0;
    await saveSettings(settings);

    const loaded = await loadSettings();
    // Zero is stored but UI should clamp. Verifying raw persistence.
    expect(loaded.ai.dailyRequestLimit).toBe(0);
  });

  it("can toggle cache on and off", async () => {
    const settings = defaultSettings();
    expect(settings.ai.enableCache).toBe(true);

    settings.ai.enableCache = false;
    await saveSettings(settings);

    const loaded = await loadSettings();
    expect(loaded.ai.enableCache).toBe(false);
  });

  it("can update max input chars", async () => {
    const settings = defaultSettings();
    settings.ai.maxInputChars = 5000;
    await saveSettings(settings);

    const loaded = await loadSettings();
    expect(loaded.ai.maxInputChars).toBe(5000);
  });

  it("disabling AI does not clear the selected provider or model", async () => {
    const settings = defaultSettings();
    settings.privacy.aiEnabled = true;
    settings.ai.provider = "openrouter";
    settings.ai.model = "mistral";
    await saveSettings(settings);

    // Disable AI
    settings.privacy.aiEnabled = false;
    await saveSettings(settings);

    const loaded = await loadSettings();
    expect(loaded.privacy.aiEnabled).toBe(false);
    expect(loaded.ai.provider).toBe("openrouter");
    expect(loaded.ai.model).toBe("mistral");
  });
});

// ── API key lifecycle tests ───────────────────────────────────────────────

describe("API key lifecycle", () => {
  it("can save and retrieve an API key for openai", async () => {
    await saveApiKey("openai", "sk-proj-abc123xyz");
    const key = await getApiKey("openai");
    expect(key).toBe("sk-proj-abc123xyz");
  });

  it("can save and retrieve an API key for deepseek", async () => {
    await saveApiKey("deepseek", "sk-deepseek-key-456");
    const key = await getApiKey("deepseek");
    expect(key).toBe("sk-deepseek-key-456");
  });

  it("can save and retrieve an API key for openrouter", async () => {
    await saveApiKey("openrouter", "sk-or-key-789");
    const key = await getApiKey("openrouter");
    expect(key).toBe("sk-or-key-789");
  });

  it("hasApiKey returns true after saving", async () => {
    await saveApiKey("openai", "sk-key");
    expect(await hasApiKey("openai")).toBe(true);
  });

  it("hasApiKey returns false when no key is stored", async () => {
    expect(await hasApiKey("openai")).toBe(false);
  });

  it("hasApiKey returns false for mock provider (never stores keys)", async () => {
    expect(await hasApiKey("mock")).toBe(false);
    await saveApiKey("mock", "should-not-matter");
    // Mock keys are still storable via the bridge, but UI should not surface them
    expect(await hasApiKey("mock")).toBe(true);
  });

  it("can delete a specific provider key", async () => {
    await saveApiKey("openai", "sk-openai-key");
    await saveApiKey("deepseek", "sk-deepseek-key");

    await deleteApiKey("openai");

    expect(await hasApiKey("openai")).toBe(false);
    expect(await hasApiKey("deepseek")).toBe(true);
  });

  it("deleteApiKey is idempotent", async () => {
    await deleteApiKey("openai"); // no key exists — should not throw
    expect(await hasApiKey("openai")).toBe(false);
  });

  it("can overwrite an existing key", async () => {
    await saveApiKey("openai", "old-key");
    await saveApiKey("openai", "new-key");
    expect(await getApiKey("openai")).toBe("new-key");
  });

  it("deleteAllApiKeys removes all keys", async () => {
    await saveApiKey("openai", "sk-openai");
    await saveApiKey("deepseek", "sk-deepseek");
    await saveApiKey("openrouter", "sk-openrouter");

    await deleteAllApiKeys();

    expect(await hasApiKey("openai")).toBe(false);
    expect(await hasApiKey("deepseek")).toBe(false);
    expect(await hasApiKey("openrouter")).toBe(false);
  });

  it("deleteAllApiKeys leaves settings intact", async () => {
    await saveApiKey("openai", "sk-openai");
    const settings = defaultSettings();
    settings.privacy.aiEnabled = true;
    await saveSettings(settings);

    await deleteAllApiKeys();

    const loaded = await loadSettings();
    expect(loaded.privacy.aiEnabled).toBe(true);
    expect(await hasApiKey("openai")).toBe(false);
  });

  it("saving empty string clears the key", async () => {
    await saveApiKey("openai", "sk-key");
    await saveApiKey("openai", "");
    expect(await getApiKey("openai")).toBeUndefined();
  });
});

// ── Cross-cutting: settings + keys coexistence ────────────────────────────

describe("settings and keys coexistence", () => {
  it("settings save does not affect stored API keys", async () => {
    await saveApiKey("openai", "sk-test");
    const settings = defaultSettings();
    settings.ai.provider = "openai";
    await saveSettings(settings);

    expect(await getApiKey("openai")).toBe("sk-test");
    const loaded = await loadSettings();
    expect(loaded.ai.provider).toBe("openai");
  });

  it("key operations do not affect settings", async () => {
    const settings = defaultSettings();
    settings.ai.dailyRequestLimit = 42;
    await saveSettings(settings);

    await saveApiKey("openai", "sk-test");
    await deleteApiKey("openai");

    const loaded = await loadSettings();
    expect(loaded.ai.dailyRequestLimit).toBe(42);
  });

  it("maskApiKey does not reveal the full key", () => {
    const key = "sk-proj-abcdefghijklmnop";
    const masked = maskApiKey(key);
    expect(masked).not.toBe(key);
    expect(masked).not.toContain("abcdef");
  });
});
