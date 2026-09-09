import { useEffect, useMemo, useState, type ReactNode } from "react";
import { db } from "@/db";
import { EmptyState } from "@/components/EmptyState";
import { jobRepo } from "@/db/repositories";
import { detectCompanionStatus, getOpsClient } from "@/services/companion-service";
import { capabilityMessage, getOpsCapabilities, type OpsCapabilities } from "@/services/ops-capabilities";
import { NATIVE_HH_SUBMISSION_CONFIRMATION } from "@/services/applied-confirmation";
import { tracker } from "@/services/tracker";
import type { Job } from "@/models/job";
import type { FollowUpItem } from "@/adapters/companion/application-types";
import type { HHSearchProfile } from "@/adapters/companion/types";
import type { VacancyListItem } from "@/adapters/companion/vacancy-types";
import {
  card,
  colors,
  compactCard,
  formInput,
  formSelect,
  pageIntro,
  pageTitle,
  primaryButton,
  secondaryButton,
  statusBadge,
  tertiaryButton,
  tabButtonStyle,
  tabListStyle,
} from "@/styles";
function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}
function scoreColor(total: number | undefined): string {
  if (total === undefined) return "#687789";
  return total >= 70 ? "#2a8" : total >= 50 ? "#e6a817" : "#c44";
}
function statusLabel(status: Job["status"]): string {
  return status.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
}

function useOpsCapabilities(): OpsCapabilities | null {
  const [capabilities, setCapabilities] = useState<OpsCapabilities | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getOpsCapabilities()
      .then((next) => { if (!cancelled) setCapabilities(next); })
      .catch(() => { if (!cancelled) setCapabilities(null); });
    return () => { cancelled = true; };
  }, []);
  return capabilities;
}

export function needsFullVacancyHydration(job: Pick<Job, "descriptionClean">): boolean {
  return job.descriptionClean.trim().length < 200;
}

function companionVacancyToJob(item: VacancyListItem): Job {
  return {
    id: item.id,
    source: "hh",
    sourceVacancyId: item.source_vacancy_id,
    sourceUrl: item.url ?? `https://hh.ru/vacancy/${item.source_vacancy_id}`,
    title: item.title,
    companyId: item.company_id ?? "",
    companyName: item.company_name ?? "",
    salaryMin: item.salary_min ?? undefined,
    salaryMax: item.salary_max ?? undefined,
    salaryCurrency: item.currency ?? undefined,
    city: undefined,
    workMode: (item.work_mode ?? "unknown") as Job["workMode"],
    experienceRaw: item.experience ?? undefined,
    descriptionClean: item.description ?? "",
    descriptionHash: item.description_hash ?? "",
    skills: item.skills,
    status: "new",
    statusHistory: [],
    firstSeenAt: item.first_seen_at,
    lastSeenAt: item.last_seen_at,
    updatedAt: item.updated_at,
  };
}

const cardStyle: React.CSSProperties = {
  ...card,
  padding: 14,
};

const mutedPanelStyle: React.CSSProperties = {
  ...compactCard,
  background: colors.neutralBg,
};

const actionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

