import { useEffect, useState, type ReactNode } from "react";
import { detectCompanionStatus, getOpsClient } from "@/services/companion-service";
import type { AnalyticsSummary } from "@/adapters/companion/application-types";

const card: React.CSSProperties = { border: "1px solid #e2e7ee", borderRadius: 8, padding: 14, background: "#fff" };

export function PerformanceSection(): ReactNode {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [message, setMessage] = useState("Loading local performance data…");
  useEffect(() => {
    void (async () => {
      try {
        const connection = await detectCompanionStatus();
        if (connection.status !== "connected") { setMessage("Connect the local companion to view conversion metrics."); return; }
        const response = await getOpsClient().getAnalyticsSummary();
        setData(response.data); setMessage("");
      } catch { setMessage("Performance data is unavailable locally."); }
    })();
  }, []);
  if (!data) return <section aria-labelledby="performance-title"><h2 id="performance-title">Performance</h2><p role="status">{message}</p></section>;
  const money = data.estimated_cost_usd === null ? "$unknown" : `$${data.estimated_cost_usd}`;
  return <section aria-labelledby="performance-title">
    <h2 id="performance-title">Performance</h2>
    <p style={{ color: "#536273", fontSize: 13 }}>Local descriptive outcomes. {data.state === "SMALL_SAMPLE" ? "Small sample — treat rates as directional." : data.state === "NO_DATA" ? "No explicitly applied applications yet." : "Observed in current sample; not evidence of causation."}</p>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {[['Applied', data.applications_applied], ['Responses', data.responses], ['Response rate', data.response_rate === null ? "—" : `${Math.round(data.response_rate * 100)}%`], ['Interviews', data.interviews], ['Pending', data.pending], ['Sessions', data.sessions], ['Median min/app', data.median_processing_minutes ?? "—"], ['AI cost', money]].map(([label, value]) => <div key={String(label)} style={{ ...card, minWidth: 120 }}><div style={{ fontSize: 12, color: "#536273" }}>{label}</div><strong style={{ fontSize: 22 }}>{value}</strong></div>)}
    </div>
    <div style={{ ...card, marginTop: 12 }}><strong>AI usage</strong><p>V4 input tokens: {data.v4_input_tokens} · output tokens: {data.v4_output_tokens} · cost/application: {data.estimated_cost_per_applied_usd === null ? "$unknown" : `$${data.estimated_cost_per_applied_usd}`}</p><p>Cache reuse: {data.cached_run_count === null ? "unknown" : data.cached_run_count}. Every number is based on persisted local records. Copying a letter never counts as Applied.</p></div>
  </section>;
}
