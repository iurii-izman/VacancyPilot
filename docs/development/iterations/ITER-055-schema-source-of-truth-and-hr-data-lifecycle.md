# ITER-055: Schema Source Of Truth And HR Data Lifecycle

Epic: EPIC-29
Commit: `fix: align schema lifecycle utilities`

## Goal

Make local data lifecycle helpers reflect the actual current Dexie schema so export/delete/count behavior is trustworthy for every active store.

## Scope

- replace the old `TABLE_NAMES` derivation from `SCHEMA_V1` with a current-schema source of truth;
- ensure `exportAllJson()` includes all live stores, including `hrTimeline`;
- ensure `deleteAllData()` clears all live stores through the same source of truth;
- ensure `hasData()` and `getDataCounts()` include all live stores without stale special-casing;
- ensure `deleteJobData()` also removes HR timeline entries linked through deleted application records;
- add focused tests for schema/table coverage and lifecycle behavior.

## Non-Goals

- no scoring changes;
- no UI redesign;
- no migration boot wiring yet;
- no Sonar/Dependency Review work.

## Acceptance Criteria

- `TABLE_NAMES` reflects the current schema version rather than the original v1 table set;
- JSON export contains `hrTimeline`;
- delete-all clears `hrTimeline` and no longer relies on stale manual table exceptions;
- single-job deletion removes related `applications`, `events`, `coverLetters`, and linked HR timeline entries;
- `hasData()` and `getDataCounts()` reflect all live stores;
- tests cover the new lifecycle behavior.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
