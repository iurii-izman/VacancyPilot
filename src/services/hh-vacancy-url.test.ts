import { describe, expect, it } from "vitest";
import {
  canonicalizeHhVacancyUrl,
  extractHhVacancyIdFromHref,
  extractHhVacancyIdFromUrl,
  isHhSearchUrl,
  isSupportedHhPageUrl,
  isCanonicalHhVacancyReference,
} from "./hh-vacancy-url";

describe("HH vacancy URL boundary", () => {
  it.each([
    ["https://hh.ru/vacancy/123456?from=search#top", "https://hh.ru/vacancy/123456"],
    ["https://spb.hh.ru/vacancy/123456/", "https://spb.hh.ru/vacancy/123456"],
    ["/vacancy/123456?from=search", "https://hh.ru/vacancy/123456"],
  ])("canonicalizes approved URL %s", (value, expected) => {
    expect(canonicalizeHhVacancyUrl(value)).toBe(expected);
    expect(extractHhVacancyIdFromUrl(value)).toBe("123456");
  });

  it.each([
    "http://hh.ru/vacancy/123456",
    "javascript:alert(1)",
    "data:text/html,<a href='https://hh.ru/vacancy/123456'>x</a>",
    "https://evil-hh.ru/vacancy/123456",
    "https://example.com/vacancy/123456",
    "https://user:pass@hh.ru/vacancy/123456",
    "https://hh.ru:443/vacancy/123456",
    "//evil-hh.ru/vacancy/123456",
    "https://hh.ru/vacancy/not-a-number",
    "https://hh.ru/vacancy/123/extra",
  ])("rejects unsafe or malformed URL %s", (value) => {
    expect(canonicalizeHhVacancyUrl(value)).toBeNull();
    expect(extractHhVacancyIdFromUrl(value)).toBeNull();
  });

  it("accepts only nested vacancy references on an approved HH redirect", () => {
    expect(
      extractHhVacancyIdFromHref(
        "https://hh.ru/redirect?target=%2Fvacancy%2F987654%3Ffrom%3Dsearch",
      ),
    ).toBe("987654");
    expect(
      extractHhVacancyIdFromHref(
        "https://evil-hh.ru/redirect?target=https%3A%2F%2Fhh.ru%2Fvacancy%2F987654",
      ),
    ).toBeNull();
  });

  it("binds an ID to the exact canonical URL", () => {
    expect(isCanonicalHhVacancyReference("123", "https://hh.ru/vacancy/123")).toBe(true);
    expect(isCanonicalHhVacancyReference("123", "https://hh.ru/vacancy/124")).toBe(false);
  });

  it("recognizes supported pages and search pages without trusting lookalikes", () => {
    expect(isSupportedHhPageUrl("https://hh.ru/applicant/resumes")).toBe(true);
    expect(isSupportedHhPageUrl("https://spb.hh.ru/search/vacancy")) .toBe(true);
    expect(isSupportedHhPageUrl("https://evil-hh.ru/search/vacancy")).toBe(false);
    expect(isHhSearchUrl("https://hh.ru/search/vacancy?text=ts")).toBe(true);
    expect(isHhSearchUrl("https://hh.ru/search/vacancy/123")).toBe(false);
  });
});
