/**
 * Companion vacancy intake & triage contracts — AOPS-06.
 *
 * These hand-maintained client types are validated against the canonical
 * OpenAPI snapshot at ``shared/contracts/openapi.json`` as required by ADR-003.
 *
 * They cover the v1 vacancy intake, list, detail, and triage contracts.
 */

// ── Intake (POST /vacancies/intake) ────────────────────────────────────────

/** Normalized user-visible vacancy fields only — no cookies, DOM blobs,
 * session data, hidden API data, or contact secrets. */
export interface VacancyIntakeV1 {
  schema_version: 1;
  source: string;
  source_vacancy_id: string;
  url?: string | null;
  title?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string | null;
  work_mode?: "remote" | "hybrid" | "office" | "unknown" | null;
  city?: string | null;
  experience?: string | null;
  description?: string | null;
  skills?: string[];
  captured_at?: string | null;
  capture_source?: string | null;
  parser_version?: string | null;
}

export interface VacancyIntakeData {
  result: "created" | "updated" | "unchanged";
  vacancy_id: string;
  revision: number;
  first_seen_at: string;
  last_seen_at: string;
  snapshot_id: string | null;
  duplicate: boolean;
  description_hash: string;
}

export interface VacancyIntakeResponse {
  data: VacancyIntakeData;
  meta: Record<string, string>;
}

// ── List (GET /vacancies) ───────────────────────────────────────────────────

export interface VacancyListItem {
  id: string;
  source: string;
  source_vacancy_id: string;
  url: string | null;
  title: string;
  company_id: string | null;
  company_name: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  work_mode: string | null;
  experience: string | null;
  description: string | null;
  skills: string[];
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
  archived: boolean;
  revision: number;
  description_hash: string | null;
}

export interface VacancyListMeta {
  request_id: string;
  total: number;
  limit: number;
  offset: number;
}

export interface VacancyListResponse {
  data: VacancyListItem[];
  meta: VacancyListMeta;
}

export interface VacancyDetailResponse {
  data: VacancyListItem;
  meta: Record<string, string>;
}

// ── Triage (POST /vacancies/{id}/triage) ────────────────────────────────────

export interface VacancyTriageRequest {
  target_titles?: string[];
  role_family?: string | null;
  must_have_skills?: string[];
  nice_to_have_skills?: string[];
  salary_expectation_min?: number | null;
  experience_years?: number | null;
  seniority?: "junior" | "middle" | "senior" | "lead" | "principal" | null;
  preferred_work_modes?: string[];
  preferred_cities?: string[];
  remote_only?: boolean;
  office_required?: boolean;
  location_eligible?: boolean | null;
  blocked_companies?: string[];
}

export interface VacancyTriageRiskFlag {
  code: string;
  severity: string;
  message: string;
  evidence: string | null;
}

export interface VacancyTriageHardGate {
  code: string;
  status: "pass" | "fail" | "needs_input" | "na";
  explanation: string;
}

export interface VacancyTriageComponent {
  code: string;
  score: number;
  max: number;
  reasons: string[];
}

export interface VacancyTriageData {
  vacancy_id: string;
  revision: number;
  verdict: "pass" | "needs_input" | "skip";
  recommendation: "apply" | "consider" | "skip" | "needs_input";
  score: number;
  engine: string;
  hard_gates: VacancyTriageHardGate[];
  components: VacancyTriageComponent[];
  risk_flags: VacancyTriageRiskFlag[];
  fit_reasons: string[];
  caps_applied: string[];
}

export interface VacancyTriageResponse {
  data: VacancyTriageData;
  meta: Record<string, string>;
}
