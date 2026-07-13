# ITER-023: Storage And Data Integrity Hardening

Epic: EPIC-13
Commit: `fix: harden vacancy storage and badge cleanup`

## Goal

Close the confirmed storage/data integrity issues around vacancy identity, upsert stability, and stale badge state.

## Scope

- add Dexie schema v2 with `[source+sourceVacancyId]`;
- switch vacancy lookup to the compound index;
- reject missing `sourceVacancyId` instead of creating `hh_unknown`;
- clean `badge_v1_hh_*` keys in:
  - `deleteAllData()`
  - `deleteJobData()`;
- add focused tests for migration/query/cleanup behavior.

## Non-Goals

- no save/status semantics changes;
- no score recompute logic;
- no parser heuristics work;
- no n8n work.

## Acceptance Criteria

- repeat save of the same vacancy resolves to the same stored job;
- no `hh_unknown` jobs can be created;
- delete-all and single-job deletion remove matching badge state;
- tests cover compound index lookup, migration safety, badge cleanup, and missing-ID rejection.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
