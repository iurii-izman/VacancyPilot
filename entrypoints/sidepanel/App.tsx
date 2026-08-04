import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { CoverLetterStudio } from "@/components/CoverLetterStudio";
import { GuidedApplyWorkspace } from "@/components/GuidedApplyWorkspace";
import { HrWorkspace } from "@/components/HrWorkspace";
import { ProfileTab } from "@/components/ProfileTab";
import { OpsStatusDot } from "@/components/OpsStatusIndicator";
import { jobRepo } from "@/db/repositories";
import { ensureMigrationsBootstrapped } from "@/db";
import type { Job } from "@/models/job";
import type { RiskFlag } from "@/models/risk";
import type { ApplicationStatusSync } from "@/adapters/types";
import type { RawHrTimelineDTO } from "@/models/hr-timeline";
import { persistHrTimelineForJob } from "@/services/hr-timeline-sync";
import { readCachedIntake } from "@/services/ops-intake";
import { useState, useCallback, useEffect, type ReactNode } from "react";
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
  borderRadius,
  shellBody,
  scrollArea,
  headerBar,
  appTitle,
  appSubtitle,
  smallButton,
  warningChip,
  infoChip,
  scoreColor,
} from "@/styles";

type TabId =
  | "overview"
  | "score"
  | "letter"
  | "apply"
  | "profile"
  | "history"
  | "hr";

interface TabDef {
  id: TabId;
  label: string;
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "score", label: "Score" },
  { id: "letter", label: "Letter" },
  { id: "apply", label: "Apply" },
  { id: "profile", label: "Profile" },
  { id: "history", label: "History" },
  { id: "hr", label: "HR" },
];

interface VacancyContext {
  jobId?: string;
  job?: Job;
  profileId?: string;
  resumeId?: string;
  passiveStatus?: Partial<ApplicationStatusSync> | null;
}

interface HrExtractionResponse {
  success: boolean;
  timeline?: RawHrTimelineDTO[];
  sourceVacancyId?: string | null;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statusBadgeStyle(status: string): { bg: string; fg: string } {
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

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
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

/**
 * Format a passive HH status into a user-facing informational label.
 * Only returns a label for detected statuses; returns null if no status.
 */
function passiveStatusLabel(
  status: Partial<ApplicationStatusSync>,
): string | null {
  if (status.detectedApplied) return "HH shows: Вы откликнулись";
  if (status.detectedRejected) return "HH shows: Отказ";
  if (status.detectedInvitation) return "HH shows: Приглашение";
  if (status.detectedViewedByEmployer)
    return "HH shows: Работодатель просмотрел резюме";
  return null;
}

function riskSeverityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "#c44";
    case "high":
      return "#e66";
    case "medium":
      return "#e6a817";
    case "low":
      return "#4a90d9";
    default:
      return "#999";
  }
}

function detectSupportedPageKind(
  url: string | undefined,
): "vacancy" | "applications" | "messages" | "other" {
  if (!url) return "other";

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "hh.ru" && !parsed.hostname.endsWith(".hh.ru")) {
      return "other";
    }

    if (/^\/vacancy\/\d+/i.test(parsed.pathname)) return "vacancy";
    if (/^\/applicant\/responses/i.test(parsed.pathname)) return "applications";
    if (/^\/negotiations/i.test(parsed.pathname)) return "messages";
    return "other";
  } catch {
    return "other";
  }
}

// ── Main Side Panel ────────────────────────────────────────────────────────

