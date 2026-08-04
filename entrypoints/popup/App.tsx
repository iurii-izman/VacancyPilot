import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { OpsStatusDot } from "@/components/OpsStatusIndicator";
import { usePageStatus, PageStatus } from "@/components/PageStatus";
import { EmptyState } from "@/components/EmptyState";
import { tracker } from "@/services/tracker";
import { recomputeScoreForJob } from "@/services/score-recompute";
import { persistBadgeState } from "@/services/badge-state";
import { jobRepo, profileRepo } from "@/db/repositories";
import { loadSettings } from "@/db/settings-bridge";
import { ensureMigrationsBootstrapped } from "@/db";
import type { Job, JobStatus } from "@/models/job";
import type { Profile } from "@/models/profile";
import type { ApplicationStatusSync } from "@/adapters/types";
import type { PageStatusInfo } from "@/components/PageStatus";
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
  scoreColor,
  popupScoreColor,
  shellBody,
  panelHeader,
  appTitle,
  appSubtitle,
  infoChip,
  warningChip,
  errorChip,
  expandToggle,
  labelStyle,
  selectStyle,
} from "@/styles";

// ── Helpers ──

function buildJobId(vacancyId: string): string {
  return `hh_${vacancyId}`;
}

async function updateBadge(tabId: number, job: Job): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "UPDATE_BADGE",
      payload: {
        score: job.ruleScore?.total,
        status: job.status,
      },
    });
  } catch {
    // Content script may not be loaded — non-critical.
  }
}

const SIDE_PANEL_GENERIC_ERROR =
  "Could not open the Chrome side panel. Try opening the browser side panel manually, then select VacancyPilot.";
const SIDE_PANEL_USER_GESTURE_ERROR =
  "Chrome rejected side panel opening because the user gesture was lost. Try clicking the Side Panel button again.";
const SIDE_PANEL_API_MISSING_ERROR =
  "Chrome Side Panel API requires Chrome 116+ for programmatic open.";

type SidePanelOpenResult =
  | { success: true }
  | { success: false; error: string; hint?: string };

interface SidePanelOpenDeps {
  getCurrentWindowId: () => Promise<number | undefined>;
  open: (windowId: number) => Promise<void>;
  sendContext: (pageInfo: PageStatusInfo) => void;
  closePopup: () => void;
  supportsProgrammaticOpen: boolean;
}

const defaultSidePanelOpenDeps: SidePanelOpenDeps = {
  async getCurrentWindowId(): Promise<number | undefined> {
    const window = await chrome.windows.getCurrent({ populate: false });
    return window.id;
  },
  async open(windowId: number): Promise<void> {
    await chrome.sidePanel.open({ windowId });
  },
  sendContext(pageInfo: PageStatusInfo): void {
    void chrome.runtime
      .sendMessage(buildSetSidePanelContext(pageInfo))
      .catch((err: unknown) => {
        console.error(
          "[VacancyPilot] Failed to persist side panel context:",
          err,
        );
      });
  },
  closePopup(): void {
    window.close();
  },
  supportsProgrammaticOpen:
    typeof chrome !== "undefined" && Boolean(chrome.sidePanel?.open),
};

export function mapSidePanelOpenError(error: unknown): SidePanelOpenResult {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("may only be called in response to a user gesture") ||
    normalized.includes("user gesture")
  ) {
    return {
      success: false,
      error: SIDE_PANEL_USER_GESTURE_ERROR,
      hint: message,
    };
  }

  if (
    (normalized.includes("sidepanel") ||
      normalized.includes("reading 'open'") ||
      normalized.includes('reading "open"')) &&
    (normalized.includes("undefined") ||
      normalized.includes("not a function") ||
      normalized.includes("cannot read") ||
      normalized.includes("reading 'open'") ||
      normalized.includes('reading "open"'))
  ) {
    return {
      success: false,
      error: SIDE_PANEL_API_MISSING_ERROR,
      hint: message,
    };
  }

  return {
    success: false,
    error: SIDE_PANEL_GENERIC_ERROR,
    hint: message,
  };
}

