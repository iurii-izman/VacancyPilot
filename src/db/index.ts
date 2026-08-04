// Local storage layer — barrel export

export {
  SCHEMA_V1,
  SCHEMA_V2,
  SCHEMA_V3,
  SCHEMA_V4,
  SCHEMA_V5,
  SCHEMA_V6,
  TABLE_NAMES,
  SCHEMA_VERSION,
} from "./schema";
export type { TableName } from "./schema";

export { VacancyDatabase, db } from "./database";

export {
  CURRENT_VERSION,
  getStoredVersion,
  writeCurrentVersion,
  runMigrations,
  ensureMigrationsBootstrapped,
} from "./migrations";

export {
  jobRepo,
  profileRepo,
  resumeRepo,
  coverLetterRepo,
  visitMarkRepo,
} from "./repositories";

export { labsActionRepo } from "./labs-repository";

export { hrTimelineRepo } from "./hr-timeline-repository";

export { defaultSettings, loadSettings, saveSettings } from "./settings-bridge";

export {
  opsMetaRepo,
  outboxRepo,
  opsCacheRepo,
} from "./ops-repository";
