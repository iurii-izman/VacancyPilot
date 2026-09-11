import { describe, expect, it } from "vitest";
import {
  contextMatchesTab,
  contextStorageKey,
  extractVacancyIdFromUrl,
  isFreshVacancyContext,
  sidePanelBindingStorageKey,
  type VacancyContext,
} from "./vacancy-context";

const context: VacancyContext = {
  tabId: 10,
  windowId: 20,
  vacancyId: "136022615",
  pageKind: "vacancy",
  timestamp: 10_000,
};

describe("vacancy context lifecycle helpers", () => {
  it("extracts only numeric IDs from supported HH vacancy URLs", () => {
    expect(extractVacancyIdFromUrl("https://hh.ru/vacancy/136022615")).toBe("136022615");
    expect(extractVacancyIdFromUrl("https://spb.hh.ru/vacancy/42?from=search")).toBe("42");
    expect(extractVacancyIdFromUrl("https://hh.ru/search/vacancy")).toBeNull();
    expect(extractVacancyIdFromUrl("http://hh.ru/vacancy/42")).toBeNull();
  });

  it("keys context by tab and requires the matching window", () => {
    expect(contextStorageKey(10)).toBe("vp_context_tab_10");
    expect(sidePanelBindingStorageKey(20)).toBe(
      "vp_side_panel_binding_window_20",
    );
    expect(contextMatchesTab(context, 10, 20, 10_001)).toBe(true);
    expect(contextMatchesTab(context, 11, 20, 10_001)).toBe(false);
    expect(contextMatchesTab(context, 10, 21, 10_001)).toBe(false);
  });

  it("rejects stale, future, and malformed context", () => {
    expect(isFreshVacancyContext(context, 10_001)).toBe(true);
    expect(isFreshVacancyContext(context, 25_001)).toBe(false);
    expect(isFreshVacancyContext({ ...context, timestamp: 10_001 }, 10_000)).toBe(false);
    expect(isFreshVacancyContext({ ...context, vacancyId: "" }, 10_001)).toBe(false);
  });
});
