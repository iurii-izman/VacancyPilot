# Prompt AOPS-12 — Command Center, Inbox and Application Card

Implement only epic `AOPS-12` in the open VacancyPilot repository root.

Follow `../ZED_SESSION_START.md`: work only on synchronized `main`; do not
create a branch or PR, and leave commit/push to the Codex review gate.

## Goal

Expose the working Ops backend inside the existing full-page React dashboard:
one navigation extension, a useful Command Center and Inbox, and an
evidence-aware Application Card. Do not create a separate frontend.

## Read first

1. `AGENTS.md`
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 11, 12.1–12.4 and
   12.8
3. Existing dashboard routes/layout/components/styles/tests
4. Current Ops API/shared contracts and standalone dashboard behavior
5. Existing accessibility and responsive patterns

## UI architecture

Extend the existing dashboard navigation:

```text
WORK
  Command Center
  Inbox
  existing/compatible Application/Pipeline surfaces
KNOWLEDGE
  existing Profiles/Resumes
  Engine Health
SYSTEM
  HH Integration
  AI Providers
  existing Import/Export/Privacy/Settings
```

Consolidate, do not duplicate, existing Summary/Applications/Companies/Kanban
features. Preserve old deep links or provide explicit internal redirects.

## Command Center

Use one companion overview/read-model endpoint or a bounded set of existing
queries. Show:

- new/high-priority vacancies;
- ready-to-send;
- follow-ups due;
- updated HH responses;
- upcoming interviews;
- missing outcomes;
- companion, engine, provider, HH and backup health.

Each count/card must link to an actionable filtered view. Provide loading,
empty, offline, incompatible and partial-error states. In Standalone Mode,
show current local capabilities and explain unavailable Ops features without
breaking the dashboard.

## Inbox

Implement server-backed pagination/filtering for P0:

- source/search profile;
- score band/decision;
- work mode;
- date;
- duplicate/archive;
- analysis status.

P1 role-family/salary-rich filtering may be deferred if not already in the
contract.

Show list/table cards with vacancy identity, source, triage/full score,
decision, hard gate, analysis state and updated time.

Actions:

- open;
- save/analyze one;
- archive/reject locally;
- select and analyze explicitly selected items only when provider preview and
  confirmation exist.

No automatic bulk provider calls.

## Application Card

Implement tabs within the existing application surface:

1. Overview
2. Vacancy
3. Evidence
4. Score
5. Letter
6. Timeline
7. Follow-up
8. Interview
9. Debug

This epic must fully wire Overview, Vacancy, Evidence, Score, Letter and safe
Debug metadata. Later epics fill the remaining domain tabs.

Evidence view shows:

- central requirements;
- evidence level;
- claim/case/portfolio IDs;
- allowed wording;
- boundary/risk;
- no hidden private raw knowledge not needed by UI.

Score shows components, hard gates, caps, final decision and confidence.
Letter reuses AOPS-09 editor/review workflow.

Debug is opt-in and sanitized: IDs, versions, hashes, error codes and timings,
not secrets/raw private provider payload.

## Engine Health

Surface real engine status/counts/version/hash/regression state without
candidate text. Link actionable install/repair guidance; never auto-repair.

## Tests

Add component/integration tests for:

- online populated/empty states;
- companion offline fallback;
- partial health failure;
- filtering/pagination URL/state;
- no duplicate dashboard route/shell;
- application tab navigation/deep link;
- evidence/cap rendering;
- QA-invalid letter cannot appear ready;
- keyboard navigation/focus/labels;
- narrow side-panel/full dashboard layout as applicable;
- no unsafe automatic network action.

## Non-goals

- no full Pipeline/follow-up implementation;
- no Interview Pack;
- no analytics charts;
- no design-system rewrite;
- no Streamlit/second frontend;
- no P1 filter explosion.

## Acceptance criteria

- core Ops workflow is visible in the existing dashboard;
- loading/error/empty/offline states are tested;
- evidence and score are explainable;
- application letter uses the existing reviewed lifecycle;
- critical actions keyboard-accessible;
- standalone extension remains useful.

## Validation

Apply the focused per-epic policy in `ZED_SESSION_START.md`. The broader
commands listed below are release-gate inventory, not mandatory for this epic;
run only directly affected tests/static/contract checks and `git diff --check`,
then report the rest as `DEFERRED_TO_RELEASE_GATE`.

Release-gate command inventory (do not run for this epic):

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
pnpm verify:companion
git diff --check
```

## Handoff

Do not commit/push. Provide route/component/API change map and screenshots only
if generated from a real local build.

Expected reviewed commit message:

```text
feat: add Application Ops command workspace
```
