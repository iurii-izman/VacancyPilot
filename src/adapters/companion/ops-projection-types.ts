/**
 * Authoritative Ops projection contracts.
 *
 * These are transport/view types, not standalone Dexie domain models.  They
 * are generated from the Ops work-items operation and its component schemas.
 */

export type {
  OpsProjectionView,
  OpsAnalysisState,
  OpsProjectionQuery,
  OpsVacancy,
  OpsApplication,
  OpsAnalysis,
  OpsFollowUp,
  OpsProvenanceHit,
  OpsAvailability,
  OpsWorkItem,
  OpsSummary,
  OpsWorkItemResponse,
} from './wire-types';
