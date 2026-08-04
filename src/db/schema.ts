/**
 * Dexie schema v6 — single source of truth for IndexedDB stores and indexes.
 *
 * Schema follows the master spec section 10.15 and AOPS-05 (DATA_MODEL_V1.md
 * § Dexie schema extension).
 *
 * Changing this requires a new version() migration.
 *
 * v2 adds [source+sourceVacancyId] compound index on jobs for stable upsert.
 * v3 adds labsActions store for Labs control plane action log.
 * v4 adds hrTimeline store for HR communication timeline entries.
 * v5 adds visitMarks store for local vacancy visit tracking.
 * v6 adds syncOutbox, opsCache, and opsMeta stores for AOPS-05 migration cache
 *     and outbox.
 */

export const SCHEMA_V1 = {
  jobs: "&id, source, sourceVacancyId, companyId, status, selectedProfileId, firstSeenAt, updatedAt, descriptionHash",
  companies: "&id, sourceCompanyId, name, status, updatedAt",
  profiles: "&id, name, updatedAt",
  resumes: "&id, profileId, hhResumeId, updatedAt",
  coverLetters: "&id, jobId, profileId, resumeId, isFinal, updatedAt",
  applications: "&id, jobId, status, appliedAt, updatedAt",
  events: "&id, type, jobId, createdAt, sentToN8n, n8nStatus",
  aiCache: "&id, inputHash, kind, provider, model, promptVersion, createdAt",
  meta: "&key",
} as const;

/** v2 adds [source+sourceVacancyId] compound index on jobs. */
export const SCHEMA_V2 = {
  ...SCHEMA_V1,
  jobs: "&id, [source+sourceVacancyId], source, sourceVacancyId, companyId, status, selectedProfileId, firstSeenAt, updatedAt, descriptionHash",
} as const;

/** v3 adds labsActions store for Labs control plane action log. */
export const SCHEMA_V3 = {
  ...SCHEMA_V2,
  labsActions: "&id, type, jobId, createdAt",
} as const;

/** v4 adds hrTimeline store for HR communication timeline entries. */
export const SCHEMA_V4 = {
  ...SCHEMA_V3,
  hrTimeline: "&id, applicationId, type, extractedAt, updatedAt",
} as const;

/** v5 adds visitMarks store for local vacancy visit tracking. */
export const SCHEMA_V5 = {
  ...SCHEMA_V4,
  visitMarks:
    "&id, [source+sourceId], source, sourceType, sourceId, firstSeenAt, lastSeenAt, viewCount, updatedAt",
} as const;

/** v6 adds syncOutbox, opsCache, opsMeta stores for AOPS-05. */
export const SCHEMA_V6 = {
  ...SCHEMA_V5,
  syncOutbox:
    "&id, &sequence, entityType, operation, createdAt, retryCount, status, nextAttemptAt",
  opsCache: "&key, entityType, entityId, updatedAt, expiresAt",
  opsMeta: "&key",
} as const;

/** Table names derived from the current schema version (v6). */
export type TableName = keyof typeof SCHEMA_V6;

export const TABLE_NAMES = Object.keys(SCHEMA_V6) as TableName[];

export const SCHEMA_VERSION = 6;
