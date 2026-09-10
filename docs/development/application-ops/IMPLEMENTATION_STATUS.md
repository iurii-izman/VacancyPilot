# Application Ops — Implementation Evidence

This is a concise evidence index for the current checkout, not a roadmap.
Runtime code, tests, migrations and the generated OpenAPI snapshot outrank
dated acceptance reports.

## Current baseline

- Branch: `hotfix/hh-vacancy-hydration-v4-card`
- Pass 1 code baseline before the Pass 2 cleanup: `f47fa11`
- Product mode: **FEATURE DEVELOPMENT: FROZEN / REAL DAILY USE / DOGFOOD**
- Private engine: local metadata reports `4.0.1`; public fixtures intentionally
  include a synthetic `4.0.0` package for compatibility/regression coverage.
- Public fixture inventory at preflight: 19 vacancy fixtures and 3 search
  fixtures. This is below the master specification's eventual public-release
  target and is not represented as release-complete.

## Implemented and verified by source

| Area | Current authority | Truth |
| --- | --- | --- |
| Extension | `wxt.config.ts`, `entrypoints/`, `src/` | MV3 with `storage`, `sidePanel`, `activeTab`; no required HH host permission |
| Standalone storage | `src/db/schema.ts`, `src/db/database.ts`, `src/db/migrations.ts` | Dexie schema v6 is canonical |
| Ops storage | `companion/app/db/`, `companion/alembic/` | SQLite is canonical; Alembic has one current head |
| API contract | `shared/contracts/openapi.json`, FastAPI routers | Generated OpenAPI is canonical; old planning contract was retired |
| Ops UI read model | `companion/app/api/ops_projection.py`, `src/models/work-item.ts`, `src/components/ApplicationOpsWorkspace.tsx` | One authenticated bounded projection; derived view only, no new table or write endpoint |
| Settings | `src/models/settings.ts`, `src/db/settings-bridge.ts` | normalized `app_settings_v1`; obsolete UI-only keys are stripped; API keys and Companion token are separate slots |
| Engine boundary | `companion/app/engine/`, local `.local/private-engine/` | real V4 stays local/private; no candidate knowledge is tracked |
| Application Factory | `src/components/ApplicationOpsWorkspace.tsx`, route/tests | Preview is provider-free; execute is explicit; queue never creates `APPLIED` |
| HH boundary | content scripts, Companion HH routes, release-safety tests | read-only DOM/API access; no HH form writes or hidden page requests |

## Fix 1: transport and mode safety

- `companion/app/server.py` is the project-owned server entrypoint used by
  `scripts/start-companion.ps1`; it validates `127.0.0.1`, `localhost`, or
  `::1` and rejects wildcard/public binds before Uvicorn starts.
- `X-VacancyPilot-Idempotency-Key` is the single client/API/CORS contract;
  preflight and authenticated intake coverage exercise the same header.
- `src/services/operating-mode.ts` is the canonical effective-mode and
  transition service. Setting Ops intent does not declare Ops authority before
  migration commit; disabling intent blocks work first and repairs stale
  metadata without a settings feedback loop.
- `src/services/ops-capabilities.ts` gates Full V4, hydration, Search Profiles,
  Ops analytics, Application Factory, and Ops follow-ups on effective Ops plus
  connected/paired/compatible status. Safe Standalone actions remain visible.
- Outbox delivery, vacancy intake mirroring, side-panel HR extraction, Guided
  Apply final mutation, and status/application write paths have action-time
  guards. HR extraction no longer synthesizes Applied from pre-application
  statuses.
- Guided Apply preparation is distinct from the explicit native-HH-submission
  confirmation. Its final local mutation remains unavailable in Ops; Fix 2
  corrects read authority without adding that write path.

## Fix 2: authoritative Ops projection

OPS-AUTH-001 was reproduced in the pre-change path: Companion vacancy DTOs
were converted into synthetic local `Job` records, which invented
`status="new"` and dropped Application, EngineRun, follow-up, and provenance
identity before Today, Inbox, Pipeline, and the card rendered them. That path
is removed.

