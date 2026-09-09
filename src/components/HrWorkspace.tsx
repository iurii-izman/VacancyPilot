// ── HR Workspace — local reply draft and follow-up workspace ──
// ITER-045: Phase 5 HR Communication Hub
//
// Allows the user to:
// - Review captured HR timeline entries for an application
// - Draft a manual reply (copy-only, no auto-send)
// - Set follow-up date and next-step notes
// - Update application state locally
//
// Rules (spec 3.3, 3.9):
// - No DOM writes into HH chat or form fields
// - No auto-reply or auto-send
// - Copy/paste based reply workflow
// - All state is local (Dexie + chrome.storage)

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type FormEvent,
} from "react";
import { hrTimelineRepo } from "@/db/hr-timeline-repository";
import { jobRepo } from "@/db/repositories";
import { db } from "@/db/database";
import { LoadingState } from "@/components/LoadingState";
import type { HrTimelineEntry, HrReplyType } from "@/models/hr-timeline";
import type { Application } from "@/models/application";
import type { Job } from "@/models/job";

// ── Props ──────────────────────────────────────────────────────────

export interface HrWorkspaceProps {
  /** Current vacancy job ID (hh_XXXXX) */
  jobId: string;
  /** Current job data (can be undefined if not tracked) */
  job?: Job;
  /** Callback to refresh parent state after changes */
  onRefresh: () => void;
  readOnly?: boolean;
}

// ── Reply type display helpers ─────────────────────────────────────

const REPLY_TYPE_LABELS: Record<HrReplyType, string> = {
  invitation: "Приглашение",
  rejection: "Отказ",
  question: "Вопрос",
  test_task: "Тестовое задание",
  interview: "Собеседование",
  unknown: "Неизвестно",
};

