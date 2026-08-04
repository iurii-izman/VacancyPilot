// Domain model contracts — barrel export
// All types are compile-time only. No runtime code, no persistence, no UI.

export type { JobStatus, StatusChange, PassiveHHStatus, Job } from "./job";
export type { Company } from "./company";
export type { CoverLetterConstraints, LetterPrefs, Profile } from "./profile";
export type { Resume } from "./resume";
export type {
  CoverLetterMode,
  CoverLetterVersion,
  CoverLetter,
  DraftProvenance,
} from "./cover-letter";
export type { Application } from "./application";
export type { EventLogType, EventLog } from "./event-log";
export type { RiskSeverity, RiskCode, RiskFlag } from "./risk";
export type { ScoringWeights, ScoreCap, ScoreResult } from "./scoring";
export type { VisitMark } from "./visit-mark";
export type {
  AIAnalysis,
  AIRequestCache,
  VacancyAnalysisInput,
  CoverLetterInput,
  LLMProvider,
} from "./ai";
export type { AppSettings } from "./settings";
export type { LabsActionType, LabsActionLog } from "./labs-action-log";
export type {
  HrReplyType,
  HrTimelineEntry,
  RawHrTimelineDTO,
} from "./hr-timeline";
export type {
  OpsMeta,
  SyncOutboxEntry,
  OpsCacheEntry,
  OutboxOperation,
  OutboxEntityType,
  OutboxStatus,
  OutboxTerminalStatus,
  AuthorityMode,
} from "./ops";
export { OPS_META_KEYS } from "./ops";
