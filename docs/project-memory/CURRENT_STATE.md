# Current State

Reviewed checkout: branch `hotfix/hh-vacancy-hydration-v4-card`, commit
`2595c145bc73f52a215b9632fae3daa14cbce2bf` before this Pass 1 UI structure
change.
The worktree was clean at audit preflight. This document is the current
runtime/status snapshot; dated acceptance reports are historical evidence.

## Product and operating mode

VacancyPilot is a local-first, user-controlled HH.ru copilot for discovery,
read-only vacancy intake, deterministic triage, explainable Full V4 analysis,
evidence-aware cover-letter preparation, manual application preparation and
tracking, follow-ups, and descriptive conversion feedback.

**FEATURE DEVELOPMENT: FROZEN**
**MODE: REAL DAILY USE / DOGFOOD**

The product is pre-release and is not an auto-apply bot. HH browser interaction
is read-only; applying, sending, and recording `APPLIED` remain explicit user
actions outside automated HH controls.

## Runtime truth

- Standalone is WXT/Manifest V3/TypeScript/React with Dexie/IndexedDB as the
  canonical domain store and `chrome.storage.local` for settings and small
  state.
- Ops Mode is an explicitly paired loopback FastAPI Companion. SQLite plus
  Alembic is canonical there; Dexie is cache/outbox metadata.
- The Companion binds to `127.0.0.1:8765`, uses the OS keyring for its secrets,
  exposes the generated OpenAPI contract, and performs only official
  read-only HH API reads.
- Current local private engine metadata reports Application Engine `4.0.1`.
  The public `4.0.0` engine fixture and bridge prompt compatibility are
  synthetic/compatibility artifacts, not the installed private package.
- Canonical local paths are `.local/private-engine/`,
  `.local/data/companion/engine/`, and
  `.local/data/companion/vacancypilot.db`; these are ignored and must stay out
  of Git.

## Workflow and safety

Search Profiles / HH discovery → Inbox → open vacancy → Full V4 Preview →
explicit Confirm and run → review evidence, score and letter → apply manually
on HH → explicit Confirm Applied → track outcomes.

Application Factory Preview makes no provider call. Execution requires explicit
confirmation. Queue preparation produces `READY_FOR_MANUAL_APPLY` or `SKIPPED`
and never creates an application or `APPLIED`. Full V4 Preview is provider-free,
but an incomplete selected HH vacancy may first be hydrated through the
official read-only API and persisted; the daily guide calls out that nuance.

Binding invariants: no auto-submit, auto-apply, auto-click, HH form writes,
synthetic HH form events, hidden HH requests, CAPTCHA bypass, cookie/password/
session handling, external recruiter/follow-up sending, or developer telemetry
by default. Generated text is never evidence; `SKIP` generates no letter.

## Surface truth

Options has six primary routes: Today, Discovery, Inbox, Pipeline, Candidate
and Settings. Legacy hashes are compatibility aliases into these workspaces;
they do not create applications or change status. Discovery owns HH Search
Profiles, while Companion owns pairing/recovery/migration and HH capability
configuration. Candidate contains Profile and Resume subviews. Settings
contains General, Companion & HH, AI, Privacy & Data, Permissions, About and
Advanced. Onboarding is hidden from normal navigation and is available on
first run or by manual rerun from Settings.

Settings are normalized and persisted under `app_settings_v1`; API keys and the
Companion token use separate local storage slots. The current Dexie schema is
v6, with Dexie migrations in `src/db/migrations.ts`; Companion schema changes
are Alembic migrations with one current head.

## Deferred / incomplete

- AOPS-14 Interview Pack: deferred, not started.
- Full canonical AOPS-15 analytics/production pilot: incomplete; only the
  bounded R5 slice is accepted.
- Backup/recovery redesign, public release, V4.1 and new providers: backlog or
  later product decision.
- `n8n` / Telegram: deferred pending an explicit permission-model decision.
- No new live-provider Full V4 acceptance has been recorded after the current
  vacancy hydration/card hotfix line; do not infer it from older reports.

## Navigation

Use [`../../README.md`](../../README.md) for the product overview,
[`../development/LOCAL_SELF_CONTAINED_SETUP.md`](../development/LOCAL_SELF_CONTAINED_SETUP.md)
for setup, [`../development/application-ops/r5/R5_DAILY_USE_READINESS.md`](../development/application-ops/r5/R5_DAILY_USE_READINESS.md)
for daily operation, and [`../development/application-ops/IMPLEMENTATION_STATUS.md`](../development/application-ops/IMPLEMENTATION_STATUS.md)
for evidence and verification.
