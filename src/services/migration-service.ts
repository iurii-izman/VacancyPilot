/**
 * Migration service — AOPS-05.
 *
 * Orchestrates the Dexie-to-companion SQLite migration workflow:
 *
 * 1. Calculate local source snapshot and entity counts.
 * 2. Export a pre-migration JSON backup through existing safe export patterns.
 * 3. Call companion migration preview.
 * 4. Show inserts, updates, unchanged records and conflicts.
 * 5. Require explicit user confirmation.
 * 6. Perform idempotent import.
 * 7. Persist migration checkpoint/result.
 * 8. Switch to Ops authority only after successful commit.
 * 9. Retain the source backup and an understandable report.
 *
 * All paths keep Dexie canonical until step 8 succeeds.
 */

import type {
  MigrationPreviewRequest,
  MigrationPreviewResponse,
  MigrationImportRequest,
  MigrationImportResponse,
  MigrationStatusResponse,
} from "@/adapters/companion/migration-types";
import { OpsClient, CompanionError } from "@/adapters/companion/ops-client";
import { downloadJson, exportAllJson } from "@/services/export-data";
import type { ExportEnvelope } from "@/services/export-data";
import { db, TABLE_NAMES } from "@/db";
import type { TableName } from "@/db";
import { opsMetaRepo } from "@/db/ops-repository";
import { OPS_META_KEYS } from "@/models/ops";
import type { AuthorityMode } from "@/models/ops";

// ── Types ────────────────────────────────────────────────────────────────────

/** Lightweight snapshot of local Dexie state for a migration preview. */
export interface DexieSnapshot {
  /** ISO-8601 timestamp when the snapshot was captured. */
  capturedAt: string;
  /** Entity counts by table name. */
  counts: Record<string, number>;
  /** Hash fingerprint of the full export JSON. */
  snapshotHash: string;
  /** Exact sanitized backup used for preview and import. */
  backup: ExportEnvelope;
}

export interface MigrationPreview {
  /** The companion's structured preview response. */
  companionPreview: MigrationPreviewResponse["data"];
  /** Whether the user has confirmed this preview. */
  confirmed: boolean;
}

