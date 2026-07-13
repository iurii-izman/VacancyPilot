# ITER-021: Runtime QA Fixes

Epic: EPIC-11
Commit: `fix: address runtime qa findings`

## Goal

Address concrete runtime defects found during installed-extension manual QA and prepare a focused rerun.

## Scope

- Fix defects captured in manual QA notes.
- Tighten browser/runtime error handling if needed.
- Update QA artifacts with pass/fail deltas after rerun.

## Non-Goals

- No new feature expansion.
- No n8n implementation.
- No store-release packaging.

## Acceptance Criteria

- Previously failed core checks from the QA run are resolved or explicitly downgraded with evidence.
- Manual QA notes are updated with new outcomes.
- Remaining blockers are explicit and narrow.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
