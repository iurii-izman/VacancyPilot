# EPIC-02: HH Vacancy Parser And Fixtures

## Goal

Read data from the HH vacancy page opened by the user, normalize it, and validate parser behavior with sanitized fixtures.

## Scope

- `SiteAdapter` contract.
- `HHAdapter`.
- Vacancy parser skeleton and fallback strategy.
- Fixture test harness.
- Initial sanitized fixture samples.
- Parser warning/failure behavior.

## Non-Goals

- No background opening of vacancies.
- No `fetch` to HH from content scripts.
- No search result badges yet.
- No auto-apply behavior.

## Acceptance Criteria

- Parser is a pure function over `Document` or HTML fixture.
- Missing fields do not crash the parser.
- Fixture tests run locally.
- Parser returns structured DTOs, not raw UI state.
- Content script remains read-only.

## Safety Notes

Prefer structured state only if it is already present in the opened page and does not require private endpoints.
