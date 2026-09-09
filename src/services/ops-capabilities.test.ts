import { describe, expect, it } from "vitest";
import { deriveOpsCapabilities, capabilityMessage } from "./ops-capabilities";

const mode = (effectiveMode: "standalone" | "ops", authorityMode = effectiveMode) => ({
  effectiveMode,
  requestedOpsMode: effectiveMode === "ops",
  authorityMode: authorityMode as "standalone" | "migration" | "ops",
});

describe("Ops capability matrix", () => {
  it("keeps local-safe Guided Apply available in Standalone and Ops actions off", () => {
    const capabilities = deriveOpsCapabilities(mode("standalone"), { status: "unavailable" });
    expect(capabilities.canUseGuidedApplyMutation).toBe(true);
    expect(capabilities.canUseFullV4).toBe(false);
    expect(capabilities.canRunApplicationFactory).toBe(false);
  });

  it("enables Ops capabilities only for connected committed Ops", () => {
    const capabilities = deriveOpsCapabilities(mode("ops"), { status: "connected" });
    expect(capabilities.canUseFullV4).toBe(true);
    expect(capabilities.canHydrateVacancy).toBe(true);
    expect(capabilities.canUseSearchProfiles).toBe(true);
    expect(capabilities.canUseOpsAnalytics).toBe(true);
    expect(capabilities.canRunApplicationFactory).toBe(true);
    expect(capabilities.canUseOpsFollowups).toBe(true);
    expect(capabilities.canUseGuidedApplyMutation).toBe(false);
  });

  it.each(["unavailable", "unpaired", "error", "incompatible-api"] as const)(
    "disables Ops actions for Companion status %s",
    (status) => {
      const capabilities = deriveOpsCapabilities(mode("ops"), { status });
      expect(capabilities.canUseFullV4).toBe(false);
      expect(capabilities.canUseOpsFollowups).toBe(false);
      expect(capabilityMessage("full-v4", capabilities)).toBeTruthy();
    },
  );

  it("does not hide a safe local mode because the companion is unavailable", () => {
    const capabilities = deriveOpsCapabilities(mode("standalone"), { status: "error" });
    expect(capabilities.canUseGuidedApplyMutation).toBe(true);
    expect(capabilityMessage("full-v4", capabilities)).toContain("Enable Ops Mode");
  });
});
