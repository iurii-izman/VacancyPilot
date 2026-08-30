import { ErrorBoundary } from "@/components/ErrorBoundary";
import { KanbanBoard } from "@/components/KanbanBoard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { ProfileManager } from "@/components/ProfileManager";
import { ResumeManager } from "@/components/ResumeManager";
import { AISettingsSection } from "@/components/AISettingsSection";
import { SearchHighlightsSection } from "@/components/SearchHighlightsSection";
import { AboutSection } from "@/components/AboutSection";
import { OnboardingSection } from "@/components/OnboardingSection";
import { PermissionsSection } from "@/components/PermissionsSection";
import { PrivacyDisclosureSection } from "@/components/PrivacyDisclosureSection";
import { CompanionSettings } from "@/components/CompanionSettings";
import { CommandCenter, Inbox, ApplicationWorkspace } from "@/components/ApplicationOpsWorkspace";
import { PerformanceSection } from "@/components/PerformanceSection";
import { useState, useCallback, useEffect, type ReactNode } from "react";
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
  borderRadius,
  shellBody,
  appTitle,
  appSubtitle,
  headerBar,
  scrollArea,
} from "@/styles";

import {
  exportAllJson,
  downloadJson,
  generateJobsCsv,
  downloadCsv,
} from "@/services/export-data";
import {
  deleteAllData,
  deleteJobData,
  deleteAiCacheAndEventLog,
  getDataCounts,
} from "@/services/delete-all";
import { getActionLog, getRemainingDailyBudget } from "@/services/labs-control";
import { getReminders, getDailySummary } from "@/services/reminders";
import type {
  ReminderItem,
  DailySummary as DailySummaryType,
} from "@/services/reminders";
import { loadSettings, saveSettings } from "@/db/settings-bridge";
import { db, ensureMigrationsBootstrapped } from "@/db";
import type { JobStatus } from "@/models/job";
import type { LabsActionLog } from "@/models/labs-action-log";

type SectionId =
  | "command"
  | "inbox"
  | "vacancies"
  | "summary"
  | "applications"
  | "companies"
  | "profiles"
  | "resumes"
  | "letters"
  | "events"
  | "labs"
  | "export"
  | "settings"
  | "privacy"
  | "permissions"
  | "companion"
  | "about"
  | "onboarding"
  | "debug";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: string;
}

interface SectionGroup {
  label: string;
  sections: SectionDef[];
}

const SECTION_GROUPS: SectionGroup[] = [
  {
    label: "Work",
    sections: [
      { id: "command", label: "Command Center", icon: "🎯" },
      { id: "inbox", label: "Inbox", icon: "📥" },
      { id: "vacancies", label: "Vacancies", icon: "📋" },
      { id: "summary", label: "Summary", icon: "📊" },
      { id: "applications", label: "Applications", icon: "📨" },
      { id: "companies", label: "Companies", icon: "🏢" },
    ],
  },
  {
    label: "Profile",
    sections: [
      { id: "profiles", label: "Profiles", icon: "👤" },
      { id: "resumes", label: "Resumes", icon: "📄" },
      { id: "letters", label: "Letters", icon: "✉️" },
    ],
  },
  {
    label: "System",
    sections: [
      { id: "export", label: "Export", icon: "📦" },
      { id: "settings", label: "Settings", icon: "⚙️" },
      { id: "privacy", label: "Privacy", icon: "🔒" },
      { id: "permissions", label: "Permissions", icon: "🔑" },
      { id: "companion", label: "Companion", icon: "🖥️" },
      { id: "about", label: "About", icon: "ℹ️" },
    ],
  },
  {
    label: "Advanced",
    sections: [
      { id: "labs", label: "Labs", icon: "🧪" },
      { id: "events", label: "Events", icon: "📜" },
      { id: "debug", label: "Debug", icon: "🛠️" },
      { id: "onboarding", label: "Onboarding", icon: "🚀" },
    ],
  },
];

// Flattened navigation structure with group labels

