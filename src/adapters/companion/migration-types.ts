// ── Companion status (client-side derived) ──

// … existing types above …

// ── Migration (AOPS-05) ─────────────────────────────────────────────────────

export interface MigrationSnapshotInfo {
  captured_at: string;
  counts: Record<string, number>;
  snapshot_hash: string;
}

export interface MigrationPreviewRequest {
  export_version: 2;
  snapshot: MigrationSnapshotInfo;
  export_data: Record<string, unknown[]>;
}

export interface MigrationPreviewData {
  /** Estimated number of entities to insert. */
  inserts: number;
  /** Estimated number of entities to update. */
  updates: number;
  /** Number of entities unchanged (already present with same data). */
  unchanged: number;
  /** Number of entities with conflicts requiring user resolution. */
  conflicts: number;
  /** Conflict details grouped by entity type. */
  conflict_details?: Array<{
    entity_type: string;
    entity_id: string;
    reason: string;
  }>;
  /** Total entities in the snapshot. */
  total: number;
  /** Records retained verbatim in the recovery backup rather than projected yet. */
  retained_in_backup: number;
  /** Whether any conflicts block the import. */
  has_blocking_conflicts: boolean;
}

export interface MigrationPreviewResponse {
  data: MigrationPreviewData;
  meta: Record<string, string>;
}

export interface MigrationImportRequest {
  export_version: 2;
  snapshot: MigrationSnapshotInfo;
  export_data: Record<string, unknown[]>;
}

export interface MigrationImportData {
  /** Final status of the import. */
  status: "committed" | "rolled_back";
  /** Number of entities inserted. */
  inserts: number;
  /** Number of entities updated. */
  updates: number;
  /** Number of entities skipped (unchanged). */
  unchanged: number;
  /** Number of conflicts that remain unresolved. */
  conflicts: number;
  retained_in_backup: number;
  /** Opaque checkpoint token for idempotency. */
  checkpoint?: string;
  /** Human-readable summary of the import. */
  summary?: string;
  /** Per-entity-type breakdown of the import. */
  breakdown?: Array<{
    entity_type: string;
    inserts: number;
    updates: number;
    unchanged: number;
    conflicts: number;
  }>;
}

export interface MigrationImportResponse {
  data: MigrationImportData;
  meta: Record<string, string>;
}

export interface MigrationStatusData {
  mode: string;
  imported: boolean;
  last_import_at: string | null;
  last_import_checkpoint: string | null;
  outbox_depth: number;
  blocked_outbox: number;
}

export interface MigrationStatusResponse {
  data: MigrationStatusData;
  meta: Record<string, string>;
}
