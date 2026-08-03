# Prompt AOPS-05 — Dexie Migration, Cache and Outbox

Implement only epic `AOPS-05` in the open VacancyPilot repository root.

Follow `../ZED_SESSION_START.md`: work only on synchronized `main`; do not
create a branch or PR, and leave commit/push to the Codex review gate.

## Goal

Add a safe transition from existing Dexie data to companion SQLite, plus an
offline outbox and cache, without changing authority silently or losing current
extension behavior.

## Read first

1. `AGENTS.md`
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 7, 11.1, 15.2–15.3
   and risk R3
3. ADR-002 and API/data contracts
4. Existing Dexie schema, migrations, repositories, export/delete code
5. Current OpsClient and companion repositories

## Required design

Add the next Dexie schema version with:

```text
syncOutbox
opsCache
opsMeta
```

Preserve every existing table and migration.

Implement the first-connection workflow:

1. calculate a local source snapshot and entity counts;
2. export a pre-migration JSON backup through existing safe export patterns;
3. call companion migration preview;
4. show inserts, updates, unchanged records and conflicts;
5. require explicit user confirmation;
6. perform idempotent import;
7. persist migration checkpoint/result;
8. switch to Ops authority only after successful commit;
9. retain the source backup and an understandable report.

Add explicit versioned endpoints, if not already frozen:

```text
POST /api/v1/migration/preview
POST /api/v1/migration/import
GET  /api/v1/migration/status
```

Update contracts/ADRs when adding them.

## Outbox

Implement:

- stable operation ID/idempotency key;
- entity type, operation, payload version, base revision, created time,
  attempt count, next attempt and last safe error code;
- FIFO processing with bounded exponential backoff and jitter;
- retry only for retryable transport/5xx/429-like local conditions;
- no retry for validation, auth or revision conflicts;
- explicit dead/conflict state visible to the user;
- online flush after reconnect and manual retry;
- deletion only after acknowledged idempotent success;
- no secrets/raw pairing token in payloads.

`opsCache` may store sanitized read models only. SQLite is canonical after
successful migration; Dexie must not become a second silent writer.

## Conflict policy

- append-only entities use idempotent add;
- mutable projections use revision checks;
- no last-write-wins without a visible conflict;
- migration preview never mutates;
- repeated import of the same snapshot creates no duplicates;
- partial server transaction rolls back cleanly.

## Lifecycle integration

Update:

- export/import format version;
- full local delete/reset;
- migration tests;
- privacy text where local companion data flow becomes visible;
- implementation status and API snapshot.

## Tests

Cover:

- Dexie upgrade preserves old data;
- preview counts and conflict report;
- preview has no server mutation;
- import idempotency;
- partial failure rollback;
- same outbox operation delivered twice creates one result;
- offline queue then reconnect flush;
- non-retryable conflict remains visible;
- export/delete include all three new tables and exclude token material;
- Standalone Mode remains authoritative before migration commit.

## Non-goals

- no vacancy parsing/triage yet;
- no hidden background sync;
- no scheduler;
- no auto conflict resolution;
- no HH/engine/provider work;
- no deletion of old Dexie data after migration.

## Acceptance criteria

- migration is previewed, explicit, idempotent and recoverable;
- authority switch cannot happen on failed/partial import;
- outbox retry cannot duplicate server state;
- conflict is visible and data is retained;
- standalone/offline workflows still pass.

## Validation

```powershell
pnpm verify
pnpm test:release
pnpm verify:companion
git diff --check
```

Include focused migration and outbox test command output.

## Handoff

Do not commit/push. Report export format and Dexie schema version changes.

Expected reviewed commit message:

```text
feat: add Ops migration and offline outbox
```
