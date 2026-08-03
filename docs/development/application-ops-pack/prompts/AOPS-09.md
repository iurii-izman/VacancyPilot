# Prompt AOPS-09 — Letter Lifecycle, Manual Bridge and Diff

Implement only epic `AOPS-09` in the open VacancyPilot repository root.

Follow `../ZED_SESSION_START.md`: work only on synchronized `main`; do not
create a branch or PR, and leave commit/push to the Codex review gate.

## Goal

Complete the human-controlled letter workflow: generate or manually import a
V4 result, validate it, preserve generated/final/sent versions separately,
calculate meaningful diffs, and never write to the HH form.

## Read first

1. `AGENTS.md`
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 10.2, 11.3, 13, 15
   `cover_letters/letter_versions`, 16.5 and risk R5
3. Existing Cover Letter Studio, copy actions, AI UI and storage models
4. Current V4 analysis schema/validators and API contracts

## Required lifecycle

Support explicit states/versions:

- provider-generated;
- manual ChatGPT-imported;
- user-edited draft versions;
- reviewed final;
- immutable actually-sent snapshot.

Do not equate “copied” with “sent.” Marking sent requires explicit confirmation
and timestamp. A sent snapshot can be superseded only by a new append-only
snapshot/event, never overwritten.

Implement:

```text
POST /api/v1/applications/{id}/letters/generate
POST /api/v1/applications/{id}/letters/import
PUT  /api/v1/applications/{id}/letters/final
POST /api/v1/applications/{id}/letters/sent
GET  /api/v1/applications/{id}/letters/diff
```

If the frozen contract uses a different safe verb/path, update all contracts
and explain the change.

## Manual ChatGPT Project bridge

UI actions:

```text
Generate via API
Copy prompt for ChatGPT
Import ChatGPT response
```

Implement:

- copyable compiler output with input hash/prompt version;
- no API key required;
- paste/import of structured JSON or clearly delimited V4 response;
- local schema and literal validation identical to automated mode;
- unknown evidence IDs and unsupported claims rejected;
- import never claims ChatGPT Project was configured automatically.

## Review gate

- QA FAIL may be stored as invalid draft but cannot become final/ready/sent;
- final text is visibly editable;
- show validation errors near affected field/section;
- copy action copies only intended letter content;
- no text after signature;
- no hidden gap/self-disqualification;
- user sees generated source/provider/model/prompt/engine metadata.

## Diff metrics

Calculate and persist deterministically:

- generated and sent word counts;
- normalized edit ratio;
- sentences/phrases added and removed;
- opening changed;
- closing changed;
- claim-related sentence changed;
- gap text removed;
- words added/removed.

Do not claim manual edits are improvements. Avoid heavyweight diff
dependencies unless justified.

## Extension UI

Extend the existing Cover Letter Studio/Application surface; do not create a
second letter editor. Add accessible loading/error/invalid/reviewed/sent states
and explicit copy/confirm actions.

## Tests

Cover:

- valid generated → final → sent;
- QA fail cannot finalize/send;
- manual import uses same validator;
- immutable sent snapshot;
- copied is not sent;
- version ordering and transaction behavior;
- empty/identical/fully changed/Unicode/English diff;
- opening/closing metrics;
- no secret/provider payload in exported letter metadata;
- no DOM form write, auto-click or HH submit code;
- existing Cover Letter Studio regressions.

## Non-goals

- no automated application send;
- no follow-up;
- no analytics charts yet;
- no provider auto-selection;
- no assumption that imported text came from a trusted source.

## Acceptance criteria

- generated, final and sent are separate auditable snapshots;
- sent snapshot immutable;
- manual bridge works without an AI key;
- final/sent require literal QA PASS;
- diff is stored and reproducible;
- extension never writes to HH controls/forms.

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

Do not commit/push. Include a state-transition table and focused test output.

Expected reviewed commit message:

```text
feat: add reviewed V4 letter lifecycle
```
