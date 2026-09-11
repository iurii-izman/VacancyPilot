/**
 * Companion wire contracts.
 *
 * The canonical source is the generated OpenAPI module.  This file is the
 * small adapter map between operation names/schema names and the ergonomic
 * names used by the extension.  Domain/read-model refinements are kept
 * explicit where the current server schema is intentionally an open JSON
 * object (for example, the legacy HH integration status payloads).
 */

import type { components, operations } from '../../../shared/contracts/generated/openapi-types';

export type { components, operations };

// ── Shared generated schemas ──────────────────────────────────────────────

export type CompanionErrorData = components['schemas']['ErrorData'];
export type CompanionErrorResponse = components['schemas']['ErrorResponse'];
export type HealthData = components['schemas']['HealthData'];
export type HealthMeta = components['schemas']['HealthMeta'];
export type HealthResponse = components['schemas']['HealthResponse'];

export type PairStartData = components['schemas']['PairStartData'];
export type PairStartResponse = components['schemas']['PairStartResponse'];
export type PairRecoveryStartResponse = PairStartResponse;
export type PairConfirmRequest = components['schemas']['PairConfirmRequest'];
export type PairConfirmData = components['schemas']['PairConfirmData'];
export type PairConfirmResponse = components['schemas']['PairConfirmResponse'];
export type PairStatusResponse = components['schemas']['PairStatusResponse'];
export type PairRevokeData = components['schemas']['PairRevokeData'];
export type PairRevokeResponse = components['schemas']['PairRevokeResponse'];

export type VacancyIntakeV1 = components['schemas']['VacancyIntakeV1'];
export type VacancyIntakeData = components['schemas']['IntakeData'];
export type VacancyIntakeResponse = components['schemas']['IntakeResponse'];
export type VacancyListItem = components['schemas']['VacancyItem'];
export type VacancyListMeta = components['schemas']['VacancyListMeta'];
export type VacancyListResponse = components['schemas']['VacancyListResponse'];
export type VacancyDetailResponse = components['schemas']['VacancyDetailResponse'];
export type VacancyListFilters = Omit<
  NonNullable<operations['vacancy_list_api_v1_vacancies_get']['parameters']['query']>,
  'limit' | 'offset'
>;
export type VacancyTriageData = components['schemas']['TriageData'];
export type VacancyTriageResponse = components['schemas']['TriageResponse'];
export type VacancyTriageRiskFlag = components['schemas']['RiskFlagOut'];
export type VacancyTriageHardGate = components['schemas']['HardGateOut'];
export type VacancyTriageComponent = components['schemas']['ScoreComponentOut'];

/**
 * The server accepts defaults for this request model.  `Partial` here is an
 * adapter convenience for the preview/execute helpers; every field and enum
 * still comes from the generated schema.
 */
export type VacancyTriageRequest = Partial<components['schemas']['TriageRequest']>;

export type CompanionProviderPolicy = components['schemas']['ProviderInputPolicy'];
export type FullV4PreviewRequest = Pick<components['schemas']['AnalyzeRequest'], 'policy'>;
export type FullV4AnalyzeRequest = Pick<
  components['schemas']['AnalyzeRequest'],
  'confirmation'
> & Partial<Omit<components['schemas']['AnalyzeRequest'], 'confirmation'>>;
export type FullV4PreviewResponse = Omit<
  components['schemas']['app__analysis__models__PreviewResponse'],
  'data'
> & {
  data: Omit<components['schemas']['PayloadPreview'], 'what_is_sent' | 'what_is_not_sent'> & {
    what_is_sent: string[];
    what_is_not_sent: string[];
  };
};
export type FullV4AnalyzeResponse = Omit<components['schemas']['AnalyzeResponse'], 'data'> & {
  data: Omit<
    components['schemas']['AnalyzeData'],
    | 'confidence'
    | 'cover_letter'
    | 'decision'
    | 'estimated_cost_usd'
    | 'recruiter_risks'
    | 'score'
    | 'token_input'
    | 'token_output'
    | 'validation_errors'
  > & {
    confidence: string | null;
    cover_letter: string | null;
    decision: string | null;
    estimated_cost_usd: number | null;
    recruiter_risks: components['schemas']['RecruiterRisk'][];
    score: number | null;
    token_input: number | null;
    token_output: number | null;
    validation_errors: string[];
  };
};
export type FullV4PersistedRunResponse = Omit<
  components['schemas']['EngineRunDetailResponse'],
  'data'
