import { useEffect, useMemo, useState, type ReactNode } from "react";
import { jobRepo } from "@/db/repositories";
import { detectCompanionStatus, getOpsClient } from "@/services/companion-service";
import type { Job } from "@/models/job";
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

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e7ee",
  borderRadius: 8,
  padding: 14,
  background: "#fff",
};

function useJobs(): { jobs: Job[]; loading: boolean; error: string | null } {
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
          const connection = await detectCompanionStatus();
          if (connection.status === "connected") {
            const response = await getOpsClient().listVacancies({ archived: false });
            items = response.data.filter((item) => item.source === "hh").map((item) => ({
              id: item.id, source: "hh", sourceVacancyId: item.source_vacancy_id,
              sourceUrl: item.url ?? "", title: item.title, companyId: item.company_id ?? "",
              companyName: item.company_name ?? "", workMode: (item.work_mode ?? "unknown") as Job["workMode"],
              descriptionClean: item.description ?? "", descriptionHash: item.description_hash ?? "",
              skills: item.skills, status: "new", statusHistory: [], firstSeenAt: item.first_seen_at,
              lastSeenAt: item.last_seen_at, updatedAt: item.updated_at,
            } satisfies Job));
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
  }, []);
  return { jobs, loading, error };
}

function ActionCard({ label, value, description, onClick }: {
  label: string; value: string; description: string; onClick: () => void;
}): ReactNode {
  return <button type="button" onClick={onClick} style={{ ...cardStyle, textAlign: "left", cursor: "pointer", minWidth: 150, flex: "1 1 150px" }} aria-label={`${label}: ${value}`}>
    <div style={{ fontSize: 12, color: "#536273" }}>{label}</div>
    <div style={{ fontSize: 25, fontWeight: 700, color: "#1a3a5c", margin: "4px 0" }}>{value}</div>
    <div style={{ fontSize: 11, color: "#687789" }}>{description}</div>
  </button>;
}

