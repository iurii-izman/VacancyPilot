# ITER-030: Passive Status And Side Panel Context

Epic: EPIC-14
Commit: `feat: integrate passive HH status parser and fix side panel context`

## Goal

Wire the already-existing passive HH status parser into the runtime flow and remove the fragile side-panel dependency on active-tab guessing.

## Inputs

- `docs/development/ITER-027-triage-report.md`
- current repository state after `ITER-029`

## Scope

- integrate `extractVisibleApplicationStatus()` into the vacancy extraction runtime path;
- surface passive HH status hints in popup and/or side panel without auto-changing saved job status;
- introduce explicit side-panel vacancy context through background-managed message/state;
- add focused tests for passive-status delivery and explicit context usage.

## Non-Goals

- no automatic status mutation from passive HH labels;
- no broader workflow/state-management rewrite;
- no search-page work.

## Acceptance Criteria

- runtime extraction can return passive HH status metadata;
- side panel can resolve vacancy context without relying on active-tab guessing;
- UI hints are informational only and keep the product read-first;
- automated coverage exists for the new runtime path.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