function useWindowWidth(): number {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024,
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function DashboardContent(): ReactNode {
  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    // If opened via onInstalled or with #onboarding hash, show onboarding first.
    if (
      typeof window !== "undefined" &&
      window.location.hash === "#onboarding"
    ) {
      // Clear the hash so back/forward navigation works normally.
      window.history.replaceState(null, "", window.location.pathname);
      return "onboarding";
    }
    return "command";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const windowWidth = useWindowWidth();

  useEffect(() => {
    const navigate = (event: Event) => {
      const target = (event as CustomEvent<SectionId>).detail;
      if (target === "inbox" || target === "vacancies") setActiveSection(target);
    };
    window.addEventListener("vacancypilot:navigate", navigate);
    return () => window.removeEventListener("vacancypilot:navigate", navigate);
  }, []);

  const handleSectionClick = useCallback(
    (section: SectionId) => {
      setActiveSection(section);
      // Auto-collapse sidebar on narrow widths after selection
      if (windowWidth < 760) setSidebarCollapsed(true);
    },
    [windowWidth],
  );

  // Responsive breakpoints (per audit P0-04):
  //   >= 1000: full sidebar with labels (200px)
  //   760-999: compact icon-only sidebar (56px)
  //   < 760:   compact collapsible (56px, can be hidden)
  const sidebarFull = windowWidth >= 1000;
  const sidebarNarrow = windowWidth < 760;
  const showLabels = sidebarFull;

  const FULL_WIDTH = 200;
  const COMPACT_WIDTH = 56;

  const sidebarWidth = sidebarNarrow
    ? sidebarCollapsed
      ? 0
      : COMPACT_WIDTH
    : sidebarFull
      ? FULL_WIDTH
      : COMPACT_WIDTH;

  // Group label style (only visible in full mode)
  const groupLabelStyle: React.CSSProperties = {
    padding: "10px 14px 4px",
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textFaint,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    userSelect: "none",
  };

  return (
    <div
      style={{
        ...shellBody,
        display: "flex",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Sidebar toggle for narrow widths */}
      {sidebarNarrow && (
        <button
          type="button"
          onClick={() => setSidebarCollapsed((v) => !v)}
          aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
          style={{
            position: "absolute",
            top: 8,
            left: sidebarCollapsed ? 4 : COMPACT_WIDTH + 4,
            zIndex: 10,
            padding: "4px 8px",
            fontSize: fontSizes.sm,
            cursor: "pointer",
            border: `1px solid ${colors.borderLight}`,
            borderRadius: borderRadius.md,
            background: colors.white,
            color: colors.textMuted,
            transition: "left 0.2s",
          }}
        >
          {sidebarCollapsed ? "☰" : "✕"}
        </button>
      )}

      {/* Sidebar */}
      <nav
        style={{
          width: sidebarWidth,
          flexShrink: 0,
          borderRight: sidebarWidth > 0 ? `1px solid ${colors.border}` : "none",
          background: colors.cardBg,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.2s",
        }}
        aria-hidden={sidebarWidth === 0}
      >
        {/* Fixed header */}
        <div style={headerBar}>
          {showLabels ? (
            <>
              <h1 style={appTitle}>VacancyPilot</h1>
              <p style={appSubtitle}>Dashboard</p>
            </>
          ) : (
            <h1 style={{ ...appTitle, fontSize: fontSizes.cardHeading }}>VP</h1>
          )}
        </div>

        {/* Scrollable nav list */}
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: "4px 0",
            flex: 1,
            overflow: "auto",
          }}
        >
          {SECTION_GROUPS.map((group, gi) => (
            <li key={group.label}>
              {showLabels && <div style={groupLabelStyle}>{group.label}</div>}
              {gi > 0 && !showLabels && (
                <div
                  style={{
                    margin: "4px 14px",
                    borderTop: `1px solid ${colors.borderHairline}`,
                  }}
                />
              )}
              {group.sections.map((section) => {
                const buttonPadding = showLabels ? "8px 14px" : "8px 0";
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => handleSectionClick(section.id)}
                      aria-label={section.label}
                      title={showLabels ? undefined : section.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: showLabels ? "flex-start" : "center",
                        gap: showLabels ? 8 : 0,
                        width: "100%",
                        padding: buttonPadding,
                        fontSize: fontSizes.md,
                        cursor: "pointer",
                        border: "none",
                        borderLeft:
                          activeSection === section.id
                            ? `3px solid ${colors.blue}`
                            : "3px solid transparent",
                        background:
                          activeSection === section.id
                            ? colors.activeBg
                            : "transparent",
                        color:
                          activeSection === section.id
                            ? colors.blue
                            : colors.textSecondary,
                        fontWeight:
                          activeSection === section.id
                            ? fontWeights.semibold
                            : fontWeights.normal,
                        textAlign: "left",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      <span aria-hidden="true">{section.icon}</span>
                      {showLabels && section.label}
                    </button>
                  </li>
                );
              })}
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content area */}
      <main
        style={{
          flex: 1,
          ...scrollArea,
          overflow: "auto",
          padding: spacing.section,
          background: colors.white,
        }}
      >
        <SectionContent section={activeSection} />
      </main>
    </div>
  );
}

// ── Pure helpers for vacancy rendering ──

/** Map score total to a display color. */
export function scoreColor(total: number | undefined): string {
  if (total === undefined) return "#999";
  if (total >= 85) return "#2a8";
  if (total >= 70) return "#6a6";
  if (total >= 50) return "#e6a817";
  return "#c44";
}

/** Map job status to a badge color. */
export function statusBadgeStyle(status: JobStatus): {
  bg: string;
  fg: string;
} {
  switch (status) {
    case "applied":
    case "interview":
    case "offer":
      return { bg: "#e6f7e6", fg: "#2a8" };
    case "saved":
    case "letter_ready":
      return { bg: "#e6f0ff", fg: "#4a90d9" };
    case "rejected_by_me":
    case "rejected_by_company":
    case "blacklist":
      return { bg: "#fff0f0", fg: "#c44" };
    case "test_task":
    case "hr_replied":
      return { bg: "#fff8e6", fg: "#e6a817" };
    default:
      return { bg: "#f5f5f5", fg: "#999" };
  }
}

/** Human-readable label for a JobStatus value. */
export function statusLabel(status: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    new: "New",
    viewed: "Viewed",
    saved: "Saved",
    rejected_by_me: "Rejected",
    letter_ready: "Letter ready",
    applied: "Applied",
    hr_replied: "HR replied",
    interview: "Interview",
    test_task: "Test task",
    rejected_by_company: "Rejected by co.",
    offer: "Offer",
    blacklist: "Blacklisted",
  };
  return labels[status] ?? status;
}

