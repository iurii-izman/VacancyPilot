# Current State

Reviewed checkout: branch `hotfix/hh-vacancy-hydration-v4-card`, Fix 4
data-lifecycle/local-security hardening on top of the Fix 3
execution/privacy/concurrency boundary, Fix 2 authoritative Ops read-model
correction, Pass 3 daily-use UX polish, and Fix 1 transport/mode-safety
baseline.
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
- The supported Companion launcher is project-owned and validates loopback
  binding before start. The default is `127.0.0.1:8765`; `localhost` and `::1`
  are the only accepted alternatives. It uses the OS keyring for its secrets,
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

The canonical effective-mode service requires both enabled Ops intent and
committed `ops` authority. Enabled intent before migration remains safe
Standalone/pending migration; disabling intent takes effect before stale
authority cleanup. Capability gates additionally require connected, paired,
compatible Companion status. The canonical HTTP idempotency header is
`X-VacancyPilot-Idempotency-Key`; blocked outbox entries remain pending.

The final local Applied mutation requires explicit confirmation that the user
submitted through native HH. Guided Apply preparation is checklist/clipboard
only, and its final local mutation plus HR/application/timeline Dexie writes
remain unavailable in effective Ops. Fix 2 corrects read authority; it does
not add an Ops write path.

## Fix 3 execution, privacy and concurrency

Executable AI operations are bound to current authoritative input and the
current explicit AI/privacy policy through one canonical provider plan. The
plan hash covers the exact provider messages, provider/model, provider-affecting
options, compiler and repair fingerprints, selected subject IDs, and privacy/
input fingerprints. Budget-limit and cache-only changes do not make a reviewed
plan stale.

```text
authoritative input + policy → canonical plan/hash → provider-free Preview
→ authenticated receipt → explicit confirmation → current-plan/policy checks
→ semantic single-flight claim → atomic budget reservation
→ durable dispatching → provider attempt → bounded repair → sanitized result
```

Missing or invalid execution policy, stale receipts, changed privacy/input
semantics, disabled AI, duplicate operations, and exhausted budgets fail closed
before dispatch. Preview does not call a provider or initialize/write receipt
signing state. Companion receipts use a dedicated OS-keyring secret; SQLite
owns the Companion execution/attempt ledger and Standalone Dexie owns its own
coordination ledger. Provider SDK retries are disabled, and a post-dispatch
timeout is outcome-unknown rather than automatically retried.

Provider-bound data is allowlist-first, recursively redacted before truncation,
and disclosed as an exact redacted dynamic payload. Raw provider output is a
transient in-memory repair input only: it is not persisted, logged, or exported.
Full V4 Preview retains the ADR-007 one-vacancy read-only hydration exception;
Application Factory Preview remains fully provider-free and side-effect-free.

## Surface truth

Options has six primary routes: Today, Discovery, Inbox, Pipeline, Candidate
and Settings. Legacy hashes are compatibility aliases into these workspaces;
they do not create applications or change status. Discovery owns HH Search
Profiles, while Companion owns pairing/recovery/migration and HH capability
configuration. Candidate contains Profile and Resume subviews. Settings
contains General, Companion & HH, AI, Privacy & Data, Permissions, About and
Advanced. Onboarding is hidden from normal navigation and is available on
first run or by manual rerun from Settings.

Pass 3 is presentation-only: the six-route IA remains unchanged. The current
UI uses clearer page hierarchy, compact action cards, styled tabs, core/secondary
Inbox filters, and actionable empty states. Fix 2 adds the authoritative Ops
work-item read model without changing the database schema or HH safety
boundary. Post-change production static render was inspected; final
unpacked-extension visual acceptance still needs human review. The projection
has targeted backend/frontend coverage and the generated OpenAPI snapshot plus
the checked-in TypeScript wire artifact are current.

