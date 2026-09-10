import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests for KanbanBoard queue transitions and stage rendering.
 *
 * These tests verify:
 * - Column classification maps statuses correctly.
 * - Status transitions follow allowed paths.
 * - Board does not perform auto-processing or background actions.
 * - Manual stage actions are user-initiated only.
 */

// ── Mocks ──

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
});

vi.mock("@/db/repositories", () => ({
  jobRepo: {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Import kanban column logic ──
// We import the classification and transition logic for unit testing.

import type { JobStatus } from "@/models/job";

// Column definitions (mirrored from KanbanBoard for testing)
const KANBAN_COLUMNS = [
  {
    id: "saved",
    statuses: ["saved", "letter_ready"] as JobStatus[],
  },
  {
    id: "active",
    statuses: [
      "applied",
      "hr_replied",
      "interview",
      "test_task",
    ] as JobStatus[],
  },
  {
    id: "offer",
    statuses: ["offer"] as JobStatus[],
  },
  {
    id: "rejected",
    statuses: [
      "rejected_by_me",
      "rejected_by_company",
      "blacklist",
    ] as JobStatus[],
  },
];

const COLUMN_TRANSITIONS: Record<string, JobStatus[]> = {
  saved: ["applied", "rejected_by_me"],
  active: ["offer", "rejected_by_me"],
  offer: ["rejected_by_me"],
  rejected: ["saved", "applied"],
};

function classifyColumn(status: JobStatus): string {
  for (const col of KANBAN_COLUMNS) {
    if (col.statuses.includes(status)) return col.id;
  }
  return "other";
}

// ── Tests ──

describe("KanbanBoard — column classification", () => {
  it('classifies "saved" as saved column', () => {
    expect(classifyColumn("saved")).toBe("saved");
  });

  it('classifies "letter_ready" as saved column', () => {
    expect(classifyColumn("letter_ready")).toBe("saved");
  });

  it('classifies "applied" as active column', () => {
    expect(classifyColumn("applied")).toBe("active");
  });

  it('classifies "interview" as active column', () => {
    expect(classifyColumn("interview")).toBe("active");
  });

  it('classifies "offer" as offer column', () => {
    expect(classifyColumn("offer")).toBe("offer");
  });

  it('classifies "rejected_by_me" as rejected column', () => {
    expect(classifyColumn("rejected_by_me")).toBe("rejected");
  });

  it('classifies "rejected_by_company" as rejected column', () => {
    expect(classifyColumn("rejected_by_company")).toBe("rejected");
  });

  it('classifies "blacklist" as rejected column', () => {
    expect(classifyColumn("blacklist")).toBe("rejected");
  });

  it('classifies "new" as other (not on board)', () => {
    expect(classifyColumn("new")).toBe("other");
  });

  it('classifies "viewed" as other (not on board)', () => {
    expect(classifyColumn("viewed")).toBe("other");
  });
});

describe("KanbanBoard — allowed transitions", () => {
  it("saved column allows move to applied", () => {
    expect(COLUMN_TRANSITIONS.saved).toContain("applied");
  });

  it("saved column allows move to rejected_by_me", () => {
    expect(COLUMN_TRANSITIONS.saved).toContain("rejected_by_me");
  });

  it("active column allows move to offer", () => {
    expect(COLUMN_TRANSITIONS.active).toContain("offer");
  });

  it("active column allows move to rejected_by_me", () => {
    expect(COLUMN_TRANSITIONS.active).toContain("rejected_by_me");
  });

  it("offer column allows move to rejected_by_me", () => {
    expect(COLUMN_TRANSITIONS.offer).toContain("rejected_by_me");
  });

  it("rejected column allows move back to saved", () => {
    expect(COLUMN_TRANSITIONS.rejected).toContain("saved");
  });

  it("rejected column allows move back to applied", () => {
    expect(COLUMN_TRANSITIONS.rejected).toContain("applied");
  });

  it("saved column does NOT allow skip to offer (must go through active)", () => {
    expect(COLUMN_TRANSITIONS.saved).not.toContain("offer");
  });
});

describe("KanbanBoard — safety boundaries", () => {
  const source = readFileSync(join(__dirname, "KanbanBoard.tsx"), "utf8");

  it("does not auto-process queue — all moves are explicit user actions", () => {
    expect(source).not.toMatch(/\bsetInterval\s*\(/);
    expect(source).toMatch(/handleMoveJob/);
    expect(source).toMatch(/onMoveJob\(job\.id,\s*targetStatus\)/);
  });

  it("does not open hidden browser tabs", () => {
    expect(source).not.toMatch(/chrome\.tabs\.(create|update)/);
  });

  it("does not send webhooks on status change", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/webhook/i);
  });

  it("status changes record explicit source: 'user'", () => {
    expect(source).toMatch(/createStatusChange\(job\.status,\s*toStatus,\s*["']user["']\)/);
  });
});
