/**
 * AI budget preview and enforcement — token/cost estimation and daily request limit.
 *
 * Section 12.9:
 * - Show provider, model, approximate input size, and cost before every AI call.
 * - If cost cannot be computed, the UI must say so clearly.
 * - Daily request budget must be enforceable without silent bypass.
 *
 * Non-goals (from ITER-061):
 * - No server metering, no billing integration, no speculative pricing service.
 * - No new provider architecture.
 *
 * Fix 3 adds a Dexie coordination ledger for semantic execution and actual
 * outbound-attempt accounting; legacy EventLog rows remain counted for
 * backward-compatible budget totals.
 */

import { db, type AIBudgetReservation, type AIExecutionCoordination } from "@/db/database";
import { loadSettings } from "@/db/settings-bridge";
import { createEventLogEntry } from "./event-log-helper";

// ── Token estimation ────────────────────────────────────────────────────

/** Rough token estimate from character count.
 *  ~4 chars per token for English, ~3 for Cyrillic; use 3.5 as a balanced avg. */
const CHARS_PER_TOKEN = 3.5;

export function estimateTokens(chars: number): number {
  return Math.max(1, Math.round(chars / CHARS_PER_TOKEN));
}

// ── Static pricing table ────────────────────────────────────────────────

export interface PricingEntry {
  /** USD per 1M input tokens. */
  inputPricePer1M: number;
  /** USD per 1M output tokens. */
  outputPricePer1M: number;
}

type ProviderId = string;
type ModelId = string;

/**
 * Static pricing for well-known provider/model pairs.
 * Prices are approximate and should be updated manually when providers change pricing.
 * Providers/models not listed here return "cost not available".
 *
 * Sources (approximate, as of mid-2025):
 * - OpenAI: https://openai.com/api/pricing/
 * - DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
 */
const PRICING: Record<ProviderId, Record<ModelId, PricingEntry>> = {
  openai: {
    "gpt-4o": { inputPricePer1M: 2.5, outputPricePer1M: 10.0 },
    "gpt-4o-mini": { inputPricePer1M: 0.15, outputPricePer1M: 0.6 },
    "gpt-4-turbo": { inputPricePer1M: 10.0, outputPricePer1M: 30.0 },
    "gpt-3.5-turbo": { inputPricePer1M: 0.5, outputPricePer1M: 1.5 },
  },
  deepseek: {
    "deepseek-chat": { inputPricePer1M: 0.27, outputPricePer1M: 1.1 },
    "deepseek-reasoner": { inputPricePer1M: 0.55, outputPricePer1M: 2.19 },
  },
  // openrouter has variable pricing per model; mark as unavailable
};

/**
 * Look up pricing for a given provider and model.
 * Returns null if pricing is not in the static table (cost unavailable).
 */
export function getPricing(
  provider: string,
  model: string,
): PricingEntry | null {
  const providerLower = provider.toLowerCase();
  const modelLower = model.toLowerCase();

  const providerTable = PRICING[providerLower];
  if (!providerTable) return null;

  // Exact match first, then case-insensitive key lookup
  if (providerTable[modelLower]) return providerTable[modelLower];

  for (const [key, entry] of Object.entries(providerTable)) {
    if (key.toLowerCase() === modelLower) return entry;
  }

  return null;
}

// ── Cost estimation ─────────────────────────────────────────────────────

export interface CostEstimate {
  inputTokens: number;
  /** Heuristic: estimated output tokens (~20% of input for analysis, ~50% for letter). */
  estimatedOutputTokens: number;
  inputCostUsd: number | null;
  outputCostUsd: number | null;
  totalCostUsd: number | null;
  /** True when pricing was found in the static table. */
  costAvailable: boolean;
  provider: string;
  model: string;
}

/**
 * Estimate cost for an AI request given input token count, provider, and model.
 *
 * Output token estimate is a heuristic fraction of input (configurable per analysis vs generation).
 * Returns null costs when provider/model pricing is not in the static table.
 */
