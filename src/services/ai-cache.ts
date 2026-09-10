/**
 * AI request cache — prevents unnecessary repeated AI calls.
 *
 * Section 12.8:
 * - Compute inputHash before analysis
 * - Cache hit -> return stored result with "regenerate" option
 * - Status changes don't invalidate AI analysis
 * - Description/profile/resume/prompt-version/provider/model/privacy-mode changes invalidate cache
 * - Cache can be disabled in settings
 */

import type {
  AIAnalysis,
  AIRequestCache,
  VacancyAnalysisInput,
  CoverLetterInput,
} from "@/models/ai";
import { db } from "@/db/database";
import {
  computeAnalysisInputHash,
  computeCoverLetterInputHash,
} from "./ai-hash";

export type CacheKind = "vacancy_analysis" | "cover_letter";

export interface CacheCheckResult<T> {
  hit: boolean;
  value: T | null;
  entry: AIRequestCache | null;
  inputHash: string;
}

export interface AnalysisCacheCheckResult
  extends CacheCheckResult<AIAnalysis> {
  analysis: AIAnalysis | null;
}

export interface CoverLetterCacheCheckResult
  extends CacheCheckResult<string> {
  letter: string | null;
}

export interface CacheStoreBaseParams {
  inputHash: string;
  kind: CacheKind;
  provider: string;
  model: string;
  promptVersion: string;
  providerPlanHash?: string;
}

export interface CacheStoreParams extends CacheStoreBaseParams {
  analysis: AIAnalysis;
}

export interface CoverLetterCacheStoreParams extends CacheStoreBaseParams {
  letter: string;
}

const CACHE_ID_PREFIX = "aicache_";
const ANALYSIS_META_PREFIX = "ai_analysis_";
const LETTER_META_PREFIX = "ai_cover_letter_";

function buildCacheId(): string {
  return `${CACHE_ID_PREFIX}${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function analysisMetaKey(id: string): string {
  return `${ANALYSIS_META_PREFIX}${id}`;
}

function coverLetterMetaKey(id: string): string {
  return `${LETTER_META_PREFIX}${id}`;
}

export async function checkAnalysisCache(
  input: VacancyAnalysisInput,
  provider: string,
  model: string,
  promptVersion: string,
  cacheEnabled: boolean,
  providerPlanHash?: string,
): Promise<AnalysisCacheCheckResult> {
  const inputHash = computeAnalysisInputHash(input);

  if (!cacheEnabled) {
    return {
      hit: false,
      value: null,
      analysis: null,
      entry: null,
      inputHash,
    };
  }

  const result = await checkCacheEntry<AIAnalysis>(
    inputHash,
    "vacancy_analysis",
    provider,
    model,
    promptVersion,
    providerPlanHash,
    getCachedAnalysisByMetaKey,
  );

  return {
    ...result,
    analysis: result.value,
  };
}

export async function checkCoverLetterCache(
  input: CoverLetterInput,
  provider: string,
  model: string,
  promptVersion: string,
  cacheEnabled: boolean,
  providerPlanHash?: string,
): Promise<CoverLetterCacheCheckResult> {
  const inputHash = computeCoverLetterInputHash(input);

  if (!cacheEnabled) {
    return {
      hit: false,
      value: null,
      letter: null,
      entry: null,
      inputHash,
    };
  }

  const result = await checkCacheEntry<string>(
    inputHash,
    "cover_letter",
    provider,
    model,
    promptVersion,
    providerPlanHash,
    getCachedCoverLetterByMetaKey,
  );

  return {
    ...result,
    letter: result.value,
  };
}

export async function storeAnalysisCache(
  params: CacheStoreParams,
): Promise<void> {
  const { inputHash, provider, model, promptVersion, analysis } = params;

  await db.meta.put({
    key: analysisMetaKey(analysis.id),
    value: analysis,
  });

  await db.aiCache.put({
    id: buildCacheId(),
    kind: "vacancy_analysis",
    inputHash,
    provider,
    model,
    promptVersion,
    providerPlanHash: params.providerPlanHash,
    resultRefId: analysis.id,
    createdAt: new Date().toISOString(),
  });
}

export async function storeCoverLetterCache(
  params: CoverLetterCacheStoreParams,
): Promise<string> {
  const { inputHash, provider, model, promptVersion, letter } = params;
  const resultRefId = `cover_letter_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;

  await db.meta.put({
    key: coverLetterMetaKey(resultRefId),
    value: letter,
  });

  await db.aiCache.put({
    id: buildCacheId(),
    kind: "cover_letter",
    inputHash,
    provider,
    model,
    promptVersion,
    providerPlanHash: params.providerPlanHash,
    resultRefId,
    createdAt: new Date().toISOString(),
  });

  return resultRefId;
}

