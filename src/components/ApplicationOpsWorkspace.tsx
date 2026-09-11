import { useEffect, useMemo, useState, type ReactNode } from "react";
import { db } from "@/db";
import { EmptyState } from "@/components/EmptyState";
import { jobRepo } from "@/db/repositories";
import { getOpsClient } from "@/services/companion-service";
import { loadSettings } from "@/db/settings-bridge";
import { buildCompanionProviderPolicy } from "@/adapters/companion/provider-policy";
import { capabilityMessage, getOpsCapabilities, type OpsCapabilities } from "@/services/ops-capabilities";
import { NATIVE_HH_SUBMISSION_CONFIRMATION } from "@/services/applied-confirmation";
import { tracker } from "@/services/tracker";
import { openHhVacancy } from "@/services/hh-navigation";
import { withWriteGuard } from "@/services/reset-guard";
import type { OpsAnalysisState, OpsFollowUp, OpsProjectionQuery, OpsSummary } from "@/adapters/companion/ops-projection-types";
import type {
  FollowUpItem,
  ApplicationSessionPreview,
} from "@/adapters/companion/application-types";
import type { HHSearchProfile } from "@/adapters/companion/types";
import type { FullV4PreviewResponse } from "@/adapters/companion/vacancy-types";
import type { Job } from "@/models/job";
import { fromOps, fromStandalone, type OpsWorkItemView, type StandaloneWorkItemView, type WorkItemViewModel } from "@/models/work-item";
import { card, colors, compactCard, formInput, formSelect, pageIntro, pageTitle, primaryButton, secondaryButton, statusBadge, tertiaryButton, tabButtonStyle, tabListStyle } from "@/styles";

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

function scoreColor(total: number | null | undefined): string {
  if (total === undefined || total === null) return "#687789";
  return total >= 70 ? "#2a8" : total >= 50 ? "#e6a817" : "#c44";
}

function statusLabel(status: string): string {
  if (status === "none") return "Not applied";
  if (status === "multiple") return "Multiple applications";
  return status.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
}

function analysisLabel(state: OpsAnalysisState | string): string {
  const labels: Record<string, string> = {
    not_analyzed: "Not analyzed",
    running: "Running",
    ready: "Ready",
    invalid: "Invalid",
    failed: "Failed",
  };
  return labels[state] ?? state;
}

function followUpForClient(followUp: OpsFollowUp): FollowUpItem {
  return {
    id: followUp.follow_up_id,
    application_id: followUp.application_id,
    reason: followUp.reason,
    due_at: followUp.due_at,
    status: followUp.status as FollowUpItem["status"],
    derived_state: followUp.derived_state,
    draft_text: followUp.draft_text,
    sent_at: followUp.sent_at,
    revision: followUp.revision,
    created_at: followUp.created_at,
    updated_at: followUp.updated_at,
  };
}

function isOpsView(item: WorkItemViewModel): item is OpsWorkItemView {
  return item.authority === "ops";
}

function isStandaloneView(item: WorkItemViewModel): item is StandaloneWorkItemView {
  return item.authority === "standalone";
}

export function needsFullVacancyHydration(job: Pick<Job, "descriptionClean">): boolean {
  return job.descriptionClean.trim().length < 200;
}

const cardStyle: React.CSSProperties = { ...card, padding: 14 };
const mutedPanelStyle: React.CSSProperties = { ...compactCard, background: colors.neutralBg };
const actionRowStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

