# ITER-079: Visit Marks Foundation

Epic: EPIC-38

Status: done

Commit: `1d55ab0`

## Goal

Add the local data foundation for HH visual triage by recording vacancy-page visits in IndexedDB and wiring the new lifecycle surface into export/delete/migrations without creating viewed-only jobs.

## Scope

- add `visitMarks` model, schema entry, repository, and migration wiring;
- record a local visit mark when the user opens an HH vacancy page with VacancyPilot active;
- keep the write path deterministic and local-only;
- add any minimal settings shape needed for feature enablement defaults;
- include `visitMarks` in export/delete/lifecycle coverage;
- add release-safety checks that the feature does not introduce `history`, `tabs`, or broad HH host permissions.

## Non-Goals

- no search-card UI changes yet;
- no search toolbar/controls yet;
- no company history or duplicate logic;
- no creation of `Job` rows just because a page was viewed;
- no new permissions or hidden network behavior.

## Acceptance Criteria

- opening an HH vacancy page creates or updates a `visitMark`;
- `firstSeenAt` stays stable and `lastSeenAt` / `viewCount` update correctly;
- viewed-only data remains separate from saved job tracking;
- export/delete/migration coverage includes `visitMarks`;
- release-safety coverage guards against `history`, `tabs`, and broad HH host permissions.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
