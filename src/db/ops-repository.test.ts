import { describe, expect, it } from "vitest";
import { assertSanitizedOpsPayload } from "./ops-repository";

describe("Ops payload safety", () => {
  it("accepts versioned domain payloads", () => {
    expect(() => assertSanitizedOpsPayload({ schemaVersion: 1, title: "Vacancy" })).not.toThrow();
  });

  it.each(["clientToken", "api_key", "password", "authorization", "cookie"])(
    "rejects the sensitive field %s",
    (field) => {
      expect(() => assertSanitizedOpsPayload({ nested: { [field]: "value" } })).toThrow(
        "forbidden sensitive field",
      );
    },
  );
});
