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
