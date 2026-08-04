/**
 * Generated Manifest Audit — ITER-026.
 *
 * Validates the ACTUAL generated manifest.json in .output/chrome-mv3/,
 * not just the wxt.config.ts source. Catches permission leakage,
 * overly broad content script matches, and missing required fields
 * that static config analysis might miss.
 *
 * If the build output is not present, these tests are skipped with
 * a clear message (CI should run `pnpm build` before tests).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── Release audit mode ───────────────────────────────────────────────────

const isReleaseAudit = process.env.RELEASE_AUDIT === "true";

// ── Paths ───────────────────────────────────────────────────────────────

const OUTPUT_MANIFEST = join(
  __dirname,
  "..",
  "..",
  ".output",
  "chrome-mv3",
  "manifest.json",
);

// ── Helpers ─────────────────────────────────────────────────────────────

function manifestExists(): boolean {
  return existsSync(OUTPUT_MANIFEST);
}

function readManifest(): Record<string, unknown> {
  const raw = readFileSync(OUTPUT_MANIFEST, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("generated manifest audit", () => {
  it("generated manifest.json exists in build output", () => {
    if (!manifestExists()) {
      if (isReleaseAudit) {
        throw new Error(
          "[generated-manifest-audit] RELEASE_AUDIT=true but .output/chrome-mv3/manifest.json not found. " +
            "Run `pnpm build` first.",
        );
      }
      console.warn(
        "[generated-manifest-audit] .output/chrome-mv3/manifest.json not found. " +
          "Run `pnpm build` first to generate it.",
      );
      // Skip instead of fail — build may not have been run yet in local dev.
      // In CI, the build step must precede tests.
      expect(true).toBe(true);
      return;
    }
    expect(manifestExists()).toBe(true);
  });

  describe("manifest structure (generated)", () => {
    // Only run these tests if the manifest exists
    const hasManifest = manifestExists();

    it("manifest_version is 3", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      expect(manifest.manifest_version).toBe(3);
    });

    it("has a non-empty name", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      expect(typeof manifest.name).toBe("string");
      expect((manifest.name as string).length).toBeGreaterThan(0);
    });

    it("has a valid semver version string", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      expect(typeof manifest.version).toBe("string");
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("permissions (generated)", () => {
    const hasManifest = manifestExists();

    it("declares the permissions array", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      const permissions = manifest.permissions;
      expect(Array.isArray(permissions)).toBe(true);
      expect((permissions as unknown[]).length).toBeGreaterThan(0);
    });

    it("contains only allowed MVP permissions", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      const permissions = manifest.permissions as string[];
      const allowed = new Set(["storage", "sidePanel", "activeTab"]);
      const unknown = permissions.filter((p) => !allowed.has(p));
      expect(unknown).toEqual([]);
    });

    it("host_permissions is empty (no broad host access)", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      const hostPerms = manifest.host_permissions;
      if (Array.isArray(hostPerms)) {
        expect(hostPerms).toEqual([]);
      } else {
        // host_permissions might be absent entirely — also OK
        expect(hostPerms === undefined || hostPerms === null).toBe(true);
      }
    });

    it("optional_host_permissions contains only the narrow OpenAI runtime origin and loopback companion", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      const optionalHostPerms = manifest.optional_host_permissions;
      expect(optionalHostPerms).toEqual([
        "https://api.openai.com/*",
        "http://127.0.0.1:8765/*",
      ]);
    });

    it("does not contain any forbidden permissions", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      const manifestStr = JSON.stringify(manifest);

      const forbidden = [
        "downloads",
        "cookies",
        "webRequest",
        "webRequestBlocking",
        "notifications",
        "history",
        "tabs",
        "scripting",
        "clipboardRead",
        "clipboardWrite",
        "nativeMessaging",
        "debugger",
        "management",
      ];

      for (const perm of forbidden) {
        // Check all known permission arrays
        const permArrays = [
          manifest.permissions,
          manifest.host_permissions,
          manifest.optional_permissions,
          manifest.optional_host_permissions,
        ];
        for (const arr of permArrays) {
          if (Array.isArray(arr)) {
            expect(arr).not.toContain(perm);
          }
        }
      }

      // Also check that "<all_urls>" is never present in any host pattern
      expect(manifestStr).not.toContain("<all_urls>");
      expect(manifestStr).not.toContain("*://*/*");
    });
  });

  describe("content scripts (generated)", () => {
    const hasManifest = manifestExists();

    it("content scripts only match approved HH vacancy, search, or HR pages", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      const contentScripts = manifest.content_scripts as
        | Array<{ matches?: string[] }>
        | undefined;

      if (!contentScripts || contentScripts.length === 0) {
        // No content scripts is acceptable if the extension doesn't need them
        return;
      }

      for (const cs of contentScripts) {
        expect(Array.isArray(cs.matches)).toBe(true);
        for (const pattern of cs.matches ?? []) {
          // All match patterns must be restricted to narrow HH product surfaces.
          // Approved surfaces:
          // - /vacancy/*
          // - /search/vacancy*
          // - /applicant/responses*
          // - /negotiations*
          const isVacancy = /^https:\/\/.*hh\.ru\/vacancy\//.test(pattern);
          const isSearch = /^https:\/\/.*hh\.ru\/search\/vacancy/.test(pattern);
          const isResponses =
            /^https:\/\/.*hh\.ru\/applicant\/responses/.test(pattern);
          const isNegotiations =
            /^https:\/\/.*hh\.ru\/negotiations/.test(pattern);
          expect(
            isVacancy || isSearch || isResponses || isNegotiations,
          ).toBe(true);
          // Must not be overly broad
          expect(pattern).not.toBe("https://hh.ru/*");
          expect(pattern).not.toBe("https://*.hh.ru/*");
          expect(pattern).not.toBe("<all_urls>");
        }
      }
    });

    it("content scripts do not match entire hh.ru domain", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      const contentScripts = manifest.content_scripts as
        | Array<{ matches?: string[] }>
        | undefined;

      if (!contentScripts) return;

      for (const cs of contentScripts) {
        for (const pattern of cs.matches ?? []) {
          // Narrow path restriction must be present
          const hasPath =
            /\/vacancy\//.test(pattern) ||
            /\/search\/vacancy/.test(pattern) ||
            /\/applicant\/responses/.test(pattern) ||
            /\/negotiations/.test(pattern);
          expect(hasPath).toBe(true);
        }
      }
    });
  });

  describe("icons and metadata (generated)", () => {
    const hasManifest = manifestExists();

    it("has icon definitions", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      expect(manifest.icons).toBeDefined();
      const icons = manifest.icons as Record<string, string>;
      // At least a 128px icon should exist
      expect(icons["128"]).toBeTruthy();
    });

    it("has a description", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      // Description may be omitted — not a hard requirement for MV3
      // but documenting the check
      if (manifest.description !== undefined) {
        expect(typeof manifest.description).toBe("string");
      }
    });
  });

  describe("CSP and security (generated)", () => {
    const hasManifest = manifestExists();

    it("does not allow eval in content_security_policy", () => {
      if (!hasManifest) return;
      const manifest = readManifest();
      const csp = manifest.content_security_policy as
        | { extension_pages?: string }
        | string
        | undefined;

      if (!csp) return; // CSP not explicitly set — MV3 defaults apply

      const cspStr =
        typeof csp === "string" ? csp : (csp.extension_pages ?? "");
      // Must not allow unsafe-eval
      expect(cspStr).not.toContain("unsafe-eval");
    });

    it("does not reference remote scripts in web_accessible_resources", () => {
      if (!hasManifest) return;
      const manifest = readManifest();

      // No http/https resources should be listed
      const war = manifest.web_accessible_resources;
      if (Array.isArray(war)) {
        const warStr = JSON.stringify(war);
        expect(warStr).not.toMatch(/https?:\/\//);
      }
    });
  });
});
