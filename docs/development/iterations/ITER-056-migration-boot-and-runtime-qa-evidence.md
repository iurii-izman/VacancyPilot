# ITER-056: Migration Boot And Runtime QA Evidence

Epic: EPIC-29
Commit: `fix: wire migrations and refresh runtime qa gate`

## Goal

Turn the existing migration helpers and runtime-permission assumptions into explicit, testable project behavior without broadening extension permissions.

## Scope

- ensure migration bookkeeping is invoked from safe extension boot surfaces;
- add focused migration tests for first-run, up-to-date, and pending-version behavior;
- refresh the manual QA docs/checklists for current active surfaces:
  - vacancy popup flow;
  - side panel open/context;
  - search quick actions;
  - HR timeline extraction;
  - export/delete;
  - Edge rerun;
- record the explicit decision that `tabs` permission remains out unless a reproducible runtime failure proves it necessary.

## Non-Goals

- no new permissions;
- no feature expansion;
- no new telemetry;
- no Sonar or GitHub policy changes.

## Acceptance Criteria

- migration helpers are not dead code and are invoked through a clear boot path;
- migration tests cover first-run and version-alignment behavior;
- QA docs/checklists reflect the current product surface after search + HR work;
- the repository contains an explicit documented runtime decision to keep minimal permissions.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