The implementation uses Option B from the corrective-pass decision tree: one
authenticated, read-only `GET /api/v1/ops/work-items` endpoint with
`view=vacancies`, `view=applications`, and `view=summary`. It reads existing
SQLite tables in bounded set-based queries, applies filters and sorting before
pagination, and exposes a hand-written frontend transport type pending the
Fix 5 generated-TypeScript pipeline. It performs no provider or HH call and
does not mutate Dexie, SQLite, or any application state.

Standalone presentation is built with `fromStandalone(Job)` and remains
Dexie-authoritative. Ops presentation is built with `fromOps(OpsWorkItem)` and
never accepts or returns a Standalone `Job`. Inbox has one row per Vacancy,
including no-Application vacancies. Pipeline has one row per Application; no
synthetic Application is created. The projection carries separate vacancy,
Application, analysis, follow-up, and provenance fields, including distinct
Companion Vacancy, HH vacancy, Application, EngineRun, Search Profile, and
FollowUp IDs. Multiple Applications and active follow-ups remain collections;
no arbitrary current record is selected. Multiple Search Profile hits are
preserved without duplicating Inbox rows.

No Application is `Not applied`, not `new`; no analysis is `Not analyzed`, not
score zero; invalid analysis does not expose a prior valid score; and a
Companion read failure is shown as unavailable rather than an empty child
source. Today counters come from the complete projection summary and the
existing analytics endpoint, never from the current Inbox page. Guided Apply
local mutation remains unavailable in Ops. Fix 3 execution/privacy/concurrency
work is intentionally not part of this pass.

## Options route truth

`entrypoints/options/App.tsx` defines six normal primary routes: Today,
Discovery, Inbox, Pipeline, Candidate and Settings. Legacy hashes map
deterministically into those workspaces and subviews; navigation does not create
applications or change status. Discovery owns Search Profile CRUD and preview;
Companion owns pairing, recovery, migration, HH account/auth and capability
configuration. Standalone Pipeline renders the existing Dexie Kanban board;
Ops Pipeline renders the Companion Application workflow and never treats the
local board as canonical. Onboarding is a hidden first-run/manual flow.

### Pass 3 daily-use UX polish

The final presentation pass keeps the six routes and all runtime contracts
unchanged. It improves page titles and hierarchy, compact cards and action
priority, styled tabs and buttons, the 860px full-label sidebar breakpoint,
Inbox filter disclosure, and actionable empty/error states. Fix 2 subsequently
added the bounded Ops read-model route; no DB schema, permission, private V4,
or HH safety behavior changed. Production static pages were rendered after the
changes; unpacked-extension visual acceptance remains
`VISUAL_ACCEPTANCE_NEEDS_HUMAN_REVIEW` until a human reloads the built extension.

## Full V4 and application safety

The application sequence is:

```text
Search Profiles / HH discovery
  → Inbox → vacancy card → Preview Full V4
  → explicit Confirm and run → review evidence/score/letter
  → manual HH application → explicit Confirm Applied → outcome tracking
```

Preview does not call a provider. If the selected HH vacancy is incomplete, the
analysis readiness path may perform an official read-only hydration first; that
persisted hydration is a known distinction from a fully non-mutating preview.
`SKIP` does not generate a letter. Copy/open actions do not mean
application sent, and no route automatically creates `APPLIED`.

## Historical evidence

The dated AOPS/R5 acceptance, recovery and security reports remain useful for
the state they tested. Their old test counts, branch names, routes and engine
versions must not be read as current status. The current daily workflow is in
[`r5/R5_DAILY_USE_READINESS.md`](r5/R5_DAILY_USE_READINESS.md); the architecture
decisions are in [`adr/`](adr/).

## Verification commands

Run from the repository root:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
pnpm verify:companion
pnpm verify:all
```

`verify:aops-workflow` was retired with the obsolete executor pack. It is not a
runtime or CI contract.

Pass 2 cleanup keeps persisted n8n/event/export fields only as compatibility
data, with no active n8n UI or delivery runtime. The obsolete daily Summary
renderer and reminder service were removed; Today and Pipeline/Performance are
the canonical current surfaces.