const REPLY_TYPE_COLORS: Record<HrReplyType, { bg: string; fg: string }> = {
  invitation: { bg: "#e6f7e6", fg: "#2a8" },
  rejection: { bg: "#fff0f0", fg: "#c44" },
  question: { bg: "#e6f0ff", fg: "#4a90d9" },
  test_task: { bg: "#fff8e6", fg: "#e6a817" },
  interview: { bg: "#f0e6ff", fg: "#84c" },
  unknown: { bg: "#f5f5f5", fg: "#999" },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatInputDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

// ── Component ──────────────────────────────────────────────────────

export function HrWorkspace({
  jobId,
  job,
  onRefresh,
  readOnly = false,
}: HrWorkspaceProps): ReactNode {
  const [application, setApplication] = useState<Application | null>(null);
  const [timeline, setTimeline] = useState<HrTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Reply draft
  const [draftReply, setDraftReply] = useState("");
  const [copied, setCopied] = useState(false);

  // Follow-up
  const [followUpDate, setFollowUpDate] = useState("");
  const [notes, setNotes] = useState("");

  // Status
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Draft persistence
  const draftStorageKey = `hr_draft_v1_${jobId}`;
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load data ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Find application for this job
      const apps = await db.applications.where("jobId").equals(jobId).toArray();
      apps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      const app = apps[0] ?? null;
      setApplication(app);

      if (app) {
        // Load HR timeline entries
        const entries = await hrTimelineRepo.listByApplication(app.id);
        setTimeline(entries);

        // Restore draft/saved state
        setFollowUpDate(app.followUpAt ? formatInputDate(app.followUpAt) : "");
        setNotes(app.notes ?? "");

        // Restore reply draft from chrome.storage.local
        try {
          const stored = await chrome.storage.local.get(draftStorageKey);
          const savedDraft = stored[draftStorageKey] as string | undefined;
          setDraftReply(savedDraft ?? "");
        } catch {
          // Non-critical
          setDraftReply("");
        }
      } else {
        setTimeline([]);
        setFollowUpDate("");
        setNotes("");
        setDraftReply("");
      }
    } catch {
      // Silently handle load errors
      setDraftReply("");
    } finally {
      setLoading(false);
    }
  }, [jobId, draftStorageKey]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Auto-save draft to chrome.storage.local (debounced) ────────

  useEffect(() => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      void chrome.storage.local.set({ [draftStorageKey]: draftReply });
    }, 500);
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, [draftReply, draftStorageKey]);

  // ── Save follow-up state ───────────────────────────────────────

  const handleSaveFollowUp = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSaveError(null);
      setSaveStatus(null);

      if (!application) return;
      if (readOnly) {
        setSaveError("HR follow-up writes are unavailable in Ops Mode until Fix 2.");
        return;
      }

      try {
        const updated: Application = {
          ...application,
          followUpAt: followUpDate
            ? new Date(followUpDate).toISOString()
            : undefined,
          notes: notes.trim() || undefined,
          updatedAt: new Date().toISOString(),
        };

        await db.applications.put(updated);
        setApplication(updated);
        setSaveStatus("Saved ✓");
        setTimeout(() => setSaveStatus(null), 2000);

        onRefresh();
      } catch (err: unknown) {
        setSaveError(err instanceof Error ? err.message : "Save failed");
      }
    },
    [application, followUpDate, notes, job, onRefresh, readOnly],
  );

  // ── Mark timeline entry as read ─────────────────────────────────

  const handleMarkRead = useCallback(
    async (entryId: string) => {
      const entry = timeline.find((e) => e.id === entryId);
      if (readOnly || !entry || entry.isRead) return;

      try {
        const updated: HrTimelineEntry = {
          ...entry,
          isRead: true,
          updatedAt: new Date().toISOString(),
        };
        await hrTimelineRepo.save(updated);
        setTimeline((prev) =>
          prev.map((e) => (e.id === entryId ? updated : e)),
        );
      } catch {
        // Non-critical
      }
    },
    [timeline, readOnly],
  );

  // ── Copy reply to clipboard ─────────────────────────────────────

  const handleCopyReply = useCallback(async () => {
    if (!draftReply.trim()) return;

    try {
      await navigator.clipboard.writeText(draftReply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers or missing clipboard permissions
      const textarea = document.createElement("textarea");
      textarea.value = draftReply;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [draftReply]);

  // ── Mark job as hr_replied ──────────────────────────────────────

  const handleMarkReplied = useCallback(async () => {
    if (!job || !application || job.status === "hr_replied") return;
    if (readOnly) {
      setSaveError("Marking HR replied is unavailable in Ops Mode until Fix 2.");
      return;
    }

    try {
      const now = new Date().toISOString();
      const updatedJob: Job = {
        ...job,
        status: "hr_replied",
        statusHistory: [
          ...job.statusHistory,
          {
            from: job.status,
            to: "hr_replied",
            at: now,
            source: "user",
            note: "Marked as replied from HR workspace",
          },
        ],
        updatedAt: now,
      };
      const updatedApplication: Application = {
        ...application,
        status: "hr_replied",
        statusHistory: [
          ...application.statusHistory,
          {
            from: application.status,
            to: "hr_replied",
            at: now,
            source: "user",
            note: "Marked as replied from HR workspace",
          },
        ],
        updatedAt: now,
      };

      await Promise.all([
        jobRepo.save(updatedJob),
        db.applications.put(updatedApplication),
      ]);
      setApplication(updatedApplication);
      onRefresh();
    } catch {
      // Non-critical
    }
  }, [application, job, onRefresh, readOnly]);

  // ── Loading state ──────────────────────────────────────────────

  if (loading) return <LoadingState message="Loading HR data…" />;

  // ── No application ─────────────────────────────────────────────

  if (!application) {
    return (
      <div style={{ padding: 20 }}>
        <div
          style={{
            padding: 16,
            background: "#fff8e6",
            border: "1px solid #e6a817",
            borderRadius: 6,
            fontSize: 13,
            color: "#8a6d14",
          }}
        >
          <strong>No application record found.</strong>
          <p style={{ margin: "8px 0 0" }}>
            Mark this vacancy as &ldquo;Applied&rdquo; in the Apply tab to start
            tracking HR communication.
          </p>
        </div>
      </div>
    );
  }

  // ── Main workspace ──────────────────────────────────────────────

  const unreadCount = timeline.filter((e) => !e.isRead).length;
  const replyCharCount = draftReply.length;

  return (
    <div style={{ fontSize: 13 }}>
      {/* ── Status header ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <span style={{ fontWeight: 600, color: "#1a3a5c" }}>
            HR Communication
          </span>
          {unreadCount > 0 && (
            <span
              style={{
                marginLeft: 8,
                background: "#4a90d9",
                color: "#fff",
                borderRadius: 10,
                padding: "1px 7px",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {unreadCount} new
            </span>
          )}
        </div>
        {job && job.status !== "hr_replied" && (
          <button
            type="button"
            onClick={() => void handleMarkReplied()}
            disabled={readOnly}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              cursor: readOnly ? "not-allowed" : "pointer",
              border: "1px solid #4a90d9",
              borderRadius: 4,
              background: "#e6f0ff",
              color: "#4a90d9",
              fontWeight: 500,
            }}
          >
            Mark as HR replied
          </button>
        )}
        {job?.status === "hr_replied" && (
          <span
            style={{
              fontSize: 11,
              color: "#2a8",
              fontWeight: 600,
            }}
          >
            ✓ HR replied
          </span>
        )}
      </div>

      {/* ── Timeline ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <h3
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 8,
          }}
        >
          Timeline ({timeline.length})
          {unreadCount > 0 && (
            <span style={{ color: "#4a90d9", marginLeft: 6 }}>
              · {unreadCount} unread
            </span>
          )}
        </h3>

        {timeline.length === 0 ? (
          <div
            style={{
              padding: 16,
              background: "#f9f9f9",
              borderRadius: 6,
              color: "#999",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            No HR communication captured yet.
            <br />
            Open an HH negotiation page to extract timeline data.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {timeline.map((entry) => {
              const colors = REPLY_TYPE_COLORS[entry.type];
              return (
                <div
                  key={entry.id}
                  onClick={readOnly ? undefined : () => void handleMarkRead(entry.id)}
                  style={{
                    padding: 10,
                    background: entry.isRead ? "#f9f9f9" : "#fff",
                    border: `1px solid ${entry.isRead ? "#eee" : colors.fg}40`,
                    borderRadius: 6,
                    cursor: entry.isRead || readOnly ? "default" : "pointer",
                    opacity: entry.isRead ? 0.8 : 1,
                    transition: "border-color 0.2s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 7px",
                        borderRadius: 3,
                        fontSize: 11,
                        fontWeight: 600,
                        background: colors.bg,
                        color: colors.fg,
                      }}
                    >
                      {REPLY_TYPE_LABELS[entry.type]}
                    </span>
                    <span style={{ fontSize: 11, color: "#999" }}>
                      {entry.extractedAt ? formatDate(entry.extractedAt) : ""}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#555",
                      lineHeight: 1.4,
                      maxHeight: 80,
                      overflow: "hidden",
                    }}
                  >
                    {entry.rawText.length > 300
                      ? entry.rawText.slice(0, 300) + "…"
                      : entry.rawText}
                  </div>
                  {!entry.isRead && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 10,
                        color: "#4a90d9",
                      }}
                    >
                      {readOnly ? "Read-state changes are unavailable in Ops Mode." : "Click to mark as read"}
                    </div>
                  )}
                  {entry.isRead && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 10,
                        color: "#aaa",
                      }}
                    >
                      ✓ Read
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Reply Draft ────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <h3
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 8,
          }}
        >
          Reply Draft
        </h3>
        <textarea
          value={draftReply}
          onChange={(e) => setDraftReply(e.target.value)}
          placeholder="Write your reply here…&#10;&#10;This is a local draft. Use Copy to transfer to HH manually."
          rows={6}
          style={{
            width: "100%",
            padding: 8,
            fontSize: 12,
            fontFamily: "system-ui, sans-serif",
            border: "1px solid #ddd",
            borderRadius: 4,
            resize: "vertical",
            boxSizing: "border-box",
            lineHeight: 1.5,
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 4,
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 10, color: "#bbb" }}>
            {replyCharCount} character{replyCharCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={() => void handleCopyReply()}
            disabled={!draftReply.trim()}
            style={{
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 600,
              cursor: draftReply.trim() ? "pointer" : "not-allowed",
              border: "1px solid #4a90d9",
              borderRadius: 4,
              background: copied ? "#e6f7e6" : "#4a90d9",
              color: copied ? "#2a8" : "#fff",
              opacity: draftReply.trim() ? 1 : 0.5,
              transition: "background 0.2s",
            }}
          >
            {copied ? "✓ Copied!" : "📋 Copy to Clipboard"}
          </button>
          <span style={{ fontSize: 10, color: "#999" }}>
            Paste into HH chat manually — no auto-send
          </span>
        </div>
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            background: "#fff8e6",
            border: "1px solid #e6a817",
            borderRadius: 4,
            fontSize: 11,
            color: "#8a6d14",
          }}
        >
          <strong>⚠ Manual only:</strong> Copy your reply, then paste it into
          the HH chat yourself. This extension never sends messages
          automatically.
        </div>
      </div>

      {/* ── Follow-up Planning ─────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h3
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 8,
          }}
        >
          Follow-up Plan
        </h3>

        <form onSubmit={(e) => void handleSaveFollowUp(e)}>
          {/* Follow-up date */}
          <div style={{ marginBottom: 10 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "#555",
                marginBottom: 4,
              }}
            >
              Follow-up date
            </label>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              disabled={readOnly}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 12,
                border: "1px solid #ddd",
                borderRadius: 4,
                boxSizing: "border-box",
              }}
            />
            {followUpDate && (
              <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                Reminder will appear in the dashboard when approaching this
                date.
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 10 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "#555",
                marginBottom: 4,
              }}
            >
              Notes / Next steps
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={readOnly}
              placeholder="E.g.: Prepare portfolio, research company, follow up on Friday…"
              rows={3}
              style={{
                width: "100%",
                padding: 8,
                fontSize: 12,
                fontFamily: "system-ui, sans-serif",
                border: "1px solid #ddd",
                borderRadius: 4,
                resize: "vertical",
                boxSizing: "border-box",
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Save button + status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <button
              type="submit"
              disabled={readOnly}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                cursor: readOnly ? "not-allowed" : "pointer",
                border: "1px solid #2a8",
                borderRadius: 4,
                background: saveStatus ? "#e6f7e6" : "#e6f7e6",
                color: "#2a8",
              }}
            >
              {saveStatus ? "✓ Saved" : "Save Follow-up"}
            </button>
            {saveStatus && (
              <span style={{ fontSize: 12, color: "#2a8" }}>{saveStatus}</span>
            )}
            {saveError && (
              <span style={{ fontSize: 12, color: "#c44" }}>{saveError}</span>
            )}
          </div>
        </form>
        {readOnly && <p style={{ fontSize: 11, color: "#8a6d14" }}>Ops Mode shows the current HR projection read-only. Follow-up and status writes are deferred until Fix 2.</p>}
      </div>

      {/* ── Application info ───────────────────────────────────── */}
      <div
        style={{
          padding: "8px 10px",
          background: "#f5f5f5",
          borderRadius: 4,
          fontSize: 11,
          color: "#999",
        }}
      >
        Application ID: {application.id.slice(0, 8)}…
        {application.appliedAt && (
          <> · Applied: {formatDate(application.appliedAt)}</>
        )}
        {application.channel && <> · Via: {application.channel}</>}
      </div>
    </div>
  );
}
