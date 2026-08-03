# AOPS-15 — Analytics, Outcomes, and Pilot Export

You are implementing one bounded epic in the existing VacancyPilot repository.

## Mandatory session contract

Read and follow `../ZED_SESSION_START.md` before changing anything. Work only
on synchronized `main`; do not create/switch branches or open a PR. Do not
commit or push; leave that to the Codex review gate after PASS.

## Goal

Implement evidence-backed Application Ops analytics and a pilot export without changing scoring policy, auto-calibrating the engine, or fabricating outcomes. The dashboard must help a candidate understand the funnel while remaining honest for zero-data and small-sample states.

## Read first

1. Repository `AGENTS.md` and applicable nested instructions.
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md`.
3. AOPS-00 contracts/ADRs and the handoff from AOPS-14.
4. Existing analytics, export, scoring, application, pipeline, and production-pilot code.
5. Existing tests and UI conventions.

If earlier AOPS acceptance evidence is missing or the working tree contains unrelated changes, stop and report `BLOCKED`; do not reconstruct previous epics or overwrite user work.

## Scope

Implement the MVP analytics contract using persisted applications, status events, analysis results, letter revisions, and explicit user outcomes:

- funnel counts and conversion rates using documented denominators;
- sent-to-response time and median response time;
- stage and offer rates;
- breakdowns by role family, source, and score band;
- edit rate and proof/claim challenge indicators;
- explicit rejection-reason distribution;
- stable definitions for “sent”, “response”, “stage”, “offer”, and excluded records;
- zero-data, insufficient-data, and populated UI states;
- small-sample warnings and sample-size display;
- filter support required by the P0 specification only;
- read-only analytics API(s) and typed client integration;
- export of sanitized pilot evidence suitable for the existing production-pilot workflow, preserving application/run IDs and provenance without secrets or raw provider credentials.

Prefer SQL aggregation for authoritative server metrics. Keep presentation formatting in the extension. If the repo already has analytics/export surfaces, extend them rather than introducing a parallel dashboard.

## Hard constraints

- Do not modify V4 scoring thresholds, weights, gates, rubrics, or evidence policy.
- Do not infer a rejection reason or business outcome that the user did not record.
- Do not automatically recalibrate or retrain anything from outcomes.
- Do not present correlation as causation.
- Do not upload telemetry or analytics.
- Do not insert demo data into the user database.
- Keep local-only operation and standalone extension behavior intact.

## Required tests and fixtures

Add deterministic tests for at least:

- empty dataset;
- one-record and other small-sample datasets;
- populated funnel with known conversion denominators;
- applications not yet sent;
- repeated status events and latest-state projection;
- response-time calculation, including missing timestamps;
- score-band boundaries;
- role/source grouping and unknown values;
- explicit rejection reasons and absent reasons;
- edit/proof/challenge rates;
- sanitized pilot export and secret-field exclusion;
- API/client contract and UI loading/error/offline states.

Use fixed timestamps and synthetic records. Avoid assertions dependent on local timezone.

## Acceptance criteria

- Every displayed metric has a documented definition and reproducible denominator.
- Empty and small samples cannot be mistaken for statistically meaningful results.
- Calculations match deterministic fixture expectations on both API and UI boundaries.
- Pilot export is deterministic, schema-versioned, sanitized, and traceable to local records.
- Analytics are read-only and cause no HH, provider, or telemetry network calls.
- No V4 runtime policy was changed.
- All relevant companion, extension, type, lint, and contract tests actually pass.

## Validation

Apply the focused per-epic policy in `ZED_SESSION_START.md`. The broader
commands listed below are release-gate inventory, not mandatory for this epic;
run only directly affected tests/static/contract checks and `git diff --check`,
then report the rest as `DEFERRED_TO_RELEASE_GATE`.

Run narrow analytics and pilot-report tests plus directly affected static and
contract checks. Record exact commands, exit codes, and concise results. If a
test requires live HH or provider credentials, report it as `NOT RUN` or
`BLOCKED`; never count it as passed.

## Handoff

Return:

1. `STATUS: READY_FOR_CODEX_REVIEW`, `NEEDS_FIX`, or `BLOCKED`;
2. concise implementation summary;
3. files changed;
4. metric definitions and denominators;
5. tests added;
6. exact validation commands and results;
7. assumptions, risks, and any `NOT RUN` checks;
8. explicit confirmation that V4 policy and external automation were not changed.

Do not commit or push.