export function getSidePanelButtonLabel(isOpeningSidePanel: boolean): string {
  return isOpeningSidePanel ? "Opening…" : "Side Panel";
}

export interface PopupContainerStyle {
  minWidth: number;
  maxWidth: number;
  width: string;
  minHeight: number;
  maxHeight: number;
  overflowY: "auto" | "hidden";
  boxSizing: "border-box";
}

interface DashboardOpenDeps {
  getOptionsUrl: () => string;
  openTab: (url: string) => Promise<void>;
}

const defaultDashboardOpenDeps: DashboardOpenDeps = {
  getOptionsUrl(): string {
    return chrome.runtime.getURL("options.html");
  },
  async openTab(url: string): Promise<void> {
    await chrome.tabs.create({ url });
  },
};

export function getPopupContainerStyle(): PopupContainerStyle {
  return {
    minWidth: 300,
    maxWidth: 360,
    width: "100%",
    minHeight: 360,
    maxHeight: 600,
    overflowY: "auto",
    boxSizing: "border-box",
  };
}

// ── Popup Content ──

function PopupContent(): ReactNode {
  const pageInfo = usePageStatus();
  const [savedJob, setSavedJob] = useState<Job | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpeningSidePanel, setIsOpeningSidePanel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sidePanelError, setSidePanelError] = useState<string | null>(null);
  const [jobLoaded, setJobLoaded] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<
    string | undefined
  >();
  const [closePopupAfterOpen, setClosePopupAfterOpen] = useState(true);
  const [passiveStatus, setPassiveStatus] = useState<
    Partial<ApplicationStatusSync> | null | undefined
  >(undefined);

  // Load profiles on mount
  useEffect(() => {
    async function loadProfiles(): Promise<void> {
      try {
        const [list, settings] = await Promise.all([
          profileRepo.list(),
          loadSettings(),
        ]);
        setProfiles(list);
        setClosePopupAfterOpen(
          settings.general.closePopupAfterOpeningSidePanel,
        );
        // Preselect: job's selectedProfileId > settings default > first profile
        const defaultId =
          savedJob?.selectedProfileId ??
          settings.general.defaultProfileId ??
          list[0]?.id;
        setSelectedProfileId(defaultId);
      } catch {
        // Non-critical
      }
    }
    void loadProfiles();
  }, [savedJob?.selectedProfileId]);

  // Load saved job from DB when vacancy is detected.
  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      if (pageInfo.kind !== "vacancy" || !pageInfo.vacancyId) {
        if (!cancelled) {
          setSavedJob(null);
          setJobLoaded(true);
          setPassiveStatus(undefined);
        }
        return;
      }

      try {
        const jobId = buildJobId(pageInfo.vacancyId);
        const job = await jobRepo.getById(jobId);
        if (!cancelled) {
          setSavedJob(job ?? null);
          setJobLoaded(true);

          // Update badge from saved state on popup open.
          if (job) {
            await updateBadge(pageInfo.tabId, job);
            await persistBadgeState(pageInfo.vacancyId, {
              score: job.ruleScore?.total,
              status: job.status,
            });
          }
        }
      } catch {
        if (!cancelled) {
          setSavedJob(null);
          setJobLoaded(true);
        }
      }

      // Fetch passive HH status from the content script (independent of save state).
      try {
        const response: {
          success: boolean;
          passiveStatus?: Partial<ApplicationStatusSync> | null;
        } = await chrome.tabs.sendMessage(pageInfo.tabId, {
          type: "EXTRACT_VACANCY",
        });
        if (!cancelled) {
          setPassiveStatus(response?.passiveStatus ?? undefined);
        }
      } catch {
        // Content script may not be reachable — non-critical.
        if (!cancelled) setPassiveStatus(undefined);
      }
    }

    setJobLoaded(false);
    setActionError(null);
    setSidePanelError(null);
    setPassiveStatus(undefined);
    void load();

    return () => {
      cancelled = true;
    };
  }, [pageInfo]);

  // ── Save ──

  const handleSave = useCallback(async () => {
    if (pageInfo.kind !== "vacancy") return;

    setIsSaving(true);
    setActionError(null);

    try {
      // Request vacancy extraction from the content script.
      const response: {
        success: boolean;
        dto?: import("@/adapters/hh/types").RawVacancyDTO;
        error?: string;
        passiveStatus?: Partial<ApplicationStatusSync> | null;
      } = await chrome.tabs.sendMessage(pageInfo.tabId, {
        type: "EXTRACT_VACANCY",
      });

      // Update passive status from the response.
      setPassiveStatus(response?.passiveStatus ?? undefined);

      if (!response?.success || !response.dto) {
        setActionError(response?.error ?? "Could not extract vacancy data");
        setIsSaving(false);
        return;
      }

      const job = await tracker.saveFromDTO(response.dto);

      // Compute score if a profile is available (uses shared recompute path).
      const jobWithScore =
        (await recomputeScoreForJob(job.id, selectedProfileId)) ?? job;

      setSavedJob(jobWithScore);

      // Update the page badge live (recomputeScoreForJob already persisted badge state).
      await updateBadge(pageInfo.tabId, jobWithScore);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes("Could not establish connection") ||
        msg.includes("receiving end does not exist")
      ) {
        setActionError(
          "Could not reach the vacancy page. Try reloading the page first.",
        );
      } else {
        setActionError(msg);
      }
    } finally {
      setIsSaving(false);
    }
  }, [pageInfo, selectedProfileId]);

  // ── Reject ──

  const handleReject = useCallback(async () => {
    if (pageInfo.kind !== "vacancy") return;

    setIsSaving(true);
    setActionError(null);

    try {
      // If the job is already saved, update its status.
      // If not saved yet, save first then reject.
      let job = savedJob ?? null;

      if (!job) {
        // Need to extract and save first.
        const response: {
          success: boolean;
          dto?: import("@/adapters/hh/types").RawVacancyDTO;
          error?: string;
          passiveStatus?: Partial<ApplicationStatusSync> | null;
        } = await chrome.tabs.sendMessage(pageInfo.tabId, {
          type: "EXTRACT_VACANCY",
        });

        // Update passive status from the response.
        setPassiveStatus(response?.passiveStatus ?? undefined);

        if (!response?.success || !response.dto) {
          setActionError(response?.error ?? "Could not extract vacancy data");
          setIsSaving(false);
          return;
        }

        job = await tracker.saveFromDTO(response.dto);
      }

      const updated = await tracker.updateStatus(
        job.id,
        "rejected_by_me" as JobStatus,
        "Rejected from popup",
      );

      if (updated) {
        setSavedJob(updated);
        await updateBadge(pageInfo.tabId, updated);
        await persistBadgeState(pageInfo.vacancyId, {
          score: updated.ruleScore?.total,
          status: updated.status,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes("Could not establish connection") ||
        msg.includes("receiving end does not exist")
      ) {
        setActionError(
          "Could not reach the vacancy page. Try reloading the page first.",
        );
      } else {
        setActionError(msg);
      }
    } finally {
      setIsSaving(false);
    }
  }, [pageInfo, savedJob]);

  const handleOpenSidePanel = useCallback(async () => {
    setIsOpeningSidePanel(true);
    setSidePanelError(null);

    const result = await openSidePanel(
      pageInfo,
      defaultSidePanelOpenDeps,
      { closePopupAfterSuccess: closePopupAfterOpen },
    );

    if (!result.success) {
      setSidePanelError(result.error);
    }

    setIsOpeningSidePanel(false);
  }, [closePopupAfterOpen, pageInfo]);

  // ── Derived display values ──

  const scoreDisplay =
    savedJob?.ruleScore?.total !== undefined
      ? String(savedJob.ruleScore.total)
      : "—";

  const statusDisplay = savedJob?.status ?? "—";

  const recommendation = savedJob?.ruleScore?.recommendation;

  const scoreDisplayColor = popupScoreColor(savedJob?.ruleScore?.total);

  const isVacancy = pageInfo.kind === "vacancy";

  // Score breakdown visibility toggle
  const [showBreakdown, setShowBreakdown] = useState(false);

  // ── Render ──

  return (
    <div
      style={{
        padding: spacing.xxxl,
        minHeight: 360,
        ...shellBody,
      }}
    >
      {/* Header */}
      <div style={{ ...panelHeader, marginBottom: spacing.lg }}>
        <h1 style={appTitle}>VacancyPilot</h1>
        <span style={appSubtitle}>
          v0.1 <OpsStatusDot />
        </span>
      </div>

      {/* Page status */}
      <div role="status" style={{ ...infoChip, marginBottom: spacing.md }}>
        <PageStatus info={pageInfo} />
      </div>

      {/* Passive HH status hint (informational, read-only) */}
      {passiveStatus && passiveStatusLabel(passiveStatus) && (
        <div
          role="status"
          aria-live="polite"
          style={{ ...warningChip, marginBottom: spacing.md }}
        >
          {passiveStatusLabel(passiveStatus)}
        </div>
      )}

      {/* Score & Status — compact summary card */}
      {isVacancy && jobLoaded ? (
        <div
          style={{
            marginBottom: spacing.md,
            padding: spacing.md,
            background: colors.cardBg,
            borderRadius: 6,
            border: `1px solid ${colors.borderHairline}`,
          }}
        >
          {/* Score row with prominent number and status inline */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: spacing.sm,
              marginBottom: recommendation ? spacing.xs3 : 0,
            }}
          >
            <span
              style={{
                fontSize: 22,
                fontWeight: fontWeights.bold,
                color: scoreDisplayColor,
                lineHeight: 1,
              }}
            >
              {scoreDisplay}
            </span>
            <span
              style={{
                fontSize: fontSizes.sm,
                color: colors.textFaint,
                textTransform: "uppercase",
                letterSpacing: "0.3px",
              }}
            >
              / 100
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: fontSizes.sm,
                fontWeight: fontWeights.semibold,
                color: colors.textSecondary,
              }}
            >
              {statusDisplay}
            </span>
          </div>

          {recommendation && (
            <div
              style={{
                fontSize: fontSizes.sm,
                color: colors.textPlaceholder,
              }}
            >
              {recommendation}
            </div>
          )}

          {/* Score breakdown toggle — collapsed by default */}
          {savedJob?.ruleScore && (
            <div style={{ marginTop: spacing.sm }}>
              <button
                type="button"
                onClick={() => setShowBreakdown(!showBreakdown)}
                aria-expanded={showBreakdown}
                aria-controls="popup-score-breakdown"
                style={expandToggle}
              >
                {showBreakdown ? "▾ Hide breakdown" : "▸ Show breakdown"}
              </button>
              {showBreakdown && (
                <div id="popup-score-breakdown">
                  <ScoreBreakdown score={savedJob.ruleScore} />
                </div>
              )}
            </div>
          )}
        </div>
      ) : pageInfo.kind === "loading" || (isVacancy && !jobLoaded) ? null : (
        <EmptyState
          icon="🔍"
          message="No vacancy detected"
          description="Open an HH.ru vacancy page to start."
        />
      )}

      {/* Profile selector */}
      {isVacancy && profiles.length > 1 && (
        <div style={{ marginBottom: spacing.md }}>
          <label htmlFor="popup-profile-select" style={labelStyle}>
            Profile
          </label>
          <select
            id="popup-profile-select"
            value={selectedProfileId ?? ""}
            onChange={(e) => setSelectedProfileId(e.target.value || undefined)}
            style={selectStyle}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Error message */}
      {actionError && (
        <div
          role="alert"
          aria-live="assertive"
          style={{ ...errorChip, marginBottom: spacing.md }}
        >
          {actionError}
        </div>
      )}

      {sidePanelError && (
        <div
          role="alert"
          aria-live="assertive"
          style={{ ...errorChip, marginBottom: spacing.md }}
        >
          {sidePanelError}
        </div>
      )}

      {/* Actions — primary Side Panel first, then quick actions */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing.xs,
          marginTop: isVacancy ? spacing.xs : 0,
        }}
      >
        <div
          role="note"
          style={{
            fontSize: fontSizes.sm,
            color: colors.textFaint,
            lineHeight: 1.4,
          }}
        >
          Chrome keeps extension popups anchored to the toolbar icon. Continue
          in the Side Panel for the full workspace and to avoid popup overlap.
        </div>
        <ActionButton
          label={getSidePanelButtonLabel(isOpeningSidePanel)}
          onClick={() => void handleOpenSidePanel()}
          primary
          wide
          disabled={isOpeningSidePanel}
          busy={isOpeningSidePanel}
        />
        {isVacancy && (
          <div style={{ display: "flex", gap: spacing.xs }}>
            <ActionButton
              label={isSaving ? "Saving…" : "Save"}
              color="#2a8"
              onClick={handleSave}
              disabled={isSaving}
              busy={isSaving}
              wide
            />
            <ActionButton
              label={isSaving ? "Rejecting…" : "Reject"}
              color="#c44"
              onClick={handleReject}
              disabled={isSaving}
              busy={isSaving}
              wide
            />
          </div>
        )}
        <ActionButton
          label="Dashboard"
          onClick={() => void openDashboard()}
          wide
        />
      </div>
    </div>
  );
}

