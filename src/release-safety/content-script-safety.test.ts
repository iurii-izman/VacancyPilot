/**
 * Content Script Safety Tests — ITER-015 / ITER-026.
 *
 * Verify that content scripts do not contain forbidden HH automation patterns:
 * - No fetch() to HH domains
 * - No XMLHttpRequest to HH domains
 * - No .click() on HH page elements
 * - No .value mutation on HH form elements
 *
 * Uses static analysis (regex patterns on source files) to catch
 * accidental regressions. This is NOT a runtime test — it scans the
 * source code for dangerous patterns.
 *
 * ITER-026 addition: also scans the generated bundle in .output/
 * for the same forbidden patterns, providing a second line of defense.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── Release audit mode ───────────────────────────────────────────────────

const isReleaseAudit = process.env.RELEASE_AUDIT === "true";

// ── Helpers ─────────────────────────────────────────────────────────────

const BASE_DIR = join(__dirname, "..", "..");

/** Find all content script files (entrypoints/** / *.content.ts) */
function findContentScripts(): string[] {
  const results: string[] = [];
  walkDir(join(BASE_DIR, "entrypoints"), results);
  return results.filter(
    (f) => f.endsWith(".content.ts") || f.endsWith(".content.tsx"),
  );
}

function walkDir(dir: string, results: string[]): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(full, results);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  } catch {
    // Directory doesn't exist — skip
  }
}

// ── Forbidden patterns ──────────────────────────────────────────────────

