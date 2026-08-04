import { describe, it, expect } from "vitest";
import {
  SCHEMA_V1,
  SCHEMA_V2,
  SCHEMA_V3,
  SCHEMA_V4,
  SCHEMA_V5,
  SCHEMA_V6,
  TABLE_NAMES,
  SCHEMA_VERSION,
} from "./schema";
import { VacancyDatabase } from "./database";

describe("schema constant", () => {
  it("has exactly 15 tables (v6)", () => {
    expect(TABLE_NAMES).toHaveLength(15);
  });

  it("includes all required table names", () => {
    expect(TABLE_NAMES).toEqual([
      "jobs",
      "companies",
      "profiles",
      "resumes",
      "coverLetters",
      "applications",
      "events",
      "aiCache",
      "meta",
      "labsActions",
      "hrTimeline",
      "visitMarks",
      "syncOutbox",
      "opsCache",
      "opsMeta",
    ]);
  });

  it("jobs table has primary key id and required indexes (v1)", () => {
    const spec = SCHEMA_V1.jobs;
    expect(spec).toContain("&id");
    expect(spec).toContain("source");
    expect(spec).toContain("sourceVacancyId");
    expect(spec).toContain("companyId");
    expect(spec).toContain("status");
    expect(spec).toContain("selectedProfileId");
    expect(spec).toContain("firstSeenAt");
    expect(spec).toContain("updatedAt");
    expect(spec).toContain("descriptionHash");
  });

  it("jobs table has compound index [source+sourceVacancyId] (v2)", () => {
    const spec = SCHEMA_V2.jobs;
    expect(spec).toContain("&id");
    expect(spec).toContain("[source+sourceVacancyId]");
    expect(spec).toContain("source");
    expect(spec).toContain("sourceVacancyId");
    expect(spec).toContain("companyId");
    expect(spec).toContain("status");
    expect(spec).toContain("selectedProfileId");
    expect(spec).toContain("firstSeenAt");
    expect(spec).toContain("updatedAt");
    expect(spec).toContain("descriptionHash");
  });

  it("companies table has primary key id and required indexes", () => {
    const spec = SCHEMA_V1.companies;
    expect(spec).toContain("&id");
    expect(spec).toContain("sourceCompanyId");
    expect(spec).toContain("name");
    expect(spec).toContain("status");
    expect(spec).toContain("updatedAt");
  });

  it("profiles table has primary key id and required indexes", () => {
    const spec = SCHEMA_V1.profiles;
    expect(spec).toContain("&id");
    expect(spec).toContain("name");
    expect(spec).toContain("updatedAt");
  });

  it("resumes table has primary key id and required indexes", () => {
    const spec = SCHEMA_V1.resumes;
    expect(spec).toContain("&id");
    expect(spec).toContain("profileId");
    expect(spec).toContain("hhResumeId");
    expect(spec).toContain("updatedAt");
  });

  it("coverLetters table has primary key id and required indexes", () => {
    const spec = SCHEMA_V1.coverLetters;
    expect(spec).toContain("&id");
    expect(spec).toContain("jobId");
    expect(spec).toContain("profileId");
    expect(spec).toContain("resumeId");
    expect(spec).toContain("isFinal");
    expect(spec).toContain("updatedAt");
  });

  it("applications table has primary key id and required indexes", () => {
    const spec = SCHEMA_V1.applications;
    expect(spec).toContain("&id");
    expect(spec).toContain("jobId");
    expect(spec).toContain("status");
    expect(spec).toContain("appliedAt");
    expect(spec).toContain("updatedAt");
  });

  it("events table has primary key id and required indexes", () => {
    const spec = SCHEMA_V1.events;
    expect(spec).toContain("&id");
    expect(spec).toContain("type");
    expect(spec).toContain("jobId");
    expect(spec).toContain("createdAt");
    expect(spec).toContain("sentToN8n");
    expect(spec).toContain("n8nStatus");
  });

  it("aiCache table has primary key id and required indexes", () => {
    const spec = SCHEMA_V1.aiCache;
    expect(spec).toContain("&id");
    expect(spec).toContain("inputHash");
    expect(spec).toContain("kind");
    expect(spec).toContain("provider");
    expect(spec).toContain("model");
    expect(spec).toContain("promptVersion");
    expect(spec).toContain("createdAt");
  });

  it("meta table has primary key only", () => {
    const spec = SCHEMA_V1.meta;
    expect(spec).toBe("&key");
  });

  it("v3 adds labsActions table", () => {
    const spec = SCHEMA_V3.labsActions;
    expect(spec).toContain("&id");
    expect(spec).toContain("type");
    expect(spec).toContain("jobId");
    expect(spec).toContain("createdAt");
  });

  it("v3 inherits all v2 tables", () => {
    expect(SCHEMA_V3.jobs).toBe(SCHEMA_V2.jobs);
    expect(SCHEMA_V3.companies).toBe(SCHEMA_V2.companies);
    expect(SCHEMA_V3.events).toBe(SCHEMA_V2.events);
  });

  it("schema version is 6", () => {
    expect(SCHEMA_VERSION).toBe(6);
  });
  it("v4 adds hrTimeline table", () => {
    const spec = SCHEMA_V4.hrTimeline;
    expect(spec).toContain("&id");
    expect(spec).toContain("applicationId");
    expect(spec).toContain("type");
    expect(spec).toContain("extractedAt");
    expect(spec).toContain("updatedAt");
  });

  it("v4 inherits all v3 tables", () => {
    expect(SCHEMA_V4.jobs).toBe(SCHEMA_V3.jobs);
    expect(SCHEMA_V4.companies).toBe(SCHEMA_V3.companies);
    expect(SCHEMA_V4.labsActions).toBe(SCHEMA_V3.labsActions);
    expect(SCHEMA_V4.hrTimeline).toBeDefined();
  });

  it("v5 adds visitMarks table", () => {
    const spec = SCHEMA_V5.visitMarks;
    expect(spec).toContain("&id");
    expect(spec).toContain("[source+sourceId]");
    expect(spec).toContain("source");
    expect(spec).toContain("sourceType");
    expect(spec).toContain("sourceId");
    expect(spec).toContain("firstSeenAt");
    expect(spec).toContain("lastSeenAt");
    expect(spec).toContain("viewCount");
    expect(spec).toContain("updatedAt");
  });

  it("v5 inherits all v4 tables", () => {
    expect(SCHEMA_V5.jobs).toBe(SCHEMA_V4.jobs);
    expect(SCHEMA_V5.hrTimeline).toBe(SCHEMA_V4.hrTimeline);
    expect(SCHEMA_V5.visitMarks).toBeDefined();
  });

  it("v6 adds syncOutbox, opsCache, and opsMeta tables", () => {
    expect(SCHEMA_V6.syncOutbox).toContain("&id");
    expect(SCHEMA_V6.opsCache).toContain("&key");
    expect(SCHEMA_V6.opsMeta).toContain("&key");
  });

  it("v6 inherits all v5 tables", () => {
    expect(SCHEMA_V6.jobs).toBe(SCHEMA_V5.jobs);
    expect(SCHEMA_V6.hrTimeline).toBe(SCHEMA_V5.hrTimeline);
    expect(SCHEMA_V6.visitMarks).toBe(SCHEMA_V5.visitMarks);
  });
});

describe("VacancyDatabase", () => {
  it("creates instance without opening IndexedDB", () => {
    const instance = new VacancyDatabase();
    expect(instance).toBeInstanceOf(VacancyDatabase);
    expect(instance.name).toBe("VacancyPilotDB");
  });

  it("has typed table accessors defined", () => {
    const instance = new VacancyDatabase();
    // Table accessors exist (Definite Assignment Assertion in class)
    expect(instance.jobs).toBeDefined();
    expect(instance.companies).toBeDefined();
    expect(instance.profiles).toBeDefined();
    expect(instance.resumes).toBeDefined();
    expect(instance.coverLetters).toBeDefined();
    expect(instance.applications).toBeDefined();
    expect(instance.events).toBeDefined();
    expect(instance.aiCache).toBeDefined();
    expect(instance.labsActions).toBeDefined();
    expect(instance.hrTimeline).toBeDefined();
    expect(instance.visitMarks).toBeDefined();
    expect(instance.meta).toBeDefined();
    expect(instance.syncOutbox).toBeDefined();
    expect(instance.opsCache).toBeDefined();
    expect(instance.opsMeta).toBeDefined();
  });
});