/**
 * Build the SET_SIDE_PANEL_CONTEXT message payload for persisting
 * vacancy context before opening the side panel.
 */
export function buildSetSidePanelContext(pageInfo: PageStatusInfo): {
  type: "SET_SIDE_PANEL_CONTEXT";
  tabId?: number;
  vacancyId?: string;
} {
  if (pageInfo.kind === "vacancy") {
    return {
      type: "SET_SIDE_PANEL_CONTEXT",
      tabId: pageInfo.tabId,
      vacancyId: pageInfo.vacancyId,
    };
  }

  return { type: "SET_SIDE_PANEL_CONTEXT" };
}

/**
 * Open the Chrome side panel from a popup user-gesture path.
 *
 * 1. Persist vacancy context to the background (fire-and-forget).
 * 2. Open the side panel directly via chrome.sidePanel.open().
 *    This avoids a background hop that can lose the user-gesture context
 *    and cause the panel to fail to open.
 */
export async function openSidePanel(
  pageInfo: PageStatusInfo,
  deps: SidePanelOpenDeps = defaultSidePanelOpenDeps,
  options: { closePopupAfterSuccess?: boolean } = {},
): Promise<SidePanelOpenResult> {
  deps.sendContext(pageInfo);

  if (!deps.supportsProgrammaticOpen) {
    return { success: false, error: SIDE_PANEL_API_MISSING_ERROR };
  }

  try {
    const windowId = await deps.getCurrentWindowId();
    if (windowId === undefined) {
      return { success: false, error: SIDE_PANEL_GENERIC_ERROR };
    }

    await deps.open(windowId);
    if (options.closePopupAfterSuccess) {
      deps.closePopup();
    }
    return { success: true };
  } catch (error) {
    console.error("[VacancyPilot] Failed to open side panel:", error);
    return mapSidePanelOpenError(error);
  }
}

