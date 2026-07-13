# ITER-005: HH Adapter Skeleton

Epic: EPIC-02
Commit: `feat: add hh vacancy parser skeleton`

## Goal

Add the adapter contract and a safe HH vacancy parser skeleton.

## Scope

- `SiteAdapter` interface.
- `RawVacancyDTO`.
- `HHAdapter.matchUrl`.
- `extractVacancy` skeleton.
- Selector version module.
- Parser warning result shape.

## Non-Goals

- No full extraction accuracy target yet.
- No live HH requests.
- No search parser.

## Acceptance Criteria

- Parser accepts `Document` or fixture HTML through a test helper.
- Missing fields return warnings, not thrown exceptions.
- Content script remains read-only.

## Validation

```text
pnpm typecheck
pnpm test
```
