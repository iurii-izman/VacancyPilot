import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AppSettings } from "@/models/settings";
import { defaultSettings, loadSettings, saveSettings } from "./settings-bridge";

// Mock chrome.storage.local
const mockStorage = new Map<string, unknown>();

beforeEach(() => {
  mockStorage.clear();
});

// Provide a minimal chrome.storage.local mock
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

describe("defaultSettings", () => {
  it("returns factory settings with all sections present", () => {
    const settings = defaultSettings();

    expect(settings.schemaVersion).toBe(1);
    expect(settings.onboardingCompleted).toBe(false);
    expect(settings.general).toBeDefined();
    expect(settings.privacy).toBeDefined();
    expect(settings.ai).toBeDefined();
    expect(settings.n8n).toBeDefined();
    expect(settings.labs).toBeDefined();
  });

  it("has privacy defaults matching spec — strict by default", () => {
    const settings = defaultSettings();

    expect(settings.privacy.aiEnabled).toBe(false);
    expect(settings.privacy.strictPrivacyMode).toBe(true);
    expect(settings.privacy.allowResumeHighlightsToAI).toBe(false);
    expect(settings.privacy.redactContacts).toBe(true);
  });

  it("has general defaults", () => {
    const settings = defaultSettings();

    expect(settings.general.searchHighlightsEnabled).toBe(true);
    expect(settings.general.searchHighlightsShowViewed).toBe(true);
    expect(settings.general.searchHighlightsShowSavedRejected).toBe(true);
    expect(settings.general.searchHighlightsShowScore).toBe(true);
    expect(settings.general.searchHighlightsShowViewCount).toBe(true);
    expect(settings.general.trackVisitMarks).toBe(true);
    expect(settings.general.rejectedSearchCardBehavior).toBe("dim");
    expect(settings.general.toolbarClickBehavior).toBe("popup");
    expect(settings.general.closePopupAfterOpeningSidePanel).toBe(true);
  });

  it("has AI disabled with safe defaults", () => {
    const settings = defaultSettings();

    expect(settings.ai.provider).toBeUndefined();
    expect(settings.ai.model).toBeUndefined();
    expect(settings.ai.dailyRequestLimit).toBe(10);
  });

  it("has n8n disabled by default", () => {
    const settings = defaultSettings();

    expect(settings.n8n.enabled).toBe(false);
    expect(settings.n8n.hmacSecretSet).toBe(false);
  });

  it("has labs disabled by default", () => {
    const settings = defaultSettings();

    expect(settings.labs.enabled).toBe(false);
    expect(settings.labs.guidedApplyEnabled).toBe(false);
  });
});

describe("loadSettings", () => {
  it("returns default settings when none are stored", async () => {
    const settings = await loadSettings();
    expect(settings).toEqual(defaultSettings());
  });

  it("returns stored settings when present", async () => {
    const custom: AppSettings = {
      ...defaultSettings(),
      general: { ...defaultSettings().general, toolbarClickBehavior: "sidePanel" },
    };
    await saveSettings(custom);

    const loaded = await loadSettings();
    expect(loaded.general.toolbarClickBehavior).toBe("sidePanel");
  });

  it("fills newly added fields for older stored settings", async () => {
    const legacy = {
      schemaVersion: 1,
      general: { toolbarClickBehavior: "sidePanel" as const, language: "en", theme: "dark", autosaveViewedJobs: false },
      privacy: { aiEnabled: true },
      ai: { enableStreaming: true },
      companion: { lastConnectedAt: "old" },
    };

    await chrome.storage.local.set({ app_settings_v1: legacy });

    const loaded = await loadSettings();

    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.onboardingCompleted).toBe(false);
    expect(loaded.general.toolbarClickBehavior).toBe("sidePanel");
    expect(loaded.general.searchHighlightsEnabled).toBe(true);
    expect(loaded.general.searchHighlightsShowViewed).toBe(true);
    expect(loaded.general.searchHighlightsShowSavedRejected).toBe(true);
    expect(loaded.general.searchHighlightsShowScore).toBe(true);
    expect(loaded.general.searchHighlightsShowViewCount).toBe(true);
    expect(loaded.general.trackVisitMarks).toBe(true);
    expect(loaded.general.rejectedSearchCardBehavior).toBe("dim");
    expect(loaded.general.toolbarClickBehavior).toBe("sidePanel");
    expect(loaded.general.closePopupAfterOpeningSidePanel).toBe(true);
    expect(loaded.privacy.aiEnabled).toBe(true);
    expect(loaded.privacy.strictPrivacyMode).toBe(true);
    expect((loaded.general as Record<string, unknown>).language).toBeUndefined();
    expect((loaded.general as Record<string, unknown>).theme).toBeUndefined();
    expect((loaded.general as Record<string, unknown>).autosaveViewedJobs).toBeUndefined();
    expect((loaded.ai as Record<string, unknown>).enableStreaming).toBeUndefined();
    expect((loaded.companion as Record<string, unknown>).lastConnectedAt).toBeUndefined();
  });
});

describe("saveSettings", () => {
  it("persists settings and loads them back", async () => {
    const settings = defaultSettings();
    settings.general.toolbarClickBehavior = "sidePanel";
    settings.privacy.aiEnabled = true;

    await saveSettings(settings);
    const loaded = await loadSettings();

    expect(loaded.general.toolbarClickBehavior).toBe("sidePanel");
    expect(loaded.privacy.aiEnabled).toBe(true);
  });
});
