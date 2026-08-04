/**
 * Manifest Safety Tests — ITER-015.
 *
 * Assert that the WXT manifest configuration contains only expected permissions
 * and does not include any forbidden or overly broad permissions.
 *
 * These tests read wxt.config.ts as text and verify the manifest block
 * against the spec (section 9.1, 9.2).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Helpers ─────────────────────────────────────────────────────────────

const configPath = join(__dirname, "..", "..", "wxt.config.ts");

function readConfig(): string {
  return readFileSync(configPath, "utf-8");
}

/** Extract a TypeScript array literal value from the config text. */
function extractArrayValue(source: string, key: string): string[] {
  // Match: key: ["item1", "item2"] or key: []
  const re = new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`, "s");
  const match = source.match(re);
  if (!match) return [];
  const inner = match[1].trim();
  if (inner.length === 0) return [];
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/** Extract a string value from the config text. */
function extractStringValue(source: string, key: string): string | null {
  const re = new RegExp(`${key}\\s*:\\s*["']([^"']+)["']`);
  const match = source.match(re);
  return match ? match[1] : null;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("manifest permission safety", () => {
  const config = readConfig();

  // ── Permission assertions ──────────────────────────────────────────

  describe("permissions", () => {
    const permissions = extractArrayValue(config, "permissions");

    it("declares the permissions array", () => {
      expect(permissions.length).toBeGreaterThan(0);
    });

    it('includes only allowed permissions: "storage", "sidePanel", "activeTab"', () => {
      const allowed = new Set(["storage", "sidePanel", "activeTab"]);
      const unknown = permissions.filter((p) => !allowed.has(p));
      expect(unknown).toEqual([]);
    });

    it.each(["storage", "sidePanel", "activeTab"])('includes "%s"', (perm) => {
      expect(permissions).toContain(perm);
    });
  });

  // ── host_permissions assertions ────────────────────────────────────

  describe("host_permissions", () => {
    const hostPermissions = extractArrayValue(config, "host_permissions");

    it("is empty (no broad host permissions)", () => {
      expect(hostPermissions).toEqual([]);
    });
  });

  // ── optional_permissions assertions ────────────────────────────────

  describe("optional_permissions", () => {
    const optionalPerms = extractArrayValue(config, "optional_permissions");

    it("is empty in MVP", () => {
      expect(optionalPerms).toEqual([]);
    });
  });

  describe("optional_host_permissions", () => {
    const optionalHostPerms = extractArrayValue(
      config,
      "optional_host_permissions",
    );

    it("allows only the narrow OpenAI runtime origin and loopback companion", () => {
      expect(optionalHostPerms).toEqual([
        "https://api.openai.com/*",
        "http://127.0.0.1:8765/*",
      ]);
    });
  });

  // ── Forbidden permissions ──────────────────────────────────────────

  describe("forbidden permissions are not present anywhere in config", () => {
    const forbiddenPatterns = [
      "downloads",
      "cookies",
      "webRequest",
      "webRequestBlocking",
      "notifications",
      "history",
      "tabs", // not needed in MVP; activeTab covers present use case
      "scripting", // not needed in MVP; content scripts are declared statically
      "clipboardRead",
      "clipboardWrite",
      "nativeMessaging",
    ];

    it.each(forbiddenPatterns)('does not include "%s"', (forbidden) => {
      // Check all permission arrays in the config
      const allArrays = [
        "permissions",
        "host_permissions",
        "optional_permissions",
        "optional_host_permissions",
      ];
      for (const key of allArrays) {
        const values = extractArrayValue(config, key);
        expect(values).not.toContain(forbidden);
      }
    });
  });

  // ── Manifest structure assertions ──────────────────────────────────

  describe("manifest structure", () => {
    it("uses manifest_version 3", () => {
      // wxt 0.19 kept manifest_version inside manifest{};
      // wxt 0.20+ uses manifestVersion at config top-level.
      // Both are valid; the generated output always gets manifest_version: 3.
      expect(config).toMatch(
        /manifest_version\s*:\s*3\b|manifestVersion\s*:\s*3\b/,
      );
    });

    it("has a name", () => {
      const name = extractStringValue(config, "name");
      expect(name).toBeTruthy();
      expect(name!.length).toBeGreaterThan(0);
    });

    it("has a version string", () => {
      const version = extractStringValue(config, "version");
      expect(version).toBeTruthy();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("has icon paths", () => {
      expect(config).toMatch(/icons\s*:/);
    });
  });
});

// ── Content script match pattern assertions ─────────────────────────────

describe("content script safety boundaries", () => {
  const config = readConfig();

  it("wxt.config does not declare broad host match patterns in permissions", () => {
    // Host permissions should not include "<all_urls>" or wildcard patterns
    const hostPerms = extractArrayValue(config, "host_permissions");
    const broadPatterns = hostPerms.filter(
      (p) => p.includes("<all_urls>") || p.includes("*://*"),
    );
    expect(broadPatterns).toEqual([]);
  });

  it("wxt.config optional host access stays narrow", () => {
    const optionalHosts = extractArrayValue(config, "optional_host_permissions");
    const unsafePatterns = optionalHosts.filter(
      (p) => p.includes("hh.ru") || p.includes("*://*"),
    );
    expect(unsafePatterns).toEqual([]);

    // All optional host permissions must be loopback (127.0.0.1:8765) or the known OpenAI origin.
    const unknown = optionalHosts.filter(
      (p) =>
        p !== "https://api.openai.com/*" &&
        p !== "http://127.0.0.1:8765/*",
    );
    expect(unknown).toEqual([]);
  });
});
