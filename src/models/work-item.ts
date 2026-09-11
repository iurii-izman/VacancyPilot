/** Non-persisted presentation models for the two explicit UI authorities. */

import type { OpsWorkItem } from "@/adapters/companion/ops-projection-types";
import type { Job } from "@/models/job";

export interface StandaloneWorkItemView {
  authority: "standalone";
  job: Job;
  vacancyId: {
    standaloneJobId: string;
    hhVacancyId: string | null;
  };
  title: string;
  companyName: string;
  source: string;
  sourceUrl: string;
  vacancyState: Job["status"];
  applicationState: string | null;
  analysisState: "not_analyzed" | "ready";
  score: number | null;
  decision: string | null;
  followUpState: string | null;
  updatedAt: string;
  lastSeenAt: string;
}

export interface OpsWorkItemView {
  authority: "ops";
  item: OpsWorkItem;
  vacancyId: {
    companionVacancyId: string;
    hhVacancyId: string;
  };
  title: string;
  companyName: string;
  source: string;
  sourceUrl: string;
  vacancyState: "active" | "archived";
  applicationState: string;
  analysisState: OpsWorkItem["analysis_state"];
  score: number | null;
  decision: string | null;
  followUpState: string;
  updatedAt: string;
  lastSeenAt: string;
}

export type WorkItemViewModel = StandaloneWorkItemView | OpsWorkItemView;

/** Build a view without changing the Standalone domain record. */
export function fromStandalone(job: Job): StandaloneWorkItemView {
  const hhVacancyId = job.sourceVacancyId ?? (job.id.startsWith("hh_") ? job.id.slice(3) : null);
  return {
    authority: "standalone",
    job,
    vacancyId: { standaloneJobId: job.id, hhVacancyId },
    title: job.title,
    companyName: job.companyName,
    source: job.source,
    sourceUrl: job.sourceUrl,
    vacancyState: job.status,
    applicationState: job.status === "new" ? null : job.status,
    analysisState: job.aiAnalysis ? "ready" : "not_analyzed",
    score: job.aiAnalysis?.fitScore ?? job.ruleScore?.total ?? null,
    decision: job.aiAnalysis?.recommendation ?? job.ruleScore?.recommendation ?? null,
    followUpState: null,
    updatedAt: job.updatedAt,
    lastSeenAt: job.lastSeenAt,
  };
}

/** Build a view from Companion data; this function never accepts or returns a Job. */
export function fromOps(item: OpsWorkItem): OpsWorkItemView {
  return {
    authority: "ops",
    item,
    vacancyId: {
      companionVacancyId: item.vacancy.vacancy_id,
      hhVacancyId: item.vacancy.hh_vacancy_id,
    },
    title: item.vacancy.title,
    companyName: item.vacancy.company_name ?? "",
    source: item.vacancy.source,
    sourceUrl:
      item.vacancy.source_url ??
      `https://hh.ru/vacancy/${encodeURIComponent(item.vacancy.hh_vacancy_id)}`,
    vacancyState: item.vacancy_state,
    applicationState: item.application_state,
    analysisState: item.analysis_state,
    score: item.analysis.score,
    decision: item.analysis.decision,
    followUpState: item.follow_up_state,
    updatedAt: item.vacancy.updated_at,
    lastSeenAt: item.vacancy.last_seen_at,
  };
}