export async function invalidateCache(inputHash?: string): Promise<number> {
  let entries: AIRequestCache[];

  if (inputHash) {
    entries = await db.aiCache.where("inputHash").equals(inputHash).toArray();
    await db.aiCache.where("inputHash").equals(inputHash).delete();
  } else {
    entries = await db.aiCache.toArray();
    await db.aiCache.clear();
  }

  const metaKeys = entries.map((entry) =>
    entry.kind === "cover_letter"
      ? coverLetterMetaKey(entry.resultRefId)
      : analysisMetaKey(entry.resultRefId),
  );

  if (metaKeys.length > 0) {
    await db.meta.bulkDelete(metaKeys);
  }

  return entries.length;
}

export async function listCacheEntries(): Promise<AIRequestCache[]> {
  return db.aiCache.orderBy("createdAt").reverse().toArray();
}

export async function getCachedAnalysis(
  resultRefId: string,
): Promise<AIAnalysis | null> {
  return getCachedAnalysisByMetaKey(analysisMetaKey(resultRefId));
}

export async function getCachedCoverLetter(
  resultRefId: string,
): Promise<string | null> {
  return getCachedCoverLetterByMetaKey(coverLetterMetaKey(resultRefId));
}

async function getCachedAnalysisByMetaKey(
  key: string,
): Promise<AIAnalysis | null> {
  const row = await db.meta.get(key);
  return row ? (row.value as AIAnalysis) : null;
}

async function getCachedCoverLetterByMetaKey(
  key: string,
): Promise<string | null> {
  const row = await db.meta.get(key);
  return typeof row?.value === "string" ? row.value : null;
}

async function checkCacheEntry<T>(
  inputHash: string,
  kind: CacheKind,
  provider: string,
  model: string,
  promptVersion: string,
  providerPlanHash: string | undefined,
  loader: (key: string) => Promise<T | null>,
): Promise<CacheCheckResult<T>> {
  const candidates = await db.aiCache.where({ inputHash, kind }).toArray();
  const match = candidates.find(
    (entry) =>
      entry.provider === provider &&
      entry.model === model &&
      entry.promptVersion === promptVersion &&
      (providerPlanHash === undefined || entry.providerPlanHash === providerPlanHash),
  );

  if (!match) {
    return { hit: false, value: null, entry: null, inputHash };
  }

  if (match.expiresAt && new Date(match.expiresAt) < new Date()) {
    await db.aiCache.delete(match.id);
    await db.meta.delete(
      kind === "cover_letter"
        ? coverLetterMetaKey(match.resultRefId)
        : analysisMetaKey(match.resultRefId),
    );
    return { hit: false, value: null, entry: null, inputHash };
  }

  const value = await loader(
    kind === "cover_letter"
      ? coverLetterMetaKey(match.resultRefId)
      : analysisMetaKey(match.resultRefId),
  );

  if (value == null) {
    await db.aiCache.delete(match.id);
    return { hit: false, value: null, entry: null, inputHash };
  }

  return { hit: true, value, entry: match, inputHash };
}
