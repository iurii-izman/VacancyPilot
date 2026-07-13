# EPIC-08: Export, Delete, And Data Ownership

## Goal

Give the user practical ownership of their local data through CSV/JSON export and deletion workflows.

## Scope

- CSV export.
- JSON export.
- Export without secrets.
- Delete one job.
- Delete cache/logs.
- Delete all data.
- Export before delete prompt.

## Non-Goals

- Import implementation in Phase 1.
- Cloud sync.
- Team sharing.

## Acceptance Criteria

- CSV includes core tracker fields.
- JSON includes structured local data and settings without secrets.
- Delete all clears local DB, cache, event logs, and settings according to spec.
- API keys never appear in export.

## Safety Notes

Data deletion must be explicit and confirmable. Do not silently wipe user data during migrations.
