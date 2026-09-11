import { describe, expect, it } from "vitest";
import { isApplicationStatus } from "./hr-timeline-sync";

describe("HR timeline application semantics", () => {
  it("does not classify pre-application statuses as an application", () => {
    expect(isApplicationStatus("new")).toBe(false);
    expect(isApplicationStatus("viewed")).toBe(false);
    expect(isApplicationStatus("saved")).toBe(false);
    expect(isApplicationStatus("letter_ready")).toBe(false);
  });

  it("recognizes only post-submission tracking statuses", () => {
    expect(isApplicationStatus("applied")).toBe(true);
    expect(isApplicationStatus("hr_replied")).toBe(true);
    expect(isApplicationStatus("interview")).toBe(true);
    expect(isApplicationStatus("offer")).toBe(true);
  });
});
