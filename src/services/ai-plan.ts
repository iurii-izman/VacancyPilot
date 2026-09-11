/** Canonical provider plans shared by preview, cache, and execution. */

import type {
  CoverLetterInput,
  ProviderInputPolicy,
  ProviderRequestPlan,
  VacancyAnalysisInput,
} from "@/models/ai";
import type { AppSettings } from "@/models/settings";
import {
  buildAnalysisSystemPrompt,
  buildAnalysisUserPrompt,
  buildCoverLetterSystemPrompt,
  buildCoverLetterUserPrompt,
  getOpenAITokenLimitParam,
} from "./ai-provider-openai";
import { redactProviderValue } from "./redaction";

export const AI_PLAN_VERSION = "fix3-provider-plan-v1";
export const ANALYSIS_RESPONSE_SCHEMA_VERSION = "vacancy-analysis-v1";
export const COVER_LETTER_RESPONSE_SCHEMA_VERSION = "cover-letter-text-v1";
const PROMPT_VERSION = "1.0.0";
export const REPAIR_POLICY_FINGERPRINT = sha256Hex(
  "one-bounded-repair;provider-sdk-retries-zero;validated-output-only",
);

export function providerPolicyFromSettings(
  settings: AppSettings,
): ProviderInputPolicy {
  return {
    policyVersion: AI_PLAN_VERSION,
    aiEnabled: settings.privacy.aiEnabled,
    provider: settings.ai.provider ?? "mock",
    model: settings.ai.model?.trim() || undefined,
    privacyMode: settings.privacy.strictPrivacyMode ? "strict" : "standard",
    allowResumeHighlightsToAI: settings.privacy.allowResumeHighlightsToAI,
    allowFullDescriptionToAI: settings.privacy.allowFullDescriptionToAI,
    redactContacts: settings.privacy.redactContacts,
    maxInputChars: Math.max(256, Math.min(12_000, settings.ai.maxInputChars || 3_000)),
    dailyRequestLimit: Math.max(0, Math.floor(settings.ai.dailyRequestLimit)),
    cacheEnabled: settings.ai.enableCache,
  };
}

/** Fields that affect execution policy, excluding budget/cache knobs. */
export function policyFingerprint(policy: ProviderInputPolicy): string {
  return sha256Hex(
    stableStringify({
      policyVersion: policy.policyVersion,
      aiEnabled: policy.aiEnabled,
      provider: policy.provider,
      model: policy.model ?? "",
      privacyMode: policy.privacyMode,
      allowResumeHighlightsToAI: policy.allowResumeHighlightsToAI,
      allowFullDescriptionToAI: policy.allowFullDescriptionToAI,
      redactContacts: policy.redactContacts,
      maxInputChars: policy.maxInputChars,
    }),
  );
}

export function buildProviderRequestPlan(
  operationKind: "vacancy_analysis" | "cover_letter",
  input: VacancyAnalysisInput | CoverLetterInput,
  settings: AppSettings,
  subjectIds: Record<string, string>,
): ProviderRequestPlan {
  const policy = providerPolicyFromSettings(settings);
  const provider = policy.provider;
  const model = policy.model || (provider === "openai" ? "gpt-4o" : "mock-gpt-4o");
  const safeInput = applyPolicyToInput(input, policy);
  const messages =
    operationKind === "vacancy_analysis"
      ? [
          { role: "system" as const, content: buildAnalysisSystemPrompt() },
          {
            role: "user" as const,
            content: buildAnalysisUserPrompt(safeInput as VacancyAnalysisInput),
          },
        ]
      : [
          {
            role: "system" as const,
            content: buildCoverLetterSystemPrompt(
              (safeInput as CoverLetterInput).constraints,
            ),
          },
          {
            role: "user" as const,
            content: buildCoverLetterUserPrompt(safeInput as CoverLetterInput),
          },
        ];

  const dynamicPayload = redactProviderValue(
    operationKind === "vacancy_analysis"
      ? {
          job: (safeInput as VacancyAnalysisInput).job,
          profile: (safeInput as VacancyAnalysisInput).profile,
          resumeHighlights: (safeInput as VacancyAnalysisInput).resumeHighlights,
          strictPrivacy: (safeInput as VacancyAnalysisInput).strictPrivacy,
        }
      : {
          job: (safeInput as CoverLetterInput).job,
          profile: (safeInput as CoverLetterInput).profile,
          resumeHighlights: (safeInput as CoverLetterInput).resumeHighlights,
          mode: (safeInput as CoverLetterInput).mode,
          constraints: (safeInput as CoverLetterInput).constraints,
          language: (safeInput as CoverLetterInput).language,
        },
    { redactContacts: policy.redactContacts },
  ) as Record<string, unknown>;

  const authoritativeInputFingerprint = sha256Hex(
    stableStringify({ dynamicPayload, policy: policyFingerprint(policy) }),
  );
  const tokenLimitParam = getOpenAITokenLimitParam(model, 1500);
  const providerAffectingOptions = {
    temperature: 0.4,
    ...tokenLimitParam,
    sdkRetries: 0,
    outputMode: operationKind === "vacancy_analysis" ? "json" : "text",
  };
  const promptVersion = PROMPT_VERSION;
  const planWithoutHash = {
    planVersion: AI_PLAN_VERSION,
    promptVersion,
    operationKind,
    subjectIds,
    provider,
    model,
    messages,
    responseSchemaVersion:
      operationKind === "vacancy_analysis"
        ? ANALYSIS_RESPONSE_SCHEMA_VERSION
        : COVER_LETTER_RESPONSE_SCHEMA_VERSION,
    providerAffectingOptions,
    compilerFingerprint: sha256Hex(
      stableStringify({ operationKind, messages, planVersion: AI_PLAN_VERSION }),
    ),
    repairPolicyFingerprint: REPAIR_POLICY_FINGERPRINT,
    privacyPolicyFingerprint: policyFingerprint(policy),
    authoritativeInputFingerprint,
  };

  return {
    ...planWithoutHash,
    providerPlanHash: sha256Hex(stableStringify(planWithoutHash)),
    dynamicPayload,
  };
}

