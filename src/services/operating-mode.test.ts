import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requestedOpsMode: false,
  authorityMode: "standalone" as "standalone" | "migration" | "ops",
  savedSettings: 0,
  authorityWrites: [] as string[],
}));

vi.mock("@/db/settings-bridge", () => ({
  loadSettings: vi.fn(async () => ({
    companion: { opsModeEnabled: state.requestedOpsMode },
  })),
  saveSettings: vi.fn(async (settings: { companion: { opsModeEnabled: boolean } }) => {
    state.requestedOpsMode = settings.companion.opsModeEnabled;
    state.savedSettings += 1;
  }),
}));

vi.mock("@/db/ops-repository", () => ({
  opsMetaRepo: {
    getAuthorityMode: vi.fn(async () => state.authorityMode),
    setAuthorityMode: vi.fn(async (mode: "standalone" | "migration" | "ops") => {
      state.authorityMode = mode;
      state.authorityWrites.push(mode);
    }),
  },
}));

const {
  beginOpsMigration,
  commitOpsAuthority,
  getOperatingMode,
  reconcileOperatingMode,
  returnToStandalone,
  setOpsModeIntent,
} = await import("./operating-mode");

beforeEach(() => {
  state.requestedOpsMode = false;
  state.authorityMode = "standalone";
  state.savedSettings = 0;
  state.authorityWrites.length = 0;
});

describe("operating mode", () => {
  it("normalizes stale Ops authority when the user intent is disabled", async () => {
    state.authorityMode = "ops";
    const mode = await reconcileOperatingMode();

    expect(mode).toEqual({
      effectiveMode: "standalone",
      requestedOpsMode: false,
      authorityMode: "standalone",
    });
    expect(state.authorityWrites).toEqual(["standalone"]);
    expect(state.savedSettings).toBe(0);
  });

  it("does not treat enabled intent as Ops authority before migration commit", async () => {
    state.requestedOpsMode = true;
    const mode = await getOperatingMode();
    expect(mode.effectiveMode).toBe("standalone");
    expect(mode.authorityMode).toBe("standalone");
  });

  it("derives Ops only from enabled intent plus committed authority", async () => {
    state.requestedOpsMode = true;
    state.authorityMode = "ops";
    expect((await getOperatingMode()).effectiveMode).toBe("ops");
  });

  it("disables intent before clearing authority", async () => {
    state.requestedOpsMode = true;
    state.authorityMode = "ops";
    await setOpsModeIntent(false);
    expect(state.savedSettings).toBe(1);
    expect(state.authorityWrites).toEqual(["standalone"]);
    expect((await getOperatingMode()).effectiveMode).toBe("standalone");
  });

  it("exposes only explicit migration transitions", async () => {
    await beginOpsMigration();
    await commitOpsAuthority();
    expect(state.authorityMode).toBe("ops");
    await returnToStandalone();
    expect(state.authorityMode).toBe("standalone");
  });
});
