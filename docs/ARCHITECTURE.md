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
client token. The current Dexie schema is v6 and its migration history is
executable authority.

The Options app exposes exactly six primary routes: Today, Discovery, Inbox,
Pipeline, Candidate and Settings. Legacy hashes remain compatibility aliases:
application/vacancy/summary/profile/resume/system hashes resolve into the
canonical workspace and subview without creating data. Onboarding is a hidden
first-run/manual flow. Discovery owns HH Search Profiles; Companion owns
pairing, recovery, migration, account/auth and capability configuration.
Standalone Pipeline is the Dexie/Kanban source of truth; Ops Pipeline exposes
Companion-backed performance summaries and does not present the local board as
canonical.

The current presentation pass keeps this route and data architecture intact.
It consolidates daily-use hierarchy around clear page titles, compact cards,
core-versus-secondary filters, actionable empty states and explicit preview or
confirmation actions. The mode-safety pass adds capability-derived gates at
the UI and action boundaries without changing the product's read-only HH
boundary.

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