export async function openDashboard(
  deps: DashboardOpenDeps = defaultDashboardOpenDeps,
): Promise<void> {
  const url = deps.getOptionsUrl();

  try {
    await deps.openTab(url);
  } catch (error) {
    console.error("[VacancyPilot] Failed to open dashboard tab:", error);
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

// ── Score Breakdown ──────────────────────────────────────────────────────

function ScoreBreakdown({
  score,
}: {
  score: import("@/models/scoring").ScoreResult;
}): ReactNode {
  const entries: Array<{ label: string; score: number; max: number }> = [
    { label: "Title", score: score.breakdown.titleMatch, max: 20 },
    {
      label: "Must-have skills",
      score: score.breakdown.mustHaveSkills,
      max: 25,
    },
    { label: "Nice-to-have", score: score.breakdown.niceToHaveSkills, max: 10 },
    { label: "Experience", score: score.breakdown.experienceFit, max: 15 },
    {
      label: "Work/Location",
      score: score.breakdown.workModeLocation,
      max: 10,
    },
    { label: "Salary", score: score.breakdown.salaryFit, max: 10 },
    { label: "Company", score: score.breakdown.companyPreference, max: 5 },
    { label: "Misc", score: score.breakdown.languageScheduleMisc, max: 5 },
  ];

  return (
    <div
      style={{
        marginTop: 6,
        padding: "6px 8px",
        background: "#f9f9f9",
        borderRadius: 4,
        fontSize: fontSizes.sm,
      }}
    >
      {entries.map((e) => {
        const pct = e.max > 0 ? (e.score / e.max) * 100 : 0;
        const barColor = scoreColor(pct >= 80 ? 85 : pct >= 50 ? 70 : 30);
        return (
          <div key={e.label} style={{ marginBottom: 3 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 1,
              }}
            >
              <span style={{ color: colors.textFaint }}>{e.label}</span>
              <span style={{ fontWeight: fontWeights.semibold }}>
                {e.score}/{e.max}
              </span>
            </div>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: colors.borderHairline,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(pct, 100)}%`,
                  background: barColor,
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        );
      })}

      {score.fitReasons.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div
            style={{
              fontWeight: fontWeights.semibold,
              color: colors.green,
              marginBottom: 2,
            }}
          >
            Fit reasons
          </div>
          {score.fitReasons.slice(0, 3).map((r, i) => (
            <div
              key={i}
              style={{ color: colors.textSecondary, padding: "1px 0" }}
            >
              ✓ {r}
            </div>
          ))}
          {score.fitReasons.length > 3 && (
            <div
              style={{ color: colors.textPlaceholder, fontSize: fontSizes.xs }}
            >
              +{score.fitReasons.length - 3} more
            </div>
          )}
        </div>
      )}

      {score.riskFlags.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div
            style={{
              fontWeight: fontWeights.semibold,
              color: colors.red,
              marginBottom: 2,
            }}
          >
            Risk flags
          </div>
          {score.riskFlags.slice(0, 3).map((flag, i) => (
            <div
              key={i}
              style={{
                color: colors.red,
                padding: "1px 0",
                fontSize: fontSizes.xs,
              }}
            >
              ⚠ {flag.message}
            </div>
          ))}
          {score.riskFlags.length > 3 && (
            <div
              style={{ color: colors.textPlaceholder, fontSize: fontSizes.xs }}
            >
              +{score.riskFlags.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Action Button ──

function ActionButton({
  label,
  onClick,
  color,
  primary,
  wide,
  disabled,
  busy,
}: {
  label: string;
  onClick: () => void;
  color?: string;
  primary?: boolean;
  wide?: boolean;
  disabled?: boolean;
  busy?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-busy={busy === true ? true : undefined}
      aria-disabled={disabled === true ? true : undefined}
      style={{
        flex: wide ? 1 : undefined,
        padding: "4px 8px",
        fontSize: fontSizes.md,
        cursor: disabled ? "not-allowed" : "pointer",
        border: primary
          ? `1px solid ${color ?? colors.blue}`
          : `1px solid ${colors.borderLight}`,
        borderRadius: 4,
        background: primary ? (color ?? colors.blue) : colors.white,
        color: primary ? colors.white : (color ?? colors.text),
        fontWeight: primary ? fontWeights.semibold : fontWeights.normal,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

// ── App Root ──

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
    <div style={getPopupContainerStyle()}>
      <ErrorBoundary rootLabel="Popup">
        {dbError ? (
          <div
            style={{
              minHeight: 360,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ErrorState
              message="Failed to initialize local data"
              details={dbError}
            />
          </div>
        ) : dbReady ? (
          <PopupContent />
        ) : (
          <div
            style={{
              minHeight: 360,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <LoadingState message="Initializing local data…" />
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
}