/** Format an ISO-8601 timestamp to a short date. */
export function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${dd}.${mm}.${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function SectionContent({ section }: { section: SectionId }): ReactNode {
  switch (section) {
    case "command":
      return <CommandCenter onNavigate={(target) => window.dispatchEvent(new CustomEvent("vacancypilot:navigate", { detail: target }))} />;
    case "inbox":
      return <Inbox />;
    case "vacancies":
      return <KanbanBoard />;
    case "summary":
      return <PerformanceSection />;
    case "applications":
      return <ApplicationWorkspace />;
    case "companies":
      return (
        <EmptyState
          icon="🏢"
          message="No companies yet"
          description="Companies are created automatically from saved vacancies."
        />
      );
    case "profiles":
      return <ProfileManager />;
    case "resumes":
      return <ResumeManager />;
    case "letters":
      return (
        <EmptyState
          icon="✉️"
          message="No cover letters yet"
          description="Generate cover letters from the side panel on a vacancy page."
        />
      );
    case "events":
      return (
        <EmptyState
          icon="📜"
          message="No events yet"
          description="Activity log will appear as you use the extension."
        />
      );
    case "labs":
      return <LabsSection />;
    case "export":
      return <ExportSection />;
    case "settings":
      return (
        <>
          <AISettingsSection />
          <div style={{ height: 24 }} />
          <SearchHighlightsSection />
        </>
      );
    case "privacy":
      return (
        <>
          <PrivacyDisclosureSection />
          <div style={{ height: 24 }} />
          <PrivacySection />
        </>
      );
    case "permissions":
      return <PermissionsSection />;
    case "companion":
      return <CompanionSettings />;
    case "about":
      return <AboutSection />;
    case "onboarding":
      return <OnboardingSection />;
    case "debug":
      return (
        <EmptyState
          icon="🛠️"
          message="Debug tools"
          description="Parser debug mode, raw HTML inspection, and local logs."
        />
      );
  }
}

// ── Export Section ───────────────────────────────────────────────────────

type ExportStatus = "idle" | "loading" | "error" | "done";

function ExportSection(): ReactNode {
  const [jsonStatus, setJsonStatus] = useState<ExportStatus>("idle");
  const [csvStatus, setCsvStatus] = useState<ExportStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleExportJson = useCallback(async () => {
    setJsonStatus("loading");
    setErrorMsg("");
    try {
      const envelope = await exportAllJson();
      downloadJson(envelope);
      setJsonStatus("done");
    } catch (err) {
      setJsonStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Export failed");
    }
  }, []);

  const handleExportCsv = useCallback(async () => {
    setCsvStatus("loading");
    setErrorMsg("");
    try {
      const jobs = await db.jobs.toArray();
      const csv = generateJobsCsv(jobs);
      downloadCsv(
        csv,
        `vacancy-pilot-jobs-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      setCsvStatus("done");
    } catch (err) {
      setCsvStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "CSV export failed");
    }
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>
        Export Your Data
      </h2>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "#666" }}>
        Download your vacancies, cover letters, settings, and event history. API
        keys and secrets are never included in exports.
      </p>

      {errorMsg && (
        <ErrorState
          message="Export failed"
          details={errorMsg}
          onRetry={() => setErrorMsg("")}
        />
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* JSON Export */}
        <div
          style={{
            flex: "1 1 240px",
            padding: 16,
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
            JSON Export
          </h3>
          <p style={{ fontSize: 11, color: "#888", margin: "0 0 12px" }}>
            Full data archive with version envelope — suitable for backup,
            migration, or import into another VacancyPilot instance.
          </p>
          <button
            type="button"
            onClick={handleExportJson}
            disabled={jsonStatus === "loading"}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              cursor: jsonStatus === "loading" ? "not-allowed" : "pointer",
              border: "1px solid #4a90d9",
              borderRadius: 4,
              background: "#4a90d9",
              color: "#fff",
              fontWeight: 600,
              opacity: jsonStatus === "loading" ? 0.6 : 1,
            }}
          >
            {jsonStatus === "loading"
              ? "Exporting…"
              : jsonStatus === "done"
                ? "✓ Exported"
                : "Export JSON"}
          </button>
        </div>

        {/* CSV Export */}
        <div
          style={{
            flex: "1 1 240px",
            padding: 16,
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
            CSV Export — Jobs
          </h3>
          <p style={{ fontSize: 11, color: "#888", margin: "0 0 12px" }}>
            Spreadsheet-friendly job history with scores, statuses, and
            timestamps. Opens in Excel, Google Sheets, or any CSV viewer.
          </p>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={csvStatus === "loading"}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              cursor: csvStatus === "loading" ? "not-allowed" : "pointer",
              border: "1px solid #2a8",
              borderRadius: 4,
              background: "#2a8",
              color: "#fff",
              fontWeight: 600,
              opacity: csvStatus === "loading" ? 0.6 : 1,
            }}
          >
            {csvStatus === "loading"
              ? "Exporting…"
              : csvStatus === "done"
                ? "✓ Exported"
                : "Export CSV"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Privacy / Delete Section ──────────────────────────────────────────────

type DeleteStep =
  | "idle"
  | "warn-export"
  | "confirm"
  | "deleting"
  | "done"
  | "error";

type InlineActionStatus = "idle" | "confirm" | "working" | "done" | "error";

function PrivacySection(): ReactNode {
  const [step, setStep] = useState<DeleteStep>("idle");
  const [dataCounts, setDataCounts] = useState<Record<string, number>>({});
  const [errorMsg, setErrorMsg] = useState("");
  const [jobIdInput, setJobIdInput] = useState("");
  const [jobDeleteStatus, setJobDeleteStatus] =
    useState<InlineActionStatus>("idle");
  const [jobDeleteMessage, setJobDeleteMessage] = useState("");
  const [cacheDeleteStatus, setCacheDeleteStatus] =
    useState<InlineActionStatus>("idle");
  const [cacheDeleteMessage, setCacheDeleteMessage] = useState("");

  const refreshCounts = useCallback(async () => {
    try {
      setDataCounts(await getDataCounts());
    } catch {
      setDataCounts({});
    }
  }, []);

  // Load counts when the section mounts or when step returns to idle
  useEffect(() => {
    if (step === "idle") {
      void refreshCounts();
    }
  }, [refreshCounts, step]);

  const totalRows = Object.values(dataCounts).reduce((a, b) => a + b, 0);
  const hasAnyData = totalRows > 0;

  const handleStartDelete = useCallback(() => {
    setStep("warn-export");
    setErrorMsg("");
  }, []);

  const handleConfirmDelete = useCallback(() => {
    setStep("confirm");
  }, []);

  const handleExecuteDelete = useCallback(async () => {
    setStep("deleting");
    setErrorMsg("");
    try {
      await deleteAllData();
      setDataCounts({});
      setStep("done");
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Deletion failed");
    }
  }, []);

  const handleDeleteJob = useCallback(async () => {
    const jobId = jobIdInput.trim();
    if (!jobId) return;

    setJobDeleteStatus("working");
    setJobDeleteMessage("");
    try {
      const result = await deleteJobData(jobId);
      setJobDeleteStatus("done");
      setJobDeleteMessage(
        `Deleted ${jobId} and related records (${result.coverLettersDeleted} letter(s), ${result.applicationsDeleted} application(s), ${result.eventsDeleted} event(s), ${result.hrTimelineDeleted} HR timeline entry(s)).`,
      );
      setJobIdInput("");
      await refreshCounts();
    } catch (err) {
      setJobDeleteStatus("error");
      setJobDeleteMessage(
        err instanceof Error ? err.message : "Single-job deletion failed",
      );
    }
  }, [jobIdInput, refreshCounts]);

  const handleDeleteAiCacheAndLog = useCallback(async () => {
    setCacheDeleteStatus("working");
    setCacheDeleteMessage("");
    try {
      const result = await deleteAiCacheAndEventLog();
      setCacheDeleteStatus("done");
      setCacheDeleteMessage(
        `Deleted ${result.cacheEntriesDeleted} AI cache entr${
          result.cacheEntriesDeleted === 1 ? "y" : "ies"
        } and ${result.eventLogEntriesDeleted} event log entr${
          result.eventLogEntriesDeleted === 1 ? "y" : "ies"
        }.`,
      );
      await refreshCounts();
    } catch (err) {
      setCacheDeleteStatus("error");
      setCacheDeleteMessage(
        err instanceof Error ? err.message : "AI cache deletion failed",
      );
    }
  }, [refreshCounts]);

  const handleCancel = useCallback(() => {
    setStep("idle");
    setErrorMsg("");
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>
        Privacy &amp; Data Controls
      </h2>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "#666" }}>
        Manage your local data. All information is stored only in this browser.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: 520,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            padding: 16,
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
            Delete One Job
          </h3>
          <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
            Remove one saved vacancy by local job ID. Related cover letters,
            application records, and event log entries for that job will also be
            deleted.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              value={jobIdInput}
              onChange={(event) => {
                setJobIdInput(event.target.value);
                if (jobDeleteStatus !== "idle") {
                  setJobDeleteStatus("idle");
                  setJobDeleteMessage("");
                }
              }}
              placeholder="hh_123456"
              style={{
                flex: "1 1 220px",
                minWidth: 180,
                padding: "6px 8px",
                fontSize: 12,
                border: "1px solid #ccc",
                borderRadius: 4,
              }}
            />
            {jobDeleteStatus !== "confirm" ? (
              <button
                type="button"
                onClick={() => setJobDeleteStatus("confirm")}
                disabled={!jobIdInput.trim() || jobDeleteStatus === "working"}
                style={dangerSecondaryButtonStyle(
                  !jobIdInput.trim() || jobDeleteStatus === "working",
                )}
              >
                Delete Job...
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setJobDeleteStatus("idle")}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteJob}
                  style={dangerPrimaryButtonStyle}
                >
                  Confirm Delete
                </button>
              </>
            )}
          </div>
          {jobDeleteMessage && (
            <p
              style={{
                fontSize: 11,
                margin: "10px 0 0",
                color: jobDeleteStatus === "error" ? "#c44" : "#666",
              }}
            >
              {jobDeleteMessage}
            </p>
          )}
        </div>

        <div
          style={{
            padding: 16,
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
            Delete AI Cache And Event Log
          </h3>
          <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
            Clear cached AI outputs and the local event log without touching
            saved vacancies, profiles, or settings.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {cacheDeleteStatus !== "confirm" ? (
              <button
                type="button"
                onClick={() => setCacheDeleteStatus("confirm")}
                disabled={cacheDeleteStatus === "working"}
                style={dangerSecondaryButtonStyle(
                  cacheDeleteStatus === "working",
                )}
              >
                Clear Cache And Log...
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setCacheDeleteStatus("idle")}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAiCacheAndLog}
                  style={dangerPrimaryButtonStyle}
                >
                  Confirm Clear
                </button>
              </>
            )}
          </div>
          {cacheDeleteMessage && (
            <p
              style={{
                fontSize: 11,
                margin: "10px 0 0",
                color: cacheDeleteStatus === "error" ? "#c44" : "#666",
              }}
            >
              {cacheDeleteMessage}
            </p>
          )}
        </div>
      </div>

      {/* Delete all data card */}
      <div
        style={{
          padding: 16,
          border: step === "done" ? "1px solid #b0d0b0" : "1px solid #e0e0e0",
          borderRadius: 8,
          background: step === "done" ? "#f5fff5" : "#fafafa",
          maxWidth: 520,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            margin: "0 0 4px",
            color: step === "done" ? "#2a8" : "#c33",
          }}
        >
          {step === "done" ? "✓ Data Deleted" : "Delete All Data"}
        </h3>

        {step === "idle" && (
          <>
            <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px" }}>
              {hasAnyData
                ? `You have ${totalRows} record(s) across ${Object.values(dataCounts).filter((c) => c > 0).length} table(s). This action is irreversible.`
                : "No data to delete."}
            </p>
            {hasAnyData && (
              <>
                <table
                  style={{
                    width: "100%",
                    fontSize: 11,
                    color: "#555",
                    borderCollapse: "collapse",
                    marginBottom: 12,
                  }}
                >
                  <tbody>
                    {Object.entries(dataCounts)
                      .filter(([, c]) => c > 0)
                      .map(([table, count]) => (
                        <tr key={table}>
                          <td style={{ padding: "2px 8px 2px 0" }}>{table}</td>
                          <td style={{ padding: "2px 0", color: "#999" }}>
                            {count} row(s)
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  onClick={handleStartDelete}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    cursor: "pointer",
                    border: "1px solid #c44",
                    borderRadius: 4,
                    background: "#fff",
                    color: "#c44",
                    fontWeight: 600,
                  }}
                >
                  Delete All Data…
                </button>
              </>
            )}
          </>
        )}

        {step === "warn-export" && (
          <>
            <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
              ⚠️ You are about to permanently delete all your VacancyPilot data.
              This includes vacancies, cover letters, profiles, settings, and
              event history.
            </p>
            <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
              We strongly recommend exporting your data first from the
              <span style={{ fontWeight: 600 }}> Export</span> section.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  background: "#fff",
                  color: "#555",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                  border: "1px solid #c44",
                  borderRadius: 4,
                  background: "#c44",
                  color: "#fff",
                  fontWeight: 600,
                }}
              >
                I understand, continue
              </button>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
              🔴 Final confirmation: this action{" "}
              <strong>cannot be undone</strong>. All local data will be wiped
              immediately.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  background: "#fff",
                  color: "#555",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                  border: "1px solid #900",
                  borderRadius: 4,
                  background: "#900",
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                Delete Everything
              </button>
            </div>
          </>
        )}

        {step === "deleting" && (
          <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
            Deleting all data…
          </p>
        )}

        {step === "done" && (
          <>
            <p style={{ fontSize: 12, color: "#2a8", margin: "0 0 8px" }}>
              All VacancyPilot data has been deleted from this browser.
            </p>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                cursor: "pointer",
                border: "1px solid #ccc",
                borderRadius: 4,
                background: "#fff",
                color: "#555",
              }}
            >
              Done
            </button>
          </>
        )}

        {step === "error" && (
          <>
            <ErrorState
              message="Deletion failed"
              details={errorMsg}
              onRetry={handleExecuteDelete}
            />
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  background: "#fff",
                  color: "#555",
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const secondaryButtonStyle = {
  padding: "6px 14px",
  fontSize: 12,
  cursor: "pointer",
  border: "1px solid #ccc",
  borderRadius: 4,
  background: "#fff",
  color: "#555",
} as const;

function dangerSecondaryButtonStyle(disabled: boolean) {
  return {
    padding: "6px 14px",
    fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid #c44",
    borderRadius: 4,
    background: "#fff",
    color: "#c44",
    fontWeight: 600,
    opacity: disabled ? 0.6 : 1,
  } as const;
}

const dangerPrimaryButtonStyle = {
  padding: "6px 14px",
  fontSize: 12,
  cursor: "pointer",
  border: "1px solid #900",
  borderRadius: 4,
  background: "#900",
  color: "#fff",
  fontWeight: 700,
} as const;

// ── Summary Section ──

// Kept for backwards-compatible source-level deep links; the visible Summary
// entry now intentionally renders the consolidated Command Center.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SummarySection(): ReactNode {
  const [summary, setSummary] = useState<DailySummaryType | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const jobs = await db.jobs.toArray();
      setSummary(getDailySummary(jobs));
      setReminders(getReminders(jobs));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local") return;
      const relevantChange = Object.keys(changes).some(
        (key) => key.startsWith("badge_v1_hh_") || key === "app_settings_v1",
      );
      if (relevantChange) void load();
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [load]);

  if (loading) return <LoadingState />;
  if (error)
    return (
      <ErrorState
        message="Failed to load summary"
        details={error}
        onRetry={() => {
          setError(null);
          setLoading(true);
          void load();
        }}
      />
    );

  if (!summary || summary.totalTracked === 0)
    return (
      <EmptyState
        icon="📊"
        message="No data yet"
        description="Start saving vacancies to see your daily summary here."
      />
    );

  const statBox = (label: string, value: number, color: string) => (
    <div
      style={{
        flex: 1,
        minWidth: 100,
        padding: "12px",
        background: "#fafafa",
        border: `1px solid ${color}30`,
        borderRadius: 6,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          margin: "0 0 4px",
          color: "#1a3a5c",
        }}
      >
        Daily Summary
      </h2>
      <p style={{ fontSize: 11, color: "#999", margin: "0 0 16px" }}>
        Generated {summary.generatedAt.slice(0, 16).replace("T", " ")}
      </p>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        {statBox("Tracked", summary.totalTracked, "#4a90d9")}
        {statBox("Active", summary.activeCount, "#e6a817")}
        {statBox("New this week", summary.newThisWeek, "#2a8")}
        {statBox("Applied this week", summary.appliedThisWeek, "#2a8")}
        {statBox("Needs follow-up", summary.needsFollowUp, "#c44")}
      </div>

      {/* Reminders */}
      {reminders.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              margin: "0 0 8px",
              color: "#1a3a5c",
            }}
          >
            🔔 Follow-up Reminders ({reminders.length})
          </h3>
          {reminders.map((r) => (
            <div
              key={r.jobId}
              style={{
                padding: "8px 10px",
                background: "#fff",
                border: "1px solid #f0e0e0",
                borderLeft: "3px solid #c44",
                borderRadius: 4,
                marginBottom: 6,
                fontSize: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <a
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontWeight: 600,
                    color: "#4a90d9",
                    textDecoration: "none",
                  }}
                >
                  {r.title}
                </a>
                <span
                  style={{
                    fontSize: 10,
                    color: "#999",
                  }}
                >
                  {r.daysSince}d ago
                </span>
              </div>
              <div style={{ color: "#666", marginTop: 2 }}>{r.companyName}</div>
              <div style={{ color: "#c44", fontSize: 10, marginTop: 2 }}>
                ⚠ {r.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {reminders.length === 0 && (
        <div
          style={{
            padding: "12px",
            background: "#e6f7e6",
            border: "1px solid #2a8",
            borderRadius: 6,
            fontSize: 12,
            color: "#2a8",
            marginBottom: 20,
          }}
        >
          ✅ All caught up! No follow-ups needed right now.
        </div>
      )}

      {/* Recent Activity */}
      {summary.recentActivity.length > 0 && (
        <div>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              margin: "0 0 8px",
              color: "#1a3a5c",
            }}
          >
            📜 Recent Activity
          </h3>
          {summary.recentActivity.map((evt, i) => (
            <div
              key={`${evt.jobId}-${evt.changedAt}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 0",
                borderBottom: "1px solid #f5f5f5",
                fontSize: 11,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  padding: "1px 5px",
                  borderRadius: 3,
                  fontSize: 10,
                  fontWeight: 600,
                  background: "#e6f0ff",
                  color: "#4a90d9",
                }}
              >
                {evt.status.replace(/_/g, " ")}
              </span>
              <span style={{ color: "#333", flex: 1 }}>
                {evt.title} · {evt.companyName}
              </span>
              <span style={{ color: "#999" }}>
                {evt.daysAgo === 0 ? "today" : `${evt.daysAgo}d ago`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Labs Section ──

function LabsSection(): ReactNode {
  const [labsOn, setLabsOn] = useState(false);
  const [guidedApplyOn, setGuidedApplyOn] = useState(false);
  const [killSwitchOn, setKillSwitchOn] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(5);
  const [remaining, setRemaining] = useState(0);
  const [actions, setActions] = useState<LabsActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const settings = await loadSettings();
      setLabsOn(settings.labs.enabled);
      setGuidedApplyOn(settings.labs.guidedApplyEnabled);
      setKillSwitchOn(settings.labs.killSwitchEnabled);
      setDailyLimit(settings.labs.dailyActionLimit);
      const [rem, log] = await Promise.all([
        getRemainingDailyBudget(),
        getActionLog(),
      ]);
      setRemaining(rem);
      setActions(log);
    } catch {
      // settings unreadable — use safe defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleToggleMaster = useCallback(async () => {
    setSaving(true);
    try {
      const settings = await loadSettings();
      settings.labs.enabled = !settings.labs.enabled;
      if (!settings.labs.enabled) {
        settings.labs.guidedApplyEnabled = false;
        setGuidedApplyOn(false);
      }
      await saveSettings(settings);
      setLabsOn(settings.labs.enabled);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleToggleGuidedApply = useCallback(async () => {
    setSaving(true);
    try {
      const settings = await loadSettings();
      settings.labs.guidedApplyEnabled = !settings.labs.guidedApplyEnabled;
      await saveSettings(settings);
      setGuidedApplyOn(settings.labs.guidedApplyEnabled);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleToggleKillSwitch = useCallback(async () => {
    setSaving(true);
    try {
      const settings = await loadSettings();
      settings.labs.killSwitchEnabled = !settings.labs.killSwitchEnabled;
      await saveSettings(settings);
      setKillSwitchOn(settings.labs.killSwitchEnabled);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleLimitChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
      setDailyLimit(v);
      setSaving(true);
      try {
        const settings = await loadSettings();
        settings.labs.dailyActionLimit = v;
        await saveSettings(settings);
        setRemaining(await getRemainingDailyBudget());
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  if (loading) return <LoadingState />;

  const effectiveLabsEnabled = labsOn && !killSwitchOn;

  const toggleBase: React.CSSProperties = {
    width: 40,
    height: 22,
    borderRadius: 11,
    position: "relative",
    cursor: saving ? "not-allowed" : "pointer",
    opacity: saving ? 0.6 : 1,
    border: "none",
    padding: 0,
    transition: "background 0.2s",
  };

  function knobLeft(on: boolean): number {
    return on ? 20 : 2;
  }

  return (
    <div>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          margin: "0 0 4px",
          color: "#1a3a5c",
        }}
      >
        Labs
      </h2>
      <p style={{ fontSize: 12, color: "#999", margin: "0 0 16px" }}>
        Experimental features. Disabled by default. Enable at your own risk.
      </p>

      {/* Risk warning */}
      <div
        style={{
          padding: "10px 14px",
          background: "#fff8e6",
          border: "1px solid #e6a817",
          borderRadius: 6,
          marginBottom: 20,
          fontSize: 12,
          color: "#8a6d14",
          lineHeight: 1.5,
        }}
      >
        <strong>⚠️ Caution:</strong> Labs features are experimental and carry
        elevated risk. They may interact with live pages. The kill switch can
        disable all Labs features instantly if something goes wrong.
      </div>

      {/* Master Toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
          borderBottom: "1px solid #eee",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
            Labs master toggle
          </div>
          <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
            Enable experimental Labs features
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleMaster}
          disabled={saving}
          style={{ ...toggleBase, background: labsOn ? "#4a90d9" : "#ccc" }}
          aria-label={labsOn ? "Disable Labs" : "Enable Labs"}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: 2,
              left: knobLeft(labsOn),
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          />
        </button>
      </div>

      {/* Guided Apply Toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
          borderBottom: "1px solid #eee",
          color: labsOn ? undefined : colors.textFaint,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
            Guided apply
          </div>
          <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
            Clipboard-only workflow with field hints (no auto-fill)
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleGuidedApply}
          disabled={saving || !labsOn}
          style={{
            ...toggleBase,
            background: guidedApplyOn && labsOn ? "#4a90d9" : "#ccc",
          }}
          aria-label={
            guidedApplyOn ? "Disable guided apply" : "Enable guided apply"
          }
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: 2,
              left: knobLeft(guidedApplyOn && labsOn),
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          />
        </button>
      </div>

      {/* Kill Switch */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
          borderBottom: "1px solid #eee",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#c44" }}>
            Kill switch
          </div>
          <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
            Instantly disable all Labs features
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleKillSwitch}
          disabled={saving}
          style={{ ...toggleBase, background: killSwitchOn ? "#c44" : "#ccc" }}
          aria-label={
            killSwitchOn ? "Deactivate kill switch" : "Activate kill switch"
          }
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: 2,
              left: knobLeft(killSwitchOn),
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          />
        </button>
      </div>

      {/* Daily Action Budget */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
          borderBottom: "1px solid #eee",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
            Daily action limit
          </div>
          <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
            Max Labs actions per day · {remaining} remaining today
          </div>
        </div>
        <input
          type="number"
          min={0}
          max={100}
          value={dailyLimit}
          onChange={handleLimitChange}
          disabled={saving}
          style={{
            width: 56,
            padding: "4px 8px",
            fontSize: 13,
            border: "1px solid #ccc",
            borderRadius: 4,
            textAlign: "center",
          }}
        />
      </div>

      {/* Status summary */}
      <div
        style={{
          marginTop: 16,
          padding: "8px 12px",
          background: effectiveLabsEnabled ? "#e6f7e6" : "#f5f5f5",
          borderRadius: 6,
          fontSize: 12,
          color: effectiveLabsEnabled ? "#2a8" : "#999",
        }}
      >
        Labs status:{" "}
        <strong>
          {killSwitchOn
            ? "KILL SWITCH ACTIVE — all Labs features blocked"
            : labsOn
              ? "Enabled"
              : "Disabled"}
        </strong>
      </div>

      {/* Action log */}
      <h3
        style={{
          fontSize: 14,
          fontWeight: 700,
          margin: "24px 0 8px",
          color: "#1a3a5c",
        }}
      >
        Action Log
      </h3>

      {actions.length === 0 ? (
        <EmptyState
          icon="📋"
          message="No Labs actions recorded"
          description="Actions appear here when you use guided-apply or other Labs features."
        />
      ) : (
        <div style={{ overflow: "auto" }}>
          <table
            style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    fontWeight: 700,
                    color: "#555",
                  }}
                >
                  Type
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    fontWeight: 700,
                    color: "#555",
                  }}
                >
                  Time
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    fontWeight: 700,
                    color: "#555",
                  }}
                >
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                        background: "#e6f0ff",
                        color: "#4a90d9",
                      }}
                    >
                      {a.type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td
                    style={{ padding: "6px 8px", color: "#999", fontSize: 11 }}
                  >
                    {a.createdAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td
                    style={{ padding: "6px 8px", color: "#666", fontSize: 11 }}
                  >
                    {a.vacancyUrl
                      ? `URL: ${a.vacancyUrl.slice(0, 60)}...`
                      : a.jobId
                        ? `Job: ${a.jobId.slice(0, 12)}...`
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function App(): ReactNode {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void ensureMigrationsBootstrapped().then(
      () => {
        if (!cancelled) setDbReady(true);
      },
      (error: unknown) => {
        if (!cancelled) {
          setDbError(error instanceof Error ? error.message : String(error));
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ErrorBoundary rootLabel="Dashboard">
      {dbError ? (
        <ErrorState
          message="Failed to initialize local data"
          details={dbError}
        />
      ) : dbReady ? (
        <DashboardContent />
      ) : (
        <LoadingState message="Initializing local data…" />
      )}
    </ErrorBoundary>
  );
}