export interface MigrationResult {
  /** The companion's structured import response. */
  companionImport: MigrationImportResponse["data"];
  /** ISO-8601 timestamp when the import completed. */
  completedAt: string;
  /** Whether authority has been switched to Ops. */
  authoritySwitched: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute a simple djb2a-hash fingerprint of a string.
 * Not cryptographically secure — used only for snapshot identity comparison.
 */
async function hashFingerprint(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * Build a local snapshot with entity counts and a content fingerprint.
 *
 * Does NOT mutate any state. Call this first in the migration workflow.
 */
export async function captureDexieSnapshot(): Promise<DexieSnapshot> {
  const counts: Record<string, number> = {};
  const tableNames = TABLE_NAMES as readonly TableName[];

  for (const name of tableNames) {
    // Exclude the new AOPS-05 tables from the count snapshot so the preview
    // only reflects pre-existing Dexie data. The outbox/cache/meta tables
    // are empty at first connection anyway.
    if (name === "syncOutbox" || name === "opsCache" || name === "opsMeta") {
      counts[name] = 0;
      continue;
    }
    counts[name] = await db.table(name).count();
  }

  // Export full JSON for fingerprint
  const envelope = await exportAllJson();
  const stablePayload = JSON.stringify({ version: envelope.version, data: envelope.data, settings: envelope.settings });
  const snapshotHash = await hashFingerprint(stablePayload);

  return {
    capturedAt: new Date().toISOString(),
    counts,
    snapshotHash,
    backup: envelope,
  };
}

/**
 * Request a non-mutating migration preview from the companion.
 *
 * The companion compares the supplied snapshot counts against its SQLite state
 * and returns expected inserts, updates, unchanged records, and conflicts.
 *
 * Returns the parsed preview data or throws a ``CompanionError``.
 */
export async function requestMigrationPreview(
  client: OpsClient,
  snapshot: DexieSnapshot,
): Promise<MigrationPreviewResponse["data"]> {
  const body: MigrationPreviewRequest = {
    export_version: 2,
    snapshot: {
      captured_at: snapshot.capturedAt,
      counts: snapshot.counts,
      snapshot_hash: snapshot.snapshotHash,
    },
    export_data: snapshot.backup.data as MigrationPreviewRequest["export_data"],
  };

  const response = await client.authenticatedPost<MigrationPreviewResponse>(
    "/migration/preview",
    body,
  );
  return response.data;
}

/**
 * Request an idempotent migration import from the companion.
 *
 * The companion must return a checkpoint token on success.
 * Repeated calls with the same snapshot hash must produce no duplicates.
 *
 * Returns the parsed import data or throws a ``CompanionError``.
 */
export async function requestMigrationImport(
  client: OpsClient,
  snapshot: DexieSnapshot,
): Promise<MigrationImportResponse["data"]> {
  const body: MigrationImportRequest = {
    export_version: 2,
    snapshot: {
      captured_at: snapshot.capturedAt,
      counts: snapshot.counts,
      snapshot_hash: snapshot.snapshotHash,
    },
    export_data: snapshot.backup.data as MigrationImportRequest["export_data"],
  };

  const response = await client.authenticatedPost<MigrationImportResponse>(
    "/migration/import",
    body,
  );
  return response.data;
}

/**
 * Persist a successful migration checkpoint to opsMeta.
 *
 * After this call the extension records that a migration has been completed
 * but does NOT yet switch authority. Authority switching is a separate step.
 */
export async function saveMigrationCheckpoint(
  snapshot: DexieSnapshot,
  result: MigrationImportResponse["data"],
): Promise<void> {
  const now = new Date().toISOString();
  await opsMetaRepo.put({
    key: OPS_META_KEYS.LAST_MIGRATION_AT,
    value: now,
    updatedAt: now,
  });
  await opsMetaRepo.put({
    key: OPS_META_KEYS.LAST_MIGRATION_SNAPSHOT_HASH,
    value: snapshot.snapshotHash,
    updatedAt: now,
  });
  await opsMetaRepo.put({
    key: OPS_META_KEYS.LAST_MIGRATION_COUNTS,
    value: snapshot.counts,
    updatedAt: now,
  });
  if (result.checkpoint) {
    await opsMetaRepo.put({
      key: OPS_META_KEYS.LAST_MIGRATION_CHECKPOINT,
      value: result.checkpoint,
      updatedAt: now,
    });
  }
}

/**
 * Switch to Ops Mode authority.
 *
 * After this call SQLite is considered canonical. This must only be called
 * after a successful, complete migration import.
 */
export async function switchToOpsAuthority(): Promise<void> {
  await opsMetaRepo.setAuthorityMode("ops");
}

/**
 * Get the current migration status by querying the companion.
 *
 * Returns the companion's structured status or null if the companion is
 * unreachable.
 */
export async function getCompanionMigrationStatus(
  client: OpsClient,
): Promise<MigrationStatusResponse["data"] | null> {
  try {
    const response = await client.authenticatedGet<MigrationStatusResponse>(
      "/migration/status",
    );
    return response.data;
  } catch (err) {
    if (err instanceof CompanionError && err.code === "NETWORK_ERROR") {
      return null;
    }
    throw err;
  }
}

/**
 * Execute the full first-connection migration workflow.
 *
 * This is the high-level orchestrator. It:
 * 1. Captures a local snapshot.
 * 2. Requests a preview from the companion.
 * 3. Returns the preview for user review (caller must confirm).
 * 4. On confirmation, performs the idempotent import.
 * 5. Saves the checkpoint.
 * 6. Switches authority to Ops.
 *
 * Steps 1–3 are returned for UI presentation. Steps 4–6 happen on confirm.
 */
export async function executeMigrationWorkflow(
  client: OpsClient,
): Promise<{
  snapshot: DexieSnapshot;
  preview: MigrationPreviewResponse["data"];
}> {
  const snapshot = await captureDexieSnapshot();
  const preview = await requestMigrationPreview(client, snapshot);
  return { snapshot, preview };
}

/** Download the exact sanitized source backup used by preview/import. */
export function downloadMigrationBackup(snapshot: DexieSnapshot): void {
  downloadJson(snapshot.backup);
}

/**
 * Confirm the migration and execute the import.
 *
 * This is the irreversible step. After this call succeeds, authority
 * switches to Ops Mode.
 */
export async function confirmMigration(
  client: OpsClient,
  snapshot: DexieSnapshot,
  explicitlyConfirmed: boolean,
): Promise<MigrationResult> {
  if (!explicitlyConfirmed) {
    throw new Error('Migration import requires explicit user confirmation');
  }
  await opsMetaRepo.setAuthorityMode("migration");
  let importResult: MigrationImportResponse["data"];
  try {
    importResult = await requestMigrationImport(client, snapshot);
  } catch (error) {
    await opsMetaRepo.setAuthorityMode("standalone");
    throw error;
  }

  if (importResult.status === "committed") {
    // Persist checkpoint before switching authority so a crash after
    // successful import but before authority switch can be recovered.
    await saveMigrationCheckpoint(snapshot, importResult);
    await switchToOpsAuthority();
  } else {
    await opsMetaRepo.setAuthorityMode("standalone");
  }

  return {
    companionImport: importResult,
    completedAt: new Date().toISOString(),
    authoritySwitched: importResult.status === "committed",
  };
}

/**
 * Revert Ops Mode authority back to Standalone.
 *
 * This does NOT delete any companion data — it only tells the extension
 * to treat Dexie as canonical again. Used when the user wants to leave
 * Ops Mode without losing data.
 */
export async function revertToStandalone(): Promise<void> {
  await opsMetaRepo.setAuthorityMode("standalone");
}

/**
 * Get the current authority mode from opsMeta.
 */
export async function getAuthorityMode(): Promise<AuthorityMode> {
  return opsMetaRepo.getAuthorityMode();
}
