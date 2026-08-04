// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  exportAllJson,
  generateJobsCsv,
  downloadJson,
  downloadCsv,
  downloadUrl,
} from "./export-data";
import type { ExportEnvelope } from "./export-data";
import {
  deleteAllData,
  deleteJobData,
  deleteAiCacheAndEventLog,
  hasData,
  getDataCounts,
} from "./delete-all";
import { defaultSettings, saveSettings } from "@/db/settings-bridge";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockStorage = new Map<string, unknown>();

beforeEach(() => {
  mockStorage.clear();
  // Clear mock Dexie tables between tests
  for (const key of Object.keys(mockTables)) {
    delete mockTables[key];
  }
});

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: async (
        keys?: string | string[] | Record<string, unknown> | null,
      ) => {
        const result: Record<string, unknown> = {};
        if (keys === null || keys === undefined) {
          // Return all keys
          for (const [key, value] of mockStorage.entries()) {
            result[key] = value;
          }
        } else if (typeof keys === "string") {
          result[keys] = mockStorage.get(keys) ?? undefined;
        } else if (Array.isArray(keys)) {
          for (const key of keys) {
            result[key] = mockStorage.get(key) ?? undefined;
          }
        } else {
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

// Mock Dexie database — IndexedDB is not available in vitest (Node environment),
// so we mock the relevant operations.
const mockTables: Record<string, unknown[]> = {};

function getPrimaryKey(row: unknown): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const value = row as Record<string, unknown>;
  const key = value.id ?? value.key;
  return typeof key === "string" ? key : undefined;
}

function ensureTable(name: string): unknown[] {
  if (!mockTables[name]) mockTables[name] = [];
  return mockTables[name];
}

function makeCollection(name: string, predicate: (row: unknown) => boolean) {
  return {
    toArray: async () => ensureTable(name).filter(predicate),
    count: async () => ensureTable(name).filter(predicate).length,
    first: async () => ensureTable(name).find(predicate),
    delete: async () => {
      const rows = ensureTable(name);
      const kept = rows.filter((row) => !predicate(row));
      const deleted = rows.length - kept.length;
      mockTables[name] = kept;
      return deleted;
    },
  };
}

function makeTable(name: string) {
  return {
    toArray: async () => [...ensureTable(name)] as unknown[],
    clear: async () => {
      ensureTable(name).length = 0;
    },
    count: async () => ensureTable(name).length,
    get: async (key: string) =>
      ensureTable(name).find((row) => getPrimaryKey(row) === key),
    put: async (item: unknown) => {
      const key = getPrimaryKey(item);
      const rows = ensureTable(name);
      if (key) {
        const index = rows.findIndex((row) => getPrimaryKey(row) === key);
        if (index >= 0) {
          rows[index] = item;
          return;
        }
      }
      rows.push(item);
    },
    bulkPut: async (items: unknown[]) => {
      for (const item of items) {
        await makeTable(name).put(item);
      }
    },
    delete: async (key: string) => {
      const rows = ensureTable(name);
      mockTables[name] = rows.filter((row) => getPrimaryKey(row) !== key);
    },
    bulkDelete: async (keys: string[]) => {
      const keySet = new Set(keys);
      const rows = ensureTable(name);
      mockTables[name] = rows.filter((row) => {
        const key = getPrimaryKey(row);
        return !key || !keySet.has(key);
      });
    },
    where: (query: string | Record<string, unknown>) => {
      if (typeof query === "string") {
        // Handle compound index queries like '[prop1+prop2]'
        const compoundMatch = query.match(/^\[(.+)\+(.+)\]$/);
        if (compoundMatch) {
          const [, prop1, prop2] = compoundMatch;
          return {
            equals: (value: unknown) =>
              makeCollection(name, (row) => {
                if (!row || typeof row !== "object") return false;
                const r = row as Record<string, unknown>;
                if (!Array.isArray(value) || value.length < 2) return false;
                return r[prop1] === value[0] && r[prop2] === value[1];
              }),
          };
        }
        return {
          equals: (value: unknown) =>
            makeCollection(name, (row) => {
              if (!row || typeof row !== "object") return false;
              return (row as Record<string, unknown>)[query] === value;
            }),
        };
      }

      return makeCollection(name, (row) => {
        if (!row || typeof row !== "object") return false;
        const value = row as Record<string, unknown>;
        return Object.entries(query).every(
          ([key, expected]) => value[key] === expected,
        );
      });
    },
    orderBy: () => ({
      reverse: () => ({
        toArray: async () => [...ensureTable(name)].reverse(),
      }),
    }),
  };
}

vi.mock("@/db", () => {
  const TABLE_NAMES = [
    "jobs",
    "companies",
    "profiles",
    "resumes",
    "coverLetters",
    "applications",
    "events",
    "aiCache",
    "labsActions",
    "hrTimeline",
    "visitMarks",
    "syncOutbox",
    "opsCache",
    "opsMeta",
    "meta",
  ];

  const db = {
    table: (name: string) => makeTable(name),
    get jobs() {
      return makeTable("jobs");
    },
    get companies() {
      return makeTable("companies");
    },
    get profiles() {
      return makeTable("profiles");
    },
    get resumes() {
      return makeTable("resumes");
    },
    get coverLetters() {
      return makeTable("coverLetters");
    },
    get applications() {
      return makeTable("applications");
    },
    get events() {
      return makeTable("events");
    },
    get aiCache() {
      return makeTable("aiCache");
    },
    get labsActions() {
      return makeTable("labsActions");
    },
    get hrTimeline() {
      return makeTable("hrTimeline");
    },
    get visitMarks() {
      return makeTable("visitMarks");
    },
    get syncOutbox() {
      return makeTable("syncOutbox");
    },
    get opsCache() {
      return makeTable("opsCache");
    },
    get opsMeta() {
      return makeTable("opsMeta");
    },
    get meta() {
      return makeTable("meta");
    },
  };

  return {
    TABLE_NAMES,
    db,
  };
});

vi.mock("@/db/repositories", () => ({
  visitMarkRepo: {
    findBySourceId: async (sourceId: string) =>
      ensureTable("visitMarks").find(
        (row) =>
          !!row &&
          typeof row === "object" &&
          (row as Record<string, unknown>).sourceId === sourceId,
      ),
    deleteBySourceId: async (sourceId: string) => {
      const rows = ensureTable("visitMarks");
      const kept = rows.filter((row) => {
        if (!row || typeof row !== "object") return true;
        return (row as Record<string, unknown>).sourceId !== sourceId;
      });
      const deleted = rows.length - kept.length;
      mockTables.visitMarks = kept;
      return deleted;
    },
    save: async (mark: Record<string, unknown>) => {
      const rows = ensureTable("visitMarks");
      const index = rows.findIndex(
        (row) => row && typeof row === "object" && (row as Record<string, unknown>).id === mark.id,
      );
      if (index >= 0) {
        rows[index] = mark;
      } else {
        rows.push(mark);
      }
    },
  },
}));

vi.mock("./ai-cache", () => ({
  invalidateCache: async () => {
    const count = ensureTable("aiCache").length;
    mockTables.aiCache = [];
    return count;
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function seedTable(name: string, rows: Record<string, unknown>[]): void {
  mockTables[name] = [...rows];
}

// ── JSON Export Tests ──────────────────────────────────────────────────────

describe("exportAllJson", () => {
  it("returns a versioned envelope with exportedAt timestamp", async () => {
    const envelope = await exportAllJson();

    expect(envelope.version).toBe(2);
    expect(envelope.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("includes all table names in data", async () => {
    const envelope = await exportAllJson();

    expect(envelope.data).toHaveProperty("jobs");
    expect(envelope.data).toHaveProperty("companies");
    expect(envelope.data).toHaveProperty("profiles");
    expect(envelope.data).toHaveProperty("resumes");
    expect(envelope.data).toHaveProperty("coverLetters");
    expect(envelope.data).toHaveProperty("applications");
    expect(envelope.data).toHaveProperty("events");
    expect(envelope.data).toHaveProperty("aiCache");
    expect(envelope.data).toHaveProperty("labsActions");
    expect(envelope.data).toHaveProperty("hrTimeline");
    expect(envelope.data).toHaveProperty("visitMarks");
    expect(envelope.data).toHaveProperty("meta");
  });

  it("exports actual table data when present", async () => {
    seedTable("jobs", [
      { id: "hh_123", title: "Frontend Dev", companyName: "Acme" },
      { id: "hh_456", title: "Backend Dev", companyName: "Beta" },
    ]);

    const envelope = await exportAllJson();

    expect(envelope.data.jobs).toHaveLength(2);
    expect(envelope.data.jobs[0]).toMatchObject({
      id: "hh_123",
      title: "Frontend Dev",
    });
  });

  it("includes redacted settings", async () => {
    const envelope = await exportAllJson();

    expect(envelope.settings).toBeDefined();
    expect(envelope.settings.schemaVersion).toBe(1);
    expect(envelope.settings.general.language).toBe("ru");
  });

  it("redacts n8n webhook URL in settings export", async () => {
    const settings = defaultSettings();
    settings.n8n.webhookUrl = "https://secret.example.com/webhook";
    settings.n8n.hmacSecretSet = true;
    await saveSettings(settings);

    const envelope = await exportAllJson();

    expect(envelope.settings.n8n.webhookUrl).toBe("[REDACTED]");
    expect(envelope.settings.n8n.hmacSecretSet).toBe(false);
  });

  it("each table data is an array", async () => {
    const envelope = await exportAllJson();

    for (const [, value] of Object.entries(envelope.data)) {
      expect(Array.isArray(value)).toBe(true);
    }
  });

  it("JSON.stringify produces valid JSON", async () => {
    const envelope = await exportAllJson();
    const json = JSON.stringify(envelope);

    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json) as ExportEnvelope;
    expect(parsed.version).toBe(2);
  });
});

// ── CSV Export Tests ───────────────────────────────────────────────────────

describe("generateJobsCsv", () => {
  it("returns header row when given empty array", () => {
    const csv = generateJobsCsv([]);

    expect(csv).toContain("ID,Source Vacancy ID,Title,Company");
  });

  it("generates one data row per job", () => {
    const jobs = [
      {
        id: "hh_1",
        sourceVacancyId: "123",
        title: "React Dev",
        companyName: "Acme",
        companyId: "hh_co_acme",
        status: "viewed",
        city: "Moscow",
        workMode: "remote",
        salaryRaw: "100000-150000",
        salaryMin: 100000,
        salaryMax: 150000,
        salaryCurrency: "RUB",
        experienceRaw: "1-3",
        employmentType: "full_time",
        schedule: "full_day",
        skills: ["React", "TypeScript"],
        firstSeenAt: "2025-01-01T00:00:00.000Z",
        lastSeenAt: "2025-01-02T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
        sourceUrl: "https://hh.ru/vacancy/123",
        selectedProfileId: "prof_1",
      },
    ];

    const csv = generateJobsCsv(jobs);

    // Should contain header
    expect(csv).toContain("ID,Source Vacancy ID,Title,Company");
    // Should contain data
    expect(csv).toContain("hh_1");
    expect(csv).toContain("React Dev");
    expect(csv).toContain("Acme");
    // Skills joined with semicolon
    expect(csv).toContain("React; TypeScript");
  });

  it("escapes cells containing commas", () => {
    const jobs = [
      {
        id: "hh_1",
        sourceVacancyId: "123",
        title: "Dev, Senior",
        companyName: "Acme, Inc.",
        companyId: "hh_co_acme",
        status: "viewed",
        city: "Moscow",
        workMode: "remote",
        salaryRaw: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        experienceRaw: null,
        employmentType: null,
        schedule: null,
        skills: [],
        firstSeenAt: "",
        lastSeenAt: "",
        updatedAt: "",
        sourceUrl: "",
        selectedProfileId: "",
      },
    ];

    const csv = generateJobsCsv(jobs);

    expect(csv).toContain('"Dev, Senior"');
    expect(csv).toContain('"Acme, Inc."');
  });

  it("escapes cells containing quotes", () => {
    const jobs = [
      {
        id: "hh_1",
        sourceVacancyId: "123",
        title: 'Dev "Ninja"',
        companyName: "Acme",
        companyId: "hh_co_acme",
        status: "viewed",
        city: "Moscow",
        workMode: "remote",
        salaryRaw: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        experienceRaw: null,
        employmentType: null,
        schedule: null,
        skills: [],
        firstSeenAt: "",
        lastSeenAt: "",
        updatedAt: "",
        sourceUrl: "",
        selectedProfileId: "",
      },
    ];

    const csv = generateJobsCsv(jobs);

    // Should have escaped quotes: "Dev ""Ninja"""
    expect(csv).toContain('Dev ""Ninja""');
  });

  it("prepends UTF-8 BOM", () => {
    const csv = generateJobsCsv([]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("uses CRLF line endings", () => {
    const csv = generateJobsCsv([]);

    expect(csv).toContain("\r\n");
  });

  it("extracts score fields from ruleScore", () => {
    const jobs = [
      {
        id: "hh_1",
        sourceVacancyId: "123",
        title: "Dev",
        companyName: "Acme",
        companyId: "hh_co_acme",
        status: "viewed",
        city: null,
        workMode: "remote",
        salaryRaw: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        experienceRaw: null,
        employmentType: null,
        schedule: null,
        skills: [],
        firstSeenAt: "",
        lastSeenAt: "",
        updatedAt: "",
        sourceUrl: "",
        selectedProfileId: "",
        ruleScore: { total: 72, recommendation: "apply" },
      },
    ];

    const csv = generateJobsCsv(jobs);

    expect(csv).toContain("72");
    expect(csv).toContain("apply");
  });

  it("produces stable column order matching column definition count", () => {
    const csv = generateJobsCsv([]);
    const headerLine = csv.split("\r\n")[0];
    // Remove BOM for counting
    const cleanHeader = headerLine.replace(/^\uFEFF/, "");
    const columns = cleanHeader.split(",");
    // 23 columns defined in JOB_CSV_COLUMNS
    expect(columns.length).toBe(23);
  });
});

// ── Delete All Data Tests ─────────────────────────────────────────────────

describe("deleteAllData", () => {
  it("clears all Dexie tables including visitMarks", async () => {
    seedTable("jobs", [{ id: "hh_1" }]);
    seedTable("events", [{ id: "evt_1" }]);
    seedTable("profiles", [{ id: "prof_1" }]);
    seedTable("hrTimeline", [{ id: "hrt_1", applicationId: "app_1" }]);
    seedTable("visitMarks", [{ id: "vm_1", sourceId: "123" }]);

    expect(mockTables.jobs).toHaveLength(1);
    expect(mockTables.events).toHaveLength(1);
    expect(mockTables.profiles).toHaveLength(1);
    expect(mockTables.hrTimeline).toHaveLength(1);
    expect(mockTables.visitMarks).toHaveLength(1);

    await deleteAllData();

    expect(mockTables.jobs).toHaveLength(0);
    expect(mockTables.events).toHaveLength(0);
    expect(mockTables.profiles).toHaveLength(0);
    expect(mockTables.hrTimeline).toHaveLength(0);
    expect(mockTables.visitMarks).toHaveLength(0);
  });

  it("removes known product keys from chrome.storage.local", async () => {
    mockStorage.set("app_settings_v1", { schemaVersion: 1 });
    mockStorage.set("some_other_key", "should survive");

    await deleteAllData();

    expect(mockStorage.has("app_settings_v1")).toBe(false);
    // Other keys should NOT be deleted
    expect(mockStorage.get("some_other_key")).toBe("should survive");
  });

  it("does not throw when tables are already empty", async () => {
    await expect(deleteAllData()).resolves.toBeUndefined();
  });

  it("removes all badge_v1_hh_* keys from chrome.storage.local", async () => {
    mockStorage.set("badge_v1_hh_12345", { score: 85, status: "saved" });
    mockStorage.set("badge_v1_hh_67890", { score: 42, status: "viewed" });
    mockStorage.set("app_settings_v1", { schemaVersion: 1 });
    mockStorage.set("some_other_key", "should survive");

    await deleteAllData();

    expect(mockStorage.has("badge_v1_hh_12345")).toBe(false);
    expect(mockStorage.has("badge_v1_hh_67890")).toBe(false);
    expect(mockStorage.has("app_settings_v1")).toBe(false);
    expect(mockStorage.get("some_other_key")).toBe("should survive");
  });
});

describe("deleteJobData", () => {
  it("deletes a job and related cover letters, applications, events, hrTimeline, and visitMarks", async () => {
    seedTable("jobs", [
      { id: "hh_1", title: "Keep me not", sourceVacancyId: "12345" },
      { id: "hh_2", title: "Keep me", sourceVacancyId: "67890" },
    ]);
    seedTable("coverLetters", [
      { id: "cl_1", jobId: "hh_1" },
      { id: "cl_2", jobId: "hh_2" },
    ]);
    seedTable("applications", [
      { id: "app_1", jobId: "hh_1" },
      { id: "app_2", jobId: "hh_2" },
    ]);
    seedTable("events", [
      { id: "evt_1", jobId: "hh_1" },
      { id: "evt_2", jobId: "hh_2" },
    ]);
    seedTable("hrTimeline", [
      { id: "hrt_1", applicationId: "app_1" },
      { id: "hrt_2", applicationId: "app_1" },
      { id: "hrt_3", applicationId: "app_2" },
    ]);
    seedTable("visitMarks", [
      { id: "hh_vacancy_12345", sourceId: "12345" },
      { id: "hh_vacancy_67890", sourceId: "67890" },
    ]);

    const result = await deleteJobData("hh_1");

    expect(result.coverLettersDeleted).toBe(1);
    expect(result.applicationsDeleted).toBe(1);
    expect(result.eventsDeleted).toBe(1);
    expect(result.hrTimelineDeleted).toBe(2);
    expect(result.visitMarksDeleted).toBe(1);
    expect(mockTables.jobs).toEqual([
      { id: "hh_2", title: "Keep me", sourceVacancyId: "67890" },
    ]);
    expect(mockTables.coverLetters).toEqual([{ id: "cl_2", jobId: "hh_2" }]);
    expect(mockTables.applications).toEqual([{ id: "app_2", jobId: "hh_2" }]);
    expect(mockTables.events).toEqual([{ id: "evt_2", jobId: "hh_2" }]);
    // Only hrTimeline for surviving application should remain
    expect(mockTables.hrTimeline).toEqual([
      { id: "hrt_3", applicationId: "app_2" },
    ]);
    expect(mockTables.visitMarks).toEqual([
      { id: "hh_vacancy_67890", sourceId: "67890" },
    ]);
  });

  it("removes badge_v1_hh_ key for the deleted job", async () => {
    mockStorage.set("badge_v1_hh_12345", { score: 85, status: "saved" });
    mockStorage.set("badge_v1_hh_67890", { score: 42, status: "viewed" });
    mockStorage.set("some_other_key", "should survive");

    seedTable("jobs", [
      { id: "hh_12345", sourceVacancyId: "12345", title: "Delete me" },
    ]);

    await deleteJobData("hh_12345");

    expect(mockStorage.has("badge_v1_hh_12345")).toBe(false);
    // Other badge keys survive
    expect(mockStorage.has("badge_v1_hh_67890")).toBe(true);
    expect(mockStorage.get("some_other_key")).toBe("should survive");
  });

  it("throws when the target job does not exist", async () => {
    await expect(deleteJobData("missing")).rejects.toThrow(
      "Job not found: missing",
    );
  });
});

describe("deleteAiCacheAndEventLog", () => {
  it("clears AI cache and event log without touching jobs", async () => {
    seedTable("jobs", [{ id: "hh_1" }]);
    seedTable("aiCache", [{ id: "cache_1" }, { id: "cache_2" }]);
    seedTable("events", [{ id: "evt_1" }]);

    const result = await deleteAiCacheAndEventLog();

    expect(result.cacheEntriesDeleted).toBe(2);
    expect(result.eventLogEntriesDeleted).toBe(1);
    expect(mockTables.aiCache).toHaveLength(0);
    expect(mockTables.events).toHaveLength(0);
    expect(mockTables.jobs).toEqual([{ id: "hh_1" }]);
  });
});

describe("hasData", () => {
  it("returns false when all tables are empty", async () => {
    const result = await hasData();
    expect(result).toBe(false);
  });

  it("returns true when any table has data", async () => {
    seedTable("jobs", [{ id: "hh_1" }]);
    const result = await hasData();
    expect(result).toBe(true);
  });

  it("returns true when hrTimeline has data", async () => {
    seedTable("hrTimeline", [{ id: "hrt_1", applicationId: "app_1" }]);
    const result = await hasData();
    expect(result).toBe(true);
  });
});

describe("getDataCounts", () => {
  it("returns zero counts for empty tables", async () => {
    const counts = await getDataCounts();

    expect(counts.jobs).toBe(0);
    expect(counts.companies).toBe(0);
    expect(Object.keys(counts).length).toBe(15);
  });

  it("returns correct counts", async () => {
    seedTable("jobs", [{ id: "hh_1" }, { id: "hh_2" }]);
    seedTable("events", [{ id: "evt_1" }]);
    seedTable("visitMarks", [{ id: "vm_1", sourceId: "123" }]);

    const counts = await getDataCounts();

    expect(counts.jobs).toBe(2);
    expect(counts.events).toBe(1);
    expect(counts.companies).toBe(0);
    expect(counts.visitMarks).toBe(1);
  });

  it("includes hrTimeline in counts", async () => {
    seedTable("hrTimeline", [
      { id: "hrt_1", applicationId: "app_1" },
      { id: "hrt_2", applicationId: "app_1" },
      { id: "hrt_3", applicationId: "app_2" },
    ]);

    const counts = await getDataCounts();

    expect(counts.hrTimeline).toBe(3);
    expect(Object.keys(counts)).toContain("hrTimeline");
  });

  it("includes visitMarks in counts", async () => {
    seedTable("visitMarks", [
      { id: "vm_1", sourceId: "123" },
      { id: "vm_2", sourceId: "456" },
    ]);

    const counts = await getDataCounts();

    expect(counts.visitMarks).toBe(2);
    expect(Object.keys(counts)).toContain("visitMarks");
  });
});

// ── API Key Exclusion Tests ───────────────────────────────────────────────

describe("sensitive data exclusion", () => {
  it("settings exported via exportAllJson never contain webhookUrl in plain text", async () => {
    const settings = defaultSettings();
    settings.n8n.webhookUrl = "https://my-n8n.example.com/hook";
    await saveSettings(settings);

    const envelope = await exportAllJson();

    expect(envelope.settings.n8n.webhookUrl).toBe("[REDACTED]");
  });

  it("settings export does not expose hmacSecretSet as true", async () => {
    const settings = defaultSettings();
    settings.n8n.hmacSecretSet = true;
    await saveSettings(settings);

    const envelope = await exportAllJson();

    expect(envelope.settings.n8n.hmacSecretSet).toBe(false);
  });

  it("sensitive storage keys are not included in the export envelope data", async () => {
    // Simulate a hypothetical API key stored in chrome.storage.local
    mockStorage.set("openai_api_key", "sk-12345");
    mockStorage.set("app_settings_v1", defaultSettings());

    const envelope = await exportAllJson();

    // The envelope data comes from Dexie tables, not chrome.storage.local raw keys.
    // Settings are loaded via loadSettings() which only reads app_settings_v1.
    // Verify the envelope itself does not contain raw storage key data.
    const json = JSON.stringify(envelope);
    expect(json).not.toContain("sk-12345");
    expect(json).not.toContain("openai_api_key");
  });
});

// ── Download Helpers (non-DOM) Tests ──────────────────────────────────────

describe("downloadJson", () => {
  it("creates a Blob and triggers download (unit-level smoke)", () => {
    // We can't fully test DOM anchor clicks in vitest without happy-dom setup,
    // but we verify the function doesn't throw on valid input.
    const envelope: ExportEnvelope = {
      version: 2,
      exportedAt: "2025-06-19T00:00:00.000Z",
      data: {},
      settings: defaultSettings(),
    };

    expect(() => downloadJson(envelope)).not.toThrow();
  });
});

describe("downloadCsv", () => {
  it("does not throw on valid CSV string", () => {
    const csv = generateJobsCsv([]);
    expect(() => downloadCsv(csv, "test.csv")).not.toThrow();
  });
});

describe("downloadUrl", () => {
  it("creates and clicks an anchor element", () => {
    // Verify the function creates an <a>, clicks it, and removes it
    expect(() => downloadUrl("blob:test", "test.json")).not.toThrow();

    // After downloadUrl, the anchor should be removed from DOM
    const anchors = document.querySelectorAll("a");
    // The anchor is removed after click, so it should not remain
    expect(anchors.length).toBe(0);
  });
});
