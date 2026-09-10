/**
 * Standalone vacancy-analysis execution boundary.
 *
 * Preview builds a canonical provider plan from the current local records and
 * policy. Execution rebuilds that plan, verifies the hash, then performs the
 * preflight -> atomic reservation -> durable dispatch -> provider call flow.
 */

import { jobRepo, profileRepo, resumeRepo } from "@/db/repositories";
import { loadSettings } from "@/db/settings-bridge";
import type {
  AIAnalysis,
  ProviderInputPolicy,
  ProviderRequestPlan,
  VacancyAnalysisInput,
} from "@/models/ai";
import type { RiskCode, RiskSeverity } from "@/models/risk";
import type { AppSettings } from "@/models/settings";
import { buildVacancyAnalysisInput } from "./ai-input-builders";
import {
  completeAiProviderExecution,
  estimateCost,
  markAiProviderOutcomeUnknown,
  recordAiRequest,
  reserveAiProviderAttempt,
} from "./ai-budget";
import {
  checkAnalysisCache,
  storeAnalysisCache,
} from "./ai-cache";
import {
  ensureProviderOriginAccess,
  hasProviderOriginAccess,
} from "./ai-provider-permissions";
import {
  checkAIReadiness,
  getLLMProvider,
  providerLabel,
} from "./ai-provider-factory";
import {
  buildProviderRequestPlan,
  buildStandaloneOperationKey,
  providerPolicyFromSettings,
} from "./ai-plan";
import {
  generateVacancyAnalysisPreview,
  type PayloadPreview,
} from "./payload-preview";

export interface VacancyAnalysisAiRequest {
  jobId: string;
  profileId: string;
  resumeId?: string;
}

export interface PreparedVacancyAnalysisAiRequest {
  request: VacancyAnalysisAiRequest;
  settings: AppSettings;
  policy: ProviderInputPolicy;
  input: VacancyAnalysisInput;
  plan: ProviderRequestPlan;
  preview: PayloadPreview;
  provider: NonNullable<AppSettings["ai"]["provider"]>;
  providerLabel: string;
  model: string;
  promptVersion: string;
  cacheEnabled: boolean;
  optionalOriginGranted: boolean;
}

export interface VacancyAnalysisAiGenerationResult {
  analysis: AIAnalysis;
  fromCache: boolean;
  provider: NonNullable<AppSettings["ai"]["provider"]>;
  providerLabel: string;
  model: string;
  promptVersion: string;
}

async function loadAuthoritativeInput(
  request: VacancyAnalysisAiRequest,
  settings: AppSettings,
): Promise<VacancyAnalysisInput> {
  const [job, profile, resume] = await Promise.all([
    jobRepo.getById(request.jobId),
    profileRepo.getById(request.profileId),
    request.resumeId
      ? resumeRepo.getById(request.resumeId)
      : Promise.resolve(undefined),
  ]);

  if (!job) {
    throw new Error("Selected vacancy was not found in local storage.");
  }
  if (!profile) {
    throw new Error("Selected profile was not found in local storage.");
  }

  return buildVacancyAnalysisInput(job, profile, settings, resume);
}

function buildPlan(
  request: VacancyAnalysisAiRequest,
  input: VacancyAnalysisInput,
  settings: AppSettings,
): ProviderRequestPlan {
  return buildProviderRequestPlan("vacancy_analysis", input, settings, {
    job_id: request.jobId,
    profile_id: request.profileId,
    ...(request.resumeId ? { resume_id: request.resumeId } : {}),
  });
}

/** Build a provider-free, permission-free, write-free analysis preview. */
export async function prepareVacancyAnalysisAiRequest(
  request: VacancyAnalysisAiRequest,
): Promise<PreparedVacancyAnalysisAiRequest> {
  const settings = await loadSettings();
  const input = await loadAuthoritativeInput(request, settings);
  const policy = providerPolicyFromSettings(settings);
  const plan = buildPlan(request, input, settings);

  return {
    request,
    settings,
    policy,
    input,
    plan,
    preview: generateVacancyAnalysisPreview(input),
    provider: plan.provider,
    providerLabel: providerLabel(plan.provider),
    model: plan.model,
    promptVersion: plan.promptVersion,
    cacheEnabled: settings.ai.enableCache,
    optionalOriginGranted: await hasProviderOriginAccess(plan.provider),
  };
}

export const previewVacancyAnalysisPayload = prepareVacancyAnalysisAiRequest;

export function buildVacancyAnalysisAiCostSummary(
  prepared: PreparedVacancyAnalysisAiRequest,
) {
  return estimateCost(
    prepared.preview.estimatedTokens,
    prepared.provider,
    prepared.model,
    0.2,
  );
}

