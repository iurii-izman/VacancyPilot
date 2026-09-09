import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BADGE_KEY_PREFIX,
  badgeStorageKey,
  persistBadgeState,
  removeBadgeState,
  removeAllBadgeStates,
} from "./badge-state";

// ── Mock chrome.storage.local ──

const mockStorage = new Map<string, unknown>();

beforeEach(() => {
  mockStorage.clear();
});

vi.stubGlobal("chrome", {
  storage: {
    local: {
      set: async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) {
          mockStorage.set(key, value);
        }
      },
      get: async (keys: string | string[] | null) => {
        if (keys === null) return Object.fromEntries(mockStorage);
        const keyList = typeof keys === "string" ? [keys] : keys;
        const result: Record<string, unknown> = {};
        for (const k of keyList) {
          if (mockStorage.has(k)) result[k] = mockStorage.get(k);
        }
        return result;
      },
      remove: async (keys: string | string[]) => {
        const keyList = typeof keys === "string" ? [keys] : keys;
        for (const k of keyList) {
          mockStorage.delete(k);
        }
      },
    },
  },
});

// ── Tests ──

describe("BADGE_KEY_PREFIX", () => {
  it("is the expected constant", () => {
    expect(BADGE_KEY_PREFIX).toBe("badge_v1_hh_");
  });
});

describe("badgeStorageKey", () => {
  it("builds a key from a vacancy id", () => {
    expect(badgeStorageKey("12345")).toBe("badge_v1_hh_12345");
  });
});

describe("persistBadgeState", () => {
  it("persists score and status to chrome.storage.local", async () => {
    await persistBadgeState("12345", { score: 85, status: "saved" });

    const stored = mockStorage.get("badge_v1_hh_12345") as {
      score: number;
      status: string;
    };
    expect(stored).toBeDefined();
    expect(stored.score).toBe(85);
    expect(stored.status).toBe("saved");
  });

  it("persists status without score", async () => {
    await persistBadgeState("67890", { status: "rejected_by_me" });

    const stored = mockStorage.get("badge_v1_hh_67890") as {
      score?: number;
      status: string;
    };
    expect(stored).toBeDefined();
    expect(stored.score).toBeUndefined();
    expect(stored.status).toBe("rejected_by_me");
  });

  it("does not throw on storage errors", async () => {
    // Simulate storage error by overriding set to throw
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = async () => {
      throw new Error("Storage error");
    };

    await expect(
      persistBadgeState("12345", { status: "saved" }),
    ).resolves.toBeUndefined();

    // Restore
    chrome.storage.local.set = originalSet;
  });
});

describe("removeBadgeState", () => {
  it("removes a single badge key from storage", async () => {
    // Seed storage
    await persistBadgeState("12345", { status: "saved" });
    expect(mockStorage.has("badge_v1_hh_12345")).toBe(true);

    await removeBadgeState("12345");
    expect(mockStorage.has("badge_v1_hh_12345")).toBe(false);
  });
});

describe("removeAllBadgeStates", () => {
  it("removes all badge keys while preserving non-badge keys", async () => {
    // Seed: badge keys + a non-badge key
    await persistBadgeState("1", { status: "saved" });
    await persistBadgeState("2", { status: "viewed" });
    mockStorage.set("app_settings_v1", { general: {} });

    expect(mockStorage.has("badge_v1_hh_1")).toBe(true);
    expect(mockStorage.has("badge_v1_hh_2")).toBe(true);
    expect(mockStorage.has("app_settings_v1")).toBe(true);

    await removeAllBadgeStates();

    expect(mockStorage.has("badge_v1_hh_1")).toBe(false);
    expect(mockStorage.has("badge_v1_hh_2")).toBe(false);
    // Non-badge key preserved
    expect(mockStorage.has("app_settings_v1")).toBe(true);
  });

  it("does nothing when no badge keys exist", async () => {
    mockStorage.set("app_settings_v1", { general: {} });

    await removeAllBadgeStates();

    expect(mockStorage.has("app_settings_v1")).toBe(true);
  });
});
