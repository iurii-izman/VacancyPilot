/**
 * Authoritative Ops UI read-model contracts.
 *
 * These are deliberately separate from the Standalone ``Job`` and
 * ``Application`` models.  They are transport/view types only and are never
 * persisted in Dexie domain tables.
 */

export type OpsProjectionView = "vacancies" | "applications" | "summary";
export type OpsAnalysisState =
  | "not_analyzed"
  | "running"
  | "ready"
  | "invalid"
  | "failed";

export interface OpsProjectionQuery {
  view?: OpsProjectionView;
  limit?: number;
  offset?: number;
  source?: string;
  work_mode?: "remote" | "hybrid" | "office" | "unknown";
  archived?: boolean;
  updated_after?: string;
  search_profile_id?: string;
  query?: string;
  vacancy_id?: string;
  source_vacancy_id?: string;
  /** ``none`` means that no Application exists; other values are App status. */
  application_status?: string;
  analysis_state?: OpsAnalysisState;
  score_band?: "high" | "mid" | "low";
  decision?: "apply" | "consider" | "skip" | "needs_input";
  sort?: "updated_at" | "score";
  direction?: "asc" | "desc";
}

export interface OpsVacancy {
  vacancy_id: string;
  hh_vacancy_id: string;
  source: string;
  source_url: string | null;
  title: string;
  company_id: string | null;
  company_name: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  city: string | null;
  work_mode: string | null;
  experience: string | null;
  description: string | null;
  description_hash: string | null;
  skills: string[];
  published_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
  archived: boolean;
  revision: number;
  hydration_state: "full" | "partial";
}

export interface OpsApplication {
  application_id: string;
  vacancy_id: string;
  status: string;
  decision: string | null;
  score: number | null;
  confidence: number | null;
  applied_at: string | null;
  next_action_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface OpsAnalysis {
  run_id: string | null;
  state: OpsAnalysisState;
  status: string | null;
  repair_status: string | null;
  ready: boolean;
  score: number | null;
  decision: string | null;
  confidence: string | null;
  created_at: string | null;
}

export interface OpsFollowUp {
  follow_up_id: string;
  application_id: string;
  reason: string | null;
  due_at: string | null;
  status: string;
  derived_state: string;
  draft_text: string | null;
  sent_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface OpsProvenanceHit {
  search_profile_id: string;
  search_profile_name: string;
  first_seen_at: string;
  last_seen_at: string;
  hit_count: number;
}

export interface OpsAvailability {
  application: "available" | "unavailable";
  analysis: "available" | "unavailable";
  follow_up: "available" | "unavailable";
  provenance: "available" | "unavailable";
}

export interface OpsWorkItem {
  authority: "ops";
  vacancy_state: "active" | "archived";
  vacancy: OpsVacancy;
  applications: OpsApplication[];
  application_state: string;
  analysis: OpsAnalysis;
  analysis_state: OpsAnalysisState;
  follow_ups: OpsFollowUp[];
  follow_up_state: string;
  active_follow_up_count: number;
  provenance: { hits: OpsProvenanceHit[] };
  availability: OpsAvailability;
}

export interface OpsSummary {
  vacancies_total: number;
  vacancies_without_application: number;
  applications_total: number;
  analysis_not_analyzed: number;
  analysis_running: number;
  analysis_ready: number;
  analysis_invalid: number;
  analysis_failed: number;
  ready_to_review: number;
  followups_due: number;
}

export interface OpsWorkItemResponse {
  data: OpsWorkItem[];
  meta: {
    request_id: string;
    total: number;
    limit: number;
    offset: number;
    view: OpsProjectionView;
    summary: OpsSummary;
  };
}