> & {
  data: Omit<
    components['schemas']['EngineRunItem'],
    'decision' | 'model' | 'score'
  > & {
    decision: string | null;
    model: string | null;
    score: number | null;
  };
};

// ── HH integration refinements ────────────────────────────────────────────

/**
 * These fields are returned by the existing HH adapter, whose OpenAPI
 * response is currently an intentionally open object.  The envelope itself
 * remains the generated operation response below; this is only a local view
 * refinement for the fields the UI consumes.
 */
export interface HHStatusViewData {
  application_token_configured: boolean;
  public_api_available: boolean;
  user_oauth_connected: boolean;
  last_public_sync_at: string | null;
  last_error_code: string | null;
}

export type HHStatusWireResponse = operations['hh_status_api_v1_integrations_hh_status_get']['responses'][200]['content']['application/json'];
export type HHStatusResponse = HHStatusWireResponse & {
  data: HHStatusViewData;
  meta: Record<string, string>;
};

export type HHSearchQuery = components['schemas']['HHSearchQuery'];
export interface HHSearchProfile {
  id: string;
  name: string;
  query: HHSearchQuery;
  enabled: boolean;
  last_run_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export type HHSearchProfilesWireResponse = components['schemas']['ProfileListResponse'];
export type HHSearchProfilesResponse = HHSearchProfilesWireResponse & {
  data: HHSearchProfile[];
  meta: Record<string, unknown>;
};

export type HHSearchProfileWireResponse = components['schemas']['ProfileResponse'];
export type HHSearchProfileResponse = HHSearchProfileWireResponse & {
  data: HHSearchProfile;
  meta: Record<string, string>;
};

export type HHSearchPreviewWireResponse = operations['preview_profile_api_v1_hh_search_profiles__profile_id__preview_post']['responses'][200]['content']['application/json'];
export type HHSearchPreviewResponse = HHSearchPreviewWireResponse & {
  data: {
    profile_id: string;
    name: string;
    found: number | null;
    classification: 'GOOD' | 'ACCEPTABLE' | 'TOO_BROAD' | 'ERROR';
    sync_allowed: boolean;
    error_code?: string;
  };
  meta: Record<string, string>;
};

export interface HHVacancySyncData {
  sync_run_id: string;
  profiles_attempted: number;
  pages_fetched: number;
  items_seen: number;
  vacancies_created: number;
  vacancies_updated: number;
  vacancies_unchanged: number;
  snapshots_created: number;
  triaged: number;
  rate_limited: number;
  errors: Array<{ profile_id: string; code: string }>;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'partial' | 'error';
  too_broad: number;
  profiles: Array<{
    profile_id: string;
    name: string;
    found: number | null;
    seen: number;
    created: number;
    updated: number;
    unchanged: number;
    error: string | null;
  }>;
}

export type HHVacancySyncWireResponse = components['schemas']['SyncResponse'];
export type HHVacancySyncResponse = HHVacancySyncWireResponse & {
  data: HHVacancySyncData;
  meta: Record<string, string>;
};

// ── Application, follow-up, migration, analytics ──────────────────────────

export type ApplicationStatus =
  | 'new'
  | 'saved'
  | 'analyzed'
  | 'ready_to_send'
  | 'applied'
  | 'hr_replied'
  | 'interview'
  | 'test_task'
  | 'offer'
  | 'rejected_by_company'
  | 'rejected_by_me'
  | 'archived';

export type ApplicationItem = Omit<components['schemas']['ApplicationData'], 'status'> & {
  /** UI status vocabulary; the generated wire field is the source value. */
  status: ApplicationStatus;
};
export type ApplicationListResponse = Omit<
  components['schemas']['ApplicationListResponse'],
  'data'
> & { data: ApplicationItem[] };
export type ApplicationResponse = Omit<components['schemas']['ApplicationResponse'], 'data'> & {
  data: ApplicationItem;
};

export type FollowUpStatus =
  | 'pending'
  | 'sent'
  | 'skipped'
  | 'scheduled'
  | 'completed'
  | 'snoozed'
  | 'cancelled';
export type FollowUpItem = Omit<components['schemas']['FollowUpData'], 'status'> & {
  status: FollowUpStatus;
};
export type FollowUpListResponse = Omit<
  components['schemas']['FollowUpListResponse'],
  'data'
> & { data: FollowUpItem[] };
export type FollowUpResponse = Omit<components['schemas']['FollowUpResponse'], 'data'> & {
  data: FollowUpItem;
};

export type ApplicationSessionItem = components['schemas']['SessionItemData'];
export type ApplicationSession = components['schemas']['SessionData'];
export type ApplicationSessionResponse = components['schemas']['SessionResponse'];
export type ApplicationSessionPreview = components['schemas']['PreviewData'];
export type ApplicationSessionPreviewItem = components['schemas']['PreviewItemData'];
export type ApplicationSessionPreviewResponse = components['schemas']['app__api__r5_application_factory__PreviewResponse'];
export type ApplicationSessionCreateRequest = components['schemas']['SessionCreateRequest'];
export type ApplicationSessionExecuteRequest = components['schemas']['SessionExecuteRequest'];
export type ApplicationSessionCreateInput = Pick<
  ApplicationSessionCreateRequest,
  'vacancy_ids'
> & Partial<Omit<ApplicationSessionCreateRequest, 'vacancy_ids'>>;
export type ApplicationSessionExecuteInput = Partial<ApplicationSessionExecuteRequest>;
export type ApplicationSessionCreateOptions = Pick<
  ApplicationSessionCreateRequest,
  'confirmation' | 'preview_receipts'
> & { policy: CompanionProviderPolicy };

export type AnalyticsSummary = components['schemas']['AnalyticsData'];
export type AnalyticsResponse = components['schemas']['AnalyticsResponse'];

export type MigrationSnapshotInfo = components['schemas']['SnapshotInfo'];
export type MigrationPreviewRequest = components['schemas']['MigrationRequest'];
export type MigrationPreviewData = components['schemas']['MigrationPreviewData'];
export type MigrationPreviewResponse = components['schemas']['MigrationPreviewResponse'];
export type MigrationImportRequest = components['schemas']['MigrationRequest'];
export type MigrationImportData = components['schemas']['MigrationImportData'];
export type MigrationImportResponse = components['schemas']['MigrationImportResponse'];
export type MigrationStatusData = components['schemas']['MigrationStatusData'];
export type MigrationStatusResponse = components['schemas']['MigrationStatusResponse'];

// ── Ops projection ─────────────────────────────────────────────────────────

export type OpsProjectionView = components['schemas']['OpsWorkItemMeta']['view'];
export type OpsAnalysisState = components['schemas']['OpsAnalysis']['state'];
export type OpsProjectionQuery = NonNullable<
  operations['ops_work_items_api_v1_ops_work_items_get']['parameters']['query']
>;
export type OpsVacancy = components['schemas']['OpsVacancy'];
export type OpsApplication = components['schemas']['OpsApplication'];
export type OpsAnalysis = components['schemas']['OpsAnalysis'];
export type OpsFollowUp = components['schemas']['OpsFollowUp'];
export type OpsProvenanceHit = components['schemas']['OpsProvenanceHit'];
export type OpsAvailability = components['schemas']['OpsAvailability'];
export type OpsWorkItem = components['schemas']['OpsWorkItem'];
export type OpsSummary = components['schemas']['OpsSummary'];
export type OpsWorkItemResponse = components['schemas']['OpsWorkItemResponse'];

// ── Operation request aliases used by OpsClient ────────────────────────────

export type HHSearchProfileCreateRequest = components['schemas']['HHSearchProfileInput'];
export type HHSearchProfileUpdateRequest = components['schemas']['HHSearchProfilePatch'];
export type VacancySyncRequest = components['schemas']['VacancySyncRequest'];
export type CreateApplicationRequest = Omit<
  components['schemas']['CreateApplicationRequest'],
  'status'
> & { status?: components['schemas']['CreateApplicationRequest']['status'] };
export type UpdateApplicationRequest = components['schemas']['UpdateApplicationRequest'];
export type UpdateFollowUpRequest = components['schemas']['UpdateFollowUpRequest'];