function SidePanelContent(): ReactNode {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [ctx, setCtx] = useState<VacancyContext>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTabClick = useCallback((tab: TabId) => {
    setActiveTab(tab);
  }, []);

  // Detect current vacancy from explicit background-managed context.
  // Falls back to active-tab guessing only when no context is available.
  // Retries context fetch to handle the short timing race between
  // the popup storing context and the side panel loading.
  useEffect(() => {
    let cancelled = false;

    /** Retry GET_SIDE_PANEL_CONTEXT up to `maxRetries` times with 100ms delays. */
    async function fetchContextWithRetry(
      maxRetries: number,
    ): Promise<{ tabId: number; vacancyId: string | null } | null> {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (cancelled) return null;
        const context: { tabId: number; vacancyId: string | null } | null =
          await chrome.runtime.sendMessage({ type: "GET_SIDE_PANEL_CONTEXT" });
        // Valid context has a positive tabId.
        if (context?.tabId && context.tabId > 0) return context;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      return null;
    }

    async function detect(): Promise<void> {
      try {
        const context = await fetchContextWithRetry(3);

        let tab: chrome.tabs.Tab | undefined;
        if (context?.tabId && context.tabId > 0) {
          try {
            tab = await chrome.tabs.get(context.tabId);
          } catch {
            tab = undefined;
          }
        }

        if (!tab) {
          const [activeTab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });
          tab = activeTab;
        }

        if (cancelled || !tab?.url || tab.id === undefined) {
          if (!cancelled) setCtx({});
          return;
        }

        const pageKind = detectSupportedPageKind(tab.url);

        if (pageKind === "vacancy") {
          const match = tab.url.match(/\/vacancy\/(\d+)/);
          if (!match) {
            if (!cancelled) setCtx({});
            return;
          }

          const vacancyId = match[1];
          const jobId = `hh_${vacancyId}`;
          const job = await jobRepo.getById(jobId);

          try {
            const response: {
              success: boolean;
              passiveStatus?: Partial<ApplicationStatusSync> | null;
            } = await chrome.tabs.sendMessage(tab.id, {
              type: "EXTRACT_VACANCY",
            });
            if (!cancelled) {
              setCtx({
                jobId,
                job: job ?? undefined,
                profileId: job?.selectedProfileId,
                resumeId: job?.selectedResumeId,
                passiveStatus: response?.passiveStatus ?? undefined,
              });
            }
          } catch {
            if (!cancelled) {
              setCtx({
                jobId,
                job: job ?? undefined,
                profileId: job?.selectedProfileId,
                resumeId: job?.selectedResumeId,
              });
            }
          }
          return;
        }

        if (pageKind === "applications" || pageKind === "messages") {
          let vacancyId = context?.tabId === tab.id ? context?.vacancyId : null;

          let hrResponse: HrExtractionResponse | null = null;
          try {
            hrResponse = (await chrome.tabs.sendMessage(tab.id, {
              type: "EXTRACT_HR_TIMELINE",
            })) as HrExtractionResponse;
          } catch {
            hrResponse = null;
          }

          vacancyId = hrResponse?.sourceVacancyId ?? vacancyId ?? null;
          if (!vacancyId) {
            if (!cancelled) setCtx({});
            return;
          }

          const jobId = `hh_${vacancyId}`;
          const job = await jobRepo.getById(jobId);

          if (job && hrResponse?.success && hrResponse.timeline) {
            await persistHrTimelineForJob(job, hrResponse.timeline);
          }

          if (!cancelled) {
            setCtx({
              jobId,
              job: job ?? undefined,
              profileId: job?.selectedProfileId,
              resumeId: job?.selectedResumeId,
            });
          }
          return;
        }

        if (!cancelled) setCtx({});
      } catch {
        if (!cancelled) setCtx({});
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Auto-refresh when badge state changes (popup saved/rejected a vacancy).
  useEffect(() => {
    function onChanged(
      changes: Record<string, chrome.storage.StorageChange>,
    ): void {
      const hasBadgeChange = Object.keys(changes).some((k) =>
        k.startsWith("badge_v1_hh_"),
      );
      if (hasBadgeChange) handleRefresh();
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [handleRefresh]);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        ...shellBody,
      }}
    >
      {/* Header */}
      <div style={headerBar}>
        <div>
          <h1 style={appTitle}>VacancyPilot</h1>
          <p style={appSubtitle}>
            HH.ru copilot <OpsStatusDot />
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          title="Refresh vacancy data"
          aria-label="Refresh vacancy data"
          style={smallButton}
        >
          ↻
        </button>
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Vacancy detail tabs"
        style={{
          display: "flex",
          borderBottom: `1px solid ${colors.border}`,
          background: colors.white,
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => handleTabClick(tab.id)}
              style={{
                flex: 1,
                padding: "8px 2px",
                fontSize: fontSizes.sm,
                cursor: "pointer",
                border: "none",
                borderBottom: selected
                  ? `2px solid ${colors.blue}`
                  : "2px solid transparent",
                background: selected ? colors.activeBg : "transparent",
                color: selected ? colors.blue : colors.textMuted,
                fontWeight: selected
                  ? fontWeights.semibold
                  : fontWeights.normal,
                transition: "background 0.15s",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={scrollArea}>
        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
        >
          <TabContent tab={activeTab} ctx={ctx} onRefresh={handleRefresh} />
        </div>
      </div>
    </div>
  );
}

function TabContent({
  tab,
  ctx,
  onRefresh,
}: {
  tab: TabId;
  ctx: VacancyContext;
  onRefresh: () => void;
}): ReactNode {
  switch (tab) {
    case "overview":
      return <OverviewTab ctx={ctx} />;
    case "score":
      return <ScoreTab ctx={ctx} />;
    case "letter":
      return <LetterTab ctx={ctx} />;
    case "apply":
      return (
        <GuidedApplyWorkspace
          jobId={ctx.jobId ?? ""}
          job={ctx.job}
          profileId={ctx.profileId}
          resumeId={ctx.resumeId}
          onRefresh={onRefresh}
        />
      );
    case "profile":
      return <ProfileTabWrapper ctx={ctx} onRefresh={onRefresh} />;
    case "hr":
      return (
        <HrWorkspace
          jobId={ctx.jobId ?? ""}
          job={ctx.job}
          onRefresh={onRefresh}
        />
      );
    case "history":
      return <HistoryTab ctx={ctx} />;
  }
}

// ── Overview Tab ───────────────────────────────────────────────────────────

/**
 * Ops intake status chip — shows the last companion intake result for the
 * current vacancy. Reads the local opsCache read-model, never the network.
 */
function OpsIntakeStatus({
  sourceVacancyId,
}: {
  sourceVacancyId: string;
}): ReactNode {
  const [state, setState] = useState<
    | "loading"
    | "none"
    | { result: string; revision: number; verdict?: string; score?: number }
  >("loading");

  useEffect(() => {
    let cancelled = false;
    void readCachedIntake(sourceVacancyId).then((cached) => {
      if (cancelled) return;
      if (!cached) {
        setState("none");
        return;
      }
      setState({
        result: cached.result,
        revision: cached.revision,
        verdict: cached.triage?.verdict,
        score: cached.triage?.score,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [sourceVacancyId]);

  if (state === "loading" || state === "none") return null;

  const label = {
    created: "Synced to Ops (created)",
    updated: "Synced to Ops (updated)",
    unchanged: "Already in Ops (unchanged)",
  }[state.result] ?? "Synced to Ops";

  return (
    <div
      role="status"
      style={{
        ...infoChip,
        marginBottom: spacing.xxl,
      }}
    >
      {label} · rev {state.revision}
      {state.verdict
        ? ` · triage ${state.verdict}${typeof state.score === "number" ? ` (${state.score})` : ""}`
        : ""}
    </div>
  );
}

function OverviewTab({ ctx }: { ctx: VacancyContext }): ReactNode {
  if (!ctx.jobId) {
    return (
      <EmptyState
        icon="📋"
        message="Vacancy overview"
        description="Open a vacancy page to see details here."
      />
    );
  }

  if (!ctx.job) {
    return (
      <EmptyState
        icon="📋"
        message="Not saved yet"
        description="Save this vacancy from the popup to see details."
      />
    );
  }

  const job = ctx.job;
  const badge = statusBadgeStyle(job.status);

  const sourceVacancyId = job.sourceVacancyId || job.id.replace(/^hh_/, "");

  return (
    <div>
      {/* Ops intake sync status (informational) */}
      <OpsIntakeStatus sourceVacancyId={sourceVacancyId} />

      {/* Title and company */}
      <div style={{ marginBottom: spacing.xxl }}>
        <h2
          style={{
            fontSize: fontSizes.sectionHeading,
            fontWeight: fontWeights.bold,
            margin: `0 0 ${spacing.xs}px`,
          }}
        >
          {job.title || "(no title)"}
        </h2>
        <p
          style={{
            fontSize: fontSizes.body,
            color: colors.textMuted,
            margin: 0,
          }}
        >
          {job.companyName || "—"}
        </p>
      </div>

      {/* Passive HH status hint (informational, read-only) */}
      {ctx.passiveStatus && passiveStatusLabel(ctx.passiveStatus) && (
        <div
          role="status"
          aria-live="polite"
          style={{ ...warningChip, marginBottom: spacing.xxl }}
        >
          {passiveStatusLabel(ctx.passiveStatus)}
        </div>
      )}

      {/* Status + Score */}
      <div
        style={{
          display: "flex",
          gap: spacing.lg,
          marginBottom: spacing.xxl,
          alignItems: "center",
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: `${spacing.xs3}px ${spacing.lg}px`,
            borderRadius: spacing.lg,
            fontSize: fontSizes.md,
            fontWeight: fontWeights.semibold,
            background: badge.bg,
            color: badge.fg,
          }}
        >
          {statusLabel(job.status)}
        </span>
        {job.ruleScore && (
          <span
            style={{
              fontSize: fontSizes.sectionHeading,
              fontWeight: fontWeights.bold,
              color: scoreColor(job.ruleScore.total),
            }}
          >
            {job.ruleScore.total}
          </span>
        )}
        {job.ruleScore?.recommendation && (
          <span
            style={{
              fontSize: fontSizes.sm,
              color: colors.textPlaceholder,
              textTransform: "uppercase",
              letterSpacing: "0.3px",
            }}
          >
            {job.ruleScore.recommendation}
          </span>
        )}
      </div>

      {/* Key details */}
      <div
        style={{
          background: colors.neutralBg,
          borderRadius: borderRadius.lg,
          padding: spacing.lg,
          marginBottom: spacing.xxl,
        }}
      >
        <DetailRow label="Salary" value={job.salaryRaw ?? "—"} />
        <DetailRow label="City" value={job.city ?? "—"} />
        <DetailRow label="Work mode" value={job.workMode ?? "—"} />
        <DetailRow label="Experience" value={job.experienceRaw ?? "—"} />
        <DetailRow label="Employment" value={job.employmentType ?? "—"} />
        <DetailRow label="Schedule" value={job.schedule ?? "—"} />
        <DetailRow
          label="Profile"
          value={job.selectedProfileId ? `✓ assigned` : "—"}
        />
        <DetailRow
          label="Resume"
          value={job.selectedResumeId ? `✓ assigned` : "—"}
        />
        <DetailRow
          label="First seen"
          value={formatShortDate(job.firstSeenAt)}
        />
        <DetailRow label="Last seen" value={formatShortDate(job.lastSeenAt)} />
      </div>

      {/* Skills */}
      {job.skills.length > 0 && (
        <div style={{ marginBottom: spacing.xxl }}>
          <div
            style={{
              fontSize: fontSizes.sm,
              fontWeight: fontWeights.semibold,
              color: colors.textFaint,
              marginBottom: spacing.xs,
              textTransform: "uppercase",
            }}
          >
            Skills
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: spacing.xs }}>
            {job.skills.map((skill) => (
              <span
                key={skill}
                style={{
                  display: "inline-block",
                  padding: `${spacing.xs2}px ${spacing.md}px`,
                  borderRadius: spacing.lg,
                  fontSize: fontSizes.sm,
                  background: colors.activeBg,
                  color: colors.navy,
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Description preview */}
      {job.descriptionClean && (
        <div>
          <div
            style={{
              fontSize: fontSizes.sm,
              fontWeight: fontWeights.semibold,
              color: colors.textFaint,
              marginBottom: spacing.xs,
              textTransform: "uppercase",
            }}
          >
            Description
          </div>
          <div
            style={{
              fontSize: fontSizes.md,
              color: colors.textSecondary,
              lineHeight: 1.5,
              maxHeight: 150,
              overflow: "hidden",
              whiteSpace: "pre-wrap",
              background: colors.cardBg,
              borderRadius: borderRadius.md,
              padding: spacing.md,
            }}
          >
            {job.descriptionClean.slice(0, 500)}
            {job.descriptionClean.length > 500 && "…"}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: `${spacing.xs3}px 0`,
        fontSize: fontSizes.md,
        borderBottom: `1px solid ${colors.borderHairline}`,
      }}
    >
      <span style={{ color: colors.textFaint }}>{label}</span>
      <span style={{ fontWeight: fontWeights.semibold }}>{value}</span>
    </div>
  );
}

// ── Score Tab ──────────────────────────────────────────────────────────────

function ScoreTab({ ctx }: { ctx: VacancyContext }): ReactNode {
  if (!ctx.jobId) {
    return (
      <EmptyState
        icon="📊"
        message="Score breakdown"
        description="Open a vacancy page to see scoring."
      />
    );
  }

  if (!ctx.job) {
    return (
      <EmptyState
        icon="📊"
        message="Not saved yet"
        description="Save this vacancy from the popup to compute a score."
      />
    );
  }

  const score = ctx.job.ruleScore;

  if (!score) {
    return (
      <EmptyState
        icon="📊"
        message="No score"
        description="Create a profile with target titles and skills to enable scoring."
      />
    );
  }

  const breakdownEntries: Array<{
    label: string;
    score: number;
    max: number;
    section: string;
  }> = [
    {
      label: "Title match",
      score: score.breakdown.titleMatch,
      max: 20,
      section: "titleMatch",
    },
    {
      label: "Must-have skills",
      score: score.breakdown.mustHaveSkills,
      max: 25,
      section: "mustHaveSkills",
    },
    {
      label: "Nice-to-have skills",
      score: score.breakdown.niceToHaveSkills,
      max: 10,
      section: "niceToHaveSkills",
    },
    {
      label: "Experience fit",
      score: score.breakdown.experienceFit,
      max: 15,
      section: "experienceFit",
    },
    {
      label: "Work mode / location",
      score: score.breakdown.workModeLocation,
      max: 10,
      section: "workModeLocation",
    },
    {
      label: "Salary fit",
      score: score.breakdown.salaryFit,
      max: 10,
      section: "salaryFit",
    },
    {
      label: "Company preference",
      score: score.breakdown.companyPreference,
      max: 5,
      section: "companyPreference",
    },
    {
      label: "Language / misc",
      score: score.breakdown.languageScheduleMisc,
      max: 5,
      section: "languageScheduleMisc",
    },
  ];

  return (
    <div>
      {/* Total score header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: spacing.xxxl,
          padding: spacing.xl,
          background: colors.neutralBg,
          borderRadius: borderRadius.xl,
        }}
      >
        <div
          style={{
            fontSize: fontSizes.icon,
            fontWeight: fontWeights.bold,
            color: scoreColor(score.total),
            lineHeight: 1,
          }}
        >
          {score.total}
        </div>
        <div
          style={{
            fontSize: fontSizes.sm,
            color: colors.textPlaceholder,
            marginTop: spacing.xs,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {score.recommendation}
        </div>
      </div>

      {/* Breakdown bars */}
      <div style={{ marginBottom: spacing.xxxl }}>
        <div
          style={{
            fontSize: fontSizes.sm,
            fontWeight: fontWeights.semibold,
            color: colors.textFaint,
            marginBottom: spacing.md,
            textTransform: "uppercase",
          }}
        >
          Breakdown
        </div>
        {breakdownEntries.map((entry) => {
          const pct = entry.max > 0 ? (entry.score / entry.max) * 100 : 0;
          const barColor =
            pct >= 80 ? colors.green : pct >= 50 ? colors.amber : colors.red;
          return (
            <div key={entry.label} style={{ marginBottom: spacing.sm }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: fontSizes.md,
                  marginBottom: spacing.xs2,
                }}
              >
                <span style={{ color: colors.textSecondary }}>
                  {entry.label}
                </span>
                <span style={{ fontWeight: fontWeights.semibold }}>
                  {entry.score}/{entry.max}
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: borderRadius.sm,
                  background: colors.borderHairline,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(pct, 100)}%`,
                    background: barColor,
                    borderRadius: borderRadius.sm,
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Caps applied */}
      {score.capsApplied && score.capsApplied.length > 0 && (
        <div style={{ marginBottom: spacing.xxxl }}>
          <div
            style={{
              fontSize: fontSizes.sm,
              fontWeight: fontWeights.semibold,
              color: colors.red,
              marginBottom: spacing.sm,
              textTransform: "uppercase",
            }}
          >
            Caps applied
          </div>
          {score.capsApplied.map((cap, i) => (
            <div
              key={i}
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                background: colors.errorBg,
                border: `1px solid ${colors.actionErrorBorder}`,
                borderRadius: borderRadius.md,
                marginBottom: spacing.xs,
                fontSize: fontSizes.md,
              }}
            >
              <span
                style={{ color: colors.red, fontWeight: fontWeights.semibold }}
              >
                max {cap.maxScore}
              </span>
              <span style={{ color: colors.textMuted, marginLeft: spacing.md }}>
                {cap.reason}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Fit reasons */}
      {score.fitReasons.length > 0 && (
        <div style={{ marginBottom: spacing.xxxl }}>
          <div
            style={{
              fontSize: fontSizes.sm,
              fontWeight: fontWeights.semibold,
              color: colors.green,
              marginBottom: spacing.sm,
              textTransform: "uppercase",
            }}
          >
            Fit reasons
          </div>
          {score.fitReasons.map((reason, i) => (
            <div
              key={i}
              style={{
                padding: `${spacing.xs}px 0`,
                fontSize: fontSizes.md,
                color: colors.textSecondary,
                borderBottom: `1px solid ${colors.neutralBg}`,
              }}
            >
              ✓ {reason}
            </div>
          ))}
        </div>
      )}

      {/* Risk flags */}
      {score.riskFlags.length > 0 && (
        <div>
          <div
            style={{
              fontSize: fontSizes.sm,
              fontWeight: fontWeights.semibold,
              color: colors.red,
              marginBottom: spacing.sm,
              textTransform: "uppercase",
            }}
          >
            Risk flags
          </div>
          {score.riskFlags.map((flag, i) => (
            <RiskFlagRow key={i} flag={flag} />
          ))}
        </div>
      )}
    </div>
  );
}

function RiskFlagRow({ flag }: { flag: RiskFlag }): ReactNode {
  const severityColor = riskSeverityColor(flag.severity);
  return (
    <div
      style={{
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.actionErrorBg,
        border: `1px solid ${colors.borderHairline}`,
        borderRadius: borderRadius.md,
        marginBottom: spacing.xs,
        fontSize: fontSizes.md,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
        <span
          style={{
            display: "inline-block",
            padding: `0 ${spacing.xs}px`,
            borderRadius: borderRadius.sm,
            fontSize: fontSizes.xs,
            fontWeight: fontWeights.bold,
            background: severityColor,
            color: colors.white,
            textTransform: "uppercase",
          }}
        >
          {flag.severity}
        </span>
        <span style={{ color: colors.text }}>{flag.message}</span>
      </div>
      {flag.evidence && (
        <div
          style={{
            fontSize: fontSizes.xs,
            color: colors.textPlaceholder,
            marginTop: spacing.xs2,
            marginLeft: spacing.xs2,
          }}
        >
          {flag.evidence}
        </div>
      )}
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────────────

function HistoryTab({ ctx }: { ctx: VacancyContext }): ReactNode {
  if (!ctx.jobId) {
    return (
      <EmptyState
        icon="🕐"
        message="Status history"
        description="Open a vacancy page to see history."
      />
    );
  }

  if (!ctx.job) {
    return (
      <EmptyState
        icon="🕐"
        message="Not saved yet"
        description="Save this vacancy to start tracking status changes."
      />
    );
  }

  const history = ctx.job.statusHistory;
  if (!history || history.length === 0) {
    return (
      <EmptyState
        icon="🕐"
        message="No history"
        description="Status changes will appear as you interact with the vacancy."
      />
    );
  }

  // Show newest first
  const reversed = [...history].reverse();

  return (
    <div>
      <div
        style={{
          fontSize: fontSizes.sm,
          fontWeight: fontWeights.semibold,
          color: colors.textFaint,
          marginBottom: spacing.md,
          textTransform: "uppercase",
        }}
      >
        Status history ({history.length})
      </div>

      <div style={{ position: "relative" }}>
        {/* Timeline line */}
        <div
          style={{
            position: "absolute",
            left: 7,
            top: 0,
            bottom: 0,
            width: 2,
            background: colors.border,
          }}
        />

        {reversed.map((change, i) => {
          const isLast = i === reversed.length - 1;
          return (
            <div
              key={`${change.at}-${i}`}
              style={{
                position: "relative",
                paddingLeft: 24,
                marginBottom: isLast ? 0 : spacing.xxl,
              }}
            >
              {/* Dot */}
              <div
                style={{
                  position: "absolute",
                  left: 3,
                  top: 3,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: isLast ? colors.blue : "#bbb",
                  border: `2px solid ${colors.white}`,
                  boxShadow: `0 0 0 2px ${colors.border}`,
                }}
              />

              <div
                style={{
                  fontSize: fontSizes.md,
                  fontWeight: fontWeights.semibold,
                }}
              >
                {change.from ? (
                  <>
                    <span style={{ color: colors.textPlaceholder }}>
                      {statusLabel(change.from)}
                    </span>
                    <span
                      style={{ color: "#ccc", margin: `0 ${spacing.xs}px` }}
                    >
                      →
                    </span>
                  </>
                ) : null}
                <span>{statusLabel(change.to)}</span>
              </div>
              <div
                style={{
                  fontSize: fontSizes.xs,
                  color: colors.textPlaceholder,
                  marginTop: 1,
                }}
              >
                {formatShortDate(change.at)}
                <span style={{ marginLeft: spacing.sm, color: "#bbb" }}>
                  via {change.source}
                </span>
              </div>
              {change.note && (
                <div
                  style={{
                    fontSize: fontSizes.sm,
                    color: colors.textMuted,
                    marginTop: spacing.xs2,
                    fontStyle: "italic",
                  }}
                >
                  {change.note}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Letter Tab ─────────────────────────────────────────────────────────────

function LetterTab({ ctx }: { ctx: VacancyContext }): ReactNode {
  if (!ctx.jobId || !ctx.profileId) {
    return (
      <EmptyState
        icon="✉️"
        message="Cover Letter Studio"
        description="Open a vacancy page and select a profile to start writing."
      />
    );
  }

  return (
    <CoverLetterStudio
      jobId={ctx.jobId}
      profileId={ctx.profileId}
      resumeId={ctx.resumeId}
    />
  );
}

// ── Profile Tab Wrapper ────────────────────────────────────────────────────

function ProfileTabWrapper({
  ctx,
  onRefresh,
}: {
  ctx: VacancyContext;
  onRefresh: () => void;
}): ReactNode {
  return (
    <ProfileTab
      jobId={ctx.jobId}
      job={ctx.job}
      profileId={ctx.profileId}
      resumeId={ctx.resumeId}
      onProfileChange={onRefresh}
      onResumeChange={onRefresh}
    />
  );
}

// ── App Root ───────────────────────────────────────────────────────────────

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
    <ErrorBoundary rootLabel="Side Panel">
      {dbError ? (
        <ErrorState
          message="Failed to initialize local data"
          details={dbError}
        />
      ) : dbReady ? (
        <SidePanelContent />
      ) : (
        <LoadingState message="Initializing local data…" />
      )}
    </ErrorBoundary>
  );
}
