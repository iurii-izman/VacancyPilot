import { jobRepo, profileRepo, resumeRepo } from "@/db/repositories";
import { loadSettings } from "@/db/settings-bridge";
import type { CoverLetterConstraints } from "@/models/cover-letter";
import type {
  CoverLetterInput,
  ProviderInputPolicy,
  ProviderRequestPlan,
} from "@/models/ai";
import type { AppSettings } from "@/models/settings";
import { buildCoverLetterInput } from "./ai-input-builders";
import {
  estimateCost,
  reserveAiProviderAttempt,
  completeAiProviderExecution,
  markAiProviderOutcomeUnknown,
} from "./ai-budget";
import { checkCoverLetterCache, storeCoverLetterCache } from "./ai-cache";
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
  generateCoverLetterPreview,
  type PayloadPreview,
} from "./payload-preview";
import { recordAiRequest } from "./ai-budget";

export interface CoverLetterAiRequest {
  jobId: string;
  profileId: string;
  resumeId?: string;
  mode: CoverLetterInput["mode"];
  constraints: CoverLetterConstraints;
}

export interface PreparedCoverLetterAiRequest {
  request: CoverLetterAiRequest;
  settings: AppSettings;
  policy: ProviderInputPolicy;
  input: CoverLetterInput;
  plan: ProviderRequestPlan;
  preview: PayloadPreview;
  provider: NonNullable<AppSettings["ai"]["provider"]>;
  providerLabel: string;
  model: string;
  promptVersion: string;
  cacheEnabled: boolean;
  optionalOriginGranted: boolean;
}

export interface CoverLetterAiGenerationResult {
  bodyText: string;
  provider: NonNullable<AppSettings["ai"]["provider"]>;
  providerLabel: string;
  model: string;
  promptVersion: string;
  fromCache: boolean;
}

const PROMPT_VERSION_BY_PROVIDER: Record<string, string> = {
  openai: "1.0.0",
  mock: "1.0.0",
};

function resolvePromptVersion(
  provider: NonNullable<AppSettings["ai"]["provider"]>,
): string {
  return PROMPT_VERSION_BY_PROVIDER[provider] ?? "1.0.0";
}

export async function prepareCoverLetterAiRequest(
  request: CoverLetterAiRequest,
): Promise<PreparedCoverLetterAiRequest> {
  const settings = await loadSettings();
  const policy = providerPolicyFromSettings(settings);
  const provider = policy.provider;

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

  const input = buildCoverLetterInput(job, profile, settings, resume, {
    mode: request.mode,
    constraints: request.constraints,
  });
  const plan = buildProviderRequestPlan(
    "cover_letter",
    input,
    settings,
    {
      job_id: request.jobId,
      profile_id: request.profileId,
      ...(request.resumeId ? { resume_id: request.resumeId } : {}),
    },
  );

  return {
    request,
    settings,
    policy,
    input,
    plan,
    preview: generateCoverLetterPreview(input),
    provider: plan.provider,
    providerLabel: providerLabel(provider),
    model: plan.model,
    promptVersion: plan.promptVersion || resolvePromptVersion(provider),
    cacheEnabled: settings.ai.enableCache,
    optionalOriginGranted: await hasProviderOriginAccess(provider),
  };
}

export function buildCoverLetterAiCostSummary(
  prepared: PreparedCoverLetterAiRequest,
) {
  return estimateCost(
    prepared.preview.estimatedTokens,
    prepared.provider,
    prepared.model,
    0.5,
  );
}

/**
 * Strictly local preview pipeline.
 *
 * Guarantees:
 * - no permission request;
 * - no provider network call;
 * - no usage increment;
 * - no cache write.
 */
export async function previewCoverLetterPayload(
  request: CoverLetterAiRequest,
): Promise<PreparedCoverLetterAiRequest> {
  return prepareCoverLetterAiRequest(request);
}

