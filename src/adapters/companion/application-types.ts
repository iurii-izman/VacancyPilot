export type ApplicationStatus =
  | 'new' | 'saved' | 'analyzed' | 'ready_to_send' | 'applied' | 'hr_replied'
  | 'interview' | 'test_task' | 'offer' | 'rejected_by_company'
  | 'rejected_by_me' | 'archived';

export interface ApplicationItem {
  id: string;
  vacancy_id: string;
  vacancy_title: string | null;
  company_name: string | null;
  status: ApplicationStatus;
  decision: string | null;
  score: number | null;
  confidence: number | null;
  applied_at: string | null;
  next_action_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface ApplicationListResponse {
  data: ApplicationItem[];
  meta: { request_id: string; total: number; limit: number; offset: number };
}

export interface ApplicationResponse { data: ApplicationItem; meta: Record<string, string>; }

export interface FollowUpItem {
  id: string;
  application_id: string;
  reason: string | null;
  due_at: string | null;
  status: 'pending' | 'sent' | 'skipped' | 'scheduled' | 'completed' | 'snoozed' | 'cancelled';
  derived_state: string;
  draft_text: string | null;
  sent_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface FollowUpListResponse {
  data: FollowUpItem[];
  meta: { request_id: string; total: number; limit: number; offset: number };
}

export interface FollowUpResponse { data: FollowUpItem; meta: Record<string, string>; }

export interface ApplicationSessionItem {
  id: string; vacancy_id: string; title: string; company_name: string | null;
  queue_state: string; position: number; analysis_run_id: string | null;
  application_id: string | null; error_message: string | null;
}
export interface ApplicationSession {
  id: string; status: string; started_at: string; completed_at: string | null;
  items: ApplicationSessionItem[];
}
export interface ApplicationSessionResponse { data: ApplicationSession; meta: Record<string, unknown>; }
export interface ApplicationSessionPreview {
  session_id: string | null; selected: number; already_stage_a: number;
  cached_v4: number; need_full_v4: number; valid_letters: number;
  likely_letter_work: number; archived_or_ineligible: number;
  expected_provider_calls: number; cost_estimate_available: boolean; message: string;
}
export interface ApplicationSessionPreviewResponse { data: ApplicationSessionPreview; meta: Record<string, unknown>; }

export interface AnalyticsSummary {
  state: 'NO_DATA' | 'SMALL_SAMPLE' | 'SUFFICIENT_FOR_DESCRIPTIVE_VIEW';
  applications_applied: number; responses: number; response_rate: number | null;
  interviews: number; interview_rate: number | null; offers: number; pending: number;
  median_response_hours: number | null; response_time_sample: number;
  sessions: number; completed_items: number; session_elapsed_hours: number | null;
  median_processing_minutes: number | null; v4_input_tokens: number; v4_output_tokens: number;
  estimated_cost_usd: number | null; estimated_cost_per_applied_usd: number | null;
  cached_run_count: number | null;
}
export interface AnalyticsResponse { data: AnalyticsSummary; meta: Record<string, unknown>; }
