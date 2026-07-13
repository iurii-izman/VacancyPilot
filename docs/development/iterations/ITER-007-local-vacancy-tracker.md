# ITER-007: Local Vacancy Tracker

Epic: EPIC-03
Commit: `feat: add local vacancy tracker`

## Goal

Allow saving and updating parsed vacancies in local storage.

## Scope

- Save job.
- Update job.
- Status transition helper.
- Status history.
- Event log entry for save/status change.
- Unit tests.

## Non-Goals

- No polished dashboard.
- No n8n.
- No passive HH status UI.

## Acceptance Criteria

- Saving same source vacancy updates existing record.
- Status changes append history.
- Events are local-only.
- Works without AI/network.

## Validation

```text
pnpm typecheck
pnpm test
```