export function CommandCenter({ onNavigate }: { onNavigate?: (section: "inbox" | "vacancies") => void }): ReactNode {
  const { jobs, loading, error } = useJobs();
  const [companion, setCompanion] = useState("Checking…");
  useEffect(() => { void detectCompanionStatus().then((result) => setCompanion(result.status)).catch(() => setCompanion("unavailable")); }, []);
  if (loading) return <p role="status">Loading Command Center…</p>;
  if (error) return <div role="alert" style={cardStyle}>Command Center unavailable: {error}</div>;
  const newJobs = jobs.filter((job) => job.status === "new" || job.status === "viewed");
  const ready = jobs.filter((job) => job.status === "letter_ready");
  const applied = jobs.filter((job) => job.status === "applied");
  const updated = jobs.filter((job) => job.passiveHHStatus && job.passiveHHStatus.detectedAt > job.updatedAt);
  return <section aria-labelledby="command-center-title">
    <h2 id="command-center-title" style={{ marginTop: 0 }}>Command Center</h2>
    <p style={{ color: "#536273", fontSize: 13 }}>A daily, action-oriented view of the local job search.</p>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0" }}>
      <ActionCard label="New to review" value={String(newJobs.length)} description="Open the Inbox" onClick={() => onNavigate?.("inbox")} />
      <ActionCard label="Ready to send" value={String(ready.length)} description="Review manually" onClick={() => onNavigate?.("inbox")} />
      <ActionCard label="Applied" value={String(applied.length)} description="Tracked explicitly" onClick={() => onNavigate?.("vacancies")} />
      <ActionCard label="HH updates" value={String(updated.length)} description="Known local signals" onClick={() => onNavigate?.("inbox")} />
    </div>
    <div style={{ ...cardStyle, background: "#f7f9fb" }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>System status</h3>
      <p style={{ margin: 0, fontSize: 12 }}>Companion: <strong>{companion}</strong>. Follow-ups, interviews and backup health are not active until supported by a real endpoint.</p>
      <p style={{ margin: "8px 0 0", fontSize: 12 }}>HH negotiations: <strong>Unavailable when denied by HH</strong>; this is not shown as zero responses.</p>
    </div>
  </section>;
}

export function Inbox({ onSelect }: { onSelect?: (job: Job) => void }): ReactNode {
  const { jobs, loading, error } = useJobs();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = useMemo(() => jobs.filter((job) => {
    const matchesQuery = !query || `${job.title} ${job.companyName}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === "all" || job.status === status);
  }), [jobs, query, status]);
  if (loading) return <p role="status">Loading Inbox…</p>;
  if (error) return <div role="alert" style={cardStyle}>Inbox unavailable: {error}</div>;
  return <section aria-labelledby="inbox-title">
    <h2 id="inbox-title" style={{ marginTop: 0 }}>Inbox</h2>
    <p style={{ color: "#536273", fontSize: 13 }}>Review imported vacancies. Full V4 analysis remains an explicit single-item action.</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
      <label style={{ flex: "1 1 220px", fontSize: 12 }}>Search title or company<input aria-label="Search vacancies" value={query} onChange={(event) => setQuery(event.target.value)} style={{ display: "block", width: "100%", padding: 7, marginTop: 3 }} /></label>
      <label style={{ fontSize: 12 }}>Status<select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} style={{ display: "block", padding: 7, marginTop: 3 }}><option value="all">All</option>{["new", "viewed", "saved", "letter_ready", "applied", "hr_replied", "interview", "test_task", "offer", "rejected_by_me", "rejected_by_company"].map((item) => <option key={item} value={item}>{statusLabel(item as Job["status"])}</option>)}</select></label>
    </div>
    {filtered.length === 0 ? <div style={cardStyle}>No vacancies match these filters. No automatic analysis was requested.</div> : <div style={{ display: "grid", gap: 8 }}>
      {filtered.map((job) => <article key={job.id} style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div><h3 style={{ margin: 0, fontSize: 14 }}>{job.title || "Untitled vacancy"}</h3><div style={{ fontSize: 12, color: "#687789" }}>{job.companyName || "Unknown company"} · {job.source.toUpperCase()}</div></div>
          <span style={{ color: scoreColor(job.ruleScore?.total), fontWeight: 700 }}>{job.ruleScore?.total ?? "—"}</span>
        </div>
        <div style={{ fontSize: 12, marginTop: 8 }}>Status: <strong>{statusLabel(job.status)}</strong> · updated {formatShortDate(job.updatedAt)} · {job.workMode}</div>
        {job.passiveHHStatus && <div style={{ fontSize: 11, color: "#536273", marginTop: 5 }}>HH signal recorded locally; it does not change pipeline status automatically.</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 9 }}><button type="button" onClick={() => onSelect?.(job)}>Open application card</button><button type="button" onClick={() => window.open(job.sourceUrl, "_blank", "noopener,noreferrer")}>Open vacancy</button></div>
      </article>)}
    </div>}
  </section>;
}

export function ApplicationCard({ job, onBack }: { job: Job; onBack?: () => void }): ReactNode {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Vacancy", "Evidence", "Score", "Letter", "Timeline", "Follow-up", "Interview", "Debug"];
  return <section aria-labelledby="application-card-title">
    <button type="button" onClick={onBack} style={{ marginBottom: 10 }}>← Back to Inbox</button>
    <h2 id="application-card-title" style={{ margin: "0 0 4px" }}>{job.title}</h2><p style={{ marginTop: 0, color: "#536273", fontSize: 13 }}>{job.companyName} · {job.source.toUpperCase()} · {statusLabel(job.status)}</p>
    <div role="tablist" aria-label="Application card sections" style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid #dce2e8", marginBottom: 14 }}>{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
    <div role="tabpanel" style={cardStyle}>
      {tab === "Overview" && <><h3>Overview</h3><p>Source: {job.source}. Work mode: {job.workMode}. Last seen: {formatShortDate(job.lastSeenAt)}.</p><p>Current status is shown only from persisted local state. Viewing this card does not create an application or mark it Applied.</p></>}
      {tab === "Vacancy" && <><h3>Vacancy</h3><p style={{ whiteSpace: "pre-wrap" }}>{job.descriptionClean}</p><button type="button" onClick={() => window.open(job.sourceUrl, "_blank", "noopener,noreferrer")}>Open source vacancy</button></>}
      {tab === "Evidence" && <><h3>Evidence</h3><p>Only persisted safe evidence references are shown here. Generated letters and provider output are not evidence.</p><p>Evidence trace: {job.aiAnalysis ? "available in the stored analysis" : "not available"}.</p></>}
      {tab === "Score" && <><h3>Score</h3><p>Stage A score: <strong>{job.ruleScore?.total ?? "not available"}</strong>. Decision: {job.ruleScore?.recommendation ?? "not available"}.</p>{job.ruleScore?.capsApplied?.map((cap) => <p key={cap.reason}>Cap: {cap.reason} (max {cap.maxScore})</p>)}</>}
      {tab === "Letter" && <><h3>Letter</h3><p>Use the existing Cover Letter Studio lifecycle. Copying is not sending; a final letter is not an application sent.</p><p>Letter reference: {job.coverLetterId ?? "not created"}.</p></>}
      {tab === "Timeline" && <><h3>Timeline</h3><p>Existing local status history only. Canonical append-only application events are introduced in AOPS-13.</p>{job.statusHistory.map((event, index) => <p key={`${event.at}-${index}`}>{formatShortDate(event.at)} · {event.from ?? "—"} → {event.to} · {event.source}</p>)}</>}
      {tab === "Follow-up" && <><h3>Follow-up</h3><p>Not-yet-active in AOPS-12. No synthetic follow-up count is shown.</p></>}
      {tab === "Interview" && <><h3>Interview</h3><p>Not-yet-active in AOPS-12. Interview Pack is deferred.</p></>}
      {tab === "Debug" && <><h3>Safe debug metadata</h3><p>ID: {job.id}</p><p>Vacancy hash: {job.descriptionHash}</p><p>Analysis: {job.aiAnalysis ? `${job.aiAnalysis.provider}/${job.aiAnalysis.model}` : "not run"}</p><p>No credentials, raw provider payloads or private evidence bodies are displayed.</p></>}
    </div>
  </section>;
}

export function ApplicationWorkspace(): ReactNode {
  const { loading } = useJobs();
  const [selected, setSelected] = useState<Job | null>(null);
  if (loading) return <p role="status">Loading applications…</p>;
  if (selected) return <ApplicationCard job={selected} onBack={() => setSelected(null)} />;
  return <Inbox onSelect={setSelected} />;
}
