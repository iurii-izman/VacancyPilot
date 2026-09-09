// Services — barrel export

export { STATUS_ORDER, createStatusChange } from "./status-transitions";
export { createEventLogEntry } from "./event-log-helper";
export { tracker } from "./tracker";
export { scoreJob, DEFAULT_WEIGHTS } from "./scoring";

export {
  redactText,
  redactContacts,
  redactEmails,
  redactPhones,
  redactUrls,
  redactTokens,
  truncateDescription,
} from "./redaction";

export {
  buildVacancyAnalysisInput,
  buildCoverLetterInput,
} from "./ai-input-builders";
export type {
  BuildVacancyInputOptions,
  BuildCoverLetterOptions,
} from "./ai-input-builders";

export {
  generateVacancyAnalysisPreview,
  generateCoverLetterPreview,
} from "./payload-preview";
export { recordVacancyVisit } from "./visit-marks";

export {
  exportAllJson,
  downloadJson,
  generateJobsCsv,
  downloadCsv,
} from "./export-data";
export type { ExportEnvelope } from "./export-data";

export {
  deleteAllData,
  deleteJobData,
  deleteAiCacheAndEventLog,
  hasData,
  getDataCounts,
} from "./delete-all";

// Labs control plane
export {
  isLabsEnabled,
  isGuidedApplyEnabled,
  getRemainingDailyBudget,
  hasDailyBudget,
  checkGuidedApplyGate,
  recordLabsAction,
  getActionLog,
  getTodayActionCount,
} from "./labs-control";
export type {
  DeleteJobDataResult,
  DeleteAiCacheAndEventLogResult,
} from "./delete-all";

export type { PayloadPreview, IncludedField } from "./payload-preview";

// AI provider
export { MockLLMProvider } from "./ai-provider";
export {
  OpenAILLMProvider,
  estimateCost as estimateOpenAICost,
} from "./ai-provider-openai";
export {
  getLLMProvider,
  isProviderImplemented,
  providerLabel,
  checkAIReadiness,
} from "./ai-provider-factory";
export {
  getProviderOptionalOrigin,
  hasProviderOriginAccess,
  ensureProviderOriginAccess,
} from "./ai-provider-permissions";
export type { ProviderOriginAccess } from "./ai-provider-permissions";
export {
  prepareCoverLetterAiRequest,
  previewCoverLetterPayload,
  buildCoverLetterAiCostSummary,
  generateCoverLetterAiDraft,
  generateCoverLetterDraft,
} from "./cover-letter-ai";
export type {
  CoverLetterAiRequest,
  PreparedCoverLetterAiRequest,
  CoverLetterAiGenerationResult,
} from "./cover-letter-ai";

// AI validation
export {
  parseAndValidateAnalysis,
  createFallbackAnalysis,
  validateCoverLetter,
} from "./ai-validation";
export type {
  ValidationError,
  AnalysisValidationResult,
  LetterValidationResult,
} from "./ai-validation";

// AI hash
export {
  computeAnalysisInputHash,
  computeCoverLetterInputHash,
} from "./ai-hash";

// AI cache
export {
  checkAnalysisCache,
  checkCoverLetterCache,
  storeAnalysisCache,
  storeCoverLetterCache,
  invalidateCache,
  listCacheEntries,
  getCachedAnalysis,
  getCachedCoverLetter,
} from "./ai-cache";
export type {
  CacheKind,
  CacheCheckResult,
  AnalysisCacheCheckResult,
  CoverLetterCacheCheckResult,
  CacheStoreParams,
  CoverLetterCacheStoreParams,
} from "./ai-cache";

// HR classification
export { classifyHrReply } from "./hr-classification";
export type {
  ClassificationInput,
  ClassificationResult,
} from "./hr-classification";

// HR timeline sync
export {
  upsertApplicationFromJob,
  buildHrTimelineEntryId,
  normalizeHrTimelineEntry,
  persistHrTimelineForJob,
} from "./hr-timeline-sync";

// AI budget preview and controls
export {
  estimateTokens,
  getPricing,
  estimateCost,
  getBudgetStatus,
  checkAiBudget,
  recordAiRequest,
  eventTypeForKind,
} from "./ai-budget";
export type {
  PricingEntry,
  CostEstimate,
  BudgetStatus,
  BudgetGateResult,
  AiRequestKind,
} from "./ai-budget";