function normalizeAnalysisResult(
  analysis: AIAnalysis,
  request: VacancyAnalysisAiRequest,
  plan: ProviderRequestPlan,
  inputHash: string,
): AIAnalysis {
  const allowedRiskCodes: RiskCode[] = [
    "salary_unknown",
    "salary_below_minimum",
    "work_mode_mismatch",
    "missing_core_skill",
    "agency_without_employer",
    "unpaid_test_task_risk",
    "vague_description",
    "low_signal",
    "company_blacklist",
    "duplicate_vacancy",
    "suspicious_wording",
    "relocation_required",
    "schedule_mismatch",
    "underqualified",
    "overqualified",
  ];
  const allowedSeverities: RiskSeverity[] = [
    "info",
    "low",
    "medium",
    "high",
    "critical",
  ];
  const recommendation = ["apply", "consider", "skip"].includes(
    analysis.recommendation,
  )
    ? analysis.recommendation
    : "consider";
  const confidence = ["low", "medium", "high"].includes(analysis.confidence)
    ? analysis.confidence
    : "low";
  const riskFlags = Array.isArray(analysis.riskFlags)
    ? analysis.riskFlags
        .filter(
          (flag) =>
            flag &&
            allowedRiskCodes.includes(flag.code as RiskCode) &&
            typeof flag.message === "string" &&
            allowedSeverities.includes(flag.severity as RiskSeverity),
        )
        .map((flag) => ({
          code: flag.code as RiskCode,
          severity: flag.severity as RiskSeverity,
          message: String(flag.message),
        }))
    : [];

  return {
    id: typeof analysis.id === "string" ? analysis.id : `ai_${Date.now()}`,
    jobId: request.jobId,
    profileId: request.profileId,
    resumeId: request.resumeId,
    provider: plan.provider,
    model: plan.model,
    promptVersion: plan.promptVersion,
    inputHash,
    fitScore:
      typeof analysis.fitScore === "number"
        ? Math.max(0, Math.min(100, analysis.fitScore))
        : 0,
    recommendation,
    confidence,
    fitReasons: Array.isArray(analysis.fitReasons)
      ? analysis.fitReasons.filter((item): item is string => typeof item === "string")
      : [],
    riskFlags,
    missingSkills: Array.isArray(analysis.missingSkills)
      ? analysis.missingSkills.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    questionsForHR: Array.isArray(analysis.questionsForHR)
      ? analysis.questionsForHR.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    suggestedProfileId: undefined,
    suggestedResumeId: undefined,
    tokenUsage: analysis.tokenUsage
      ? {
          inputTokens:
            typeof analysis.tokenUsage.inputTokens === "number"
              ? analysis.tokenUsage.inputTokens
              : undefined,
          outputTokens:
            typeof analysis.tokenUsage.outputTokens === "number"
              ? analysis.tokenUsage.outputTokens
              : undefined,
          estimatedCostUsd:
            typeof analysis.tokenUsage.estimatedCostUsd === "number"
              ? analysis.tokenUsage.estimatedCostUsd
              : undefined,
        }
      : undefined,
    createdAt:
      typeof analysis.createdAt === "string"
        ? analysis.createdAt
        : new Date().toISOString(),
  };
}

/** Execute exactly the reviewed plan, or fail closed as stale. */
export async function generateVacancyAnalysisAi(
  prepared: PreparedVacancyAnalysisAiRequest,
  retryId?: string,
): Promise<VacancyAnalysisAiGenerationResult> {
  const currentSettings = await loadSettings();
  const readiness = checkAIReadiness(currentSettings);
  if (!readiness.ready) {
    throw new Error(readiness.reason);
  }

  const currentInput = await loadAuthoritativeInput(
    prepared.request,
    currentSettings,
  );
  const currentPlan = buildPlan(prepared.request, currentInput, currentSettings);
  if (currentPlan.providerPlanHash !== prepared.plan.providerPlanHash) {
    throw new Error(
      "AI_PREVIEW_STALE: local vacancy/profile/resume data or AI/privacy policy changed after preview.",
    );
  }

  const cached = await checkAnalysisCache(
    currentInput,
    currentPlan.provider,
    currentPlan.model,
    currentPlan.promptVersion,
    currentSettings.ai.enableCache && !retryId,
    currentPlan.providerPlanHash,
  );
  if (cached.hit && cached.analysis) {
    return {
      analysis: cached.analysis,
      fromCache: true,
      provider: currentPlan.provider,
      providerLabel: providerLabel(currentPlan.provider),
      model: currentPlan.model,
      promptVersion: currentPlan.promptVersion,
    };
  }

  const originAccess = await ensureProviderOriginAccess(currentPlan.provider);
  if (!originAccess.granted) {
    throw new Error(
      originAccess.reason ??
        `Optional ${providerLabel(currentPlan.provider)} API access was denied by the browser.`,
    );
  }

  const provider = getLLMProvider(currentSettings);
  await provider.preflight?.();

  const reservation = await reserveAiProviderAttempt({
    operationKey: buildStandaloneOperationKey(currentPlan, retryId),
    operationKind: "vacancy_analysis",
    provider: currentPlan.provider,
    model: currentPlan.model,
    providerPlanHash: currentPlan.providerPlanHash,
    dailyRequestLimit: currentSettings.ai.dailyRequestLimit,
  });

  let rawResult: AIAnalysis;
  try {
    rawResult = await provider.analyzeVacancy(currentInput, currentPlan);
  } catch (error) {
    await markAiProviderOutcomeUnknown(reservation);
    throw error;
  }

  const analysis = normalizeAnalysisResult(
    rawResult,
    prepared.request,
    currentPlan,
    cached.inputHash,
  );
  await completeAiProviderExecution(reservation, analysis.id);

  if (currentSettings.ai.enableCache) {
    await storeAnalysisCache({
      inputHash: cached.inputHash,
      kind: "vacancy_analysis",
      provider: currentPlan.provider,
      model: currentPlan.model,
      promptVersion: currentPlan.promptVersion,
      providerPlanHash: currentPlan.providerPlanHash,
      analysis,
    });
  }
  await recordAiRequest("analysis", prepared.request.jobId);

  return {
    analysis,
    fromCache: false,
    provider: currentPlan.provider,
    providerLabel: providerLabel(currentPlan.provider),
    model: currentPlan.model,
    promptVersion: currentPlan.promptVersion,
  };
}

export const generateVacancyAnalysis = generateVacancyAnalysisAi;
