# ITER-004: Local Storage Schema

Epic: EPIC-01
Commit: `feat: add local storage schema`

## Goal

Create Dexie schema v1, migrations structure, and local settings storage boundary.

## Scope

- Dexie database wrapper.
- `db.version(1).stores(...)`.
- Migration file structure.
- Basic repository helpers for jobs/profiles/settings.
- Tests for DB initialization and schema version.

## Non-Goals

- No UI tracker.
- No export.
- No sync.

## Acceptance Criteria

- DB opens locally.
- Schema includes required tables.
- Migration structure is explicit.
- Settings and API key boundaries are documented in code comments or module names.

## Validation

```text
pnpm typecheck
pnpm test
```
