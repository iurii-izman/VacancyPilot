# AOPS-13 Current State

## Existing domain

SQLite already contains `applications`, append-only `application_events` and
`followups`, with revisions and foreign keys. `ApplicationRepository.change_status`
updates the projection and event in the same session, but it accepts arbitrary
statuses and has no HTTP service. Existing status strings are:

`new`, `viewed`, `saved`, `rejected_by_me`, `letter_ready`, `applied`,
`hr_replied`, `interview`, `test_task`, `rejected_by_company`, `offer`,
`blacklist`.

The local Dexie tracker/Kanban uses the same legacy vocabulary and status
history. `HrWorkspace` captures read-only local HH timeline data and reminders;
it never sends messages. AOPS-12 added safe Application Card Timeline and
Follow-up placeholders. AOPS-09 owns immutable letter lifecycle snapshots.

## Compatibility mapping

| Legacy persisted value | Canonical AOPS-13 value | Compatibility |
|---|---|---|
| `new`, `viewed` | `NEW` | retained as review states |
| `saved` | `SAVED` | retained |
| `letter_ready` | `READY_TO_SEND` | API accepts canonical projection while old clients retain label |
| `applied`, `hr_replied`, `interview`, `test_task`, `offer` | same canonical meaning | retained |
| `rejected_by_me` | `REJECTED_BY_ME` | retained |
| `rejected_by_company` | `REJECTED_BY_COMPANY` | retained |
| `blacklist` | `ARCHIVED` | no destructive migration; legacy value remains readable |

`ANALYZED` is represented by an explicit transition and is added to the SQLite
constraint through an additive migration. No second canonical status model is
introduced.

## Current gaps addressed

- one validated transition service for API, Kanban and Application Card;
- event source/provenance and safe payload validation;
- explicit APPLIED confirmation, including a documented no-letter exception;
- paginated application and follow-up endpoints;
- deterministic due/overdue lifecycle and human-controlled draft generation.
