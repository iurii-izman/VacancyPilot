// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Dexie schema migration tests — AOPS-05.
 *
 * Verify that the v6 schema extension with syncOutbox, opsCache, and opsMeta
 * tables preserves all existing v1–v5 tables.
 */

// ── Mock the database module ─────────────────────────────────────────────────

const metaStore = new Map<string, unknown>();

vi.mock("./database", () => ({
  db: {
    meta: {
      get: vi.fn((key: string) => {
        const value = metaStore.get(key);
        return Promise.resolve(
          value !== undefined ? { key, value } : undefined,
        );
      }),
      put: vi.fn((entry: { key: string; value: unknown }) => {
        metaStore.set(entry.key, entry.value);
        return Promise.resolve(entry.key);
      }),
    },
  },
}));

const {
  getStoredVersion,
  writeCurrentVersion,
  runMigrations,
  CURRENT_VERSION,
  ensureMigrationsBootstrapped,
} = await import("./migrations");

import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_VERSION, TABLE_NAMES } from "./schema";

beforeEach(() => {
  metaStore.clear();
  vi.clearAllMocks();
});

// ── Schema version upgrade tests ────────────────────────────────────────────

describe("Dexie schema v6 upgrade preserves old data", () => {
  it("SCHEMA_V6 includes all tables from SCHEMA_V5", () => {
    const v5Keys = Object.keys(SCHEMA_V5);
    for (const key of v5Keys) {
      expect(SCHEMA_V6).toHaveProperty(key);
    }
  });

  it("SCHEMA_V6 adds syncOutbox, opsCache, and opsMeta tables", () => {
    expect(SCHEMA_V6).toHaveProperty("syncOutbox");
    expect(SCHEMA_V6).toHaveProperty("opsCache");
    expect(SCHEMA_V6).toHaveProperty("opsMeta");
  });

  it("SCHEMA_V6 has exactly 3 more tables than SCHEMA_V5", () => {
    const v5Count = Object.keys(SCHEMA_V5).length;
    const v6Count = Object.keys(SCHEMA_V6).length;
    expect(v6Count).toBe(v5Count + 3);
  });

  it("SCHEMA_VERSION is 6", () => {
    expect(SCHEMA_VERSION).toBe(6);
  });

  it("TABLE_NAMES includes syncOutbox, opsCache, and opsMeta", () => {
    expect(TABLE_NAMES).toContain("syncOutbox");
    expect(TABLE_NAMES).toContain("opsCache");
    expect(TABLE_NAMES).toContain("opsMeta");
  });

  it("syncOutbox has the required indexes per contract", () => {
    const storeDef = SCHEMA_V6.syncOutbox;
    expect(storeDef).toContain("&id");
    expect(storeDef).toContain("entityType");
    expect(storeDef).toContain("operation");
    expect(storeDef).toContain("createdAt");
    expect(storeDef).toContain("retryCount");
  });

  it("opsCache has the required indexes per contract", () => {
    const storeDef = SCHEMA_V6.opsCache;
    expect(storeDef).toContain("&key");
    expect(storeDef).toContain("entityType");
    expect(storeDef).toContain("entityId");
  });
});

// ── Migration bookkeeping tests ─────────────────────────────────────────────

describe("migration bookkeeping with v6", () => {
  describe("getStoredVersion", () => {
    it("returns 0 when meta table is empty (first-run)", async () => {
      const version = await getStoredVersion();
      expect(version).toBe(0);
    });

    it("returns the stored version after writeCurrentVersion", async () => {
      await writeCurrentVersion();
      const version = await getStoredVersion();
      expect(version).toBe(CURRENT_VERSION);
    });
  });

  describe("writeCurrentVersion", () => {
    it("writes CURRENT_VERSION to meta table", async () => {
      await writeCurrentVersion();
      expect(metaStore.get("schemaVersion")).toBe(CURRENT_VERSION);
    });
  });

  describe("runMigrations", () => {
    it("first-run: writes CURRENT_VERSION when stored version is 0", async () => {
      await runMigrations();
      expect(metaStore.get("schemaVersion")).toBe(CURRENT_VERSION);
    });

    it("up-to-date: no-op when stored version equals CURRENT_VERSION", async () => {
      metaStore.set("schemaVersion", CURRENT_VERSION);
      await runMigrations();
      expect(metaStore.get("schemaVersion")).toBe(CURRENT_VERSION);
    });

    it("upgrades from v5 to v6 when stored version is 5", async () => {
      metaStore.set("schemaVersion", 5);
      await runMigrations();
      expect(metaStore.get("schemaVersion")).toBe(CURRENT_VERSION);
    });
  });

  describe("CURRENT_VERSION alignment", () => {
    it("matches SCHEMA_VERSION", () => {
      expect(CURRENT_VERSION).toBe(SCHEMA_VERSION);
    });

    it("is 6", () => {
      expect(CURRENT_VERSION).toBe(6);
    });
  });

  describe("ensureMigrationsBootstrapped", () => {
    it("runs migration bookkeeping only once across repeated calls", async () => {
      const first = ensureMigrationsBootstrapped();
      const second = ensureMigrationsBootstrapped();

      await Promise.all([first, second]);

      expect(metaStore.get("schemaVersion")).toBe(CURRENT_VERSION);
    });
  });
});

// ── Full schema chain verification ──────────────────────────────────────────

describe("schema chain integrity", () => {
  it("SCHEMA_V1 through SCHEMA_V6 are all defined", () => {
    expect(SCHEMA_V1).toBeDefined();
    expect(SCHEMA_V2).toBeDefined();
    expect(SCHEMA_V3).toBeDefined();
    expect(SCHEMA_V4).toBeDefined();
    expect(SCHEMA_V5).toBeDefined();
    expect(SCHEMA_V6).toBeDefined();
  });

  it("each version adds at least one table or alters an existing one", () => {
    // v2: changed jobs index
    expect(SCHEMA_V2.jobs).not.toBe(SCHEMA_V1.jobs);
    // v3: added labsActions
    expect(Object.keys(SCHEMA_V3)).toContain("labsActions");
    // v4: added hrTimeline
    expect(Object.keys(SCHEMA_V4)).toContain("hrTimeline");
    // v5: added visitMarks
    expect(Object.keys(SCHEMA_V5)).toContain("visitMarks");
    // v6: added syncOutbox, opsCache, opsMeta
    expect(Object.keys(SCHEMA_V6)).toContain("syncOutbox");
    expect(Object.keys(SCHEMA_V6)).toContain("opsCache");
    expect(Object.keys(SCHEMA_V6)).toContain("opsMeta");
  });

  it("core domain tables are preserved across all versions", () => {
    const coreTables = ["jobs", "companies", "profiles", "resumes", "coverLetters", "applications", "events", "aiCache", "meta"];
    for (const v of [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6]) {
      for (const table of coreTables) {
        expect(v).toHaveProperty(table);
      }
    }
  });
});
