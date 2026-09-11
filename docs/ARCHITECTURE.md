# Architecture

VacancyPilot has two local surfaces and one explicit privacy boundary.

```text
HH pages opened by the user
  └─ read-only DOM parsing → WXT extension UI
       ├─ Standalone: Dexie/IndexedDB + chrome.storage.local
       └─ Ops Mode: paired loopback API → FastAPI Companion
            ├─ SQLite + Alembic
            ├─ OS keyring
            ├─ official read-only api.hh.ru access
            └─ local/private V4 engine package
```

## Extension

The WXT Manifest V3 extension uses TypeScript and React. Standalone Mode keeps
the domain in Dexie/IndexedDB. `chrome.storage.local` holds normalized settings,
small UI state, the standalone BYOK path, and the separately stored Companion
client token. The current Dexie schema is v7 and its migration history is
executable authority.

The Options app exposes exactly six primary routes: Today, Discovery, Inbox,
Pipeline, Candidate and Settings. Legacy hashes remain compatibility aliases:
application/vacancy/summary/profile/resume/system hashes resolve into the
canonical workspace and subview without creating data. Onboarding is a hidden
first-run/manual flow. Discovery owns HH Search Profiles; Companion owns
pairing, recovery, migration, account/auth and capability configuration.
Standalone Pipeline is the Dexie/Kanban source of truth; Ops Pipeline exposes
the Companion Application workflow and does not present the local board as
canonical. In Ops, Inbox and the Application Card use the bounded
`/api/v1/ops/work-items` read model; a vacancy with no Application remains a
vacancy row, while Pipeline has one row per authoritative Application.

The current presentation pass keeps this route and data architecture intact.
It consolidates daily-use hierarchy around clear page titles, compact cards,
core-versus-secondary filters, actionable empty states and explicit preview or
confirmation actions. The mode-safety pass adds capability-derived gates at
the UI and action boundaries without changing the product's read-only HH
boundary.

### Generated Companion wire contract

The FastAPI-generated snapshot at `shared/contracts/openapi.json` is the
canonical Companion API contract. `pnpm contracts:generate` produces the
type-only `shared/contracts/generated/openapi-types.ts` module, while
`src/adapters/companion/wire-types.ts` provides stable adapter aliases and
explicitly documented view refinements for legacy open-object HH responses.
`pnpm contracts:check` validates FastAPI snapshot drift, deterministic
generation and generated-output privacy. Critical operation IDs are kept in
the TypeScript compiler surface by `contract-compile-checks.ts`; generated
types are not bundled into the extension runtime.

The current Dexie schema is v7. Its explicit migration-coverage registry is
independent from the schema object chain, and actual fake-IndexedDB tests cover
v1/v6 upgrades, row/index preservation, v7 coordination stores and a current
schema reopen.

### Ops read-model boundary

The Ops projection is a derived read model over the existing SQLite tables. It
does not add a table, reconcile Dexie, or introduce a second write path. The
single authenticated `GET /api/v1/ops/work-items` endpoint serves bounded
vacancy, Application, and summary views with server-side filters and
filter-before-pagination. Set-based queries load related Applications,
EngineRuns, follow-ups, snapshots, and Search Profile hits; the browser does
not perform vacancy-by-vacancy joins.

The projection carries `vacancyState`, `applicationState`, `analysisState`,
and `followUpState` separately. `none` Application state is not `new`, no
analysis is not score zero, and unavailable data is not an empty authoritative
collection. The latest persisted analysis run is shown according to its
validity; an invalid latest run does not silently fall back to an older score.
Search Profile provenance is a collection because a vacancy may have multiple
authoritative hits. Standalone UI remains Dexie-authoritative, while Ops UI
never projects Companion state into Standalone `Job` or Application records.

## Companion

Ops Mode is opt-in and paired through a terminal code. The supported
project-owned `app.server` entrypoint validates a loopback bind before starting;
the default is `127.0.0.1:8765` and non-loopback launch values are rejected. The
FastAPI service exposes `/api/v1` routes. The generated snapshot at
[`../shared/contracts/openapi.json`](../shared/contracts/openapi.json) is the
contract. SQLite is canonical in Ops Mode; Dexie is cache/outbox metadata.
Alembic upgrades are run by `pnpm companion:start` before `app.server` starts.

