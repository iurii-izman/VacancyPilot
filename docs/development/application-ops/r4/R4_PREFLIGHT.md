# R4 Preflight

Date: 2026-08-30

## Git baseline

| Check | Result |
|---|---|
| Repository | `C:/Dev/VacancyPilot` |
| Initial branch | `main` |
| Initial local SHA | `139f57fa2e84ef093e1ddf30546671fc041d3ee7` |
| Initial `origin/main` SHA | `139f57fa2e84ef093e1ddf30546671fc041d3ee7` |
| Working tree | clean at start |
| Expected R3 closure present | yes; `docs: close R3 HH data plane acceptance` |
| Push | pending final closure gates |

The accepted AOPS-12 and AOPS-13 implementations are merged on `main`. The
authoritative R3 baseline is `139f57fa2e84ef093e1ddf30546671fc041d3ee7`; no
repo-local copy of the pasted R3 prompt or private candidate package was found.

## Tooling

- pnpm 11.1.1
- Node.js v24.18.0
- Python 3.12.10
- uv 0.9.30
- WXT 0.20.26, React 19, TypeScript 6, Dexie 4.4.4, Vitest 3.2.6
- Companion OpenAPI snapshot: current (`pnpm companion:openapi-check`)
- SQLite migration head: `3b7a1d2e9f10` (`aops10_sync_result`)

## Current runtime map

The existing Options page is the only full-page dashboard React root. It uses
local section state rather than a router, with the `#onboarding` deep-link
special case. `Vacancies` renders the local Dexie Kanban; `Summary` is a local
daily summary; `Applications` and `Companies` are placeholders; profiles,
resumes, letters, settings, companion and privacy surfaces already exist.

The current persisted application statuses are `new`, `viewed`, `saved`,
`rejected_by_me`, `letter_ready`, `applied`, `hr_replied`, `interview`,
`test_task`, `rejected_by_company`, `offer`, and `blacklist`. The companion
already has SQLite `applications`, append-only `application_events`, engine
runs, evidence usage, letters and followups tables, but no application/followup
HTTP routers yet.

## R3 live capability matrix

| Capability | State |
|---|---|
| HH account | `AVAILABLE` |
| HH auth type | `applicant` |
| HH resumes | `DENIED_BY_HH` |
| HH negotiations | `DENIED_BY_HH` |
| HH writes | `FORBIDDEN_BY_PRODUCT` |

Denial is not represented as an empty result. The companion remains loopback,
SQLite is authoritative in Ops Mode, Dexie remains canonical in Standalone
Mode, and extension HH access remains read-only.

## Baseline checks

GitHub Actions for the baseline SHA reported completed success for CI,
SonarQube Cloud, and dependency update checks. OpenAPI drift is clean. The
broader R4 release-gate commands are run and reported at acceptance time.
