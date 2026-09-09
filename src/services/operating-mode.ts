import { opsMetaRepo } from "@/db/ops-repository";
import { loadSettings, saveSettings } from "@/db/settings-bridge";
import type { AuthorityMode } from "@/models/ops";
import type { AppSettings } from "@/models/settings";

/** The mode that feature code may use for authority and mutation decisions. */
export type EffectiveOperatingMode = "standalone" | "ops";

export interface OperatingModeSnapshot {
  /** Effective authority for feature decisions. */
  effectiveMode: EffectiveOperatingMode;
  /** User intent, persisted independently from migration authority. */
  requestedOpsMode: boolean;
  /** Low-level migration state, including the in-progress state. */
  authorityMode: AuthorityMode;
}

function effectiveModeFor(
  requestedOpsMode: boolean,
  authorityMode: AuthorityMode,
): EffectiveOperatingMode {
  return requestedOpsMode && authorityMode === "ops" ? "ops" : "standalone";
}

async function readMode(settings: AppSettings): Promise<OperatingModeSnapshot> {
  let authorityMode = await opsMetaRepo.getAuthorityMode();

  // A disabled Ops intent always wins. Normalize stale authority metadata so
  // no caller can accidentally continue an outbox or Dexie mutation after a
  // user turns Ops Mode off. This is a metadata repair, not a settings write.
  if (!settings.companion.opsModeEnabled && authorityMode !== "standalone") {
    await opsMetaRepo.setAuthorityMode("standalone");
    authorityMode = "standalone";
  }

  return {
    effectiveMode: effectiveModeFor(
      settings.companion.opsModeEnabled,
      authorityMode,
    ),
    requestedOpsMode: settings.companion.opsModeEnabled,
    authorityMode,
  };
}

/** Read the canonical effective operating mode and repair stale metadata. */
export async function getOperatingMode(): Promise<OperatingModeSnapshot> {
  return readMode(await loadSettings());
}

/** Run the startup reconciliation without creating a settings feedback loop. */
export async function reconcileOperatingMode(): Promise<OperatingModeSnapshot> {
  return getOperatingMode();
}

/** Persist user intent and make disabling Ops effective before any cleanup. */
export async function setOpsModeIntent(enabled: boolean): Promise<OperatingModeSnapshot> {
  const settings = await loadSettings();
  settings.companion.opsModeEnabled = enabled;

  // Save intent first when disabling, so action-time guards observe
  // Standalone even if metadata cleanup is interrupted.
  await saveSettings(settings);
  if (!enabled) {
    await opsMetaRepo.setAuthorityMode("standalone");
  }
  return readMode(settings);
}

/** Mark the bounded first-connection import as in progress. */
export async function beginOpsMigration(): Promise<void> {
  await opsMetaRepo.setAuthorityMode("migration");
}

/** Commit Ops authority only after the migration import and checkpoint succeed. */
export async function commitOpsAuthority(): Promise<void> {
  await opsMetaRepo.setAuthorityMode("ops");
}

/** Leave migration/authority state in safe Standalone mode. */
export async function returnToStandalone(): Promise<void> {
  await opsMetaRepo.setAuthorityMode("standalone");
}