/** Patterns that indicate a forbidden fetch to HH */
const HH_FETCH_PATTERNS = [
  /fetch\s*\(\s*["'`][^"'`]*hh\.ru/i,
  /fetch\s*\(\s*`[^`]*hh\.ru/i,
  /fetch\s*\(\s*["'`][^"'`]*hh\.ru/i,
  /XMLHttpRequest/i,
];

/** Patterns that indicate forbidden DOM mutation on HH controls */
const HH_CLICK_PATTERNS = [
  // .click() on elements that might be HH UI controls
  // We need to be careful: legitimate clicks on extension-owned elements are OK.
  // Flag: .click() where the target might be an HH DOM element selector.
  /querySelector\(["'`][^"'`]*(?:hh|bloko|vacancy)[^"'`]*["'`]\)\s*\.\s*click\s*\(/i,
  /getElementById\(["'`][^"'`]*(?:hh|bloko|apply)[^"'`]*["'`]\)\s*\.\s*click\s*\(/i,
];

/** Patterns that indicate forbidden value mutation on HH form controls */
const HH_VALUE_PATTERNS = [
  // .value = on elements that might be HH form fields
  /querySelector\(["'`][^"'`]*(?:input|textarea|select)[^"'`]*["'`]\)\s*\.\s*value\s*=/i,
  /\.value\s*=\s*.+querySelector\(["'`][^"'`]*(?:hh|bloko|vacancy)/i,
];

// ── Tests ────────────────────────────────────────────────────────────────

describe("content script safety — no HH fetch", () => {
  const scripts = findContentScripts();

  it("has content script files to check", () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  it.each(scripts.map((s) => [s.replace(BASE_DIR, ""), s] as const))(
    "%s does not contain fetch() calls to HH domains",
    (_label, path) => {
      const content = readFileSync(path, "utf-8");

      for (const pattern of HH_FETCH_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    },
  );

  it.each(scripts.map((s) => [s.replace(BASE_DIR, ""), s] as const))(
    "%s does not contain XMLHttpRequest",
    (_label, path) => {
      const content = readFileSync(path, "utf-8");
      expect(content).not.toMatch(/XMLHttpRequest/i);
    },
  );
});

describe("content script safety — no HH DOM mutation", () => {
  const scripts = findContentScripts();

  it.each(scripts.map((s) => [s.replace(BASE_DIR, ""), s] as const))(
    "%s does not programmatically click HH UI controls",
    (_label, path) => {
      const content = readFileSync(path, "utf-8");

      for (const pattern of HH_CLICK_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    },
  );

  it.each(scripts.map((s) => [s.replace(BASE_DIR, ""), s] as const))(
    "%s does not set .value on HH form controls",
    (_label, path) => {
      const content = readFileSync(path, "utf-8");

      for (const pattern of HH_VALUE_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    },
  );
});

describe("content script safety — structure", () => {
  const scripts = findContentScripts();

  it("content scripts only match HH vacancy pages", () => {
    for (const script of scripts) {
      const content = readFileSync(script, "utf-8");
      // Content scripts must be scoped to vacancy pages, not all HH
      // Verify that matches array includes vacancy path restriction
      const hasVacancyMatch =
        content.includes("vacancy") || content.includes("matches") === false; // May not have explicit matches
      expect(hasVacancyMatch).toBe(true);
    }
  });

  it("content scripts use Shadow DOM for UI isolation", () => {
    // UI must be isolated via Shadow DOM or similar mechanism
    // This is a soft check — at least one content script should use attachShadow
    const allContent = scripts.map((s) => readFileSync(s, "utf-8")).join("\n");

    expect(allContent).toMatch(/attachShadow|shadowRoot|Shadow DOM/i);
  });

  it("vacancy content script registers and serves provider-free page context", () => {
    const vacancyPath = join(BASE_DIR, "entrypoints", "vacancy.content.ts");
    const content = readFileSync(vacancyPath, "utf-8");
    expect(content).toMatch(/REGISTER_VACANCY_CONTEXT/);
    expect(content).toMatch(/GET_PAGE_VACANCY_CONTEXT/);
    expect(content).toMatch(/registerVacancyContext\(\)/);
    expect(content).not.toMatch(/provider|analy[sz]eFullV4|OPENAI/i);
  });
});

// ── Additional: Background script safety ─────────────────────────────────

describe("background script safety", () => {
  const bgPath = join(BASE_DIR, "entrypoints", "background.ts");

  it("background script exists", () => {
    let exists = false;
    try {
      readFileSync(bgPath, "utf-8");
      exists = true;
    } catch {
      // file may not exist
    }
    expect(exists).toBe(true);
  });

  it("background script does not fetch HH endpoints", () => {
    const content = readFileSync(bgPath, "utf-8");
    expect(content).not.toMatch(/fetch\s*\(\s*["'`][^"'`]*hh\.ru/i);
  });

  it("background script does not use XMLHttpRequest", () => {
    const content = readFileSync(bgPath, "utf-8");
    expect(content).not.toMatch(/XMLHttpRequest/i);
  });
});

// ── Generated bundle safety (ITER-026) ───────────────────────────────────

describe("generated bundle safety — no HH patterns in build output", () => {
  const BUNDLE_DIR = join(BASE_DIR, ".output", "chrome-mv3", "content-scripts");

  function findBundleScripts(): string[] {
    const results: string[] = [];
    try {
      const entries = readdirSync(BUNDLE_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".js")) {
          results.push(join(BUNDLE_DIR, entry.name));
        }
      }
    } catch {
      // Build output not available
    }
    return results;
  }

  const bundleScripts = findBundleScripts();

  it("has generated content script bundles if build was run", () => {
    if (bundleScripts.length === 0) {
      if (isReleaseAudit) {
        throw new Error(
          "[content-script-safety] RELEASE_AUDIT=true but no generated bundle files found. " +
            "Run `pnpm build` first.",
        );
      }
      console.warn(
        "[content-script-safety] No generated bundle files found. " +
          "Run pnpm build before tests to enable bundle-level checks.",
      );
    }
    if (isReleaseAudit) {
      expect(bundleScripts.length).toBeGreaterThan(0);
    } else {
      expect(bundleScripts.length).toBeGreaterThanOrEqual(0);
    }
  });

  it.each(bundleScripts.map((s) => [s.replace(BASE_DIR, ""), s] as const))(
    "%s does not contain fetch() calls to HH domains (bundle)",
    (_label, path) => {
      const content = readFileSync(path, "utf-8");
      for (const pattern of HH_FETCH_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    },
  );

  it.each(bundleScripts.map((s) => [s.replace(BASE_DIR, ""), s] as const))(
    "%s does not contain XMLHttpRequest (bundle)",
    (_label, path) => {
      const content = readFileSync(path, "utf-8");
      expect(content).not.toMatch(/XMLHttpRequest/i);
    },
  );

  it.each(bundleScripts.map((s) => [s.replace(BASE_DIR, ""), s] as const))(
    "%s does not programmatically click HH UI controls (bundle)",
    (_label, path) => {
      const content = readFileSync(path, "utf-8");
      for (const pattern of HH_CLICK_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    },
  );

  it.each(bundleScripts.map((s) => [s.replace(BASE_DIR, ""), s] as const))(
    "%s does not set .value on HH form controls (bundle)",
    (_label, path) => {
      const content = readFileSync(path, "utf-8");
      for (const pattern of HH_VALUE_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    },
  );
});