export async function generateCoverLetterAiDraft(
  prepared: PreparedCoverLetterAiRequest,
  jobId?: string,
  retryId?: string,
): Promise<CoverLetterAiGenerationResult> {
  // Rebuild the authoritative input and current policy at the execution
  // boundary. The preview object is not a permission to use changed data.
  const currentSettings = await loadSettings();
  const readiness = checkAIReadiness(currentSettings);
  if (!readiness.ready) {
    throw new Error(readiness.reason);
  }

  const [job, profile, resume] = await Promise.all([
    jobRepo.getById(prepared.request.jobId),
    profileRepo.getById(prepared.request.profileId),
    prepared.request.resumeId
      ? resumeRepo.getById(prepared.request.resumeId)
      : Promise.resolve(undefined),
  ]);
  if (!job || !profile) {
    throw new Error("The reviewed vacancy or profile no longer exists locally.");
  }

  const currentInput = buildCoverLetterInput(
    job,
    profile,
    currentSettings,
    resume,
    {
      mode: prepared.request.mode,
      constraints: prepared.request.constraints,
    },
  );
  const currentPlan = buildProviderRequestPlan(
    "cover_letter",
    currentInput,
    currentSettings,
    {
      job_id: prepared.request.jobId,
      profile_id: prepared.request.profileId,
      ...(prepared.request.resumeId
        ? { resume_id: prepared.request.resumeId }
        : {}),
    },
  );
  if (currentPlan.providerPlanHash !== prepared.plan.providerPlanHash) {
    throw new Error(
      "AI_PREVIEW_STALE: local vacancy/profile/resume data or AI/privacy policy changed after preview.",
    );
  }

  const cached = await checkCoverLetterCache(
    currentInput,
    currentPlan.provider,
    currentPlan.model,
    currentPlan.promptVersion,
    currentSettings.ai.enableCache && !retryId,
    currentPlan.providerPlanHash,
  );

  if (cached.hit && cached.letter) {
    return {
      bodyText: cached.letter,
      provider: currentPlan.provider,
      providerLabel: providerLabel(currentPlan.provider),
      model: currentPlan.model,
      promptVersion: currentPlan.promptVersion,
      fromCache: true,
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
  // Check credentials/provider configuration before consuming a request slot.
  await provider.preflight?.();

  const reservation = await reserveAiProviderAttempt({
    operationKey: buildStandaloneOperationKey(currentPlan, retryId),
    operationKind: "cover_letter",
    provider: currentPlan.provider,
    model: currentPlan.model,
    providerPlanHash: currentPlan.providerPlanHash,
    dailyRequestLimit: currentSettings.ai.dailyRequestLimit,
  });

  let bodyText: string;
  try {
    bodyText = await provider.generateCoverLetter(currentInput, currentPlan);
  } catch (error) {
    // Once durable dispatching exists, a thrown provider error may mean that
    // the request reached the provider. Never auto-retry it.
    await markAiProviderOutcomeUnknown(reservation);
    throw error;
  }

  await completeAiProviderExecution(reservation);

  if (currentSettings.ai.enableCache) {
    await storeCoverLetterCache({
      inputHash: cached.inputHash,
      kind: "cover_letter",
      provider: currentPlan.provider,
      model: currentPlan.model,
      promptVersion: currentPlan.promptVersion,
      providerPlanHash: currentPlan.providerPlanHash,
      letter: bodyText,
      jobId: jobId ?? prepared.request.jobId,
    });
  }

  await recordAiRequest("cover_letter", jobId ?? prepared.request.jobId);

  return {
    bodyText,
    provider: currentPlan.provider,
    providerLabel: providerLabel(currentPlan.provider),
    model: currentPlan.model,
    promptVersion: currentPlan.promptVersion,
    fromCache: false,
  };
}

/**
 * Generation pipeline with permission + provider call.
 */
export async function generateCoverLetterDraft(
  prepared: PreparedCoverLetterAiRequest,
  jobId?: string,
  retryId?: string,
): Promise<CoverLetterAiGenerationResult> {
  return generateCoverLetterAiDraft(prepared, jobId, retryId);
}
