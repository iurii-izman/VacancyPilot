// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { VacancyDatabase } from "./database";
import { SCHEMA_V1, SCHEMA_V6 } from "./schema";

const databaseNames = [
  "VacancyPilotDB-AOPS05-v1-to-v7-test",
  "VacancyPilotDB-AOPS05-v6-to-v7-test",
  "VacancyPilotDB-AOPS05-current-open-test",
];

afterEach(async () => {
  for (const name of databaseNames) {
    await Dexie.delete(name);
  }
});

describe("Dexie v1 to v7 upgrade", () => {
  it("preserves domain rows and adds every later store and index", async () => {
    const oldDatabase = new Dexie(databaseNames[0]);
    oldDatabase.version(1).stores(SCHEMA_V1);
    await oldDatabase.open();
    await oldDatabase.table("jobs").add({
      id: "hh_123",
      source: "hh",
      sourceVacancyId: "123",
      title: "Preserved vacancy",
      status: "saved",
      firstSeenAt: "2026-08-04T00:00:00Z",
      updatedAt: "2026-08-04T00:00:00Z",
    });
    await oldDatabase.table("meta").put({ key: "user-setting", value: "preserve-me" });
    oldDatabase.close();

    const upgraded = new VacancyDatabase(databaseNames[0]);
    await upgraded.open();

    expect(await upgraded.jobs.get("hh_123")).toMatchObject({
      title: "Preserved vacancy",
      status: "saved",
    });
    expect(await upgraded.meta.get("user-setting")).toEqual({
      key: "user-setting",
      value: "preserve-me",
    });
    expect(
      await upgraded.jobs.where("[source+sourceVacancyId]").equals(["hh", "123"]).count(),
    ).toBe(1);
    expect(upgraded.tables.map((table) => table.name)).toEqual(
      expect.arrayContaining([
        "labsActions",
        "hrTimeline",
        "visitMarks",
        "syncOutbox",
        "opsCache",
        "opsMeta",
        "aiExecution",
        "aiBudget",
      ]),
    );
    expect(upgraded.verno).toBe(7);
    upgraded.close();
  });
});

describe("Dexie v6 to v7 upgrade", () => {
  it("preserves Ops migration rows and creates usable Fix 3 coordination stores", async () => {
    const oldDatabase = new Dexie(databaseNames[1]);
    oldDatabase.version(6).stores(SCHEMA_V6);
    await oldDatabase.open();
    await oldDatabase.table("jobs").add({
      id: "hh_456",
      source: "hh",
      sourceVacancyId: "456",
      title: "Ops vacancy",
      status: "new",
      firstSeenAt: "2026-08-05T00:00:00Z",
      updatedAt: "2026-08-05T00:00:00Z",
    });
    await oldDatabase.table("syncOutbox").put({
      id: "outbox-1",
      sequence: 1,
      entityType: "job",
      operation: "upsert",
      createdAt: "2026-08-05T00:00:00Z",
      retryCount: 2,
      status: "pending",
      nextAttemptAt: "2026-08-05T00:00:00Z",
    });
    await oldDatabase.table("opsCache").put({
      key: "vacancy:456",
      entityType: "vacancy",
      entityId: "456",
      updatedAt: "2026-08-05T00:00:00Z",
      expiresAt: "2026-08-06T00:00:00Z",
      payload: { title: "cached" },
    });
    await oldDatabase.table("opsMeta").put({ key: "migration", value: "imported" });
    oldDatabase.close();

    const upgraded = new VacancyDatabase(databaseNames[1]);
    await upgraded.open();

    expect(await upgraded.jobs.get("hh_456")).toMatchObject({ title: "Ops vacancy" });
    expect(await upgraded.syncOutbox.get("outbox-1")).toMatchObject({
      retryCount: 2,
      status: "pending",
    });
    expect(await upgraded.opsCache.get("vacancy:456")).toMatchObject({
      entityId: "456",
      payload: { title: "cached" },
    });
    expect(await upgraded.opsMeta.get("migration")).toEqual({
      key: "migration",
      value: "imported",
    });
    await upgraded.aiExecution.put({
      operationKey: "analysis:456",
      providerPlanHash: "plan-hash",
      operationKind: "vacancy_analysis",
      provider: "openai",
      model: "gpt-test",
      state: "completed",
      ownerToken: "owner",
      attemptCount: 1,
      createdAt: "2026-08-05T00:00:00Z",
      updatedAt: "2026-08-05T00:00:00Z",
    });
    await upgraded.aiBudget.put({
      id: "budget-1",
      operationKey: "analysis:456",
      scope: "standalone",
      dayKey: "2026-08-05",
      attemptNumber: 1,
      state: "consumed",
      providerPlanHash: "plan-hash",
      createdAt: "2026-08-05T00:00:00Z",
    });
    expect(await upgraded.aiExecution.get("analysis:456")).toMatchObject({
      state: "completed",
      attemptCount: 1,
    });
    expect(await upgraded.aiBudget.get("budget-1")).toMatchObject({
      dayKey: "2026-08-05",
      state: "consumed",
    });
    expect(
      await upgraded.aiBudget.where("[scope+dayKey]").equals(["standalone", "2026-08-05"]).count(),
    ).toBe(1);
    upgraded.close();
  });
});

describe("current Dexie schema open", () => {
  it("opens and reopens at v7 without changing user rows", async () => {
    const first = new VacancyDatabase(databaseNames[2]);
    await first.open();
    await first.meta.put({ key: "sentinel", value: { retained: true } });
    expect(first.verno).toBe(7);
    first.close();

    const reopened = new VacancyDatabase(databaseNames[2]);
    await reopened.open();
    expect(reopened.verno).toBe(7);
    expect(await reopened.meta.get("sentinel")).toEqual({
      key: "sentinel",
      value: { retained: true },
    });
    reopened.close();
  });
});