Options and Side Panel authority is explicit: Standalone presentation reads
Dexie domain state; Ops presentation reads the Companion/SQLite work-item
projection. `/api/v1/ops/work-items` is a derived view only, not a persisted
third authority. Ops Inbox is one row per Vacancy, including no-Application
vacancies; Ops Pipeline is one row per Application. No Application is not
`new`, no analysis is not score `0`, provenance can be many-to-many, and
multiple Applications/follow-ups are retained as collections rather than
arbitrarily selected. Ops refresh does not write Standalone jobs or local
Application domain tables, and cached Ops data is never reinterpreted as
Standalone truth.

Settings are normalized and persisted under `app_settings_v1`; stale removed
UI-only keys are stripped on load, while API keys and the Companion token use
separate local storage slots. Deferred n8n/event/export fields remain only for
compatibility and redaction. The current Dexie schema is v7, with Dexie
migrations in `src/db/migrations.ts`; Companion schema changes are Alembic
migrations with one current head.

## Fix 4 data lifecycle and local security

Global reset is an extension-local operation guarded by a process-wide write
barrier and reset epoch. It drains admitted writes, blocks new writes, clears
all Dexie tables, clears the extension's `chrome.storage.local` and
`chrome.storage.session` namespaces, resets Companion client state and restores
safe Standalone defaults. It does not delete Companion SQLite, OS-keyring
secrets, the private engine, HH/provider data, browser history/cache or
passwords. In effective Ops it does not claim to delete the authoritative
Companion store. Standalone per-vacancy deletion cascades only structurally
linked local data, removes terminal linked outbox entries, blocks in-flight or
unknown outcomes, and is refused while Ops is authoritative.

The HH URL policy is centralized: navigation and stored/extracted references
must be HTTPS, exact `hh.ru`/subdomain authority, numeric `/vacancy/<id>`
paths, and matching ID/reference pairs; query and fragment values are not
trusted. Search badges use a closed Shadow DOM with a generic host and no
page-owned status/score/view state, global style injection, or HH card
hide/dim mutation. Quick actions require a trusted event and canonical
extension-owned reference, with background validation and current-tab binding.
Side Panel context is proved from the current live tab and is cleared on
navigation/failure rather than accepted from stale storage.

Companion HH sync requires explicit scope, caps each run at 50 profiles and
2,000 items, refuses duplicates/over-broad requests and single-flights
identical scopes. Follow-up timestamps validate before persistence. Pre-auth
rate limiting bounds expensive verification, engine health returns sanitized
metadata from a short-lived fingerprinted cache, and OAuth state is purged,
capped and consumed atomically. The runtime no longer persists or reads raw
provider output; a recognized-path, `--confirm`-gated scrub utility audits
legacy `engine_runs.raw_output` without printing values.

The complete Fix 4 evidence and exact data-scope contract are in
[`../development/FIX4_DATA_SECURITY_ACCEPTANCE.md`](../development/FIX4_DATA_SECURITY_ACCEPTANCE.md).

## Fix 5 engineering hygiene

Fix 5 is accepted as a repository-local engineering-hygiene pass. The
canonical OpenAPI snapshot now has a deterministic generated TypeScript
artifact and adapter wire map with compiler checks. Dexie v1–v7 coverage is
explicitly registered and exercised through upgrade tests. Workflow action
pins, dependency-review blocking, dependency dispositions, release artifact
privacy checks, and the provider-free `pnpm verify:all` gate are documented in
[`../development/FIX5_ENGINEERING_HYGIENE.md`](../development/FIX5_ENGINEERING_HYGIENE.md).
This does not claim live-provider V4 acceptance, final human visual
acceptance, SEC-SERVER-AUTH-001 closure, public-release readiness, or external
GitHub branch-protection configuration.

## Deferred / incomplete

- AOPS-14 Interview Pack: deferred, not started.
- Broader post-R5 product work remains deferred; Fix 5 engineering hygiene is
  accepted locally as recorded above.
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
