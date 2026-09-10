import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { jobRepo } from "@/db/repositories";
import { createStatusChange } from "@/services/status-transitions";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import type { Job, JobStatus } from "@/models/job";
import { getOperatingMode } from "@/services/operating-mode";
import { NATIVE_HH_SUBMISSION_CONFIRMATION } from "@/services/applied-confirmation";
import { openHhVacancy } from "@/services/hh-navigation";

// ── Kanban column definitions ─────────────────────────────────────────────

interface KanbanColumn {
  id: string;
  label: string;
  icon: string;
  statuses: JobStatus[];
  color: string;
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: "saved",
    label: "Saved",
    icon: "📥",
    statuses: ["saved", "letter_ready"],
    color: "#4a90d9",
  },
  {
    id: "active",
    label: "Active",
    icon: "🔄",
    statuses: ["applied", "hr_replied", "interview", "test_task"],
    color: "#e6a817",
  },
  {
    id: "offer",
    label: "Offer",
    icon: "🏆",
    statuses: ["offer"],
    color: "#2a8",
  },
  {
    id: "rejected",
    label: "Rejected",
    icon: "🚫",
    statuses: ["rejected_by_me", "rejected_by_company", "blacklist"],
    color: "#c44",
  },
];

/** All statuses NOT covered by kanban columns fall into "Other". */
const OTHER_LABEL = "Other";
const OTHER_ICON = "📦";

// ── Allowed transitions per column (for quick-action dropdown) ────────────

const COLUMN_TRANSITIONS: Record<string, JobStatus[]> = {
  saved: ["applied", "rejected_by_me"],
  active: ["offer", "rejected_by_me"],
  offer: ["rejected_by_me"],
  rejected: ["saved", "applied"],
};

// ── Helpers ───────────────────────────────────────────────────────────────

function scoreColor(total: number | undefined): string {
  if (total === undefined) return "#999";
  if (total >= 85) return "#2a8";
  if (total >= 70) return "#6a6";
  if (total >= 50) return "#e6a817";
  return "#c44";
}