function useJobs(searchProfileId?: string): { jobs: Job[]; loading: boolean; error: string | null } {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const localItems = await jobRepo.list();
        let items = localItems.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (!cancelled) { setJobs(items); setLoading(false); }
        try {
          const capabilities = await getOpsCapabilities();
          if (capabilities.canUseSearchProfiles) {
            const response = await getOpsClient().listVacancies({ archived: false, ...(searchProfileId ? { search_profile_id: searchProfileId } : {}) });
            items = response.data.filter((item) => item.source === "hh").map(companionVacancyToJob);
            if (!cancelled) setJobs(items);
          }
        } catch {
          // Local Dexie data is the supported fallback when the companion is unavailable.
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to read vacancies");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [searchProfileId]);
  return { jobs, loading, error };
}

function ActionCard({ label, value, description, onClick }: {
  label: string; value: string; description: string; onClick: () => void;
}): ReactNode {
  return <button type="button" onClick={onClick} style={{ ...compactCard, textAlign: "left", cursor: "pointer", minWidth: 170, flex: "1 1 170px", marginBottom: 0 }} aria-label={`${label}: ${value}`}>
    <div style={{ fontSize: 12, color: colors.textMuted }}>{label}</div>
    <div style={{ fontSize: 23, fontWeight: 700, color: colors.navy, margin: "3px 0" }}>{value}</div>
    <div style={{ fontSize: 11, color: colors.textFaint }}>{description}</div>
  </button>;
}

export function TodayWorkspace({ onNavigate }: { onNavigate?: (section: "discovery" | "inbox" | "pipeline") => void }): ReactNode {
  const { jobs, loading, error } = useJobs();
  const [companion, setCompanion] = useState("Checking…");
  const [followupCount, setFollowupCount] = useState<number | null>(null);
  useEffect(() => { void detectCompanionStatus().then((result) => setCompanion(result.status)).catch(() => setCompanion("unavailable")); }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const localApps = await db.applications.toArray();
        const localDue = localApps.filter((item) => item.followUpAt && new Date(item.followUpAt) <= new Date()).length;
        const capabilities = await getOpsCapabilities();
        if (capabilities.canUseOpsFollowups) {
          const remote = await getOpsClient().listFollowUps();
          if (!cancelled) setFollowupCount(remote.data.filter((item) => ["due", "overdue"].includes(item.derived_state)).length);
        } else if (!cancelled) setFollowupCount(localDue);
      } catch { if (!cancelled) setFollowupCount(null); }
    })();
    return () => { cancelled = true; };
  }, []);
  if (loading) return <p role="status">Loading Today…</p>;
  if (error) return <div role="alert" style={cardStyle}>Today unavailable: {error}</div>;
  const newJobs = jobs.filter((job) => job.status === "new" || job.status === "viewed");
  const ready = jobs.filter((job) => job.status === "letter_ready");
  const applied = jobs.filter((job) => job.status === "applied");
  const updated = jobs.filter((job) => job.passiveHHStatus && job.passiveHHStatus.detectedAt > job.updatedAt);
  const attentionCount = newJobs.length + ready.length + updated.length + (followupCount ?? 0);
  return <section aria-labelledby="today-title">
    <h2 id="today-title" style={pageTitle}>Today</h2>
    <p style={pageIntro}>A daily, action-oriented view of the local job search.</p>
    {attentionCount === 0 ? (
      <div style={{ ...mutedPanelStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <strong style={{ display: "block", color: colors.navy, marginBottom: 4 }}>Nothing needs attention right now.</strong>
          <span style={{ color: colors.textMuted, fontSize: 12 }}>Open Discovery to sync new vacancies.</span>
        </div>
        <button type="button" onClick={() => onNavigate?.("discovery")} style={primaryButton}>Open Discovery</button>
      </div>
    ) : (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0" }}>
        <ActionCard label="New to review" value={String(newJobs.length)} description="Open the Inbox" onClick={() => onNavigate?.("inbox")} />
        <ActionCard label="Ready to review" value={String(ready.length)} description="Review manually" onClick={() => onNavigate?.("inbox")} />
        <ActionCard label="HH updates" value={String(updated.length)} description="Known local signals" onClick={() => onNavigate?.("inbox")} />
        <ActionCard label="Follow-ups due" value={followupCount === null ? "—" : String(followupCount)} description={followupCount === null ? "Unavailable" : "Open the Inbox"} onClick={() => onNavigate?.("inbox")} />
        <ActionCard label="Applied" value={String(applied.length)} description="Tracked explicitly" onClick={() => onNavigate?.("pipeline")} />
      </div>
    )}
    <div style={{ ...mutedPanelStyle, marginTop: 16 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 14, color: colors.navy }}>System status</h3>
      <p style={{ margin: 0, fontSize: 12 }}>Companion: <strong>{companion}</strong>. Follow-ups use local/Companion endpoints when available; Interview Pack and backup health are not active.</p>
      <p style={{ margin: "8px 0 0", fontSize: 12 }}>HH negotiations: <strong>Unavailable when denied by HH</strong>; this is not shown as zero responses.</p>
    </div>
  </section>;
}

export function Inbox({ onSelect, onNavigate }: { onSelect?: (job: Job) => void; onNavigate?: (route: "discovery") => void }): ReactNode {
  const capabilities = useOpsCapabilities();
  const [profileFilter, setProfileFilter] = useState("all");
  const [searchProfiles, setSearchProfiles] = useState<HHSearchProfile[]>([]);
  const { jobs, loading, error } = useJobs(profileFilter === "all" ? undefined : profileFilter);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [workMode, setWorkMode] = useState("all");
  const [scoreBand, setScoreBand] = useState("all");
  const [decision, setDecision] = useState("all");
  const [analysisStatus, setAnalysisStatus] = useState("all");
  const [updatedAfter, setUpdatedAfter] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ selected: number; expected_provider_calls: number; cached_v4: number; archived_or_ineligible: number } | null>(null);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [sessionItems, setSessionItems] = useState<Array<{ title: string; company_name: string | null; queue_state: string }>>([]);
  useEffect(() => {
    if (!capabilities?.canUseSearchProfiles) {
      setSearchProfiles([]);
      return;
    }
    void getOpsClient().listHHSearchProfiles().then((response) => setSearchProfiles(response.data)).catch(() => setSearchProfiles([]));
  }, [capabilities]);
  const filtered = useMemo(() => jobs.filter((job) => {
    const matchesQuery = !query || `${job.title} ${job.companyName}`.toLowerCase().includes(query.toLowerCase());
    const score = job.ruleScore?.total;
    const matchesScore = scoreBand === "all" || (scoreBand === "high" && score !== undefined && score >= 70) || (scoreBand === "mid" && score !== undefined && score >= 50 && score < 70) || (scoreBand === "low" && score !== undefined && score < 50);
    const matchesAnalysis = analysisStatus === "all" || (analysisStatus === "available" && Boolean(job.aiAnalysis)) || (analysisStatus === "not_run" && !job.aiAnalysis);
    return matchesQuery && (status === "all" || job.status === status) && (workMode === "all" || job.workMode === workMode) && matchesScore && (decision === "all" || job.ruleScore?.recommendation === decision || job.aiAnalysis?.recommendation === decision) && matchesAnalysis && (!updatedAfter || job.updatedAt >= new Date(updatedAfter).toISOString());
  }), [jobs, query, status, workMode, scoreBand, decision, analysisStatus, updatedAfter]);
  if (loading) return <p role="status">Loading Inbox…</p>;
  if (error) return <div role="alert" style={cardStyle}>Inbox unavailable: {error}</div>;
  const toggleSelection = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const prepareSelected = async () => {
    if (selectedIds.length === 0) return;
    try {
      const currentCapabilities = await getOpsCapabilities({ force: true });
      if (!currentCapabilities.canRunApplicationFactory) { setSessionMessage(capabilityMessage("application-factory", currentCapabilities)); return; }
      const result = await getOpsClient().previewApplicationSession(selectedIds);
      setPreview(result.data);
      setSessionMessage("Preview ready. No provider call was made.");
    } catch (err) { setSessionMessage(err instanceof Error ? err.message : "Unable to create preview"); }
  };
  const confirmPrepare = async () => {
    if (!preview || selectedIds.length === 0) return;
    try {
      const currentCapabilities = await getOpsCapabilities({ force: true });
      if (!currentCapabilities.canRunApplicationFactory) { setSessionMessage(capabilityMessage("application-factory", currentCapabilities)); return; }
      const session = await getOpsClient().createApplicationSession(selectedIds);
      const processed = await getOpsClient().executeApplicationSession(session.data.id);
      setSessionItems(processed.data.items);
      setSessionMessage("Confirmed session processed. Open an item to review and apply manually.");
      setPreview(null); setSelectedIds([]);
    } catch (err) { setSessionMessage(err instanceof Error ? err.message : "Session execution failed"); }
  };
  const clearFilters = () => {
    setQuery(""); setStatus("all"); setWorkMode("all"); setScoreBand("all");
    setDecision("all"); setAnalysisStatus("all"); setUpdatedAfter(""); setProfileFilter("all");
  };
  return <section aria-labelledby="inbox-title">
    <h2 id="inbox-title" style={pageTitle}>Inbox</h2>
    <p style={pageIntro}>Review imported vacancies. Full V4 analysis remains an explicit single-item action or a bounded confirmed session.</p>
    <div style={{ ...mutedPanelStyle, marginBottom: 14 }}>
      <strong>{selectedIds.length} selected</strong>{" "}
      <button type="button" onClick={() => setSelectedIds([])} disabled={selectedIds.length === 0} style={secondaryButton}>Clear selection</button>{" "}
      <button type="button" onClick={() => void prepareSelected()} disabled={selectedIds.length === 0 || !capabilities?.canRunApplicationFactory} style={selectedIds.length > 0 && capabilities?.canRunApplicationFactory ? primaryButton : secondaryButton}>Preview selected</button>
      {!capabilities?.canRunApplicationFactory && capabilities && <div role="status" style={{ marginTop: 8, fontSize: 12 }}>{capabilityMessage("application-factory", capabilities)}</div>}
      {preview && <div role="status" style={{ marginTop: 8 }}>Preview: {preview.selected} selected · {preview.cached_v4} cached V4 · {preview.expected_provider_calls} possible provider calls · {preview.archived_or_ineligible} archived/ineligible. Cost estimate unavailable.</div>}
      {preview && <button type="button" onClick={() => void confirmPrepare()} disabled={!capabilities?.canRunApplicationFactory} style={{ ...primaryButton, marginTop: 8 }}>Confirm and process selected</button>}
      {sessionMessage && <div role="status" style={{ marginTop: 8 }}>{sessionMessage}</div>}
      {sessionItems.length > 0 && <ol aria-label="Application session queue" style={{ margin: "10px 0 0", paddingLeft: 22 }}>{sessionItems.map((item) => <li key={`${item.title}-${item.company_name ?? ""}`}>{item.title} — {item.queue_state}</li>)}</ol>}
    </div>
    <div style={{ ...cardStyle, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ flex: "1 1 260px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Search title or company<input aria-label="Search vacancies" value={query} onChange={(event) => setQuery(event.target.value)} style={{ ...formInput, display: "block", marginTop: 4 }} /></label>
        <label style={{ flex: "0 1 160px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Status<select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All</option>{["new", "viewed", "saved", "letter_ready", "applied", "hr_replied", "interview", "test_task", "offer", "rejected_by_me", "rejected_by_company"].map((item) => <option key={item} value={item}>{statusLabel(item as Job["status"])}</option>)}</select></label>
        <label style={{ flex: "0 1 140px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Decision<select aria-label="Filter by decision" value={decision} onChange={(event) => setDecision(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All</option><option value="apply">Apply</option><option value="consider">Consider</option><option value="skip">Skip</option></select></label>
        <button type="button" aria-expanded={showMoreFilters} onClick={() => setShowMoreFilters((value) => !value)} style={secondaryButton}>{showMoreFilters ? "Fewer filters" : "More filters"}</button>
      </div>
      {showMoreFilters && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.borderHairline}` }}>
        <label style={{ flex: "0 1 140px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Work mode<select aria-label="Filter by work mode" value={workMode} onChange={(event) => setWorkMode(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="office">Office</option></select></label>
        <label style={{ flex: "0 1 120px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Score<select aria-label="Filter by score band" value={scoreBand} onChange={(event) => setScoreBand(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All</option><option value="high">70+</option><option value="mid">50–69</option><option value="low">&lt;50</option></select></label>
        <label style={{ flex: "0 1 140px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Analysis<select aria-label="Filter by analysis status" value={analysisStatus} onChange={(event) => setAnalysisStatus(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All</option><option value="available">Available</option><option value="not_run">Not run</option></select></label>
        <label style={{ flex: "0 1 150px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Updated after<input aria-label="Filter by updated date" type="date" value={updatedAfter} onChange={(event) => setUpdatedAfter(event.target.value)} style={{ ...formInput, display: "block", marginTop: 4 }} /></label>
        <label style={{ flex: "0 1 180px", fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Search profile<select aria-label="Filter by search profile" value={profileFilter} onChange={(event) => setProfileFilter(event.target.value)} style={{ ...formSelect, display: "block", marginTop: 4 }}><option value="all">All profiles</option>{searchProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        <button type="button" onClick={clearFilters} style={{ ...tertiaryButton, alignSelf: "end" }}>Clear filters</button>
      </div>}
    </div>
    {filtered.length === 0 ? jobs.length === 0 ? <EmptyState icon="📥" message="Inbox is empty" description="Open Discovery to sync new vacancies, or open an HH vacancy to save it here." actionLabel="Open Discovery" onAction={() => onNavigate?.("discovery")} /> : <div style={cardStyle}><strong>No vacancies match these filters.</strong><p style={{ margin: "6px 0 10px", color: colors.textMuted, fontSize: 12 }}>No automatic analysis was requested.</p><button type="button" onClick={clearFilters} style={secondaryButton}>Clear filters</button></div> : <div style={{ display: "grid", gap: 10 }}>
      {filtered.map((job) => <article key={job.id} style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}><label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11, color: colors.textMuted }}><input type="checkbox" aria-label={`Select ${job.title || "vacancy"}`} checked={selectedIds.includes(job.id)} onChange={() => toggleSelection(job.id)} /> Select</label><h3 style={{ margin: "4px 0 2px", fontSize: 15, color: colors.navy, overflowWrap: "anywhere" }}>{job.title || "Untitled vacancy"}</h3><div style={{ fontSize: 12, color: colors.textFaint }}>{job.companyName || "Unknown company"} · {job.source.toUpperCase()}</div></div>
          <span style={{ ...statusBadge, background: `${scoreColor(job.ruleScore?.total)}18`, color: scoreColor(job.ruleScore?.total) }}>Score {job.ruleScore?.total ?? "—"}</span>
        </div>
        <div style={{ fontSize: 12, marginTop: 8 }}>Status: <strong>{statusLabel(job.status)}</strong> · updated {formatShortDate(job.updatedAt)} · {job.workMode}</div>
        {job.passiveHHStatus && <div style={{ fontSize: 11, color: "#536273", marginTop: 5 }}>HH signal recorded locally; it does not change pipeline status automatically.</div>}
        <div style={{ ...actionRowStyle, marginTop: 10 }}><button type="button" onClick={() => onSelect?.(job)} style={primaryButton}>Open application card</button><button type="button" onClick={() => window.open(job.sourceUrl, "_blank", "noopener,noreferrer")} style={secondaryButton}>Open on HH</button></div>
      </article>)}
    </div>}
  </section>;
}

export function ApplicationCard({ job, onBack }: { job: Job; onBack?: () => void }): ReactNode {
  const capabilities = useOpsCapabilities();
  const [tab, setTab] = useState("Overview");
  const [currentJob, setCurrentJob] = useState(job);
  const [preview, setPreview] = useState<{ provider: string; model: string; token_estimate: number | null; cache_hit: boolean; what_is_sent: string[]; what_is_not_sent: string[] } | null>(null);
  const [run, setRun] = useState<{ run_id: string; status: string; ready: boolean; score: number | null; decision: string | null; confidence: string | null; cover_letter: string | null; recruiter_risks: Array<{ risk: string; severity: string; mitigation: string }>; cached: boolean; token_input: number | null; token_output: number | null; estimated_cost_usd: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedBusy, setAppliedBusy] = useState(false);
  const tabs = ["Overview", "Vacancy", "Evidence", "Score", "Letter", "Timeline", "Follow-up", "Interview", "Debug"];
  const isFull = !needsFullVacancyHydration(currentJob);
  const refreshCapabilities = async (): Promise<OpsCapabilities> => {
    const next = await getOpsCapabilities({ force: true });
    return next;
  };
  const hydrate = async () => {
    const hydrated = await getOpsClient().hydrateVacancy(currentJob.id);
    const item = hydrated.data;
    setCurrentJob((value) => ({ ...value, title: item.title, companyName: item.company_name ?? "", sourceUrl: item.url ?? value.sourceUrl, descriptionClean: item.description ?? "", skills: item.skills, workMode: (item.work_mode ?? "unknown") as Job["workMode"], updatedAt: item.updated_at, lastSeenAt: item.last_seen_at, descriptionHash: item.description_hash ?? value.descriptionHash }));
  };
  const previewFullV4 = async () => {
    setBusy(true); setError(null); setPreview(null);
    try {
      const currentCapabilities = await refreshCapabilities();
      if (!currentCapabilities.canUseFullV4) {
        setError(capabilityMessage("full-v4", currentCapabilities));
        return;
      }
      // A migrated/full local projection is already sufficient for the
      // provider-free preview. Hydration is an explicit HH API read and must
      // only run when the stored vacancy is actually incomplete.
      if (needsFullVacancyHydration(currentJob)) await hydrate();
      const response = await getOpsClient().previewFullV4(currentJob.id);
      setPreview(response.data);
    }
    catch (err) { setError(err instanceof Error ? err.message : "Full vacancy preview failed"); }
    finally { setBusy(false); }
  };
  const refreshFullDetails = async () => {
    setBusy(true); setError(null);
    try {
      const currentCapabilities = await refreshCapabilities();
      if (!currentCapabilities.canHydrateVacancy) {
        setError(capabilityMessage("vacancy-hydration", currentCapabilities));
        return;
      }
      await hydrate();
    }
    catch (err) { setError(err instanceof Error ? err.message : "Full vacancy refresh failed"); }
    finally { setBusy(false); }
  };
  const executeFullV4 = async () => {
    if (!preview || busy) return;
    setBusy(true); setError(null);
    try {
      const currentCapabilities = await refreshCapabilities();
      if (!currentCapabilities.canUseFullV4) {
        setError(capabilityMessage("full-v4", currentCapabilities));
        return;
      }
      const response = await getOpsClient().analyzeFullV4(currentJob.id);
      const persisted = await getOpsClient().getFullV4Run(response.data.run_id);
      setRun({ ...response.data, status: persisted.data.status, ready: persisted.data.ready, score: persisted.data.score, decision: persisted.data.decision });
      setTab("Score");
    }
    catch (err) { setError(err instanceof Error ? err.message : "Full V4 analysis failed"); }
    finally { setBusy(false); }
  };
  const confirmApplied = async () => {
    if (appliedBusy || currentJob.status === "applied") return;
    setAppliedBusy(true); setError(null);
    try {
      const currentCapabilities = await refreshCapabilities();
      if (!currentCapabilities.canUseGuidedApplyMutation) {
        setError(capabilityMessage("guided-apply-mutation", currentCapabilities));
        return;
      }
      if (!window.confirm(`${NATIVE_HH_SUBMISSION_CONFIRMATION}. Confirm local tracking?`)) return;
      const updated = await tracker.updateStatus(
        currentJob.id,
        "applied",
        "User confirmed native HH submission",
      );
      if (!updated) {
        setError("The local vacancy was not found. Refresh the card and try again.");
        return;
      }
      setCurrentJob(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark as applied");
    } finally {
      setAppliedBusy(false);
    }
  };
  return <section aria-labelledby="application-card-title">
    <button type="button" onClick={onBack} style={{ ...secondaryButton, marginBottom: 14 }}>← Back to Inbox</button>
    <div style={{ ...cardStyle, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 id="application-card-title" style={pageTitle}>{currentJob.title}</h2>
          <p style={{ ...pageIntro, marginBottom: 10 }}>{currentJob.companyName} · {currentJob.source.toUpperCase()}</p>
        </div>
        <span style={{ ...statusBadge, background: colors.neutralBg, color: colors.textSecondary }}>{statusLabel(currentJob.status)}</span>
      </div>
      <p style={{ margin: "0 0 12px", color: colors.textMuted, fontSize: 12 }}>Vacancy readiness: <strong>{isFull ? "Full details available" : "Search preview only"}</strong>{!isFull && " — refresh to load the official full vacancy before running Full V4."}</p>
      <div style={actionRowStyle}><button type="button" onClick={() => void previewFullV4()} disabled={busy || !capabilities?.canUseFullV4} style={primaryButton}>Preview Full V4</button><button type="button" onClick={() => void refreshFullDetails()} disabled={busy || !capabilities?.canHydrateVacancy} style={secondaryButton}>Refresh vacancy</button>{preview && <button type="button" onClick={() => void executeFullV4()} disabled={busy || !capabilities?.canUseFullV4} style={primaryButton}>Confirm and run Full V4</button>}</div>
      {capabilities && !capabilities.canUseFullV4 && <p role="status" style={{ margin: "10px 0 0", color: colors.textMuted }}>{capabilityMessage("full-v4", capabilities)}</p>}
      {currentJob.status !== "applied" && <button type="button" onClick={() => void confirmApplied()} disabled={appliedBusy || !capabilities?.canUseGuidedApplyMutation} style={{ ...secondaryButton, marginTop: 10, opacity: appliedBusy || !capabilities?.canUseGuidedApplyMutation ? 0.6 : 1 }}>I submitted this application on HH — mark Applied</button>}
      {capabilities && currentJob.status !== "applied" && !capabilities.canUseGuidedApplyMutation && <p role="status" style={{ margin: "10px 0 0", color: colors.textMuted }}>{capabilityMessage("guided-apply-mutation", capabilities)}</p>}
      {busy && <p role="status" style={{ margin: "10px 0 0", color: colors.textMuted }}>Working…</p>}{error && <p role="alert" style={{ margin: "10px 0 0", color: colors.red }}>{error}</p>}
    </div>
    {preview && <div style={{ ...mutedPanelStyle, margin: "0 0 14px" }}><strong style={{ color: colors.navy }}>Preview only — no provider call was made.</strong><p>Target: {preview.provider}/{preview.model}. Expected provider call: {preview.cache_hit ? 0 : 1} (cache hit: {preview.cache_hit ? "yes" : "no"}).</p><p style={{ marginBottom: 0 }}>Payload readiness: full vacancy text loaded; privacy disclosure applies. Sent: {preview.what_is_sent.join(", ") || "none"}.</p></div>}
    <div role="tablist" aria-label="Application card sections" style={tabListStyle}>{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} style={tabButtonStyle(tab === item)}>{item}</button>)}</div>
    <div role="tabpanel" style={{ ...cardStyle, marginBottom: 0 }}>
      {tab === "Overview" && <><h3>Overview</h3><p>Source: {currentJob.source}. Work mode: {currentJob.workMode}. Last seen: {formatShortDate(currentJob.lastSeenAt)}.</p><p>Full V4: {run ? `persisted (${run.status}${run.ready ? ", ready" : ", not ready"})` : "not run"}. Viewing this card does not create an application or mark it Applied.</p></>}
      {tab === "Vacancy" && <><h3>Vacancy</h3><p style={{ whiteSpace: "pre-wrap" }}>{currentJob.descriptionClean || "Full vacancy description is not available."}</p><button type="button" onClick={() => window.open(currentJob.sourceUrl, "_blank", "noopener,noreferrer")}>Open source vacancy</button></>}
      {tab === "Evidence" && <><h3>Evidence</h3><p>Only persisted safe evidence references are shown here. Generated letters and provider output are not evidence.</p><p>Evidence trace: {run?.ready ? "available in the persisted Full V4 run" : run ? "not available: Full V4 result is invalid" : "not available"}.</p></>}
      {tab === "Score" && <><h3>Score</h3><p>Stage A deterministic score: <strong>{currentJob.ruleScore?.total ?? "not run/not available"}</strong>. Decision: {currentJob.ruleScore?.recommendation ?? "not run/not available"}.</p><p>Full V4 final score: <strong>{run?.score ?? "not run"}</strong>. Decision: {run?.decision ?? "not run"}; confidence: {run?.confidence ?? "not run"}.</p></>}
      {tab === "Letter" && <><h3>Letter</h3><p>Copying is not sending; a final letter is not an application sent.</p><p>{run?.decision === "skip" ? "SKIP: no letter was generated." : run && !run.ready ? "Full V4 letter is not ready: persisted validation failed." : `Full V4 letter: ${run?.cover_letter ? "available in persisted result" : "not created"}.`}</p></>}
      {tab === "Timeline" && <><h3>Timeline</h3><p>Existing local status history only.</p>{currentJob.statusHistory.map((event, index) => <p key={`${event.at}-${index}`}>{formatShortDate(event.at)} · {event.from ?? "—"} → {event.to} · {event.source}</p>)}</>}
      {tab === "Follow-up" && <FollowUpPanel job={currentJob} />}
      {tab === "Interview" && <><h3>Interview</h3><p>Not-yet-active in AOPS-12. Interview Pack is deferred.</p></>}
      {tab === "Debug" && <><h3>Safe debug metadata</h3><p>ID: {currentJob.id}</p><p>Vacancy hash: {currentJob.descriptionHash}</p><p>Run ID: {run?.run_id ?? "not run"}</p><p>Analysis status: {run?.status ?? "not run"}</p><p>Provider calls: {run ? (run.cached ? "0 (cache hit)" : "1") : "0"}</p><p>No credentials, raw provider payloads or private evidence bodies are displayed.</p></>}
    </div>
  </section>;
}

function FollowUpPanel({ job }: { job: Job }): ReactNode {
  const capabilities = useOpsCapabilities();
  const [followUpAt, setFollowUpAt] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [activeFollowUp, setActiveFollowUp] = useState<FollowUpItem | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void db.applications.where("jobId").equals(job.id).first().then(async (application) => {
      const currentCapabilities = await getOpsCapabilities();
      if (currentCapabilities.mode.effectiveMode === "standalone" && application?.followUpAt) {
        if (!cancelled) { setApplicationId(application.id); setFollowUpAt(application.followUpAt); setStatus(new Date(application.followUpAt) <= new Date() ? "overdue" : "scheduled"); }
        return;
      }
      try {
        if (currentCapabilities.canUseOpsFollowups && application) {
          const response = await getOpsClient().listFollowUps(application.id);
          const active = response.data.find((item) => !["completed", "cancelled", "sent", "skipped"].includes(item.status));
          if (!cancelled) { setApplicationId(application.id); setActiveFollowUp(active ?? null); setFollowUpAt(active?.due_at ?? null); setStatus(active?.derived_state ?? "none"); }
        } else if (!cancelled) setStatus(currentCapabilities.mode.effectiveMode === "ops" ? "unavailable" : "none");
      } catch { if (!cancelled) setStatus("unavailable"); }
    }).catch(() => { if (!cancelled) setStatus("unavailable"); });
    return () => { cancelled = true; };
  }, [job.id]);
  const update = async (nextStatus: "completed" | "snoozed" | "cancelled" | "sent") => {
    if (activeFollowUp) {
      try {
        const currentCapabilities = await getOpsCapabilities({ force: true });
        if (!currentCapabilities.canUseOpsFollowups) {
          setStatus("unavailable");
          return;
        }
        const response = await getOpsClient().updateFollowUp(activeFollowUp.id, { expected_revision: activeFollowUp.revision, status: nextStatus === "sent" ? undefined : nextStatus, sent_confirmation: nextStatus === "sent", due_at: nextStatus === "snoozed" ? new Date(Date.now() + 86400000).toISOString() : undefined });
        setActiveFollowUp(nextStatus === "completed" || nextStatus === "cancelled" || nextStatus === "sent" ? null : response.data);
        setStatus(nextStatus);
      } catch { setStatus("unavailable"); }
    } else if (applicationId && followUpAt) {
      const currentCapabilities = await getOpsCapabilities({ force: true });
      if (currentCapabilities.mode.effectiveMode === "ops") {
        setStatus("unavailable");
        return;
      }
      await db.applications.update(applicationId, { followUpAt: undefined });
      setFollowUpAt(null); setStatus(nextStatus);
    }
  };
  const followupWriteBlocked = capabilities?.mode.effectiveMode === "ops" && !capabilities.canUseOpsFollowups;
  return <><h3>Follow-up</h3><p>Status: <strong>{status}</strong>{followUpAt ? ` · due ${formatShortDate(followUpAt)}` : ""}.</p><p>Follow-ups are local and human-controlled. Draft generation never sends a message; explicit sent confirmation is required.</p>{followupWriteBlocked && <p role="status">{capabilityMessage("ops-followups", capabilities)}</p>}{activeFollowUp?.draft_text && <p style={{ whiteSpace: "pre-wrap", background: "#f7f9fb", padding: 8 }}>{activeFollowUp.draft_text}</p>}{(activeFollowUp || (applicationId && followUpAt)) && <div style={{ display: "flex", gap: 8 }}><button type="button" disabled={followupWriteBlocked} onClick={() => void update("completed")}>Complete</button><button type="button" disabled={followupWriteBlocked} onClick={() => void update("snoozed")}>Snooze 1 day</button><button type="button" disabled={followupWriteBlocked} onClick={() => void update("cancelled")}>Cancel</button>{activeFollowUp?.draft_text && <button type="button" disabled={followupWriteBlocked} onClick={() => void update("sent")}>Confirm sent</button>}</div>}{status === "none" && <p>No active follow-up is recorded.</p>}</>;
}

export function ApplicationWorkspace({ onNavigate }: { onNavigate?: (route: "discovery") => void }): ReactNode {
  const { loading } = useJobs();
  const [selected, setSelected] = useState<Job | null>(null);
  const [directLookup, setDirectLookup] = useState<"idle" | "loading" | "not-found">("idle");
  useEffect(() => {
    const vacancyId = new URLSearchParams(window.location.search).get("vacancyId");
    if (!vacancyId) return;
    setDirectLookup("loading");
    void (async () => {
      const localJob = await jobRepo.getById(`hh_${vacancyId}`);
      if (localJob) {
        setSelected(localJob);
        setDirectLookup("idle");
        return;
      }

      // A direct card link may target a vacancy mirrored in Companion but not
      // present in local Dexie. Read the safe list projection only; this does
      // not create an Application and does not invoke Full V4/provider work.
      try {
        const capabilities = await getOpsCapabilities();
        if (!capabilities.canUseSearchProfiles) return;
        const response = await getOpsClient().listVacancies({ archived: false });
        const remote = response.data.find(
          (item) => item.source === "hh" && item.source_vacancy_id === vacancyId,
        );
        if (remote) {
          setSelected(companionVacancyToJob(remote));
          setDirectLookup("idle");
        } else {
          setDirectLookup("not-found");
        }
      } catch {
        // Inbox remains the safe fallback when Companion is unavailable.
        setDirectLookup("not-found");
      }
    })();
  }, []);
  if (loading) return <p role="status">Loading applications…</p>;
  if (directLookup === "loading") return <p role="status">Loading application card…</p>;
  if (selected) return <ApplicationCard job={selected} onBack={() => setSelected(null)} />;
  if (directLookup === "not-found") return <section aria-labelledby="inbox-title"><h2 id="inbox-title">Inbox</h2><p role="alert">Application card vacancy was not found.</p></section>;
  return <Inbox onSelect={setSelected} onNavigate={onNavigate} />;
}
