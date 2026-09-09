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

The Options app has compatibility routes for Inbox and Applications; both map
to the application workspace. Summary is a separate performance view.
Companies, Letters and Events are visible placeholders, while Interview Pack
is deferred. These surfaces must not be documented as active backend features.

## Companion

Ops Mode is opt-in and paired through a terminal code. The FastAPI service binds
only to `127.0.0.1:8765` and exposes `/api/v1` routes. The generated snapshot at
[`../shared/contracts/openapi.json`](../shared/contracts/openapi.json) is the
contract. SQLite is canonical in Ops Mode; Dexie is cache/outbox metadata.
Alembic upgrades are run by `pnpm companion:start` before Uvicorn starts.

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
confirms the resulting state. Copy/open is never treated as sent/applied.