export function estimateCost(
  inputTokens: number,
  provider: string,
  model: string,
  outputRatio = 0.2,
): CostEstimate {
  const pricing = getPricing(provider, model);
  const estimatedOutputTokens = Math.max(
    20,
    Math.round(inputTokens * outputRatio),
  );

  if (!pricing) {
    return {
      inputTokens,
      estimatedOutputTokens,
      inputCostUsd: null,
      outputCostUsd: null,
      totalCostUsd: null,
      costAvailable: false,
      provider,
      model,
    };
  }

  const inputCostUsd = (inputTokens / 1_000_000) * pricing.inputPricePer1M;
  const outputCostUsd =
    (estimatedOutputTokens / 1_000_000) * pricing.outputPricePer1M;

  return {
    inputTokens,
    estimatedOutputTokens,
    inputCostUsd: roundUsd(inputCostUsd),
    outputCostUsd: roundUsd(outputCostUsd),
    totalCostUsd: roundUsd(inputCostUsd + outputCostUsd),
    costAvailable: true,
    provider,
    model,
  };
}

function roundUsd(value: number): number {
  // Add a tiny epsilon to compensate for IEEE 754 floating-point errors
  // (e.g., 0.001 * 0.15 = 0.0001499... instead of 0.00015)
  return Math.round(value * 10_000 + 1e-9) / 10_000;
}

// ── Daily request budget ────────────────────────────────────────────────

export type AiRequestKind = "analysis" | "cover_letter";

export type ProviderExecutionKind = "vacancy_analysis" | "cover_letter";

export interface AiProviderAttemptReservation {
  reservationId: string;
  operationKey: string;
  operationKind: ProviderExecutionKind;
  provider: string;
  model: string;
  providerPlanHash: string;
  ownerToken: string;
  attemptNumber: number;
  dayKey: string;
}

export class AiExecutionError extends Error {
  constructor(
    public readonly code:
    | "AI_EXECUTION_IN_FLIGHT"
    | "AI_EXECUTION_ALREADY_COMPLETED"
    | "AI_EXECUTION_OUTCOME_UNKNOWN"
    | "AI_BUDGET_EXHAUSTED"
    | "AI_COORDINATION_UNAVAILABLE"
    | "AI_EXECUTION_OWNERSHIP_LOST",
    message: string,
  ) {
    super(message);
    this.name = "AiExecutionError";
  }
}

/** EventLog types that count toward the AI daily request budget. */
const AI_REQUEST_EVENT_TYPES: ReadonlySet<string> = new Set([
  "ai_analysis_requested",
  "letter_generated",
]);

export interface BudgetStatus {
  used: number;
  limit: number;
  remaining: number;
  isExhausted: boolean;
}

const FIX3_COORDINATION_VERSION = "fix3";

function currentDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function makeId(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

function hasCoordinationTables(): boolean {
  return Boolean(
    (db as unknown as { aiExecution?: unknown }).aiExecution &&
      (db as unknown as { aiBudget?: unknown }).aiBudget,
  );
}

function isCountedLegacyEvent(event: {
  type?: string;
  payloadPreview?: Record<string, unknown>;
}): boolean {
  return (
    typeof event.type === "string" &&
    AI_REQUEST_EVENT_TYPES.has(event.type) &&
    event.payloadPreview?.coordinationVersion !== FIX3_COORDINATION_VERSION
  );
}

async function countTodayAttempts(dayKey: string): Promise<number> {
  if (!hasCoordinationTables()) return 0;

  const ledgerRows = await db.aiBudget
    .where("[scope+dayKey]")
    .equals(["standalone", dayKey])
    .toArray();
  return ledgerRows.filter((row) => row.state === "consumed").length;
}

async function countLegacyTodayEvents(): Promise<number> {
  const todayStart = startOfTodayUTC();
  const todayEvents = await db.events
    .where("createdAt")
    .between(todayStart, new Date().toISOString(), true, true)
    .toArray();
  return todayEvents.filter(isCountedLegacyEvent).length;
}

/**
 * Atomically claim a semantic provider operation and reserve one real
 * outbound attempt.  The durable dispatching state is written in the same
 * Dexie transaction as the budget row, before the provider is called.
 */
export async function reserveAiProviderAttempt(params: {
  operationKey: string;
  operationKind: ProviderExecutionKind;
  provider: string;
  model: string;
  providerPlanHash: string;
  dailyRequestLimit: number;
}): Promise<AiProviderAttemptReservation> {
  if (!hasCoordinationTables()) {
    throw new AiExecutionError(
      "AI_COORDINATION_UNAVAILABLE",
      "AI execution coordination is unavailable; the provider call was not started.",
    );
  }

  const limit = Math.max(0, Math.floor(params.dailyRequestLimit));
  const dayKey = currentDayKey();
  const now = new Date().toISOString();
  const ownerToken = makeId("owner");

  return db.transaction(
    "rw",
    db.aiExecution,
    db.aiBudget,
    db.events,
    async () => {
      const existing = await db.aiExecution.get(params.operationKey);

      if (existing) {
        if (
          existing.providerPlanHash !== params.providerPlanHash ||
          existing.provider !== params.provider ||
          existing.model !== params.model ||
          existing.operationKind !== params.operationKind
        ) {
          throw new AiExecutionError(
            "AI_EXECUTION_OWNERSHIP_LOST",
            "The reviewed AI operation no longer matches its execution plan.",
          );
        }

        if (existing.state === "completed") {
          throw new AiExecutionError(
            "AI_EXECUTION_ALREADY_COMPLETED",
            "This reviewed AI operation has already completed.",
          );
        }
        if (existing.state === "outcome_unknown") {
          throw new AiExecutionError(
            "AI_EXECUTION_OUTCOME_UNKNOWN",
            "The previous provider outcome is unknown; automatic retry is disabled.",
          );
        }
        if (
          existing.state === "dispatching" ||
          existing.state === "repairing" ||
          existing.state === "claimed"
        ) {
          throw new AiExecutionError(
            "AI_EXECUTION_IN_FLIGHT",
            "This reviewed AI operation is already in flight.",
          );
        }
        if (existing.state === "failed") {
          throw new AiExecutionError(
            "AI_EXECUTION_ALREADY_COMPLETED",
            "This AI operation has reached a terminal failure; use an explicit retry operation.",
          );
        }
      }

      const used =
        (await countTodayAttempts(dayKey)) +
        (await countLegacyTodayEvents());
      if (used >= limit) {
        throw new AiExecutionError(
          "AI_BUDGET_EXHAUSTED",
          `Daily AI request limit (${limit}) reached. Try again tomorrow.`,
        );
      }

      const attemptNumber = (existing?.attemptCount ?? 0) + 1;
      const reservationId = makeId("attempt");
      const execution: AIExecutionCoordination = {
        operationKey: params.operationKey,
        operationKind: params.operationKind,
        provider: params.provider,
        model: params.model,
        providerPlanHash: params.providerPlanHash,
        state: "dispatching",
        ownerToken,
        attemptCount: attemptNumber,
        runId: existing?.runId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const reservation: AIBudgetReservation = {
        id: reservationId,
        operationKey: params.operationKey,
        scope: "standalone",
        dayKey,
        attemptNumber,
        state: "consumed",
        providerPlanHash: params.providerPlanHash,
        createdAt: now,
      };

      await db.aiExecution.put(execution);
      await db.aiBudget.put(reservation);

      return {
        reservationId,
        operationKey: params.operationKey,
        operationKind: params.operationKind,
        provider: params.provider,
        model: params.model,
        providerPlanHash: params.providerPlanHash,
        ownerToken,
        attemptNumber,
        dayKey,
      };
    },
  );
}

/** Release only a reservation for which no provider dispatch occurred. */
export async function releaseAiAttemptBeforeDispatch(
  reservation: AiProviderAttemptReservation,
): Promise<void> {
  if (!hasCoordinationTables()) return;
  const now = new Date().toISOString();
  await db.transaction("rw", db.aiExecution, db.aiBudget, async () => {
    const execution = await db.aiExecution.get(reservation.operationKey);
    const attempt = await db.aiBudget.get(reservation.reservationId);
    if (!execution || !attempt) return;
    if (
      execution.ownerToken !== reservation.ownerToken ||
      execution.state !== "dispatching"
    ) {
      throw new AiExecutionError(
        "AI_EXECUTION_OWNERSHIP_LOST",
        "AI execution ownership was lost before provider dispatch.",
      );
    }
    await db.aiBudget.put({ ...attempt, state: "released", releasedAt: now });
    await db.aiExecution.put({
      ...execution,
      state: "failed_before_dispatch",
      updatedAt: now,
    });
  });
}

/** Mark an accepted provider result as durably completed. */
export async function completeAiProviderExecution(
  reservation: AiProviderAttemptReservation,
  runId?: string,
): Promise<void> {
  if (!hasCoordinationTables()) return;
  await db.transaction("rw", db.aiExecution, db.aiBudget, async () => {
    const execution = await db.aiExecution.get(reservation.operationKey);
    const attempt = await db.aiBudget.get(reservation.reservationId);
    if (!execution || !attempt || execution.ownerToken !== reservation.ownerToken) {
      throw new AiExecutionError(
        "AI_EXECUTION_OWNERSHIP_LOST",
        "AI execution ownership was lost before completion.",
      );
    }
    await db.aiExecution.put({
      ...execution,
      state: "completed",
      runId: runId ?? execution.runId,
      updatedAt: new Date().toISOString(),
    });
  });
}

/** Preserve a consumed attempt when the provider result is not knowable. */
export async function markAiProviderOutcomeUnknown(
  reservation: AiProviderAttemptReservation,
): Promise<void> {
  if (!hasCoordinationTables()) return;
  await db.transaction("rw", db.aiExecution, db.aiBudget, async () => {
    const execution = await db.aiExecution.get(reservation.operationKey);
    const attempt = await db.aiBudget.get(reservation.reservationId);
    if (!execution || !attempt || execution.ownerToken !== reservation.ownerToken) {
      throw new AiExecutionError(
        "AI_EXECUTION_OWNERSHIP_LOST",
        "AI execution ownership was lost before recording the provider outcome.",
      );
    }
    await db.aiExecution.put({
      ...execution,
      state: "outcome_unknown",
      updatedAt: new Date().toISOString(),
    });
  });
}

/** Midnight UTC for the current calendar day, as ISO string. */
function startOfTodayUTC(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

/**
 * Get the current AI request budget status for today.
 * Counts both `ai_analysis_requested` and `letter_generated` events since midnight UTC.
 */
export async function getBudgetStatus(): Promise<BudgetStatus> {
  const settings = await loadSettings();
  const limit = settings.ai.dailyRequestLimit;
  const todayStart = startOfTodayUTC();

  // Dexie doesn't support "anyOf" combined with ".and()" in a single query,
  // so we filter in two steps: collect today's events, then count only AI types.
  const ledgerUsed = await countTodayAttempts(currentDayKey());
  const used =
    ledgerUsed +
    (hasCoordinationTables() ? await countLegacyTodayEvents() : await (async () => {
      const todayEvents = await db.events
        .where("createdAt")
        .between(todayStart, new Date().toISOString(), true, true)
        .toArray();
      return todayEvents.filter((e) => AI_REQUEST_EVENT_TYPES.has(e.type)).length;
    })());
  const remaining = Math.max(0, limit - used);

  return {
    used,
    limit,
    remaining,
    isExhausted: remaining <= 0,
  };
}

export interface BudgetGateResult extends BudgetStatus {
  allowed: boolean;
  reason?: string;
}

/**
 * Gate check before an AI request.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export async function checkAiBudget(): Promise<BudgetGateResult> {
  const settings = await loadSettings();

  if (!settings.privacy.aiEnabled) {
    return {
      allowed: false,
      reason: "AI is disabled in settings",
      used: 0,
      limit: settings.ai.dailyRequestLimit,
      remaining: 0,
      isExhausted: false,
    };
  }

  const status = await getBudgetStatus();

  if (status.isExhausted) {
    return {
      ...status,
      allowed: false,
      reason: `Daily AI request limit (${status.limit}) reached. Try again tomorrow.`,
    };
  }

  return { ...status, allowed: true };
}

/**
 * Map an AiRequestKind to the EventLog type used for budget tracking.
 * Exported for testing; callers normally use recordAiRequest().
 */
export function eventTypeForKind(
  kind: AiRequestKind,
): "ai_analysis_requested" | "letter_generated" {
  switch (kind) {
    case "analysis":
      return "ai_analysis_requested";
    case "cover_letter":
      return "letter_generated";
  }
}

/**
 * Record an AI request for budget tracking.
 * Creates an event in the EventLog with the appropriate type for the request kind.
 * Does NOT perform the Fix 3 provider-attempt reservation — callers must
 * reserve atomically before dispatch and use this only for legacy history.
 *
 * @param kind — "analysis" for vacancy analysis, "cover_letter" for cover letter generation
 * @param jobId — optional job ID to associate with the request
 */
export async function recordAiRequest(
  kind: AiRequestKind,
  jobId?: string,
): Promise<string> {
  const entry = createEventLogEntry(eventTypeForKind(kind), {
    jobId,
    coordinationVersion: FIX3_COORDINATION_VERSION,
    recordedAt: new Date().toISOString(),
  });
  await db.events.put(entry);
  return entry.id;
}
