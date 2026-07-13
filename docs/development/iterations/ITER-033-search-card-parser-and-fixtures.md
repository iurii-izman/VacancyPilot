# ITER-033: Search Card Parser And Fixtures

Epic: EPIC-20
Commit: `feat: add hh search card parser`

## Goal

Create the safe DOM-only read layer for HH search result cards before any badge UI or quick-action behavior is added.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `5.5`, `Phase 2`, `17.6`
- current repository state after `ITER-032`

## Scope

- add search-card parser types/contracts;
- parse only fields visible on the search card DOM;
- add sanitized search-card fixtures and fixture tests;
- do not fetch or infer full vacancy details from hidden sources.

## Non-Goals

- no badge rendering yet;
- no quick save/reject yet;
- no queue/dashboard work yet.

## Acceptance Criteria

- parser extracts stable visible card fields from fixtures;
- fixture harness covers the initial search-card matrix;
- no hidden fetch or vacancy-page opening is introduced.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
