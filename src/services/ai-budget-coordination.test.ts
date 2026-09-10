// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/database";
import {
  AiExecutionError,
  completeAiProviderExecution,
  markAiProviderOutcomeUnknown,
  releaseAiAttemptBeforeDispatch,
  reserveAiProviderAttempt,
} from "./ai-budget";

const baseParams = {
  operationKind: "vacancy_analysis" as const,
  provider: "openai",
  model: "gpt-4o",
  providerPlanHash: "a".repeat(64),
  dailyRequestLimit: 10,
};

beforeEach(async () => {
  await db.aiExecution.clear();
  await db.aiBudget.clear();
  await db.events.clear();
});

describe("standalone provider-attempt coordination", () => {
  it("single-flights concurrent identical operations", async () => {
    const params = { ...baseParams, operationKey: "same-operation" };
    const results = await Promise.allSettled([
      reserveAiProviderAttempt(params),
      reserveAiProviderAttempt(params),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
      code: "AI_EXECUTION_IN_FLIGHT",
    });
    expect(await db.aiBudget.where("state").equals("consumed").count()).toBe(1);
  });

  it("does not dispatch an already completed or unknown operation", async () => {
    const reservation = await reserveAiProviderAttempt({
      ...baseParams,
      operationKey: "completed-operation",
    });
    await completeAiProviderExecution(reservation);
    await expect(
      reserveAiProviderAttempt({
        ...baseParams,
        operationKey: "completed-operation",
      }),
    ).rejects.toMatchObject({ code: "AI_EXECUTION_ALREADY_COMPLETED" });

    const unknown = await reserveAiProviderAttempt({
      ...baseParams,
      operationKey: "unknown-operation",
    });
    await markAiProviderOutcomeUnknown(unknown);
    await expect(
      reserveAiProviderAttempt({
        ...baseParams,
        operationKey: "unknown-operation",
      }),
    ).rejects.toMatchObject({ code: "AI_EXECUTION_OUTCOME_UNKNOWN" });
  });

  it("enforces the current limit atomically and releases a pre-dispatch failure", async () => {
    const reservation = await reserveAiProviderAttempt({
      ...baseParams,
      operationKey: "pre-dispatch-operation",
      dailyRequestLimit: 1,
    });
    await releaseAiAttemptBeforeDispatch(reservation);

    const retry = await reserveAiProviderAttempt({
      ...baseParams,
      operationKey: "pre-dispatch-operation",
      dailyRequestLimit: 1,
    });
    expect(retry.attemptNumber).toBe(2);

    await expect(
      reserveAiProviderAttempt({
        ...baseParams,
        operationKey: "different-operation",
        dailyRequestLimit: 1,
      }),
    ).rejects.toMatchObject({ code: "AI_BUDGET_EXHAUSTED" });
    expect(await db.aiBudget.where("state").equals("consumed").count()).toBe(1);
  });

  it("preserves typed coordination errors", async () => {
    await expect(
      reserveAiProviderAttempt({
        ...baseParams,
        operationKey: "zero-limit",
        dailyRequestLimit: 0,
      }),
    ).rejects.toBeInstanceOf(AiExecutionError);
  });
});
