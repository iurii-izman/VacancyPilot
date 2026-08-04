// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { VacancyDatabase } from "./database";
import { SCHEMA_V5 } from "./schema";

const databaseName = "VacancyPilotDB-AOPS05-upgrade-test";

afterEach(async () => {
  await Dexie.delete(databaseName);
});

describe("Dexie v5 to v6 upgrade", () => {
  it("preserves existing rows while adding the three Ops stores", async () => {
    const oldDatabase = new Dexie(databaseName);
    oldDatabase.version(5).stores(SCHEMA_V5);
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
    oldDatabase.close();

    const upgraded = new VacancyDatabase(databaseName);
    await upgraded.open();

    expect(await upgraded.jobs.get("hh_123")).toMatchObject({
      title: "Preserved vacancy",
      status: "saved",
    });
    expect(upgraded.tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(["syncOutbox", "opsCache", "opsMeta"]),
    );
    upgraded.close();
  });
});
