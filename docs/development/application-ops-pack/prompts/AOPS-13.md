# Prompt AOPS-13 — Pipeline, Events and Follow-ups

Implement only epic `AOPS-13` in the open VacancyPilot repository root.

Follow `../ZED_SESSION_START.md`: work only on synchronized `main`; do not
create a branch or PR, and leave commit/push to the Codex review gate.

## Goal

Make applications operational after letter preparation: explicit state
transitions, append-only timeline, existing Kanban integration, next actions
and human-controlled follow-up drafts.

## Read first

1. `AGENTS.md`
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 11.4–11.5,
   12.5–12.6, 15 `applications/application_events/followups` and 16.6–16.7
3. Existing Kanban/status history/reminders/HR timeline code
4. Current application repositories, HH sync events and letter sent state

## Status model

Implement or reconcile:

```text
NEW
SAVED
ANALYZED
READY_TO_SEND
APPLIED
HR_REPLIED
INTERVIEW
TEST_TASK
OFFER
REJECTED_BY_COMPANY
REJECTED_BY_ME
ARCHIVED
```

Define allowed transitions and exceptional transitions explicitly. Do not
erase history when current status changes.

Rules:

- transition writes append-only `application_event` and current projection in
  one transaction;
- transition has source: user, HH read-only sync, migration, system reminder;
- HH ambiguous signal proposes rather than silently changes;
- `APPLIED` requires explicit user confirmation and a final/sent letter
  snapshot unless a documented non-letter application exception exists;
- no event claims an external action happened without user input or a
  documented HH signal;
- revision conflict is visible.

## API/UI

Complete:

```text
GET  /api/v1/applications
POST /api/v1/applications
PATCH /api/v1/applications/{id}
POST /api/v1/applications/{id}/events
GET  /api/v1/followups
POST /api/v1/followups
PATCH /api/v1/followups/{id}
POST /api/v1/followups/{id}/generate
```

Integrate with the existing Kanban instead of making another pipeline.
Application Card Timeline must show event source, time and safe summary.

## Follow-ups

Implement:

- configurable delay by reason/status;
- due/overdue/waiting/after-interview/after-test-task views;
- creation on explicit qualifying transition;
- manual complete/snooze/cancel;
- optional draft generation through existing provider/manual bridge contract;
- no automatic recruiter message;
- explicit sent confirmation/event;
- deterministic offline template when AI unavailable;
- existing local reminder infrastructure where compatible.

P0 must show due/overdue items even if browser notifications are deferred to
P1.

## Tests

Cover:

- allowed/forbidden transitions;
- event + projection transaction;
- revision conflict;
- APPLIED prerequisite;
- explicit vs HH event source;
- ambiguous HH signal proposal;
- duplicate HH event idempotency;
- follow-up due calculation/time zones;
- snooze/complete/cancel;
- offline draft;
- generated draft never auto-sends;
- Kanban DnD uses same transition service and handles rejection;
- export/timeline includes events but no secrets.

## Non-goals

- no automated external message;
- no new notification permission unless already present/required by existing
  reminder behavior;
- no Interview Pack;
- no analytics charts;
- no background daily HH sync.

## Acceptance criteria

- pipeline and timeline have one canonical transition path;
- no application is marked applied without evidence/user confirmation;
- follow-up due/overdue cannot disappear silently;
- draft/send are separate;
- old Kanban behavior is preserved or migrated explicitly;
- offline mode still shows local pipeline state.

## Validation

Apply the focused per-epic policy in `ZED_SESSION_START.md`. The broader
commands listed below are release-gate inventory, not mandatory for this epic;
run only directly affected tests/static/contract checks and `git diff --check`,
then report the rest as `DEFERRED_TO_RELEASE_GATE`.

Release-gate command inventory (do not run for this epic):

```powershell
pnpm verify
pnpm test:release
pnpm verify:companion
git diff --check
```

## Handoff

Do not commit/push. Include the transition matrix and time-control test output.

Expected reviewed commit message:

```text
feat: add Ops pipeline and follow-up workflow
```
