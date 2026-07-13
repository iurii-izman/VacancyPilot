# ITER-013: Export And Delete

Epic: EPIC-08
Commit: `feat: add export and data deletion`

## Goal

Add CSV/JSON export and explicit local data deletion workflows.

## Scope

- CSV export.
- JSON export.
- Secret exclusion.
- Delete one job.
- Delete AI cache/logs.
- Delete all.
- Tests for export redaction.

## Non-Goals

- No import implementation.
- No cloud backup.

## Acceptance Criteria

- Export contains expected tracker fields.
- Export excludes API keys/secrets.
- Delete all clears local data.
- User-facing destructive action requires confirmation.

## Validation

```text
pnpm typecheck
pnpm test
```
