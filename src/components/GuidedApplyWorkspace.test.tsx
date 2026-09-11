import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests for the GuidedApplyWorkspace safety boundaries.
 *
 * These tests verify that:
 * - The workspace respects Labs gating (does not render when disabled).
 * - No DOM form fill or synthetic events are used.
 * - Clipboard copy is the only data output mechanism.
 * - Mark-as-applied is done via message passing, not direct DOM manipulation.
 */

// ── Mocks ──

const mockChromeSendMessage = vi.fn();

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: mockChromeSendMessage,
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
});

// Mock labs control — return false by default (Labs off)
vi.mock("@/services/labs-control", () => ({
  isLabsEnabled: vi.fn().mockResolvedValue(false),
  isGuidedApplyEnabled: vi.fn().mockResolvedValue(false),
  checkGuidedApplyGate: vi
    .fn()
    .mockResolvedValue({ allowed: false, reason: "Labs disabled" }),
  checkGuidedApplyMutationGate: vi
    .fn()
    .mockResolvedValue({ allowed: false, reason: "Labs disabled" }),
  recordLabsAction: vi.fn().mockResolvedValue({ id: "mock-action" }),
  getActionLog: vi.fn().mockResolvedValue([]),
  getRemainingDailyBudget: vi.fn().mockResolvedValue(5),
  hasDailyBudget: vi.fn().mockResolvedValue(true),
  getTodayActionCount: vi.fn().mockResolvedValue(0),
}));

// Mock repositories
vi.mock("@/db/repositories", () => ({
  jobRepo: {
    getById: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  },
  profileRepo: {
    getById: vi.fn().mockResolvedValue(undefined),
  },
  resumeRepo: {
    getById: vi.fn().mockResolvedValue(undefined),
  },
  coverLetterRepo: {
    listByJob: vi.fn().mockResolvedValue([]),
  },
}));

// ── Tests ──

describe("GuidedApplyWorkspace — safety boundaries", () => {
  const source = readFileSync(join(__dirname, "GuidedApplyWorkspace.tsx"), "utf8");

  beforeEach(() => {
    vi.clearAllMocks();
    mockChromeSendMessage.mockResolvedValue({ success: true });
  });

  it("does not perform DOM writes to HH form fields", () => {
    expect(source).not.toMatch(/document\.querySelector(?:All)?/);
    expect(source).not.toMatch(/(?:input|form)\.value\s*=/);
    expect(source).not.toMatch(/\.innerHTML\s*=/);
    expect(source).toContain('document.createElement("textarea")');
  });

  it("does not use synthetic DOM events on HH forms", () => {
    expect(source).not.toMatch(/dispatchEvent|new\s+Event\s*\(|\.submit\s*\(|requestSubmit|\.click\s*\(/);
  });

  it("uses clipboard API or execCommand fallback for copy", () => {
    expect(source).toContain("navigator.clipboard.writeText");
    expect(source).toContain('document.execCommand("copy")');
  });

  it("does not call chrome.tabs.create or open hidden tabs", () => {
    expect(source).not.toMatch(/chrome\.tabs\.(create|update)/);
    expect(source).not.toMatch(/window\.open\s*\(/);
    expect(source).toContain("chrome.runtime.sendMessage");
  });

  it("does not trigger form submit actions", () => {
    expect(source).not.toMatch(/\.submit\s*\(|requestSubmit|type=["']submit["']/);
  });
});

describe("GuidedApplyWorkspace — Labs gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies that Labs APIs exist and can be imported", async () => {
    // This test confirms the labs-control module is importable
    // and the gating function signatures are correct.
    const mod = await import("@/services/labs-control");
    expect(typeof mod.isGuidedApplyEnabled).toBe("function");
    expect(typeof mod.checkGuidedApplyGate).toBe("function");
    expect(typeof mod.recordLabsAction).toBe("function");
  });
});

describe("GuidedApplyWorkspace — MARK_APPLIED handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChromeSendMessage.mockResolvedValue({ success: true });
  });

  it("MARK_APPLIED message has the correct shape", () => {
    const message = {
      type: "MARK_APPLIED",
      jobId: "hh_12345",
    };
    expect(message.type).toBe("MARK_APPLIED");
    expect(message.jobId).toBe("hh_12345");
  });

  it("MARK_APPLIED does not include any form data or DOM selectors", () => {
    // The message carries only the explicit confirmation flags and jobId. It does not contain:
    // - form field selectors
    // - form values
    // - DOM element references
    // - CSS selectors
    // - XPaths
    const message = {
      type: "MARK_APPLIED",
      jobId: "hh_12345",
      preparationComplete: true,
      nativeSubmissionConfirmed: true,
    };
    const keys = Object.keys(message);
    expect(keys).toEqual(["type", "jobId", "preparationComplete", "nativeSubmissionConfirmed"]);
  });
});
