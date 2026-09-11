/** Process-wide write barrier used by destructive local reset flows. */
let resetInProgress = false;
let resetEpoch = 0;
let activeWrites = 0;
let writeDrainWaiters: Array<() => void> = [];

export class ResetInProgressError extends Error {
  readonly code = "RESET_IN_PROGRESS";

  constructor() {
    super("VacancyPilot data reset is in progress");
    this.name = "ResetInProgressError";
  }
}

export function assertResetWritable(): void {
  if (resetInProgress) throw new ResetInProgressError();
}

export function beginReset(): number {
  if (resetInProgress) throw new ResetInProgressError();
  resetInProgress = true;
  resetEpoch += 1;
  return resetEpoch;
}

export function endReset(): void {
  resetInProgress = false;
}

export function isResetInProgress(): boolean {
  return resetInProgress;
}

export function getResetEpoch(): number {
  return resetEpoch;
}

/**
 * Track an async browser-owned write so a destructive reset can wait for it
 * to settle before clearing the authoritative stores. The increment happens
 * synchronously after the barrier check, so reset cannot interleave between
 * admission and registration of the write.
 */
export async function withWriteGuard<T>(work: () => Promise<T>): Promise<T> {
  assertResetWritable();
  activeWrites += 1;
  try {
    return await work();
  } finally {
    activeWrites -= 1;
    if (activeWrites === 0 && writeDrainWaiters.length > 0) {
      const waiters = writeDrainWaiters;
      writeDrainWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }
}

async function waitForWritesToDrain(): Promise<void> {
  if (activeWrites === 0) return;
  await new Promise<void>((resolve) => writeDrainWaiters.push(resolve));
}

export async function withResetGuard<T>(work: (epoch: number) => Promise<T>): Promise<T> {
  const epoch = beginReset();
  try {
    await waitForWritesToDrain();
    return await work(epoch);
  } finally {
    endReset();
  }
}