The effective mode is `ops` only when the persisted Ops intent is enabled and
the authority metadata is the committed `ops` state. Intent alone leaves the
extension in Standalone while migration is pending; disabling intent first
forces Standalone and then normalizes stale authority metadata. UI and
action-time capability gates require effective Ops plus a connected, paired,
compatible Companion. The canonical idempotency header is
`X-VacancyPilot-Idempotency-Key`.

The Companion stores sensitive material through the OS keyring, loads the
private engine from `.local/private-engine/` into
`.local/data/companion/engine/`, and uses `.local/data/companion/vacancypilot.db`
for operational data. Those paths are ignored and must never be committed.

## Fix 4 local data and UI security boundary

The extension's destructive reset runs behind a process-wide write barrier. It
waits for already-admitted browser writes, blocks new writes, clears every
Dexie table, clears the extension's `chrome.storage.local` and
`chrome.storage.session` namespaces, resets Companion client state and
restores safe Standalone defaults. Epoch checks prevent stale asynchronous
loads from repopulating UI state after reset. This is an extension-local reset:
it does not clear Companion SQLite, the OS keyring, the private engine package,
HH/provider data, browser history, cache or passwords. In effective Ops,
authoritative Companion data is therefore not presented as deleted by this
button. Standalone per-vacancy deletion is a structured cascade; it refuses
in-flight/unknown linked work and is unavailable while Ops is authoritative.

The search badge is rendered in a closed Shadow DOM with a generic,
state-independent host. Vacancy state is not encoded in page-owned classes,
attributes, titles, ARIA, text or global styles, and the content script never
hides or dims HH cards. Quick actions are extension-owned, require a trusted
event, use a canonical HH vacancy reference, and are validated again by the
background authority. All HH vacancy navigation uses the canonical HTTPS
`hh.ru/vacancy/<numeric-id>` form; stored or extracted query/fragment values,
lookalike hosts, userinfo and unsafe schemes are rejected.

Companion HH sync requires explicit selected-profile or explicit all-enabled
scope, caps each operation at 50 profiles and 2,000 items, refuses duplicate
scope and coalesces identical concurrent scopes. Follow-up timestamps are
validated before mutation. Pre-auth requests are bounded before token
verification, sanitized engine status is cached with short TTLs, and OAuth
state is purged/capped/consumed atomically. Legacy provider-body cleanup is
handled only by the recognized-path, dry-run-first scrub utility documented in
the Fix 4 acceptance report.

### Provider execution and privacy boundary

Both AI modes compile a canonical provider plan from current authoritative
input and the explicit AI/privacy policy. Preview is provider-free and shows
the exact redacted dynamic payload, plan hash, privacy summary, cache predicate,
expected attempts, budget limit and authenticated receipt. Execute rechecks the
current plan and policy, requires explicit confirmation, then performs a
semantic single-flight claim and atomic attempt reservation before dispatch.
SQLite is canonical for the Companion execution/attempt ledger; Dexie is
canonical for the Standalone ledger. A bounded repair is the only automatic
second attempt, SDK retries are disabled, and post-dispatch uncertainty is
durable `outcome_unknown` with no automatic retry. Raw provider output is
transient repair input only and is not persisted, logged or exported.

## External boundaries

HH page access is read-only DOM inspection. Official `api.hh.ru` access is
read-only and only through the Companion's explicit capability flow. OpenAI or
other AI paths are opt-in and previewed before execution. There is no developer
cloud backend, hidden HH request, auto-apply, HH form write, CAPTCHA bypass,
cookie/session handling, recruiter sending, or developer telemetry by default.

The user performs any HH application action outside VacancyPilot and explicitly
confirms the resulting state. Copy/open, preparation, HR extraction, and a
generated letter are never treated as sent/applied. Guided Apply's final local
mutation is Standalone-only until the next migration-safe write phase; Ops
surfaces remain read-only for that state.
