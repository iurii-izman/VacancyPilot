/**
 * Companion API TypeScript contracts — AOPS-04.
 *
 * These hand-maintained client types are validated against the canonical
 * OpenAPI snapshot at ``shared/contracts/openapi.json`` as required by ADR-003.
 *
 * These types cover the v1 health, pairing, and error contracts.
 */

// ── Error envelope ─────────────────────────────────────────────────────────

export interface CompanionErrorData {
  code: string;
  message: string;
  request_id: string;
  details?: Record<string, unknown> | null;
}

export interface CompanionErrorResponse {
  error: CompanionErrorData;
}

// ── Health ─────────────────────────────────────────────────────────────────

export interface HealthData {
  status: string;
  service_version: string;
  api_version: string;
  db: string;
}

export interface HealthMeta {
  request_id: string;
}

export interface HealthResponse {
  data: HealthData;
  meta: HealthMeta;
}

// ── Capability / version handshake (derived from health + spec) ────────────

/** Minimal API version info the extension uses for compatibility checks. */
export interface CompanionVersionInfo {
  service_version: string;
  api_version: string;
  /** True when the companion's API version is compatible with this client. */
  compatible: boolean;
}

/** The client's expected API version. The companion advertises its own. */
export const EXPECTED_API_VERSION = '1';

/**
 * Compare the companion's reported API version against the expected version.
 * The companion currently exposes an integer API generation (``1``).
 * A future dotted version is compatible when its leading generation matches.
 */
export function isCompatibleApiVersion(
  companionVersion: string,
): boolean {
  const expectedGeneration = EXPECTED_API_VERSION.split('.')[0];
  const actualGeneration = companionVersion.trim().split('.')[0];
  return actualGeneration.length > 0 && actualGeneration === expectedGeneration;
}

// ── Pairing ────────────────────────────────────────────────────────────────

export interface PairStartData {
  challenge_id: string;
  expires_in_seconds?: number;
}

export interface PairStartResponse {
  data: PairStartData;
  meta: Record<string, string>;
}

export interface PairConfirmRequest {
  challenge_id: string;
  code: string;
}

export interface PairConfirmData {
  client_token: string;
  message?: string;
}

export interface PairConfirmResponse {
  data: PairConfirmData;
  meta: Record<string, string>;
}

export interface PairRevokeData {
  message?: string;
}

export interface PairRevokeResponse {
  data: PairRevokeData;
  meta: Record<string, string>;
}

export interface HHStatusResponse {
  data: {
    application_token_configured: boolean;
    public_api_available: boolean;
    user_oauth_connected: boolean;
    last_public_sync_at: string | null;
    last_error_code: string | null;
  };
  meta: Record<string, string>;
}

export interface HHSearchProfile {
  id: string;
  name: string;
  query: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface HHSearchProfilesResponse {
  data: HHSearchProfile[];
  meta: Record<string, unknown>;
}

export interface HHSearchProfileResponse {
  data: HHSearchProfile;
  meta: Record<string, string>;
}

export interface HHSearchPreviewResponse {
  data: {
    profile_id: string;
    name: string;
    found: number | null;
    classification: 'GOOD' | 'ACCEPTABLE' | 'TOO_BROAD' | 'ERROR';
    sync_allowed: boolean;
    error_code?: string;
  };
  meta: Record<string, string>;
}

export interface HHVacancySyncResponse {
  data: {
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
  };
  meta: Record<string, string>;
}

// ── Companion status (client-side derived) ─────────────────────────────────

/**
 * Companion connection states visible in the UI.
 *
 * - ``unavailable`` — companion is unreachable (offline, not installed, refused).
 * - ``unpaired`` — companion reachable but no stored client token.
 * - ``pairing`` — a pairing challenge is in progress.
 * - ``connected`` — companion reachable and client token valid.
 * - ``incompatible-api`` — companion API version incompatible with this client.
 * - ``error`` — companion returned an unexpected error.
 */
export type CompanionStatus =
  | 'unavailable'
  | 'unpaired'
  | 'pairing'
  | 'connected'
  | 'incompatible-api'
  | 'error';
