# Prompt AOPS-02 — SQLite Domain and Migrations

Implement only epic `AOPS-02` in the open VacancyPilot repository root.

## Goal

Create the SQLite operational data foundation with Alembic migrations,
SQLAlchemy repositories, transactional invariants and tests. Do not expose the
full product API or build UI yet.

## Read first

1. `AGENTS.md`
2. `docs/development/CODEX-RUNTIME-BRIEF.md`
3. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 7, 13–16 and 20
4. ADR-002 and ADR-003
5. `DATA_MODEL_V1.md`
6. Current companion code/tests

## Required work

Implement under `companion/app/db/`, `companion/app/domain/`,
`companion/migrations/` and companion tests:

- SQLAlchemy 2 declarative models;
- Alembic configuration and initial revision;
- SQLite connection setup with foreign keys enabled, busy timeout, and an
  explicitly documented WAL decision;
- transaction/session boundary;
- UTC-aware timestamps serialized consistently;
- stable application-generated IDs;
- repositories/services for MVP entities.

The initial schema must cover:

- vacancies;
- vacancy snapshots;
- applications;
- application events;
- engine runs;
- evidence usage;
- cover letters;
- letter versions;
- follow-ups;
- interview packs;
- HH account metadata;
- HH sync runs;
- search profiles;
- settings.

Add fields needed for safe operation that are implicit in the MVP:

- `revision` or equivalent optimistic-concurrency field on mutable
  projections;
- uniqueness for `(source, source_vacancy_id)`;
- idempotency key/source event identity where repeat ingestion is expected;
- created/updated timestamps and required foreign keys;
- enums/check constraints for controlled states where practical.

Implement these invariants:

1. events, snapshots, engine runs and letter versions are append-only through
   repository APIs;
2. application status change writes an event and updates current projection in
   one transaction;
3. sent-letter snapshots cannot be overwritten through the repository;
4. secrets have no columns;
5. deletes cannot silently orphan domain rows;
6. duplicate intake can be represented idempotently.

Add a minimal DB health contribution to `/health`, without leaking local paths.

## Tests

Use temporary databases. Cover:

- clean migration to head;
- schema matches expected tables/constraints/indexes;
- migration downgrade/upgrade round-trip in a disposable DB;
- foreign keys actually enforce;
- unique vacancy identity;
- event + status transaction rollback behavior;
- append-only repository protections;
- immutable sent snapshot protection;
- optimistic revision conflict;
- no secret-named columns;
- health response for available/unavailable DB.

## Documentation

Update `DATA_MODEL_V1.md`, implementation status, companion README and OpenAPI
snapshot only as required. Document migration commands and DB location
selection. Do not store a real DB in Git.

## Non-goals

- no broad CRUD endpoints;
- no Dexie migration;
- no HH/AI/engine logic;
- no analytics calculations;
- no backup/restore implementation;
- no UI.

## Acceptance criteria

- fresh DB upgrades deterministically;
- repository invariants are enforced by tests, not comments only;
- DB contains no secrets;
- migration and model metadata agree;
- extension remains unaffected;
- all current companion and extension checks pass.

## Validation

```powershell
pnpm verify:companion
pnpm verify
pnpm test:release
git diff --check
```

Include the exact Alembic smoke commands used against a temporary DB.

## Handoff

Do not commit/push or include generated SQLite files.

Expected reviewed commit message:

```text
feat: add Ops SQLite domain foundation
```
