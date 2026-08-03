# Prompt AOPS-06 — Vacancy Intake, Deduplication and Local Triage

Implement only epic `AOPS-06` in the open VacancyPilot repository root.

Follow `../ZED_SESSION_START.md`: work only on synchronized `main`; do not
create a branch or PR, and leave commit/push to the Codex review gate.

## Goal

Deliver the first complete vertical slice: user-visible HH vacancy data enters
the companion idempotently, snapshots changes, receives explainable no-AI
triage, and remains usable offline.

## Read first

1. `AGENTS.md`
2. Runtime brief and existing HH parser/score/repository code
3. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 4, 7, 9.3 Stage A,
   11.1, 15.1, 16.4 and 20.6
4. ADR-002/004 and current contracts
5. Existing parser fixtures and release-safety tests

## Required work

Define a versioned `VacancyIntakeV1` contract with normalized:

- source and source vacancy ID;
- canonical user-visible URL;
- title and company identity/name;
- salary/currency;
- work mode/location;
- experience;
- visible description;
- visible skills;
- capture timestamp and capture source;
- parser/schema version.

Do not include cookies, DOM blobs, session data, hidden API data or contact
secrets.

Implement companion:

- `POST /api/v1/vacancies/intake`;
- `GET /api/v1/vacancies`;
- `GET /api/v1/vacancies/{id}`;
- `POST /api/v1/vacancies/{id}/triage`;
- idempotent upsert by `(source, source_vacancy_id)`;
- deterministic fallback identity only when source ID is truly absent;
- normalized description hash;
- new snapshot only when relevant normalized payload changes;
- first/last seen semantics;
- revision-aware response;
- clear duplicate/update/unchanged result.

Implement Stage A without LLM:

- work-format and remote-only hard gates;
- location/eligibility known/unknown handling;
- salary preference signal without inventing missing salary;
- title/role-family match using explicit configuration;
- known skill and vacancy keyword overlap;
- duplicate/archived/company-block signal;
- preliminary score components and explanations;
- explicit `NEEDS_INPUT` when a true mandatory gate cannot be resolved;
- no V4 evidence-level upgrade and no cover letter.

Reuse current explainable rule-based scoring where semantics match. Do not
maintain divergent extension/companion formulas silently; document shared or
versioned behavior.

Extension:

- wire the existing user-triggered vacancy save/analyze action to Ops intake;
- queue through the outbox when offline;
- show intake/triage result in the existing side panel;
- retain current standalone score when companion is offline;
- never fetch hidden HH data or send automatically on page load unless the
  existing explicit local capture contract already permits it.

## Fixtures/tests

Add sanitized fixtures for:

- same vacancy captured twice;
- description changed;
- missing company;
- missing salary;
- remote-anywhere;
- remote restricted and unresolved eligibility;
- office-required hard fail;
- malformed/oversized description;
- non-HH/manual source.

Test:

- idempotent upsert and stable first seen;
- one snapshot per actual change;
- retry/outbox duplicate safety;
- deterministic score/explanations;
- hard-gate precedence;
- `NEEDS_INPUT` behavior;
- parser DTO does not contain forbidden fields;
- no extension hidden fetch/permission change;
- API list/detail pagination and validation.

## Non-goals

- no official HH API yet;
- no Full V4/LLM/letter;
- no batch auto-analysis;
- no dashboard Inbox;
- no auto-created application unless explicitly required by frozen contract.

## Acceptance criteria

- open vacancy can be saved to Ops by explicit user action;
- duplicate intake creates no duplicate vacancy/snapshot;
- local triage works with no AI key;
- result is explainable and safe under missing data;
- offline capture retries idempotently;
- existing standalone behavior remains available.

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

Do not commit/push. Report any deliberate score-parity difference.

Expected reviewed commit message:

```text
feat: add idempotent vacancy intake and triage
```
