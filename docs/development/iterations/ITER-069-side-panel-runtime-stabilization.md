# ITER-069: Side Panel Runtime Stabilization

Epic: EPIC-35
Commit: `fix: stabilize side panel open flow`

## Goal

Fix the popup-to-side-panel runtime opening bug and the background boot synchronization warning without expanding permissions or changing product scope.

## Scope

- make the background entrypoint register listeners synchronously and move async boot work out of the main callback;
- split side-panel context persistence from side-panel opening;
- open the Chrome side panel directly from the popup user gesture path;
- make side-panel context loading more robust under short timing races;
- preserve or safely degrade badge-triggered side-panel behavior without adding HH automation;
- add focused runtime and release-safety coverage;
- document root cause, fix, and manual QA evidence.

## Non-Goals

- no dashboard/options redesign;
- no new permissions or host permissions;
- no hidden HH fetch/XHR;
- no branch/PR operations inside the implementation run;
- no feature expansion outside side-panel runtime reliability.

## Acceptance Criteria

- the background no longer emits the async main warning on reload;
- popup `Side Panel` opens the panel from a valid user gesture path or returns a clear user-facing error;
- side-panel context survives the popup handoff reliably enough for the current vacancy workflow;
- manifest permissions remain limited to the approved set;
- focused tests cover the main success/failure runtime paths.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