function statusBadgeStyle(status: JobStatus): { bg: string; fg: string } {
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

function statusLabel(status: JobStatus): string {
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
  return labels[status];
}

function formatShortDate(iso: string): string {
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

function classifyColumn(status: JobStatus): string {
  for (const col of KANBAN_COLUMNS) {
    if (col.statuses.includes(status)) return col.id;
  }
  return "other";
}

// ── Component ─────────────────────────────────────────────────────────────

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

export function KanbanBoard(): ReactNode {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [effectiveMode, setEffectiveMode] = useState<"standalone" | "ops" | null>(null);
  const [search, setSearch] = useState("");
  const [changingJobId, setChangingJobId] = useState<string | null>(null);
  const [lastMoved, setLastMoved] = useState<{
    jobId: string;
    toStatus: JobStatus;
  } | null>(null);
  const windowWidth = useWindowWidth();

  const loadJobs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await jobRepo.list();
      data.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setJobs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vacancies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    void getOperatingMode()
      .then((mode) => setEffectiveMode(mode.effectiveMode))
      .catch(() => setEffectiveMode("standalone"));
  }, []);

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local") return;
      const relevantChange = Object.keys(changes).some(
        (key) => key.startsWith("badge_v1_hh_") || key === "app_settings_v1",
      );
      if (relevantChange) void loadJobs(true);
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [loadJobs]);

  const handleMoveJob = useCallback(
    async (jobId: string, toStatus: JobStatus) => {
      setChangingJobId(jobId);
      setActionError(null);
      try {
        const mode = await getOperatingMode();
        if (toStatus === "applied" && mode.effectiveMode !== "standalone") {
          setActionError("Confirm Applied is unavailable in Ops Mode until Fix 2.");
          return;
        }
        const job = await jobRepo.getById(jobId);
        if (!job) return;
        if (toStatus === "applied" && !window.confirm(`${NATIVE_HH_SUBMISSION_CONFIRMATION}. Confirm local tracking?`)) return;
        const change = createStatusChange(job.status, toStatus, "user");
        job.status = toStatus;
        job.statusHistory = [...job.statusHistory, change];
        job.updatedAt = new Date().toISOString();
        await jobRepo.save(job);

        // Update local state optimistically
        setJobs((prev) =>
          prev
            .map((j) =>
              j.id === jobId
                ? {
                    ...j,
                    status: toStatus,
                    updatedAt: new Date().toISOString(),
                  }
                : j,
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
        // Brief success indicator
        setLastMoved({ jobId, toStatus });
        setTimeout(() => setLastMoved(null), 1200);
      } catch {
        setActionError("Could not update the local status. Refresh and try again.");
        void loadJobs(true);
      } finally {
        setChangingJobId(null);
      }
    },
    [loadJobs],
  );

  const handleOpenVacancy = useCallback((url: string) => {
    openHhVacancy(url);
  }, []);

  // ── Filtering ──
  const filteredJobs = search
    ? jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(search.toLowerCase()) ||
          j.companyName.toLowerCase().includes(search.toLowerCase()),
      )
    : jobs;

  // ── Group into columns ──
  const columnJobs: Record<string, Job[]> = {};
  for (const col of KANBAN_COLUMNS) {
    columnJobs[col.id] = [];
  }
  columnJobs.other = [];

  for (const job of filteredJobs) {
    const colId = classifyColumn(job.status);
    if (columnJobs[colId]) {
      columnJobs[colId].push(job);
    } else {
      columnJobs.other.push(job);
    }
  }

  // ── Render ──

  if (loading) return <LoadingState message="Loading vacancies…" />;

  if (error)
    return (
      <ErrorState
        message="Failed to load vacancies"
        details={error}
        onRetry={() => void loadJobs()}
      />
    );

  if (jobs.length === 0)
    return (
      <EmptyState
        icon="📋"
        message="No vacancies yet"
        description="Vacancies are saved automatically when you view them on HH.ru."
      />
    );

  const totalJobs = filteredJobs.length;
  const isNarrow = windowWidth < 700;
  const colWidth = isNarrow ? 200 : 240;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2
          style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#1a3a5c" }}
        >
          Kanban Board ({totalJobs})
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="text"
            placeholder="Search title or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "5px 10px",
              fontSize: 12,
              border: "1px solid #ccc",
              borderRadius: 4,
              width: isNarrow ? 140 : 200,
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              style={{
                padding: "3px 8px",
                fontSize: 11,
                cursor: "pointer",
                border: "1px solid #ccc",
                borderRadius: 4,
                background: "#f5f5f5",
                color: "#666",
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          overflow: "auto",
          minHeight: 300,
          paddingBottom: 4,
        }}
      >
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumnView
            key={col.id}
            column={col}
            jobs={columnJobs[col.id] ?? []}
            changingJobId={changingJobId}
            lastMoved={lastMoved}
            onMoveJob={handleMoveJob}
            onOpenVacancy={handleOpenVacancy}
            allowApplied={effectiveMode === "standalone"}
            colWidth={colWidth}
          />
        ))}

        {/* Other column (new, viewed) */}
        {(columnJobs.other?.length ?? 0) > 0 && (
          <KanbanColumnView
            column={{
              id: "other",
              label: OTHER_LABEL,
              icon: OTHER_ICON,
              statuses: [],
              color: "#999",
            }}
            jobs={columnJobs.other ?? []}
            changingJobId={changingJobId}
            lastMoved={lastMoved}
            onMoveJob={handleMoveJob}
            onOpenVacancy={handleOpenVacancy}
            allowApplied={effectiveMode === "standalone"}
            colWidth={colWidth}
          />
        )}
      </div>
      {actionError && <p role="status" style={{ color: "#8a6d14", fontSize: 12 }}>{actionError}</p>}
    </div>
  );
}

// ── Kanban Column View ────────────────────────────────────────────────────

