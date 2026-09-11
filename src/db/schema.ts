/**
 * Dexie schema v7 — single source of truth for IndexedDB stores and indexes.
 *
 * Schema follows the master specification and the current Dexie migration
 * tests; the migration history below is executable authority.
 *
 * Changing this requires a new version() migration.
 *
 * v2 adds [source+sourceVacancyId] compound index on jobs for stable upsert.
 * v3 adds labsActions store for Labs control plane action log.
 * v4 adds hrTimeline store for HR communication timeline entries.
 * v5 adds visitMarks store for local vacancy visit tracking.
 * v6 adds syncOutbox, opsCache, and opsMeta stores for AOPS-05 migration cache
 *     and outbox.
 * v7 adds aiExecution and aiBudget stores for Fix 3 semantic single-flight and
 *     atomic provider-attempt coordination.
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

/** v7 adds local semantic single-flight and atomic AI attempt coordination. */
export const SCHEMA_V7 = {
  ...SCHEMA_V6,
  aiExecution:
    "&operationKey, providerPlanHash, operationKind, provider, model, state, createdAt",
  aiBudget:
    "&id, [scope+dayKey], operationKey, state, attemptNumber, createdAt",
} as const;

/** The oldest schema this release can open and migrate. */
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;

/**
 * Explicit migration coverage.  Keep this registry independent from the
 * schema object spread chain: adding a new Dexie version without adding a
 * coverage entry must fail the database constructor and its tests.
 *
 * All current transitions are schema-only.  Dexie still receives an explicit
 * upgrade callback for each transition in database.ts so future data
 * transforms have a visible place to be added.
 */
export const DEXIE_MIGRATION_COVERAGE = [
  { fromVersion: 0, toVersion: 1, kind: "initial" },
  { fromVersion: 1, toVersion: 2, kind: "schema-only" },
  { fromVersion: 2, toVersion: 3, kind: "schema-only" },
  { fromVersion: 3, toVersion: 4, kind: "schema-only" },
  { fromVersion: 4, toVersion: 5, kind: "schema-only" },
  { fromVersion: 5, toVersion: 6, kind: "schema-only" },
  { fromVersion: 6, toVersion: 7, kind: "schema-only" },
] as const;

export type DexieMigrationCoverageEntry = {
  fromVersion: number;
  toVersion: number;
  kind: "initial" | "schema-only";
};

/** Validate that every supported schema transition has an explicit entry. */
export function assertDexieMigrationCoverage(
  currentVersion: number,
  coverage: readonly DexieMigrationCoverageEntry[] = DEXIE_MIGRATION_COVERAGE,
): void {
  if (!Number.isInteger(currentVersion) || currentVersion < MIN_SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`Invalid current Dexie schema version: ${currentVersion}`);
  }

  const targets = new Set<number>();
  for (const entry of coverage) {
    if (targets.has(entry.toVersion)) {
      throw new Error(`Duplicate Dexie migration target: v${entry.toVersion}`);
    }
    targets.add(entry.toVersion);
    if (entry.toVersion !== entry.fromVersion + 1) {
      throw new Error(
        `Dexie migration coverage must be sequential: v${entry.fromVersion} -> v${entry.toVersion}`,
      );
    }
  }

  for (let version = MIN_SUPPORTED_SCHEMA_VERSION; version <= currentVersion; version += 1) {
    if (!targets.has(version)) {
      throw new Error(`Missing Dexie migration coverage for v${version}`);
    }
  }
}

/** Table names derived from the current schema version (v7). */
export type TableName = keyof typeof SCHEMA_V7;

export const TABLE_NAMES = Object.keys(SCHEMA_V7) as TableName[];

export const SCHEMA_VERSION = 7;
