# ITER-036: Search Triage Runtime Hardening

Epic: EPIC-20
Commit: `fix: harden search triage runtime`

## Goal

Make the search triage surface resilient on dynamic HH result pages and lock in safety/performance checks for the new surface.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `Phase 2`, `17.6`
- current repository state after `ITER-035`

## Scope

- handle dynamic card insertion/removal safely;
- dedupe re-render behavior on updated search lists;
- add search-surface safety/runtime tests;
- keep per-card rendering lightweight.

## Non-Goals

- no queue/dashboard work yet;
- no heavy client-side architecture rewrite;
- no background vacancy fetches.

## Acceptance Criteria

- search triage keeps working on dynamic HH result pages;
- repeat renders do not pile up duplicate UI;
- tests guard against performance/safety regressions.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
