/**
 * Search quick actions — ITER-035.
 *
 * Service functions for local quick save/reject from search cards.
 * Runs in the background context (has access to Dexie) and is
 * called via chrome.runtime.sendMessage from the search content script.
 *
 * Rules:
 * - Quick actions affect only local data (Dexie + chrome.storage.local).
 * - No HH network requests, no form interaction, no DOM writes to HH.
 * - Existing jobs are never overwritten with sparse search-card data.
 */

import type { RawSearchItemDTO } from "@/adapters/types";
import type { RawVacancyDTO } from "@/adapters/hh/types";
import { jobRepo } from "@/db/repositories";
import { tracker } from "./tracker";
import { recomputeScoreForJob } from "./score-recompute";
import { persistBadgeState } from "./badge-state";
import {
  canonicalizeHhVacancyUrl,
  isCanonicalHhVacancyReference,
} from "./hh-vacancy-url";

const SOURCE_HH = "hh";

/** Validate the complete untrusted message payload before local mutation. */
export function isValidQuickActionCard(
  value: unknown,
): value is RawSearchItemDTO {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<RawSearchItemDTO>;
  if (
    typeof card.sourceId !== "string" ||
    !/^\d+$/.test(card.sourceId) ||
    !isCanonicalHhVacancyReference(card.sourceId, card.url)
  ) {
    return false;
  }
  return (
    (card.title === null || typeof card.title === "string") &&
    (card.companyName === null || typeof card.companyName === "string") &&
    (card.salaryRaw === null || typeof card.salaryRaw === "string") &&
    (card.city === null || typeof card.city === "string") &&
    (card.experienceRaw === null || typeof card.experienceRaw === "string") &&
    (card.publicationDate === null || typeof card.publicationDate === "string") &&
    (card.workMode === null ||
      card.workMode === "remote" ||
      card.workMode === "hybrid" ||
      card.workMode === "office" ||
      card.workMode === "unknown")
  );
}

// ── Conversion helper ──────────────────────────────────────────────────────

/**
 * Build a minimal RawVacancyDTO from search-card data.
 * Fields not available on search cards are null.
 */
function searchCardToVacancyDTO(card: RawSearchItemDTO): RawVacancyDTO {
  const sourceUrl = canonicalizeHhVacancyUrl(card.url);
  if (!sourceUrl) {
    throw new Error("Search card URL is not a canonical HH vacancy URL");
  }
  return {
    sourceVacancyId: card.sourceId,
    sourceUrl,
    title: card.title,
    companyName: card.companyName,
    salaryRaw: card.salaryRaw,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    city: card.city,
    workMode: card.workMode,
    experienceRaw: card.experienceRaw,
    employmentType: null,
    schedule: null,
    descriptionHtml: null,
    descriptionText: null,
    skills: null,
    sourceCompanyId: null,
    extractedAt: new Date().toISOString(),
    selectorVersion: "search-quick-save-v1",
    warnings: [],
  };
}

// ── Result shape ───────────────────────────────────────────────────────────

export interface QuickActionResult {
  jobId: string;
  status: string;
  score?: number;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Quick-save a vacancy from a search card.
 *
 * - If the job already exists in Dexie, does NOT overwrite it —
 *   only refreshes the badge state.
 * - If new, creates a minimal Job entry from the visible card data,
 *   then recomputes the score and persists badge state.
 */
export async function quickSaveSearchCard(
  card: RawSearchItemDTO,
): Promise<QuickActionResult> {
  if (!isValidQuickActionCard(card)) {
    throw new Error("Invalid canonical HH search card");
  }
  const existing = await jobRepo.findBySourceVacancy(SOURCE_HH, card.sourceId);

  if (existing) {
    // Already tracked — ensure badge state is correct, don't overwrite.
    await persistBadgeState(card.sourceId, {
      score: existing.ruleScore?.total,
      status: existing.status,
    });
    return {
      jobId: existing.id,
      status: existing.status,
      score: existing.ruleScore?.total,
    };
  }

  // Create a new minimal job from search-card data.
  const dto = searchCardToVacancyDTO(card);
  const job = await tracker.saveFromDTO(dto);

  // Recompute score and persist badge.
  const scored = await recomputeScoreForJob(job.id);

  // Always persist badge state — even if profile is missing and score
  // couldn't be computed (recomputeScoreForJob returns early without
  // calling persistBadgeState when no profile is available).
  await persistBadgeState(card.sourceId, {
    score: scored?.ruleScore?.total,
    status: scored?.status ?? job.status,
  });

  return {
    jobId: job.id,
    status: scored?.status ?? job.status,
    score: scored?.ruleScore?.total,
  };
}

/**
 * Quick-reject a vacancy from a search card.
 *
 * - If the job already exists, transitions its status to rejected_by_me.
 * - If new, creates a minimal Job entry and immediately rejects it.
 * - Persists badge state with the rejected status.
 */
export async function quickRejectSearchCard(
  card: RawSearchItemDTO,
): Promise<QuickActionResult> {
  if (!isValidQuickActionCard(card)) {
    throw new Error("Invalid canonical HH search card");
  }
  const existing = await jobRepo.findBySourceVacancy(SOURCE_HH, card.sourceId);

  if (existing) {
    if (existing.status === "rejected_by_me") {
      // Already rejected — just ensure badge state is correct.
      await persistBadgeState(card.sourceId, {
        score: existing.ruleScore?.total,
        status: "rejected_by_me",
      });
      return {
        jobId: existing.id,
        status: "rejected_by_me",
        score: existing.ruleScore?.total,
      };
    }

    const updated = await tracker.updateStatus(
      existing.id,
      "rejected_by_me",
      "Rejected from search results",
    );

    if (updated) {
      await persistBadgeState(card.sourceId, {
        score: updated.ruleScore?.total,
        status: "rejected_by_me",
      });
      return {
        jobId: updated.id,
        status: "rejected_by_me",
        score: updated.ruleScore?.total,
      };
    }
  }

  // Create a new rejected job from search-card data.
  const dto = searchCardToVacancyDTO(card);
  const job = await tracker.saveFromDTO(dto);

  const updated = await tracker.updateStatus(
    job.id,
    "rejected_by_me",
    "Rejected from search results",
  );

  if (updated) {
    await persistBadgeState(card.sourceId, {
      score: updated.ruleScore?.total,
      status: "rejected_by_me",
    });
  }

  return {
    jobId: updated?.id ?? job.id,
    status: "rejected_by_me",
    score: updated?.ruleScore?.total,
  };
}
