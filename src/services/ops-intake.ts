/**
 * Ops vacancy intake service — AOPS-06.
 *
 * Wires the existing user-triggered vacancy save/analyze action to the
 * companion intake endpoint:
 *
 * - Builds a sanitized ``VacancyIntakeV1`` payload from a parsed
 *   ``RawVacancyDTO`` (user-visible fields only — never DOM blobs, cookies,
 *   session data, hidden API data, or contact secrets).
 * - Enqueues the intake through the outbox when Ops Mode is active, so
 *   offline captures retry idempotently on reconnect.
 * - Provides an ``OutboxTransport`` so the shared outbox drainer can deliver
 *   queued intake entries.
 * - Caches the intake result (and, when run, the triage result) in the local
 *   opsCache read-model for display in the side panel.
 *
 * The standalone score is untouched: saving to Dexie still happens first, and
 * this service only mirrors the save to Ops when the companion is reachable.
 */

import { OpsClient } from "@/adapters/companion/ops-client";
import type { VacancyIntakeV1, VacancyIntakeResponse, VacancyTriageData, VacancyTriageRequest, VacancyTriageResponse } from "@/adapters/companion/vacancy-types";
import { getOpsClient } from "@/services/companion-service";
import { outboxRepo, opsCacheRepo, opsMetaRepo } from "@/db/ops-repository";
import type { SyncOutboxEntry } from "@/models/ops";
import type { AuthorityMode } from "@/models/ops";
import type { RawVacancyDTO } from "@/adapters/hh/types";

// ── Constants ────────────────────────────────────────────────────────────────

export const INTAKE_PAYLOAD_VERSION = 1;
export const INTAKE_ENTITY_TYPE = "vacancy" as const;
const INTAKE_CACHE_PREFIX = "vacancy_intake";

export interface CachedVacancyIntake {
  result: string;
  revision: number;
  vacancy_id: string;
  triage?: VacancyTriageData;
}

// ── Payload builder ──────────────────────────────────────────────────────────

const WORK_MODE_MAP: Record<string, VacancyIntakeV1["work_mode"]> = {
  remote: "remote",
  hybrid: "hybrid",
  office: "office",
  "partly remote": "hybrid",
};

/**
 * Build a sanitized ``VacancyIntakeV1`` payload from a parsed vacancy DTO.
 *
 * Only normalized user-visible fields are included. The source URL is the
 * canonical public vacancy URL, never a DOM blob.
 */
export function buildIntakePayload(dto: RawVacancyDTO): VacancyIntakeV1 {
  const sourceVacancyId = (dto.sourceVacancyId ?? "").trim();
  const sourceUrl = dto.sourceUrl ?? "";

  return {
    schema_version: 1,
    source: "hh",
    source_vacancy_id: sourceVacancyId,
    url: sourceUrl || null,
    title: dto.title || null,
    company_id: dto.sourceCompanyId ?? null,
    company_name: dto.companyName ?? null,
    salary_min: dto.salaryMin ?? null,
    salary_max: dto.salaryMax ?? null,
    currency: dto.salaryCurrency ?? null,
    work_mode: WORK_MODE_MAP[dto.workMode ?? ""] ?? null,
    city: dto.city ?? null,
    experience: dto.experienceRaw ?? null,
    description: dto.descriptionText ?? null,
    skills: dto.skills ?? [],
    captured_at: dto.extractedAt ?? null,
    capture_source: dto.selectorVersion ? `extension:${dto.selectorVersion}` : "extension",
    parser_version: dto.selectorVersion ?? null,
  };
}

// ── Outbox transport ──────────────────────────────────────────────────────────

/**
 * Stable content discriminator for the outbox idempotency key.
 *
 * The companion performs the real change detection (its normalized SHA-256
 * content hash); this only needs to differ when the normalized payload
 * differs, so a content change gets a fresh key and thus a fresh snapshot
 * instead of being treated as a replay of the previous key.
 */
