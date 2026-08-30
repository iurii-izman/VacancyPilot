# AOPS-13 Runtime Contract

## Canonical transitions

All status mutations go through one transition service. The service validates
source, prerequisites and optimistic `revision`, then writes one
`application_event` and updates the `applications.status` projection in one
transaction. A stale revision is a visible 409.

| From | To | Source/prerequisite | Event | Follow-up |
|---|---|---|---|---|
| NEW | SAVED | explicit user | `status_changed` | none |
| SAVED | ANALYZED | explicit user/engine result | `status_changed` | none |
| ANALYZED | READY_TO_SEND | validated final letter | `status_changed` | none |
| READY_TO_SEND | APPLIED | explicit user confirmation; sent letter or `application_without_letter` reason | `application_confirmed` | optional idempotent no-response follow-up |
| APPLIED | HR_REPLIED | explicit user or unambiguous HH sync | `status_changed` | close waiting follow-up only explicitly |
| HR_REPLIED | INTERVIEW | explicit user | `status_changed` | none |
| INTERVIEW | TEST_TASK | explicit user | `status_changed` | none |
| TEST_TASK | OFFER | explicit user | `status_changed` | none |
| any active | REJECTED_BY_COMPANY / REJECTED_BY_ME / ARCHIVED | explicit user or accepted source | `status_changed` | no deletion |
| terminal | active status | explicit reopen only | `application_reopened` | preserve history |

An informational HH event such as employer viewing never implies
`HR_REPLIED`. Ambiguous HH signals are recorded as proposals/events with
`source=hh_sync`, not silent status changes.

## Follow-ups

Follow-ups are local records only. Storage states include `pending`, `scheduled`,
`snoozed`, `completed`, `cancelled`, plus legacy `sent` and `skipped`; their
rendered view derives due/overdue from UTC `due_at`. No external message is
sent. Create/complete/snooze/reschedule/cancel operations are explicit,
revision-checked and idempotent. Draft generation produces draft text only;
explicit user confirmation is required before recording `sent_at`.

AI is opt-in and never runs on list load. Offline draft text is a clearly
labeled deterministic template and never claims company-specific facts.

## Authority and safety

SQLite is canonical in Ops Mode; Dexie local behavior remains authoritative in
Standalone Mode. HH capability denial does not remove local follow-ups. No
cookies, OAuth tokens, provider secrets, raw upstream payloads or private V4
knowledge are persisted in events or exposed by these endpoints.
