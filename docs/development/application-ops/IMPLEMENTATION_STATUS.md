# Application Ops — Implementation Evidence

This is a concise evidence index for the current checkout, not a roadmap.
Runtime code, tests, migrations and the generated OpenAPI snapshot outrank
dated acceptance reports.

## Current baseline

- Branch: `hotfix/hh-vacancy-hydration-v4-card`
- Code baseline at audit preflight: `e6c27c8`
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
| Settings | `src/models/settings.ts`, `src/db/settings-bridge.ts` | normalized `app_settings_v1`; API keys and Companion token are separate slots |
| Engine boundary | `companion/app/engine/`, local `.local/private-engine/` | real V4 stays local/private; no candidate knowledge is tracked |
| Application Factory | `src/components/ApplicationOpsWorkspace.tsx`, route/tests | Preview is provider-free; execute is explicit; queue never creates `APPLIED` |
| HH boundary | content scripts, Companion HH routes, release-safety tests | read-only DOM/API access; no HH form writes or hidden page requests |

## Options route truth

`entrypoints/options/App.tsx` defines six normal primary routes: Today,
Discovery, Inbox, Pipeline, Candidate and Settings. Legacy hashes map
deterministically into those workspaces and subviews; navigation does not create
applications or change status. Discovery owns Search Profile CRUD and preview;
Companion owns pairing, recovery, migration, HH account/auth and capability
configuration. Standalone Pipeline renders the existing Dexie Kanban board;
Ops Pipeline renders Companion-backed performance summaries and never treats
the local board as canonical. Onboarding is a hidden first-run/manual flow.

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