function KanbanColumnView({
  column,
  jobs,
  changingJobId,
  lastMoved,
  onMoveJob,
  onOpenVacancy,
  allowApplied,
  colWidth = 240,
}: {
  column: KanbanColumn;
  jobs: Job[];
  changingJobId: string | null;
  lastMoved: { jobId: string; toStatus: JobStatus } | null;
  onMoveJob: (jobId: string, toStatus: JobStatus) => void;
  onOpenVacancy: (url: string) => void;
  allowApplied: boolean;
  colWidth?: number;
}): ReactNode {
  const [dropdownJobId, setDropdownJobId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownJobId) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownJobId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownJobId]);

  const allowedMoves =
    COLUMN_TRANSITIONS[column.id] ??
    (["saved", "applied", "offer", "rejected_by_me"] as JobStatus[]);
  const visibleMoves = allowApplied
    ? allowedMoves
    : allowedMoves.filter((status) => status !== "applied");

  return (
    <div
      style={{
        flex: `0 0 ${colWidth}px`,
        display: "flex",
        flexDirection: "column",
        background: "#f9f9f9",
        border: `1px solid ${column.color}30`,
        borderRadius: 6,
      }}
    >
      {/* Column header */}
      <div
        style={{
          padding: "8px 10px",
          borderBottom: `2px solid ${column.color}`,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 14 }}>{column.icon}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: column.color,
            flex: 1,
          }}
        >
          {column.label}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
            background: column.color,
            borderRadius: 10,
            padding: "1px 7px",
            minWidth: 18,
            textAlign: "center",
          }}
        >
          {jobs.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ padding: "6px", flex: 1 }}>
        {jobs.map((job) => {
          const badge = statusBadgeStyle(job.status);
          const isChanging = changingJobId === job.id;
          const justMoved =
            lastMoved?.jobId === job.id ? lastMoved.toStatus : null;

          return (
            <div
              key={job.id}
              style={{
                padding: "9px 10px",
                background: "#fff",
                border: `1px solid ${isChanging ? column.color : "#e8e8e8"}`,
                borderRadius: 5,
                marginBottom: 6,
                opacity: isChanging ? 0.6 : 1,
                cursor: "default",
                transition: "border-color 0.2s, opacity 0.2s",
              }}
            >
              {/* Title */}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#333",
                  marginBottom: 4,
                  lineHeight: 1.3,
                  cursor: "pointer",
                }}
                onClick={() => onOpenVacancy(job.sourceUrl)}
                title="Open vacancy in new tab"
              >
                {job.title || "(no title)"}
              </div>

              {/* Company */}
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                {job.companyName || "—"}
              </div>

              {/* Score + Status */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                {job.ruleScore?.total !== undefined ? (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: scoreColor(job.ruleScore.total),
                    }}
                  >
                    {job.ruleScore.total}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: "#ccc" }}>—</span>
                )}

                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 7px",
                    borderRadius: 8,
                    fontSize: 10,
                    fontWeight: 600,
                    background: badge.bg,
                    color: badge.fg,
                  }}
                >
                  {statusLabel(job.status)}
                </span>
              </div>

              {/* Date + Just-moved indicator */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 10, color: "#bbb" }}>
                  {formatShortDate(job.updatedAt)}
                </span>
                {justMoved && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#2a8",
                      background: "#e6f7e6",
                      borderRadius: 3,
                      padding: "1px 5px",
                    }}
                  >
                    ✓ Moved
                  </span>
                )}
              </div>

              {/* Quick actions */}
              <div
                style={{ position: "relative" }}
                ref={dropdownJobId === job.id ? dropdownRef : undefined}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownJobId(dropdownJobId === job.id ? null : job.id);
                  }}
                  style={{
                    width: "100%",
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 500,
                    border: "1px solid #d0d0d0",
                    borderRadius: 3,
                    background:
                      dropdownJobId === job.id ? "#f0f0f0" : "#fafafa",
                    color: "#555",
                    cursor: "pointer",
                  }}
                >
                  {isChanging ? "Moving…" : "Move to… ▾"}
                </button>

                {dropdownJobId === job.id && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "#fff",
                      border: "1px solid #d0d0d0",
                      borderRadius: 4,
                      boxShadow: "0 3px 12px rgba(0,0,0,0.12)",
                      zIndex: 10,
                      marginTop: 2,
                      overflow: "hidden",
                    }}
                  >
                    {visibleMoves
                      .filter((s) => s !== job.status)
                      .map((targetStatus) => {
                        const targetBadge = statusBadgeStyle(targetStatus);
                        return (
                          <button
                            key={targetStatus}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDropdownJobId(null);
                              onMoveJob(job.id, targetStatus);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              width: "100%",
                              padding: "6px 10px",
                              fontSize: 11,
                              border: "none",
                              borderBottom: "1px solid #f5f5f5",
                              background: "transparent",
                              color: "#333",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) => {
                              (e.target as HTMLElement).style.background =
                                "#f5f8ff";
                            }}
                            onMouseLeave={(e) => {
                              (e.target as HTMLElement).style.background =
                                "transparent";
                            }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: targetBadge.fg,
                                flexShrink: 0,
                              }}
                            />
                            {statusLabel(targetStatus)}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {jobs.length === 0 && (
          <div
            style={{
              padding: "20px 8px",
              fontSize: 11,
              color: "#bbb",
              textAlign: "center",
            }}
          >
            {column.id === "other"
              ? "New/viewed vacancies appear here"
              : `No ${column.label.toLowerCase()} vacancies`}
          </div>
        )}
      </div>
    </div>
  );
}
