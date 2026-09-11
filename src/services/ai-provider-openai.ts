/**
 * OpenAI LLM Provider — real BYOK provider implementing LLMProvider.
 *
 * Sends vacancy analysis and cover letter prompts to the OpenAI chat
 * completions API using the user's own API key stored locally.
 *
 * Section 12.1, 12.2: first real provider, BYOK model.
 * Never makes network calls without an explicit user action.
 * Never logs or exports the API key.
 */

import type {
  LLMProvider,
  AIAnalysis,
  VacancyAnalysisInput,
  CoverLetterInput,
  ProviderRequestPlan,
} from "@/models/ai";
import type { CoverLetterConstraints } from "@/models/cover-letter";
import { getApiKey } from "@/db/api-key-bridge";
import {
  parseAndValidateAnalysis,
  createFallbackAnalysis,
} from "./ai-validation";

// ── OpenAI API types ─────────────────────────────────────────────────────

interface OpenAIMessage {
  role: "system" | "user";
  content: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

// ── Constants ────────────────────────────────────────────────────────────

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const PROMPT_VERSION = "1.0.0";
const DEFAULT_MODEL = "gpt-4o";

// ── ID generation ────────────────────────────────────────────────────────

function generateAnalysisId(): string {
  return `ai_analysis_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

// ── Prompt builders ──────────────────────────────────────────────────────

export function buildAnalysisSystemPrompt(): string {
  return [
    "Ты карьерный аналитик и job matching assistant.",
    "Используй только предоставленные данные.",
    "Не выдумывай факты.",
    "Верни строго валидный JSON без markdown.",
  ].join("\n");
}

export function buildAnalysisUserPrompt(input: VacancyAnalysisInput): string {
  const profileJson = JSON.stringify(
    {
      summary: input.profile.summary,
      targetTitles: input.profile.targetTitles,
      mustHaveSkills: input.profile.mustHaveSkills,
      niceToHaveSkills: input.profile.niceToHaveSkills,
    },
    null,
    2,
  );

  const vacancyJson = JSON.stringify(
    {
      title: input.job.title,
      company: input.job.company,
      salary: input.job.salaryRaw ?? "не указана",
      city: input.job.city ?? "не указан",
      workMode: input.job.workMode,
      experience: input.job.experienceRaw ?? "не указан",
      skills: input.job.skills,
      description: input.job.descriptionClean || "(нет описания)",
    },
    null,
    2,
  );

  const resumeLine = input.resumeHighlights
    ? `\nResume highlights:\n${input.resumeHighlights}\n`
    : "";

  return [
    "Проанализируй вакансию относительно профиля кандидата.",
    "",
    "Candidate profile:",
    profileJson,
    resumeLine,
    "Vacancy:",
    vacancyJson,
    "",
    `Privacy mode: ${input.strictPrivacy ? "strict" : "standard"}.`,
    "",
    "Return JSON:",
    "{",
    '  "fitScore": <0-100>,',
    '  "recommendation": "apply" | "consider" | "skip",',
    '  "fitReasons": ["<string>"],',
    '  "riskFlags": [',
    '    { "code": "<string>", "severity": "low" | "medium" | "high", "message": "<string>" }',
    "  ],",
    '  "missingSkills": ["<string>"],',
    '  "questionsForHR": ["<string>"]',
    "}",
  ].join("\n");
}

export function buildCoverLetterSystemPrompt(
  constraints: CoverLetterConstraints,
): string {
  const rules: string[] = [
    "Ты пишешь сопроводительные письма для HH.ru.",
    "Пиши от лица кандидата.",
    "Не выдумывай факты.",
  ];

  if (constraints.noMarkdown) {
    rules.push("Не используй markdown.");
  }
  if (constraints.noEmoji) {
    rules.push("Не используй emoji.");
  }
  if (constraints.noSpecialChars) {
    rules.push("Избегай нестандартных символов.");
  }
  if (constraints.maxChars) {
    rules.push(`Соблюдай лимит в ${constraints.maxChars} символов.`);
  }

  rules.push("Верни только текст письма без комментариев.");

  return rules.join("\n");
}

export function buildCoverLetterUserPrompt(input: CoverLetterInput): string {
  const parts: string[] = [];

  parts.push("Вакансия:");
  parts.push(`- Title: ${input.job.title}`);
  parts.push(`- Company: ${input.job.company}`);
  parts.push(`- Requirements: ${input.job.topRequirements}`);
  parts.push(`- Skills: ${input.job.skills.join(", ")}`);
  parts.push("");

  parts.push("Профиль кандидата:");
  parts.push(input.profile.summary || "(нет данных)");
  parts.push("");

  if (input.resumeHighlights) {
    parts.push("Релевантные достижения:");
    parts.push(input.resumeHighlights);
    parts.push("");
  }

  const modeLabels: Record<string, string> = {
    hh_standard: "стандартное для HH.ru",
    hh_short: "короткое для HH.ru",
    tg_short: "короткое для Telegram",
    very_short: "очень короткое",
  };

  parts.push(`Режим письма: ${modeLabels[input.mode] ?? input.mode}`);
  parts.push("");

  const constraintLines: string[] = [];
  if (input.constraints.noEmoji) constraintLines.push("- без emoji");
  if (input.constraints.noMarkdown) constraintLines.push("- без markdown");
  if (input.constraints.noSpecialChars)
    constraintLines.push("- без спецсимволов");
  if (input.constraints.maxChars)
    constraintLines.push(`- до ${input.constraints.maxChars} символов`);
  if (constraintLines.length > 0) {
    parts.push("Ограничения:");
    parts.push(...constraintLines);
    parts.push("");
  }

  const langLabels: Record<string, string> = {
    ru: "русский",
    en: "английский",
    ro: "румынский",
  };
  parts.push(`Язык: ${langLabels[input.language] ?? input.language}`);
  parts.push("");
  parts.push("Напиши сопроводительное письмо.");

  return parts.join("\n");
}

// ── Token limit parameter compatibility ───────────────────────────────────

/**
 * Return the correct token-limit parameter name for a given OpenAI model.
 *
 * GPT-5, o1, o3, and o4 family models require `max_completion_tokens`
 * instead of the legacy `max_tokens`. All other chat models keep `max_tokens`.
 */
export function getOpenAITokenLimitParam(
  model: string,
  value: number,
): { max_completion_tokens: number } | { max_tokens: number } {
  const normalized = model.toLowerCase();

  const requiresMaxCompletionTokens =
    normalized.startsWith("gpt-5") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4");

  return requiresMaxCompletionTokens
    ? { max_completion_tokens: value }
    : { max_tokens: value };
}

// ── Error message mapping ─────────────────────────────────────────────────

const OPENAI_ERROR_MAP: Record<string, string> = {
  unsupported_parameter:
    "Model/API parameter mismatch. Try another model or update request parameters.",
  model_not_found: "Model is not available for this API key/project.",
  insufficient_quota: "OpenAI quota/billing issue. Check your account balance.",
  invalid_api_key: "API key is invalid or revoked. Check your key in settings.",
  rate_limit_exceeded:
    "Rate limit exceeded. Try again later or lower request frequency.",
};

function mapOpenAIError(
  status: number,
  errorBody?: OpenAIErrorResponse,
): string {
  const code = errorBody?.error?.code;
  if (code && OPENAI_ERROR_MAP[code]) {
    if (code === "unsupported_parameter") {
      const messageLower = (errorBody?.error?.message ?? "").toLowerCase();
      if (messageLower.includes("max_tokens")) {
        return "OpenAI rejected the token limit parameter for this model. VacancyPilot should use max_completion_tokens for this model.";
      }
    }

    const mapped = OPENAI_ERROR_MAP[code];
    return `OpenAI: ${mapped}`;
  }

  if (status === 401) {
    return "OpenAI: Invalid API key. Check your key in settings.";
  }
  if (status === 403) {
    return "OpenAI: Browser permission or OpenAI project access issue.";
  }
  if (status === 429) {
    return "OpenAI: Rate limit exceeded. Try again later.";
  }
  if (status === 402) {
    return "OpenAI: Insufficient credits. Check your account balance.";
  }

  const serverMsg = errorBody?.error?.message;
  if (serverMsg) {
    return `OpenAI: ${serverMsg}`;
  }
  return `OpenAI API error ${status}`;
}

// ── API call helpers ─────────────────────────────────────────────────────

async function callOpenAI(
  model: string,
  messages: OpenAIMessage[],
  apiKey: string,
  options?: Record<string, unknown>,
): Promise<OpenAIResponse> {
  const tokenParam =
    typeof options?.max_completion_tokens === "number"
      ? { max_completion_tokens: options.max_completion_tokens }
      : typeof options?.max_tokens === "number"
        ? { max_tokens: options.max_tokens }
        : getOpenAITokenLimitParam(model, 1500);
  const outputMode = options?.outputMode;

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature:
        typeof options?.temperature === "number" ? options.temperature : 0.4,
      ...tokenParam,
      ...(outputMode === "json"
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
  });

  if (!response.ok) {
    let errorBody: OpenAIErrorResponse | undefined;
    try {
      errorBody = (await response.json()) as OpenAIErrorResponse;
    } catch {
      // Response body not parseable — use status text
    }

    throw new Error(mapOpenAIError(response.status, errorBody));
  }

  return response.json() as Promise<OpenAIResponse>;
}

// ── Provider ─────────────────────────────────────────────────────────────

export class OpenAILLMProvider implements LLMProvider {
  readonly id = "openai" as const;
  private model: string;

  constructor(model?: string) {
    this.model = model || DEFAULT_MODEL;
  }

  async preflight(): Promise<void> {
    const apiKey = await getApiKey("openai");
    if (!apiKey) {
      throw new Error(
        "OpenAI API key not configured. Add your key in Settings → AI.",
      );
    }
  }

  async analyzeVacancy(
    input: VacancyAnalysisInput,
    plan?: ProviderRequestPlan,
  ): Promise<AIAnalysis> {
    const apiKey = await getApiKey("openai");
    if (!apiKey) {
      throw new Error(
        "OpenAI API key not configured. Add your key in Settings → AI.",
      );
    }

    const messages: OpenAIMessage[] = plan?.messages ?? [
      { role: "system", content: buildAnalysisSystemPrompt() },
      { role: "user", content: buildAnalysisUserPrompt(input) },
    ];

    const model = plan?.model ?? this.model;
    const response = await callOpenAI(
      model,
      messages,
      apiKey,
      plan?.providerAffectingOptions,
    );
    const content = response.choices[0]?.message?.content ?? "";

    const validationResult = parseAndValidateAnalysis(content, {
      id: generateAnalysisId(),
      provider: this.id,
      model,
      promptVersion: plan?.promptVersion ?? PROMPT_VERSION,
      inputHash: "",
      jobId: "",
      profileId: "",
    });

    if (validationResult.valid && validationResult.analysis) {
      const analysis = validationResult.analysis;

      // Attach token usage from API response
      if (response.usage) {
        analysis.tokenUsage = {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
          estimatedCostUsd: estimateCost(
            model,
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
          ),
        };
      }

      return analysis;
    }

    // Return fallback analysis on validation failure
    return createFallbackAnalysis({
      id: generateAnalysisId(),
      provider: this.id,
      model,
      promptVersion: plan?.promptVersion ?? PROMPT_VERSION,
      inputHash: "",
      jobId: "",
      profileId: "",
    });
  }

  async generateCoverLetter(
    input: CoverLetterInput,
    plan?: ProviderRequestPlan,
  ): Promise<string> {
    const apiKey = await getApiKey("openai");
    if (!apiKey) {
      throw new Error(
        "OpenAI API key not configured. Add your key in Settings → AI.",
      );
    }

    const messages: OpenAIMessage[] = plan?.messages ?? [
      {
        role: "system",
        content: buildCoverLetterSystemPrompt(input.constraints),
      },
      { role: "user", content: buildCoverLetterUserPrompt(input) },
    ];

    const response = await callOpenAI(
      plan?.model ?? this.model,
      messages,
      apiKey,
      plan?.providerAffectingOptions,
    );
    const content = response.choices[0]?.message?.content ?? "";

    // Apply post-processing constraints (defense in depth)
    return postProcessLetter(content.trim(), input.constraints);
  }
}

// ── Cost estimation ──────────────────────────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
};

/**
 * Estimate cost in USD based on token counts and known model pricing.
 * Returns 0 if pricing is unknown.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}

// ── Post-processing ──────────────────────────────────────────────────────

const EMOJI_LIKE_RE = /\p{Extended_Pictographic}|\uFE0F|\u200D/gu;

function postProcessLetter(
  text: string,
  constraints: CoverLetterConstraints,
): string {
  let result = text;

  if (constraints.noEmoji) {
    result = result.replace(EMOJI_LIKE_RE, "");
  }

  if (constraints.noMarkdown) {
    result = result
      .replace(/[*_~`#]/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^[-*+]\s/gm, "")
      .replace(/^>\s/gm, "");
  }

  if (constraints.maxChars && result.length > constraints.maxChars) {
    const truncated = result.slice(0, constraints.maxChars);
    const lastPeriod = truncated.lastIndexOf(".");
    if (lastPeriod > constraints.maxChars * 0.6) {
      result = truncated.slice(0, lastPeriod + 1);
    } else {
      const lastSpace = truncated.lastIndexOf(" ");
      result =
        (lastSpace > constraints.maxChars * 0.8
          ? truncated.slice(0, lastSpace)
          : truncated.slice(0, constraints.maxChars)) + "…";
    }
  }

  return result.trim();
}