function applyPolicyToInput(
  input: VacancyAnalysisInput | CoverLetterInput,
  policy: ProviderInputPolicy,
): VacancyAnalysisInput | CoverLetterInput {
  const safe = (value: unknown, maxChars?: number): string =>
    String(
      redactProviderValue(value, {
        redactContacts: policy.redactContacts,
        maxStringChars: maxChars,
      }),
    );
  const allowResume =
    policy.allowResumeHighlightsToAI && policy.privacyMode !== "strict";
  const allowDescription =
    policy.allowFullDescriptionToAI && policy.privacyMode !== "strict";

  if ("strictPrivacy" in input) {
    return {
      ...input,
      job: {
        title: safe(input.job.title, 500),
        company: safe(input.job.company, 500),
        salaryRaw: input.job.salaryRaw
          ? safe(input.job.salaryRaw, 200)
          : undefined,
        city: input.job.city ? safe(input.job.city, 200) : undefined,
        workMode: safe(input.job.workMode, 64),
        experienceRaw: input.job.experienceRaw
          ? safe(input.job.experienceRaw, 500)
          : undefined,
        skills: input.job.skills.slice(0, 50).map((item) => safe(item, 200)),
        descriptionClean: allowDescription
          ? safe(input.job.descriptionClean, Math.min(policy.maxInputChars, 12000))
          : "",
      },
      profile: {
        summary: safe(input.profile.summary, policy.maxInputChars),
        targetTitles: input.profile.targetTitles
          .slice(0, 20)
          .map((item) => safe(item, 200)),
        mustHaveSkills: input.profile.mustHaveSkills
          .slice(0, 30)
          .map((item) => safe(item, 200)),
        niceToHaveSkills: input.profile.niceToHaveSkills
          .slice(0, 30)
          .map((item) => safe(item, 200)),
      },
      resumeHighlights: allowResume && input.resumeHighlights
        ? safe(input.resumeHighlights, Math.min(policy.maxInputChars, 12000))
        : undefined,
      strictPrivacy: policy.privacyMode === "strict",
    };
  }

  return {
    ...input,
    job: {
      title: safe(input.job.title, 500),
      company: safe(input.job.company, 500),
      topRequirements: safe(input.job.topRequirements, 800),
      skills: input.job.skills.slice(0, 50).map((item) => safe(item, 200)),
    },
    profile: { summary: safe(input.profile.summary, policy.maxInputChars) },
    resumeHighlights: allowResume
      ? safe(input.resumeHighlights, Math.min(policy.maxInputChars, 12000))
      : "",
    constraints: sanitizeCoverLetterConstraints(input.constraints),
  };
}

function sanitizeCoverLetterConstraints(
  constraints: CoverLetterInput["constraints"],
): CoverLetterInput["constraints"] {
  return {
    noEmoji: constraints.noEmoji === true,
    noMarkdown: constraints.noMarkdown === true,
    noSpecialChars: constraints.noSpecialChars === true,
    maxChars:
      constraints.maxChars === 500 || constraints.maxChars === 1000
        ? constraints.maxChars
        : undefined,
  };
}

export function buildStandaloneOperationKey(
  plan: ProviderRequestPlan,
  retryId?: string,
): string {
  return sha256Hex(
    stableStringify({
      domainIdentity: "standalone",
      operationKind: plan.operationKind,
      subjectIds: plan.subjectIds,
      providerPlanHash: plan.providerPlanHash,
      retryId: retryId ?? "",
    }),
  );
}

export function stablePlanStringify(value: unknown): string {
  return stableStringify(value);
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

// Synchronous SHA-256 keeps plan construction deterministic in MV3 service
// workers and tests without depending on Node's crypto module.
function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 9 + 63) >> 6) << 6);
  const data = new Uint8Array(paddedLength);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
    0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
    0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
    0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
    0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let h0 = 0x6a09e667; let h1 = 0xbb67ae85; let h2 = 0x3c6ef372; let h3 = 0xa54ff53a;
  let h4 = 0x510e527f; let h5 = 0x9b05688c; let h6 = 0x1f83d9ab; let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let hh = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + k[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}
