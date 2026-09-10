import { describe, expect, it } from "vitest";
import {
  assertResetWritable,
  isResetInProgress,
  withResetGuard,
  withWriteGuard,
} from "./reset-guard";

describe("reset write barrier", () => {
  it("waits for an admitted write before entering destructive work", async () => {
    let releaseWrite!: () => void;
    let resetWorkStarted = false;
    const writeFinished = withWriteGuard(
      () =>
        new Promise<void>((resolve) => {
          releaseWrite = resolve;
        }),
    );

    const resetWork = withResetGuard(async () => {
      resetWorkStarted = true;
    });

    await Promise.resolve();
    expect(isResetInProgress()).toBe(true);
    expect(resetWorkStarted).toBe(false);
    expect(() => assertResetWritable()).toThrow("reset is in progress");

    releaseWrite();
    await Promise.all([writeFinished, resetWork]);
    expect(resetWorkStarted).toBe(true);
    expect(isResetInProgress()).toBe(false);
  });
});
