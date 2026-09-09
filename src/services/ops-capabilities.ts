import type { CompanionStatus } from "@/adapters/companion/types";
import {
  detectCompanionStatus,
  type CompanionStatusResult,
} from "@/services/companion-service";
import {
  getOperatingMode,
  type OperatingModeSnapshot,
} from "@/services/operating-mode";

export type OpsCapability =
  | "full-v4"
  | "vacancy-hydration"
  | "search-profiles"
  | "ops-analytics"
  | "application-factory"
  | "ops-followups"
  | "guided-apply-mutation";

export interface OpsCapabilities {
  mode: OperatingModeSnapshot;
  companion: CompanionStatusResult;
  canUseFullV4: boolean;
  canHydrateVacancy: boolean;
  canUseSearchProfiles: boolean;
  canUseOpsAnalytics: boolean;
  canRunApplicationFactory: boolean;
  canUseOpsFollowups: boolean;
  canUseGuidedApplyMutation: boolean;
}

function isConnectedOps(
  mode: OperatingModeSnapshot,
  companion: CompanionStatus,
): boolean {
  return mode.effectiveMode === "ops" && companion === "connected";
}

/** Derive all feature gates from one mode/connectivity snapshot. */
export function deriveOpsCapabilities(
  mode: OperatingModeSnapshot,
  companion: CompanionStatusResult,
): OpsCapabilities {
  const connectedOps = isConnectedOps(mode, companion.status);
  return {
    mode,
    companion,
    canUseFullV4: connectedOps,
    canHydrateVacancy: connectedOps,
    canUseSearchProfiles: connectedOps,
    canUseOpsAnalytics: connectedOps,
    canRunApplicationFactory: connectedOps,
    canUseOpsFollowups: connectedOps,
    // Guided Apply may prepare local clipboard content in Standalone, but its
    // final local status/application mutation is intentionally not available
    // in Ops until the next migration-safe implementation phase.
    canUseGuidedApplyMutation: mode.effectiveMode === "standalone",
  };
}

/** Read the current mode and bounded companion status once for a surface. */
export async function getOpsCapabilities(
  options: { force?: boolean } = {},
): Promise<OpsCapabilities> {
  const mode = await getOperatingMode();
  const companion = await detectCompanionStatus(options);
  return deriveOpsCapabilities(mode, companion);
}

function capabilityLabel(capability: OpsCapability): string {
  switch (capability) {
    case "full-v4": return "Full V4";
    case "vacancy-hydration": return "full vacancy refresh";
    case "search-profiles": return "Search Profiles";
    case "ops-analytics": return "Ops analytics";
    case "application-factory": return "the application factory";
    case "ops-followups": return "Ops follow-ups";
    case "guided-apply-mutation": return "the Guided Apply local mutation";
  }
}

/** Explain a disabled capability without implying a hidden fallback. */
export function capabilityMessage(
  capability: OpsCapability,
  capabilities: OpsCapabilities,
): string {
  const label = capabilityLabel(capability);
  if (capability === "guided-apply-mutation" && capabilities.mode.effectiveMode === "ops") {
    return "Guided Apply local mutation is unavailable in Ops Mode until Fix 2. Confirm Applied in Standalone Mode after the native HH submission.";
  }
  if (capabilities.mode.effectiveMode !== "ops") {
    return `Enable Ops Mode and complete Companion migration to use ${label}.`;
  }
  switch (capabilities.companion.status) {
    case "unpaired":
      return `Pair the local Companion to use ${label}.`;
    case "incompatible-api":
      return `Update the local Companion before using ${label}.`;
    case "error":
      return `Resolve the local Companion connection before using ${label}.`;
    case "unavailable":
    default:
      return `Start the local Companion to use ${label}.`;
  }
}
