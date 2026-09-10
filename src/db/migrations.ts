import { db } from "./database";
import {
  SCHEMA_VERSION,
  DEXIE_MIGRATION_COVERAGE,
  assertDexieMigrationCoverage,
} from "./schema";
import { withWriteGuard } from "@/services/reset-guard";

/**
 * Migration infrastructure.
 *
 * Rules (from master spec section 10.15):
 * - Every data model change requires db.version(n).upgrade(...)
 * - Migrations must NOT delete user data without explicit backup/export
 * - Before destructive migration, warn and offer JSON export
 * - Schema version is stored in meta table
 * - Migration tests are required for v1 → latest transitions
 */

const META_KEY_VERSION = "schemaVersion";

/** Current schema version as defined in schema.ts */
export const CURRENT_VERSION = SCHEMA_VERSION;

// Fail closed if a schema version is added without a corresponding explicit
// migration-coverage entry. The database constructor performs the same guard
// before registering Dexie versions; keeping it here protects bookkeeping
// imports and test doubles as well.
assertDexieMigrationCoverage(CURRENT_VERSION, DEXIE_MIGRATION_COVERAGE);

let migrationBootstrapPromise: Promise<void> | null = null;

/**
 * Read the stored schema version from the meta table.
 * Returns 0 if no version has been written yet.
 */
export async function getStoredVersion(): Promise<number> {
  const row = await db.meta.get(META_KEY_VERSION);
  return row ? (row.value as number) : 0;
}

/**
 * Write the current schema version to the meta table.
 * Call this after successful migration to record the version.
 */
export async function writeCurrentVersion(): Promise<void> {
  await withWriteGuard(() =>
    db.meta.put({ key: META_KEY_VERSION, value: CURRENT_VERSION }),
  );
}

/**
 * Run any pending migrations.
 * For v1 this is a no-op (initial schema is created by version(1).stores()).
 * Future iterations will add version(n).upgrade() calls here.
 */
export async function runMigrations(): Promise<void> {
  const stored = await getStoredVersion();

  if (stored < CURRENT_VERSION) {
    // Future migrations go here:
    // if (stored < 2) { ... }
    await writeCurrentVersion();
  }
}

/**
 * Ensure migration bookkeeping has been executed for the current extension
 * surface. Safe to call from multiple entrypoints; work is memoized.
 */
export function ensureMigrationsBootstrapped(): Promise<void> {
  if (!migrationBootstrapPromise) {
    migrationBootstrapPromise = (async () => {
      await runMigrations();
    })().catch((error) => {
      migrationBootstrapPromise = null;
      throw error;
    });
  }

  return migrationBootstrapPromise;
}