function useOpsCapabilities(): OpsCapabilities | null {
  const [capabilities, setCapabilities] = useState<OpsCapabilities | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getOpsCapabilities().then((next) => {
      if (!cancelled) setCapabilities(next);
    }).catch(() => {
      if (!cancelled) setCapabilities(null);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return capabilities;
}

interface WorkItemsState {
  items: WorkItemViewModel[];
  loading: boolean;
  error: string | null;
  mode: "standalone" | "ops" | null;
  capabilities: OpsCapabilities | null;
  total: number;
  summary: OpsSummary | null;
}

/** Read the selected authority without ever coercing Ops records into Jobs. */
function useWorkItems(query: OpsProjectionQuery = {}): WorkItemsState {
  const [state, setState] = useState<WorkItemsState>({
    items: [], loading: true, error: null, mode: null, capabilities: null, total: 0, summary: null,
  });
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let capabilities: OpsCapabilities | null = null;
      try {
        capabilities = await getOpsCapabilities();
        if (cancelled) return;
        if (capabilities.mode.effectiveMode === "ops") {
          if (!capabilities.canUseSearchProfiles) {
            throw new Error(capabilityMessage("search-profiles", capabilities));
          }
          const response = await getOpsClient().getOpsWorkItems(query);
          if (cancelled) return;
          setState({
            items: response.data.map(fromOps), loading: false, error: null, mode: "ops",
            capabilities, total: response.meta.total, summary: response.meta.summary,
          });
          return;
        }

        // Standalone is a separate authority.  Inbox applies its filters over
        // this complete local result; Companion is not a fallback or join.
        const jobs = [...(await jobRepo.list())].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (cancelled) return;
        const items = jobs.map(fromStandalone);
        setState({ items, loading: false, error: null, mode: "standalone", capabilities, total: items.length, summary: null });
      } catch (error: unknown) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to read Ops work items";
        setState({
          items: [], loading: false,
          error: capabilities?.mode.effectiveMode === "ops" ? `Ops read model unavailable: ${message}` : message,
          mode: capabilities?.mode.effectiveMode ?? null, capabilities, total: 0, summary: null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // The serialized request is the intentional dependency for filter changes.
  }, [queryKey]);

  return state;
}

function ActionCard({ label, value, description, onClick }: { label: string; value: string; description: string; onClick: () => void }): ReactNode {
  return <button type="button" onClick={onClick} style={{ ...compactCard, textAlign: "left", cursor: "pointer", minWidth: 170, flex: "1 1 170px", marginBottom: 0 }} aria-label={`${label}: ${value}`}>
    <div style={{ fontSize: 12, color: colors.textMuted }}>{label}</div>
    <div style={{ fontSize: 23, fontWeight: 700, color: colors.navy, margin: "3px 0" }}>{value}</div>
    <div style={{ fontSize: 11, color: colors.textFaint }}>{description}</div>
  </button>;
}

export function TodayWorkspace({ onNavigate }: { onNavigate?: (section: "discovery" | "inbox" | "pipeline") => void }): ReactNode {
  const query = useMemo<OpsProjectionQuery>(() => ({ view: "summary", limit: 1 }), []);
  const { items, loading, error, mode, capabilities, summary } = useWorkItems(query);
  const [analytics, setAnalytics] = useState<{ applications_applied: number } | null>(null);
  const [analyticsError, setAnalyticsError] = useState(false);
  const [standaloneFollowupCount, setStandaloneFollowupCount] = useState<number | null>(null);

  useEffect(() => {
    if (mode !== "ops" || !capabilities?.canUseOpsAnalytics) return;
    let cancelled = false;
    void getOpsClient().getAnalyticsSummary().then((response) => {
      if (!cancelled) setAnalytics({ applications_applied: response.data.applications_applied });
    }).catch(() => {
      if (!cancelled) setAnalyticsError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [capabilities, mode]);

  useEffect(() => {
    if (mode !== "standalone") return;
    let cancelled = false;
    void db.applications.toArray().then((applications) => {
      const count = applications.filter((item) => item.followUpAt && new Date(item.followUpAt) <= new Date()).length;
      if (!cancelled) setStandaloneFollowupCount(count);
    }).catch(() => {
      if (!cancelled) setStandaloneFollowupCount(null);
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (loading || (mode === "ops" && capabilities?.canUseOpsAnalytics && analytics === null && !analyticsError)) return <p role="status">Loading Today…</p>;
  if (error) return <div role="alert" style={cardStyle}>Today unavailable: {error}</div>;

  const standaloneJobs = items.filter(isStandaloneView).map((item) => item.job);
  const newJobs = standaloneJobs.filter((job) => job.status === "new" || job.status === "viewed");
  const ready = standaloneJobs.filter((job) => job.status === "letter_ready");
  const applied = standaloneJobs.filter((job) => job.status === "applied");
  const updated = standaloneJobs.filter((job) => job.passiveHHStatus && job.passiveHHStatus.detectedAt > job.updatedAt);
  const ops = mode === "ops";
  const newCount = ops ? summary?.vacancies_without_application ?? 0 : newJobs.length;
  const readyCount = ops ? summary?.ready_to_review ?? 0 : ready.length;
  const followupCount = ops ? summary?.followups_due ?? null : standaloneFollowupCount;
  const appliedCount = ops ? analytics?.applications_applied ?? null : applied.length;
  const attentionCount = newCount + readyCount + (ops ? 0 : updated.length) + (followupCount ?? 0);
  const companion = capabilities?.companion.status ?? "unavailable";

  return <section aria-labelledby="today-title">
    <h2 id="today-title" style={pageTitle}>Today</h2>
    <p style={pageIntro}>A daily, action-oriented view of the local job search.</p>
    {attentionCount === 0 && !ops ? <div style={{ ...mutedPanelStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}><div><strong style={{ display: "block", color: colors.navy, marginBottom: 4 }}>Nothing needs attention right now.</strong><span style={{ color: colors.textMuted, fontSize: 12 }}>Open Discovery to sync new vacancies.</span></div><button type="button" onClick={() => onNavigate?.("discovery")} style={primaryButton}>Open Discovery</button></div> : <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0" }}>
      <ActionCard label="New to review" value={String(newCount)} description={ops ? "Vacancies with no Application" : "Open the Inbox"} onClick={() => onNavigate?.("inbox")} />
      <ActionCard label="Ready to review" value={String(readyCount)} description={ops ? "Valid persisted analysis" : "Review manually"} onClick={() => onNavigate?.("inbox")} />
      {!ops && <ActionCard label="HH updates" value={String(updated.length)} description="Known local signals" onClick={() => onNavigate?.("inbox")} />}
      <ActionCard label="Follow-ups due" value={followupCount === null ? "—" : String(followupCount)} description={followupCount === null ? "Unavailable" : "Open the Inbox"} onClick={() => onNavigate?.("inbox")} />
      <ActionCard label="Applied" value={appliedCount === null ? "—" : String(appliedCount)} description={appliedCount === null ? "Unavailable" : ops ? "Confirmed Applications" : "Tracked explicitly"} onClick={() => onNavigate?.("pipeline")} />
    </div>}
    <div style={{ ...mutedPanelStyle, marginTop: 16 }}><h3 style={{ margin: "0 0 8px", fontSize: 14, color: colors.navy }}>System status</h3><p style={{ margin: 0, fontSize: 12 }}>Companion: <strong>{companion}</strong>. {ops ? "Today counters are calculated from complete Companion read sources." : "Standalone counters use the local Dexie domain."}</p>{ops && analyticsError && <p role="status" style={{ margin: "8px 0 0", fontSize: 12 }}>Applied analytics unavailable; it is not shown as zero.</p>}<p style={{ margin: "8px 0 0", fontSize: 12 }}>HH negotiations: <strong>Unavailable when denied by HH</strong>; this is not shown as zero responses.</p></div>
  </section>;
}

function standaloneInboxMatches(item: StandaloneWorkItemView, filters: { query: string; status: string; workMode: string; scoreBand: string; decision: string; analysisStatus: string; updatedAfter: string }): boolean {
  const job = item.job;
  const query = filters.query.toLowerCase();
  const score = item.score;
  const matchesScore = filters.scoreBand === "all" || (filters.scoreBand === "high" && score !== null && score >= 70) || (filters.scoreBand === "mid" && score !== null && score >= 50 && score < 70) || (filters.scoreBand === "low" && score !== null && score < 50);
  const matchesAnalysis = filters.analysisStatus === "all" || (filters.analysisStatus === "available" && Boolean(job.aiAnalysis)) || (filters.analysisStatus === "not_run" && !job.aiAnalysis);
  return (!query || `${job.title} ${job.companyName}`.toLowerCase().includes(query)) && (filters.status === "all" || job.status === filters.status) && (filters.workMode === "all" || job.workMode === filters.workMode) && matchesScore && (filters.decision === "all" || item.decision === filters.decision) && matchesAnalysis && (!filters.updatedAfter || job.updatedAt >= new Date(filters.updatedAfter).toISOString());
}

export function Inbox({ onSelect, onNavigate }: { onSelect?: (item: WorkItemViewModel) => void; onNavigate?: (route: "discovery") => void }): ReactNode {
  const capabilities = useOpsCapabilities();
  const [profileFilter, setProfileFilter] = useState("all");
  const [searchProfiles, setSearchProfiles] = useState<HHSearchProfile[]>([]);
  const [queryText, setQueryText] = useState("");
  const [status, setStatus] = useState("all");
  const [workMode, setWorkMode] = useState("all");
  const [scoreBand, setScoreBand] = useState("all");
  const [decision, setDecision] = useState("all");
  const [analysisStatus, setAnalysisStatus] = useState("all");
  const [updatedAfter, setUpdatedAfter] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<ApplicationSessionPreview | null>(null);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [sessionItems, setSessionItems] = useState<Array<{ title: string; company_name: string | null; queue_state: string }>>([]);

  const opsMode = capabilities?.mode.effectiveMode === "ops";
  const opsAnalysisState: OpsAnalysisState | undefined = opsMode && analysisStatus !== "all" ? analysisStatus as OpsAnalysisState : undefined;
  const projectionQuery = useMemo<OpsProjectionQuery>(() => ({
    view: "vacancies", limit: 100, offset: 0, source: "hh", archived: false,
    query: opsMode && queryText ? queryText : undefined,
    application_status: opsMode && status !== "all" ? status : undefined,
    work_mode: opsMode && workMode !== "all" ? workMode as "remote" | "hybrid" | "office" : undefined,
    score_band: opsMode && scoreBand !== "all" ? scoreBand as "high" | "mid" | "low" : undefined,
    decision: opsMode && decision !== "all" ? decision as "apply" | "consider" | "skip" | "needs_input" : undefined,
    analysis_state: opsAnalysisState,
    updated_after: opsMode && updatedAfter ? new Date(updatedAfter).toISOString() : undefined,
    search_profile_id: opsMode && profileFilter !== "all" ? profileFilter : undefined,
  }), [analysisStatus, decision, opsAnalysisState, opsMode, profileFilter, queryText, scoreBand, status, updatedAfter, workMode]);
  const { items, loading, error, total } = useWorkItems(projectionQuery);

  useEffect(() => {
    if (!capabilities?.canUseSearchProfiles) {
      setSearchProfiles([]);
      return;
    }
    void getOpsClient().listHHSearchProfiles().then((response) => setSearchProfiles(response.data)).catch(() => setSearchProfiles([]));
  }, [capabilities]);

  const filtered = useMemo(() => {
    if (opsMode) return items;
    return items.filter((item): item is StandaloneWorkItemView => isStandaloneView(item) && standaloneInboxMatches(item, { query: queryText, status, workMode, scoreBand, decision, analysisStatus, updatedAfter }));
  }, [analysisStatus, decision, items, opsMode, queryText, scoreBand, status, updatedAfter, workMode]);

  if (loading) return <p role="status">Loading Inbox…</p>;
  if (error) return <div role="alert" style={cardStyle}>Inbox unavailable: {error}</div>;

  const itemSelectionId = (item: WorkItemViewModel): string => isOpsView(item) ? item.vacancyId.companionVacancyId : item.vacancyId.standaloneJobId;
  const toggleSelection = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const prepareSelected = async () => {
    if (selectedIds.length === 0) return;
    try {
      const currentCapabilities = await getOpsCapabilities({ force: true });
      if (!currentCapabilities.canRunApplicationFactory) { setSessionMessage(capabilityMessage("application-factory", currentCapabilities)); return; }
      const policy = buildCompanionProviderPolicy(await loadSettings());
      const result = await getOpsClient().previewApplicationSession(selectedIds, policy);
      setPreview(result.data);
      setSessionMessage("Preview ready. No provider call was made; execution requires these receipts and the unchanged policy.");
    } catch (err) { setSessionMessage(err instanceof Error ? err.message : "Unable to create preview"); }
  };
  const confirmPrepare = async () => {
    if (!preview || selectedIds.length === 0) return;
    try {
      const currentCapabilities = await getOpsCapabilities({ force: true });
      if (!currentCapabilities.canRunApplicationFactory) { setSessionMessage(capabilityMessage("application-factory", currentCapabilities)); return; }
      const policy = buildCompanionProviderPolicy(await loadSettings());
      const previewReceipts = Object.fromEntries(
        (preview.items ?? [])
          .filter((item) => item.receipt)
          .map((item) => [item.vacancy_id, item.receipt as string]),
      );
      const session = await getOpsClient().createApplicationSession(selectedIds, {
        policy,
        confirmation: true,
        preview_receipts: previewReceipts,
      });
      const processed = await getOpsClient().executeApplicationSession(
        session.data.id,
        {
          confirmation: true,
          policy,
          preview_receipts: previewReceipts,
        },
      );
      setSessionItems(processed.data.items);
      setSessionMessage("Confirmed session processed. Open an item to review and apply manually.");
      setPreview(null); setSelectedIds([]);
    } catch (err) { setSessionMessage(err instanceof Error ? err.message : "Session execution failed"); }
  };
  const clearFilters = () => { setQueryText(""); setStatus("all"); setWorkMode("all"); setScoreBand("all"); setDecision("all"); setAnalysisStatus("all"); setUpdatedAfter(""); setProfileFilter("all"); };
  const statusOptions = opsMode ? ["none", "new", "saved", "analyzed", "ready_to_send", "applied", "hr_replied", "interview", "test_task", "offer", "rejected_by_me", "rejected_by_company", "archived"] : ["new", "viewed", "saved", "letter_ready", "applied", "hr_replied", "interview", "test_task", "offer", "rejected_by_me", "rejected_by_company"];
  const analysisOptions = opsMode ? ["not_analyzed", "running", "ready", "invalid", "failed"] : ["available", "not_run"];

  return <section aria-labelledby="inbox-title">
    <h2 id="inbox-title" style={pageTitle}>Inbox</h2>
    <p style={pageIntro}>{opsMode ? "One row per authoritative Companion vacancy. Application and analysis state are shown separately." : "Review imported vacancies. Full V4 analysis remains an explicit single-item action or a bounded confirmed session."}</p>
    <div style={{ ...mutedPanelStyle, marginBottom: 14 }}><strong>{selectedIds.length} selected</strong>{" "}<button type="button" onClick={() => setSelectedIds([])} disabled={selectedIds.length === 0} style={secondaryButton}>Clear selection</button>{" "}<button type="button" onClick={() => void prepareSelected()} disabled={selectedIds.length === 0 || !capabilities?.canRunApplicationFactory} style={selectedIds.length > 0 && capabilities?.canRunApplicationFactory ? primaryButton : secondaryButton}>Preview selected</button>{!capabilities?.canRunApplicationFactory && capabilities && <div role="status" style={{ marginTop: 8, fontSize: 12 }}>{capabilityMessage("application-factory", capabilities)}</div>}{preview && <div role="status" style={{ marginTop: 8 }}>Preview: {preview.selected} selected · {preview.cached_v4} cached V4 · {preview.expected_provider_calls} possible provider calls · {preview.archived_or_ineligible} archived/ineligible. Cost estimate unavailable. Reviewed receipts: {(preview.items ?? []).filter((item) => item.receipt).length}/{preview.items?.length ?? 0}. Budget: {preview.budget_used}/{preview.budget_limit ?? "—"} used · {preview.budget_remaining ?? "—"} remaining.</div>}{preview && <details style={{ marginTop: 8 }}><summary>Privacy and exact plan disclosure</summary><div style={{ fontSize: 12, marginTop: 6 }}>{(preview.items ?? []).map((item) => <div key={item.vacancy_id} style={{ marginBottom: 8 }}><div><strong>{item.vacancy_id}</strong> · {item.provider}/{item.model} · {item.privacy_mode} · {item.receipt ? "receipt ready" : "receipt unavailable"}</div><div>Plan: {item.provider_plan_hash} · Expected attempts: {item.expected_initial_attempts} (+ bounded repair up to {item.expected_max_attempts})</div><details><summary>Redacted dynamic payload</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(item.dynamic_payload, null, 2)}</pre></details></div>)}</div></details>}{preview && <button type="button" onClick={() => void confirmPrepare()} disabled={!capabilities?.canRunApplicationFactory} style={{ ...primaryButton, marginTop: 8 }}>Confirm and process selected</button>}{sessionMessage && <div role="status" style={{ marginTop: 8 }}>{sessionMessage}</div>}{sessionItems.length > 0 && <ol aria-label="Application session queue" style={{ margin: "10px 0 0", paddingLeft: 22 }}>{sessionItems.map((item) => <li key={`${item.title}-${item.company_name ?? ""}`}>{item.title} — {item.queue_state}</li>)}</ol>}</div>
    <div style={{ ...cardStyle, marginBottom: 14 }}><div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}><label style={{ flex: "1 1 260px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Search title or company<input aria-label="Search vacancies" value={queryText} onChange={(event) => setQueryText(event.target.value)} style={{ ...formInput, display: "block", marginTop: 4 }} /></label><label style={{ flex: "0 1 160px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>{opsMode ? "Application status" : "Status"}<select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All</option>{statusOptions.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label><label style={{ flex: "0 1 140px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Decision<select aria-label="Filter by decision" value={decision} onChange={(event) => setDecision(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All</option><option value="apply">Apply</option><option value="consider">Consider</option><option value="skip">Skip</option><option value="needs_input">Needs input</option></select></label><button type="button" aria-expanded={showMoreFilters} onClick={() => setShowMoreFilters((value) => !value)} style={secondaryButton}>{showMoreFilters ? "Fewer filters" : "More filters"}</button></div>{showMoreFilters && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.borderHairline}` }}><label style={{ flex: "0 1 140px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Work mode<select aria-label="Filter by work mode" value={workMode} onChange={(event) => setWorkMode(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="office">Office</option></select></label><label style={{ flex: "0 1 120px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Score<select aria-label="Filter by score band" value={scoreBand} onChange={(event) => setScoreBand(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All</option><option value="high">70+</option><option value="mid">50–69</option><option value="low">&lt;50</option></select></label><label style={{ flex: "0 1 140px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Analysis<select aria-label="Filter by analysis status" value={analysisStatus} onChange={(event) => setAnalysisStatus(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All</option>{analysisOptions.map((item) => <option key={item} value={item}>{analysisLabel(item)}</option>)}</select></label><label style={{ flex: "0 1 150px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Updated after<input aria-label="Filter by updated date" type="date" value={updatedAfter} onChange={(event) => setUpdatedAfter(event.target.value)} style={{ ...formInput, display: "block", marginTop: 4 }} /></label>{opsMode && <label style={{ flex: "0 1 180px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Search profile<select aria-label="Filter by search profile" value={profileFilter} onChange={(event) => setProfileFilter(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All profiles</option>{searchProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>}<button type="button" onClick={clearFilters} style={{ ...tertiaryButton, alignSelf: "end" }}>Clear filters</button></div>}</div>
    {filtered.length === 0 ? total === 0 ? <EmptyState icon="📥" message="Inbox is empty" description="Open Discovery to sync new vacancies, or open an HH vacancy to save it here." actionLabel="Open Discovery" onAction={() => onNavigate?.("discovery")} /> : <div style={cardStyle}><strong>No vacancies match these filters.</strong><p style={{ margin: "6px 0 10px", color: colors.textMuted, fontSize: 12 }}>No automatic analysis was requested.</p><button type="button" onClick={clearFilters} style={secondaryButton}>Clear filters</button></div> : <div style={{ display: "grid", gap: 10 }}>{filtered.map((item) => { const selectionId = itemSelectionId(item); return <article key={selectionId} style={cardStyle}><div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div style={{ minWidth: 0, flex: 1 }}><label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11, color: colors.textMuted }}><input type="checkbox" aria-label={`Select ${item.title || "vacancy"}`} checked={selectedIds.includes(selectionId)} onChange={() => toggleSelection(selectionId)} /> Select</label><h3 style={{ margin: "4px 0 2px", fontSize: 15, color: colors.navy, overflowWrap: "anywhere" }}>{item.title || "Untitled vacancy"}</h3><div style={{ fontSize: 12, color: colors.textFaint }}>{item.companyName || "Unknown company"} · {item.source.toUpperCase()}</div></div><span style={{ ...statusBadge, background: `${scoreColor(item.score)}18`, color: scoreColor(item.score) }}>Score {item.score ?? "—"}</span></div>{isOpsView(item) ? <div style={{ fontSize: 12, marginTop: 8 }}>Application: <strong>{statusLabel(item.applicationState)}</strong> · Analysis: <strong>{analysisLabel(item.analysisState)}</strong> · updated {formatShortDate(item.updatedAt)} · {item.item.vacancy.work_mode ?? "unknown"}{item.item.provenance.hits.length > 0 && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 5 }}>Profiles: {item.item.provenance.hits.map((hit) => hit.search_profile_name).join(", ")}</div>}{item.item.availability.application === "unavailable" && <div role="status">Application state unavailable.</div>}</div> : <div style={{ fontSize: 12, marginTop: 8 }}>Status: <strong>{statusLabel(item.job.status)}</strong> · updated {formatShortDate(item.updatedAt)} · {item.job.workMode}</div>}<div style={{ ...actionRowStyle, marginTop: 10 }}><button type="button" onClick={() => onSelect?.(item)} style={primaryButton}>Open application card</button><button type="button" onClick={() => openHhVacancy(item.sourceUrl)} style={secondaryButton}>Open on HH</button></div></article>; })}</div>}
  </section>;
}

type RunDisplay = { run_id: string; status: string; ready: boolean; score: number | null; decision: string | null; confidence: string | null; cover_letter: string | null; recruiter_risks: Array<{ risk: string; severity: string; mitigation: string }>; cached: boolean; token_input: number | null; token_output: number | null; estimated_cost_usd: number | null };

function initialRun(item: WorkItemViewModel): RunDisplay | null {
  if (!isOpsView(item) || !item.item.analysis.run_id) return null;
  return { run_id: item.item.analysis.run_id, status: item.item.analysis.status ?? item.item.analysis.state, ready: item.item.analysis.ready, score: item.item.analysis.score, decision: item.item.analysis.decision, confidence: item.item.analysis.confidence, cover_letter: null, recruiter_risks: [], cached: false, token_input: null, token_output: null, estimated_cost_usd: null };
}

export function ApplicationCard({ item, onBack }: { item: WorkItemViewModel; onBack?: () => void }): ReactNode {
  const capabilities = useOpsCapabilities();
  const [tab, setTab] = useState("Overview");
  const [currentItem, setCurrentItem] = useState(item);
  const [preview, setPreview] = useState<FullV4PreviewResponse["data"] | null>(null);
  const [run, setRun] = useState<RunDisplay | null>(() => initialRun(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedBusy, setAppliedBusy] = useState(false);
  const tabs = ["Overview", "Vacancy", "Evidence", "Score", "Letter", "Timeline", "Follow-up", "Interview", "Debug"];
  const opsItem = isOpsView(currentItem) ? currentItem : null;
  const standaloneItem = isStandaloneView(currentItem) ? currentItem : null;
  const currentJob = standaloneItem?.job;
  const isFull = opsItem ? opsItem.item.vacancy.hydration_state === "full" : currentJob ? !needsFullVacancyHydration(currentJob) : false;

  const refreshCapabilities = async (): Promise<OpsCapabilities> => getOpsCapabilities({ force: true });
  const refreshOpsItem = async (companionVacancyId: string): Promise<OpsWorkItemView> => {
    const response = await getOpsClient().getOpsWorkItems({ view: "vacancies", vacancy_id: companionVacancyId, limit: 1 });
    const next = response.data[0];
    if (!next) throw new Error("The Companion vacancy was not found");
    const view = fromOps(next);
    setCurrentItem(view);
    setRun(initialRun(view));
    return view;
  };
  const hydrate = async (): Promise<WorkItemViewModel> => {
    if (!opsItem) return currentItem;
    await getOpsClient().hydrateVacancy(opsItem.vacancyId.companionVacancyId);
    return refreshOpsItem(opsItem.vacancyId.companionVacancyId);
  };
  const previewFullV4 = async () => {
    if (!opsItem) { setError("Full V4 is available from the connected Ops Companion."); return; }
    setBusy(true); setError(null); setPreview(null);
    try {
      const currentCapabilities = await refreshCapabilities();
      if (!currentCapabilities.canUseFullV4) { setError(capabilityMessage("full-v4", currentCapabilities)); return; }
      const latest = isOpsView(currentItem) && !isFull ? await hydrate() : currentItem;
      if (!isOpsView(latest)) throw new Error("Ops vacancy context is unavailable");
      const policy = buildCompanionProviderPolicy(await loadSettings());
      const response = await getOpsClient().previewFullV4(
        latest.vacancyId.companionVacancyId,
        { policy },
      );
      setPreview(response.data);
    } catch (err) { setError(err instanceof Error ? err.message : "Full vacancy preview failed"); }
    finally { setBusy(false); }
  };
  const refreshFullDetails = async () => {
    if (!opsItem) { setError("Full vacancy refresh is available from the connected Ops Companion."); return; }
    setBusy(true); setError(null);
    try {
      const currentCapabilities = await refreshCapabilities();
      if (!currentCapabilities.canHydrateVacancy) { setError(capabilityMessage("vacancy-hydration", currentCapabilities)); return; }
      await hydrate();
    } catch (err) { setError(err instanceof Error ? err.message : "Full vacancy refresh failed"); }
    finally { setBusy(false); }
  };
  const executeFullV4 = async () => {
    if (!preview || !opsItem || busy) return;
    setBusy(true); setError(null);
    try {
      const currentCapabilities = await refreshCapabilities();
      if (!currentCapabilities.canUseFullV4) { setError(capabilityMessage("full-v4", currentCapabilities)); return; }
      if (!preview.receipt) { setError("No authenticated preview receipt is available; execution is blocked."); return; }
      const policy = buildCompanionProviderPolicy(await loadSettings());
      const response = await getOpsClient().analyzeFullV4(
        opsItem.vacancyId.companionVacancyId,
        {
          policy,
          confirmation: true,
          preview_receipt: preview.receipt,
        },
      );
      const persisted = await getOpsClient().getFullV4Run(response.data.run_id);
      setRun({ ...response.data, status: persisted.data.status, ready: persisted.data.ready, score: persisted.data.score, decision: persisted.data.decision });
      setTab("Score");
    } catch (err) { setError(err instanceof Error ? err.message : "Full V4 analysis failed"); }
    finally { setBusy(false); }
  };
  const confirmApplied = async () => {
    if (!currentJob || appliedBusy || currentJob.status === "applied") return;
    setAppliedBusy(true); setError(null);
    try {
      const currentCapabilities = await refreshCapabilities();
      if (!currentCapabilities.canUseGuidedApplyMutation) { setError(capabilityMessage("guided-apply-mutation", currentCapabilities)); return; }
      if (!window.confirm(`${NATIVE_HH_SUBMISSION_CONFIRMATION}. Confirm local tracking?`)) return;
      const updated = await tracker.updateStatus(currentJob.id, "applied", "User confirmed native HH submission");
      if (!updated) { setError("The local vacancy was not found. Refresh the card and try again."); return; }
      setCurrentItem(fromStandalone(updated));
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to mark as applied"); }
    finally { setAppliedBusy(false); }
  };

  const title = currentItem.title;
  const company = currentItem.companyName;
  const sourceUrl = currentItem.sourceUrl;
  const status = opsItem ? statusLabel(opsItem.applicationState) : statusLabel(currentJob?.status ?? "none");
  const description = opsItem?.item.vacancy.description ?? currentJob?.descriptionClean ?? "";
  const skills = opsItem?.item.vacancy.skills ?? currentJob?.skills ?? [];
  return <section aria-labelledby="application-card-title">
    {onBack && <button type="button" onClick={onBack} style={{ ...secondaryButton, marginBottom: 14 }}>← Back to Inbox</button>}
    <div style={{ ...cardStyle, marginBottom: 14 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}><div style={{ minWidth: 0, flex: 1 }}><h2 id="application-card-title" style={pageTitle}>{title}</h2><p style={{ ...pageIntro, marginBottom: 10 }}>{company} · {currentItem.source.toUpperCase()}</p></div><span style={{ ...statusBadge, background: colors.neutralBg, color: colors.textSecondary }}>{opsItem ? `Application: ${status}` : status}</span></div><p style={{ margin: "0 0 12px", color: colors.textMuted, fontSize: 12 }}>Vacancy readiness: <strong>{isFull ? "Full details available" : "Search preview only"}</strong>{!isFull && " — refresh to load the official full vacancy before running Full V4."}</p>{opsItem && <p style={{ margin: "0 0 12px", color: colors.textMuted, fontSize: 12 }}>Analysis: <strong>{analysisLabel(opsItem.analysisState)}</strong> · Follow-up: <strong>{opsItem.followUpState}</strong> · Applications recorded: <strong>{opsItem.item.applications.length}</strong></p>}<div style={actionRowStyle}><button type="button" onClick={() => void previewFullV4()} disabled={busy || !capabilities?.canUseFullV4} style={primaryButton}>Preview Full V4</button><button type="button" onClick={() => void refreshFullDetails()} disabled={busy || !capabilities?.canHydrateVacancy} style={secondaryButton}>Refresh vacancy</button>{preview && <button type="button" onClick={() => void executeFullV4()} disabled={busy || !capabilities?.canUseFullV4} style={primaryButton}>Confirm and run Full V4</button>}</div>{capabilities && !capabilities.canUseFullV4 && <p role="status" style={{ margin: "10px 0 0", color: colors.textMuted }}>{capabilityMessage("full-v4", capabilities)}</p>}{currentJob && currentJob.status !== "applied" && <button type="button" onClick={() => void confirmApplied()} disabled={appliedBusy || !capabilities?.canUseGuidedApplyMutation} style={{ ...secondaryButton, marginTop: 10, opacity: appliedBusy || !capabilities?.canUseGuidedApplyMutation ? 0.6 : 1 }}>I submitted this application on HH — mark Applied</button>}{opsItem && <p role="status" style={{ margin: "10px 0 0", color: colors.textMuted }}>Guided Apply local mutation is unavailable in Ops Mode. This card does not create an Application or mark Applied.</p>}{busy && <p role="status" style={{ margin: "10px 0 0", color: colors.textMuted }}>Working…</p>}{error && <p role="alert" style={{ margin: "10px 0 0", color: colors.red }}>{error}</p>}</div>
    {opsItem && <p role="status" style={{ margin: "0 0 14px", color: colors.textMuted }}>Viewing this card does not create an application or mark it Applied.</p>}
    {preview && <div style={{ ...mutedPanelStyle, margin: "0 0 14px" }}><strong style={{ color: colors.navy }}>Preview only — no provider call was made.</strong><p>Target: {preview.provider}/{preview.model}. Expected provider call: {preview.cache_hit ? 0 : 1} (cache hit: {preview.cache_hit ? "yes" : "no"}).</p><p style={{ marginBottom: 0 }}>Plan: {preview.provider_plan_hash}. Privacy: {preview.privacy_mode}. Receipt: {preview.receipt ? "authenticated and ready" : "unavailable — execution is blocked"}.</p><p style={{ marginBottom: 0 }}>Budget: {preview.budget_used}/{preview.budget_limit ?? "—"} used · {preview.budget_remaining ?? "—"} remaining; bounded repair may add one attempt.</p><p style={{ marginBottom: 0 }}>Sent: {preview.what_is_sent.join(", ") || "none"}. Not sent: {preview.what_is_not_sent.join(", ") || "none"}.</p>{preview.dynamic_payload && <details><summary>Exact redacted dynamic payload</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(preview.dynamic_payload, null, 2)}</pre></details>}</div>}
    <div role="tablist" aria-label="Application card sections" style={tabListStyle}>{tabs.map((itemName) => <button key={itemName} type="button" role="tab" aria-selected={tab === itemName} onClick={() => setTab(itemName)} style={tabButtonStyle(tab === itemName)}>{itemName}</button>)}</div><div role="tabpanel" style={{ ...cardStyle, marginBottom: 0 }}>
      {tab === "Overview" && <><h3>Overview</h3><p>Source: {currentItem.source}. Work mode: {opsItem?.item.vacancy.work_mode ?? currentJob?.workMode ?? "unknown"}. Last seen: {formatShortDate(currentItem.lastSeenAt)}.</p>{opsItem ? <p>Application state: <strong>{status}</strong>. Analysis state: <strong>{analysisLabel(opsItem.analysisState)}</strong>. Full V4: {run ? `persisted (${run.status}${run.ready ? ", ready" : ", not ready"})` : "not run"}.</p> : <p>Full V4: {run ? `persisted (${run.status}${run.ready ? ", ready" : ", not ready"})` : "not run"}.</p>}<p>Viewing this card is read-only except for explicit vacancy hydration, preview, and confirmed Full V4 actions.</p></>}
      {tab === "Vacancy" && <><h3>Vacancy</h3><p style={{ whiteSpace: "pre-wrap" }}>{description || "Full vacancy description is not available."}</p><button type="button" onClick={() => openHhVacancy(sourceUrl)}>Open source vacancy</button>{skills.length > 0 && <p>Skills: {skills.join(", ")}</p>}</>}
      {tab === "Evidence" && <><h3>Evidence</h3><p>Only persisted safe evidence references are shown here. Generated letters and provider output are not evidence.</p><p>Evidence trace: {run?.ready ? "available in the persisted Full V4 run" : run ? "not available: Full V4 result is invalid" : "not available"}.</p></>}
      {tab === "Score" && <><h3>Score</h3>{opsItem ? <p>Authoritative Full V4 score: <strong>{opsItem.item.analysis.score ?? "—"}</strong>. Decision: {opsItem.item.analysis.decision ?? "—"}. {opsItem.analysisState === "invalid" && "The latest persisted analysis is invalid; its score and decision are unavailable."}</p> : <p>Stage A deterministic score: <strong>{currentJob?.ruleScore?.total ?? "not run/not available"}</strong>. Decision: {currentJob?.ruleScore?.recommendation ?? "not run/not available"}.</p>}{run && <p>Full V4 run {run.run_id}: score <strong>{run.score ?? "—"}</strong>; decision {run.decision ?? "—"}; confidence {run.confidence ?? "—"}.</p>}</>}
      {tab === "Letter" && <><h3>Letter</h3><p>Copying is not sending; a final letter is not an application sent.</p><p>{run?.decision === "skip" ? "SKIP: no letter was generated." : run && !run.ready ? "Full V4 letter is not ready: persisted validation failed." : `Full V4 letter: ${run?.cover_letter ? "available in persisted result" : "not created"}.`}</p></>}
      {tab === "Timeline" && <><h3>Timeline</h3>{opsItem ? <>{opsItem.item.applications.length === 0 ? <p>No Application record exists.</p> : opsItem.item.applications.map((application) => <p key={application.application_id}>{application.application_id} · {statusLabel(application.status)} · updated {formatShortDate(application.updated_at)}</p>)}</> : <>{currentJob?.statusHistory.map((event, index) => <p key={`${event.at}-${index}`}>{formatShortDate(event.at)} · {event.from ?? "—"} → {event.to} · {event.source}</p>)}</>}</>}
      {tab === "Follow-up" && <FollowUpPanel item={currentItem} />}
      {tab === "Interview" && <><h3>Interview</h3><p>Not-yet-active in AOPS-12. Interview Pack is deferred.</p></>}
      {tab === "Debug" && <><h3>Safe debug metadata</h3>{opsItem ? <><p>Companion vacancy ID: {opsItem.vacancyId.companionVacancyId}</p><p>HH vacancy ID: {opsItem.vacancyId.hhVacancyId}</p><p>Application IDs: {opsItem.item.applications.map((application) => application.application_id).join(", ") || "none"}</p><p>Run ID: {opsItem.item.analysis.run_id ?? "none"}</p></> : <><p>Standalone Job ID: {currentJob?.id}</p><p>HH vacancy ID: {currentJob?.sourceVacancyId}</p><p>Run ID: {run?.run_id ?? "not run"}</p></>}<p>No credentials, raw provider payloads or private evidence bodies are displayed.</p></>}
    </div></section>;
}

function FollowUpPanel({ item }: { item: WorkItemViewModel }): ReactNode {
  const capabilities = useOpsCapabilities();
  const [opsFollowUps, setOpsFollowUps] = useState<FollowUpItem[]>([]);
  const [localFollowUpAt, setLocalFollowUpAt] = useState<string | null>(null);
  const [localApplicationId, setLocalApplicationId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState("Loading…");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (isOpsView(item)) {
      if (item.item.availability.follow_up === "unavailable") { setOpsFollowUps([]); return; }
      setOpsFollowUps(item.item.follow_ups.map(followUpForClient));
      return;
    }
    void db.applications.where("jobId").equals(item.vacancyId.standaloneJobId).toArray().then((applications) => {
      if (cancelled) return;
      if (applications.length !== 1) { setLocalApplicationId(null); setLocalFollowUpAt(null); setLocalStatus(applications.length > 1 ? "multiple" : "none"); return; }
      const application = applications[0];
      setLocalApplicationId(application.id); setLocalFollowUpAt(application.followUpAt ?? null); setLocalStatus(application.followUpAt ? new Date(application.followUpAt) <= new Date() ? "overdue" : "scheduled" : "none");
    }).catch(() => { if (!cancelled) setLocalStatus("unavailable"); });
    return () => { cancelled = true; };
  }, [item]);
  const activeOpsFollowUps = opsFollowUps.filter((followUp) => ["pending", "scheduled", "snoozed"].includes(followUp.status));
  const opsStatus = isOpsView(item) ? item.item.availability.follow_up === "unavailable" ? "unavailable" : activeOpsFollowUps.length > 1 ? "multiple" : activeOpsFollowUps[0]?.derived_state ?? "none" : localStatus;
  const followupWriteBlocked = capabilities?.mode.effectiveMode === "ops" && !capabilities.canUseOpsFollowups;
  const updateOpsFollowUp = async (followUp: FollowUpItem, nextStatus: "completed" | "snoozed" | "cancelled" | "sent") => {
    try {
      const currentCapabilities = await getOpsCapabilities({ force: true });
      if (!currentCapabilities.canUseOpsFollowups) { setError(capabilityMessage("ops-followups", currentCapabilities)); return; }
      const response = await getOpsClient().updateFollowUp(followUp.id, { expected_revision: followUp.revision, status: nextStatus === "sent" ? undefined : nextStatus, sent_confirmation: nextStatus === "sent", due_at: nextStatus === "snoozed" ? new Date(Date.now() + 86400000).toISOString() : undefined });
      setOpsFollowUps((current) => current.map((itemToUpdate) => itemToUpdate.id === followUp.id ? response.data : itemToUpdate));
    } catch (err) { setError(err instanceof Error ? err.message : "Follow-up update unavailable"); }
  };
  const clearStandaloneFollowUp = async () => {
    if (!localApplicationId || !localFollowUpAt || capabilities?.mode.effectiveMode === "ops") return;
    await withWriteGuard(() =>
      db.applications.update(localApplicationId, { followUpAt: undefined }),
    );
    setLocalFollowUpAt(null); setLocalStatus("completed");
  };
  return <><h3>Follow-up</h3><p>Status: <strong>{opsStatus}</strong>{localFollowUpAt ? ` · due ${formatShortDate(localFollowUpAt)}` : ""}.</p>{isOpsView(item) ? <p>Follow-ups are Companion/SQLite state and remain linked to their Application IDs.</p> : <p>Follow-ups are local and human-controlled. Draft generation never sends a message; explicit sent confirmation is required.</p>}{isOpsView(item) && activeOpsFollowUps.length > 1 && <p>Multiple active follow-ups are recorded; none was selected as a current follow-up.</p>}{followupWriteBlocked && <p role="status">{capabilityMessage("ops-followups", capabilities)}</p>}{error && <p role="alert">{error}</p>}{isOpsView(item) && activeOpsFollowUps.map((followUp) => <div key={followUp.id} style={{ margin: "8px 0", padding: 8, background: "#f7f9fb" }}><p style={{ margin: 0 }}>Application {followUp.application_id}: {followUp.derived_state}{followUp.due_at ? ` · due ${formatShortDate(followUp.due_at)}` : ""}</p>{followUp.draft_text && <p style={{ whiteSpace: "pre-wrap" }}>{followUp.draft_text}</p>}<div style={{ display: "flex", gap: 8 }}><button type="button" disabled={followupWriteBlocked} onClick={() => void updateOpsFollowUp(followUp, "completed")}>Complete</button><button type="button" disabled={followupWriteBlocked} onClick={() => void updateOpsFollowUp(followUp, "snoozed")}>Snooze 1 day</button><button type="button" disabled={followupWriteBlocked} onClick={() => void updateOpsFollowUp(followUp, "cancelled")}>Cancel</button>{followUp.draft_text && <button type="button" disabled={followupWriteBlocked} onClick={() => void updateOpsFollowUp(followUp, "sent")}>Confirm sent</button>}</div></div>)}{!isOpsView(item) && localApplicationId && localFollowUpAt && <button type="button" onClick={() => void clearStandaloneFollowUp()}>Complete</button>}{opsStatus === "none" && <p>No active follow-up is recorded.</p>}</>;
}

export function OpsPipelineWorkspace(): ReactNode {
  const query = useMemo<OpsProjectionQuery>(() => ({ view: "applications", limit: 100, offset: 0, archived: false }), []);
  const { items, loading, error, mode, total } = useWorkItems(query);
  if (loading) return <p role="status">Loading Ops Pipeline…</p>;
  if (error) return <div role="alert" style={cardStyle}>Pipeline unavailable: {error}</div>;
  if (mode !== "ops") return <EmptyState icon="📋" message="Ops Pipeline is unavailable" description="Switch to Ops Mode to view Companion Applications." />;
  const pipelineItems = items.filter(isOpsView);
  return <section aria-labelledby="ops-pipeline-title"><h3 id="ops-pipeline-title" style={{ margin: "0 0 12px", color: colors.navy }}>Applications</h3>{pipelineItems.length === 0 || total === 0 ? <EmptyState icon="📋" message="No Applications recorded" description="Vacancies without an Application remain in Inbox and do not appear in Pipeline." /> : <div style={{ display: "grid", gap: 10 }}>{pipelineItems.map((item) => { const application = item.item.applications[0]; if (!application) return null; const href = `?vacancyId=${encodeURIComponent(item.vacancyId.hhVacancyId)}#inbox`; return <article key={application.application_id} style={cardStyle}><div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><h4 style={{ margin: 0, color: colors.navy }}>{item.title}</h4><p style={{ margin: "4px 0 0", color: colors.textMuted, fontSize: 12 }}>{item.companyName || "Unknown company"}</p></div><span style={statusBadge}>{statusLabel(application.status)}</span></div><p style={{ fontSize: 12 }}>Application ID: <strong>{application.application_id}</strong> · updated {formatShortDate(application.updated_at)}{application.applied_at ? ` · applied ${formatShortDate(application.applied_at)}` : ""}</p><p style={{ fontSize: 12 }}>Analysis: {analysisLabel(item.analysisState)} · score {item.score ?? "—"} · decision {item.decision ?? "—"}</p><a href={href} style={primaryButton}>Open vacancy card</a></article>; })}</div>}</section>;
}

export function readInboxVacancyId(search: string): string | null {
  const value = new URLSearchParams(search).get("vacancyId");
  return value && /^\d+$/.test(value) ? value : null;
}

export function buildInboxVacancyUrl(vacancyId: string): string {
  return `?vacancyId=${encodeURIComponent(vacancyId)}#inbox`;
}

export function ApplicationWorkspace({ onNavigate }: { onNavigate?: (route: "discovery") => void }): ReactNode {
  const initialRequestedId = new URLSearchParams(window.location.search).get("vacancyId");
  const [directVacancyId, setDirectVacancyId] = useState<string | null>(() => readInboxVacancyId(window.location.search));
  const [invalidDirectId, setInvalidDirectId] = useState<string | null>(() => initialRequestedId && !/^\d+$/.test(initialRequestedId) ? initialRequestedId : null);
  const query = useMemo<OpsProjectionQuery>(() => ({ view: "vacancies", limit: 100, offset: 0, archived: false, source: "hh", source_vacancy_id: directVacancyId ?? undefined }), [directVacancyId]);
  const { items, loading, error, total } = useWorkItems(query);
  const [selected, setSelected] = useState<WorkItemViewModel | null>(null);
  useEffect(() => {
    const onPopState = () => {
      const raw = new URLSearchParams(window.location.search).get("vacancyId");
      setDirectVacancyId(readInboxVacancyId(window.location.search));
      setInvalidDirectId(raw && !/^\d+$/.test(raw) ? raw : null);
      setSelected(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!directVacancyId || loading) return;
    const found = items.find((item) => item.vacancyId.hhVacancyId === directVacancyId);
    setSelected(found ?? null);
  }, [directVacancyId, items, loading]);
  if (loading) return <p role="status">Loading applications…</p>;
  if (error) return <div role="alert" style={cardStyle}>Application card unavailable: {error}</div>;
  const clearDirectRoute = () => {
    window.history.replaceState({}, "", `${window.location.pathname}#inbox`);
    setSelected(null);
    setDirectVacancyId(null);
    setInvalidDirectId(null);
  };
  const selectItem = (item: WorkItemViewModel) => {
    const vacancyId = item.vacancyId.hhVacancyId;
    if (typeof vacancyId !== "string" || !/^\d+$/.test(vacancyId)) return;
    window.history.pushState({}, "", buildInboxVacancyUrl(vacancyId));
    setDirectVacancyId(vacancyId);
    setInvalidDirectId(null);
    setSelected(item);
  };
  if (selected) return <ApplicationCard item={selected} onBack={clearDirectRoute} />;
  if (invalidDirectId || (directVacancyId && total === 0)) return <section aria-labelledby="inbox-title"><h2 id="inbox-title" style={pageTitle}>Inbox</h2><p role="alert">Application card vacancy was not found.</p><button type="button" onClick={clearDirectRoute}>Open Inbox</button></section>;
  return <Inbox onSelect={selectItem} onNavigate={onNavigate} />;
}
