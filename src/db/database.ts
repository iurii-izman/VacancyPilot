import Dexie, { type EntityTable } from "dexie";
import type { Job } from "@/models/job";
import type { Company } from "@/models/company";
import type { Profile } from "@/models/profile";
import type { Resume } from "@/models/resume";
import type { CoverLetter } from "@/models/cover-letter";
import type { Application } from "@/models/application";
import type { EventLog } from "@/models/event-log";
import type { AIRequestCache } from "@/models/ai";
import type { LabsActionLog } from "@/models/labs-action-log";
import type { HrTimelineEntry } from "@/models/hr-timeline";
import type { VisitMark } from "@/models/visit-mark";
import type { SyncOutboxEntry, OpsCacheEntry, OpsMeta } from "@/models/ops";
import {
  SCHEMA_V1,
  SCHEMA_V2,
  SCHEMA_V3,
  SCHEMA_V4,
  SCHEMA_V5,
  SCHEMA_V6,
  SCHEMA_V7,
  assertDexieMigrationCoverage,
  DEXIE_MIGRATION_COVERAGE,
  SCHEMA_VERSION,
} from "./schema";

export interface AIExecutionCoordination {
  operationKey: string;
  operationKind: "vacancy_analysis" | "cover_letter";
  provider: string;
  model: string;
  providerPlanHash: string;
  state:
    | "claimed"
    | "dispatching"
    | "repairing"
    | "completed"
    | "failed_before_dispatch"
    | "failed"
    | "outcome_unknown";
  ownerToken: string;
  attemptCount: number;
  runId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIBudgetReservation {
  id: string;
  operationKey: string;
  scope: "standalone";
  dayKey: string;
  attemptNumber: number;
  state: "consumed" | "released";
  providerPlanHash: string;
  createdAt: string;
  releasedAt?: string;
}

/**
 * Dexie database wrapper for VacancyPilot.
 *
 * All domain data goes here. Settings and API keys are NOT stored in IndexedDB;
 * they live in chrome.storage.local (see settings-bridge.ts).
 */

export class VacancyDatabase extends Dexie {
  jobs!: EntityTable<Job, "id">;
  companies!: EntityTable<Company, "id">;
  profiles!: EntityTable<Profile, "id">;
  resumes!: EntityTable<Resume, "id">;
  coverLetters!: EntityTable<CoverLetter, "id">;
  applications!: EntityTable<Application, "id">;
  events!: EntityTable<EventLog, "id">;
  aiCache!: EntityTable<AIRequestCache, "id">;
  labsActions!: EntityTable<LabsActionLog, "id">;
  hrTimeline!: EntityTable<HrTimelineEntry, "id">;
  visitMarks!: EntityTable<VisitMark, "id">;
  syncOutbox!: EntityTable<SyncOutboxEntry, "id">;
  opsCache!: EntityTable<OpsCacheEntry, "key">;
  opsMeta!: EntityTable<OpsMeta, "key">;
  meta!: EntityTable<{ key: string; value: unknown }, "key">;
  aiExecution!: EntityTable<AIExecutionCoordination, "operationKey">;
  aiBudget!: EntityTable<AIBudgetReservation, "id">;

  constructor(name = "VacancyPilotDB") {
    super(name);
    assertDexieMigrationCoverage(SCHEMA_VERSION, DEXIE_MIGRATION_COVERAGE);
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V2).upgrade(() => undefined);
    this.version(3).stores(SCHEMA_V3).upgrade(() => undefined);
    this.version(4).stores(SCHEMA_V4).upgrade(() => undefined);
    this.version(5).stores(SCHEMA_V5).upgrade(() => undefined);
    this.version(6).stores(SCHEMA_V6).upgrade(() => undefined);
    this.version(7).stores(SCHEMA_V7).upgrade(() => undefined);
  }
}

/** Singleton database instance. Created lazily by Dexie — no DB open until first operation. */
export const db = new VacancyDatabase();
