/**
 * Companion API contracts used by the extension.
 *
 * Wire shapes are re-exported from the generated OpenAPI adapter map.  The
 * only hand-written types here are client-derived status values and the
 * compatibility helper; they are not duplicate server schemas.
 */

export type {
  CompanionErrorData,
  CompanionErrorResponse,
  HealthData,
  HealthMeta,
  HealthResponse,
  PairStartData,
  PairStartResponse,
  PairRecoveryStartResponse,
  PairConfirmRequest,
  PairConfirmData,
  PairConfirmResponse,
  PairStatusResponse,
  PairRevokeData,
  PairRevokeResponse,
  HHStatusResponse,
  HHSearchProfile,
  HHSearchProfilesResponse,
  HHSearchProfileResponse,
  HHSearchPreviewResponse,
  HHVacancySyncResponse,
} from './wire-types';

/** Minimal API version info the extension derives from the generated health response. */
export interface CompanionVersionInfo {
  service_version: string;
  api_version: string;
  compatible: boolean;
}

/** The companion currently exposes an integer API generation. */
export const EXPECTED_API_VERSION = '1';

export function isCompatibleApiVersion(companionVersion: string): boolean {
  const expectedGeneration = EXPECTED_API_VERSION.split('.')[0];
  const actualGeneration = companionVersion.trim().split('.')[0];
  return actualGeneration.length > 0 && actualGeneration === expectedGeneration;
}

/** Connection states derived locally from transport and pairing state. */
export type CompanionStatus =
  | 'unavailable'
  | 'unpaired'
  | 'pairing'
  | 'connected'
  | 'incompatible-api'
  | 'error';
