# EPIC-01: Domain Models And Local Storage

## Goal

Implement the local contracts that all features use: typed domain models, Dexie schema v1, migrations, settings, and safe local persistence.

## Scope

- TypeScript model contracts from master spec section 10.
- Dexie database wrapper.
- Schema versioning from day one.
- Settings storage.
- AI cache table.
- Basic migration tests.

## Non-Goals

- No real HH parser behavior.
- No AI provider calls.
- No UI polish.
- No sync/backend.

## Acceptance Criteria

- Models compile and are exported from stable module paths.
- Dexie schema has `version(1)`.
- Migration structure exists.
- API keys are not stored in IndexedDB.
- JSON export excludes secrets by design.

## Safety Notes

Local-first does not mean secure vault. Keep API key handling separate and explicit.