function contentKey(payload: VacancyIntakeV1): string {
  const basis = JSON.stringify([
    payload.source,
    payload.source_vacancy_id,
    payload.url,
    payload.title,
    payload.company_id,
    payload.company_name,
    payload.salary_min,
    payload.salary_max,
    payload.currency,
    payload.work_mode,
    payload.city,
    payload.experience,
    payload.description,
    payload.skills,
  ]);
  // djb2 → base-36. Non-cryptographic on purpose: this is a cache key
  // discriminator, not a digest, and matches hashString's style elsewhere.
  let hash = 5381;
  for (let i = 0; i < basis.length; i++) {
    hash = ((hash << 5) + hash + basis.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Deliver a single queued intake entry to the companion intake endpoint.
 *
 * Uses the entry's stable idempotency key so the companion deduplicates
 * retries after a network interruption.
 */
export async function deliverVacancyIntake(
  entry: SyncOutboxEntry,
): Promise<void> {
  const client = getOpsClient();
  const response = await client.authenticatedPost<VacancyIntakeResponse>(
    "/vacancies/intake",
    entry.payload,
    undefined,
    { idempotencyKey: entry.idempotencyKey },
  );

  const payload = entry.payload as VacancyIntakeV1;
  const cacheKey = payload.source_vacancy_id ?? "";
  await cacheIntakeResult(cacheKey, response.data);

  // Intake is already durable at this point. Triage is deliberately
  // best-effort so a transient triage/cache failure cannot cause the outbox
  // to replay an accepted intake forever. With no candidate profile yet, an
  // empty explicit config produces the safe explainable NEEDS_INPUT result.
  const triage = await fetchAndCacheTriage(response.data.vacancy_id, {});
  if (triage) {
    await cacheIntakeResult(cacheKey, response.data, triage).catch(() => {});
  }
}

/**
 * OutboxTransport adapter for the vacancy intake endpoint. Pass to
 * ``drainOutbox``/``flushOutboxOnReconnect`` to deliver queued intakes.
 */
export const vacancyIntakeTransport = {
  deliver: deliverVacancyIntake,
};

// ── Enqueue ──────────────────────────────────────────────────────────────────

/**
 * Queue a vacancy intake through the outbox when Ops Mode is active.
 *
 * Returns ``true`` when the intake was enqueued (Ops Mode active) or the
 * companion is unreachable but the capture was queued for later delivery.
 * Returns ``false`` when Ops Mode is disabled (standalone-only behavior).
 *
 * This never performs network I/O directly — offline captures are queued and
 * delivered by the outbox on reconnect.
 */
export async function enqueueVacancyIntake(dto: RawVacancyDTO): Promise<boolean> {
  const mode: AuthorityMode = await opsMetaRepo.getAuthorityMode();
  if (mode !== "ops") {
    return false;
  }

  const payload = buildIntakePayload(dto);
  const idempotencyKey = `intake:${payload.source}:${payload.source_vacancy_id}:${contentKey(payload)}`;

  await outboxRepo.enqueue({
    entityType: INTAKE_ENTITY_TYPE,
    operation: "upsert",
    payload,
    payloadVersion: INTAKE_PAYLOAD_VERSION,
    idempotencyKey,
    expectedRevision: null,
  });

  return true;
}

// ── Result cache ─────────────────────────────────────────────────────────────

/**
 * Cache an intake result in the opsCache read-model for side-panel display.
 */
export async function cacheIntakeResult(
  sourceVacancyId: string,
  data: { vacancy_id: string; revision: number; result: string; description_hash: string },
  triage?: VacancyTriageData,
): Promise<void> {
  await opsCacheRepo.put({
    key: `${INTAKE_CACHE_PREFIX}:${sourceVacancyId}`,
    entityType: INTAKE_ENTITY_TYPE,
    entityId: data.vacancy_id,
    payload: { ...data, ...(triage ? { triage } : {}) },
    revision: data.revision,
    updatedAt: new Date().toISOString(),
    expiresAt: null,
  });
}

/**
 * Read the last cached intake result for a vacancy, or null.
 */
export async function readCachedIntake(
  sourceVacancyId: string,
): Promise<CachedVacancyIntake | null> {
  const entry = await opsCacheRepo.get(`${INTAKE_CACHE_PREFIX}:${sourceVacancyId}`);
  if (!entry) return null;
  const payload = entry.payload as Partial<CachedVacancyIntake>;
  if (!payload?.result || typeof payload.revision !== "number" || !payload.vacancy_id) {
    return null;
  }
  return {
    result: payload.result,
    revision: payload.revision,
    vacancy_id: payload.vacancy_id,
    ...(payload.triage ? { triage: payload.triage } : {}),
  };
}

// ── Wire into save (best-effort) ─────────────────────────────────────────────

/**
 * Mirror a user-triggered vacancy save to Ops.
 *
 * - When Ops Mode is disabled → no-op (standalone behavior unchanged).
 * - When Ops Mode is active → queue through the outbox (offline-safe).
 *
 * Never throws; the standalone save already succeeded at the call site.
 */
export async function mirrorSaveToOps(dto: RawVacancyDTO): Promise<{
  enqueued: boolean;
  mode: AuthorityMode;
}> {
  try {
    const mode: AuthorityMode = await opsMetaRepo.getAuthorityMode();
    if (mode !== "ops") {
      return { enqueued: false, mode };
    }
    const enqueued = await enqueueVacancyIntake(dto);
    return { enqueued, mode };
  } catch {
    // Mirroring must never break the standalone save, even if the ops meta
    // read fails (e.g. DB closed). Report the safest default.
    return { enqueued: false, mode: "standalone" };
  }
}

/**
 * Run a companion triage for a vacancy id and cache the result.
 *
 * Best-effort: returns null when the companion is unreachable or not paired.
 */
export async function fetchAndCacheTriage(
  vacancyId: string,
  request: VacancyTriageRequest,
): Promise<VacancyTriageData | null> {
  const client: OpsClient = getOpsClient();
  if (!client.hasToken) return null;
  try {
    const response = await client.authenticatedPost<VacancyTriageResponse>(
      `/vacancies/${vacancyId}/triage`,
      request,
    );
    await opsCacheRepo.put({
      key: `vacancy_triage:${vacancyId}`,
      entityType: INTAKE_ENTITY_TYPE,
      entityId: vacancyId,
      payload: response.data,
      revision: response.data.revision,
      updatedAt: new Date().toISOString(),
      expiresAt: null,
    });
    return response.data;
  } catch {
    return null;
  }
}
