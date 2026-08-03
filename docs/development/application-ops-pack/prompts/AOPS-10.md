# Prompt AOPS-10 — Official HH Public API and Search Profiles

Implement only epic `AOPS-10` in the open VacancyPilot repository root.

Follow `../ZED_SESSION_START.md`: work only on synchronized `main`; do not
create a branch or PR, and leave commit/push to the Codex review gate.

## Goal

Add an official, read-only HH public API adapter using application
authorization/configuration, safe retries and manual Search Profile sync.
Do not implement user OAuth yet.

## Read first

1. `AGENTS.md`
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 4.2, 8.1, 8.4–8.6,
   11.2, 15 `search_profiles/hh_sync_runs`, 16.3 and 20.3
3. ADR-004 and HH API contract
4. Current vacancy intake/triage, keyring and sync repositories
5. Current official HH API documentation for every endpoint/auth behavior used

## Documentation rule

Use current official HH documentation only. Do not infer endpoint paths,
authorization grants, fields, pagination or rate semantics from memory or
private frontend traffic.

For every implemented endpoint, record in a developer contract:

- official documentation URL/title;
- HTTP method/path;
- authorization mode;
- relevant response fields;
- pagination/rate behavior;
- verification date.

If “application token” acquisition or an endpoint differs from the MVP text,
do not invent compatibility. Implement the documented behavior, update the ADR
and surface the real external setup gate.

## Required work

Implement companion-only HH client:

- explicit base URL;
- mandatory compliant `HH-User-Agent` from configuration;
- application credential/token in OS keyring only;
- public vacancy search;
- vacancy detail;
- dictionaries needed by search normalization;
- public employer data only if required by frozen scope;
- typed response normalization that tolerates documented optional fields;
- per-request timeout;
- documented pagination and hard page/item limits;
- retry only for safe GET and retryable transport/5xx/429;
- exponential backoff with jitter and `Retry-After` support;
- no retry storm;
- 401/403/404/429 typed errors;
- request/response logs contain metadata only, no token or full vacancy text in
  privacy mode.

Implement Search Profiles:

- create/update/enable/disable;
- versioned validated query JSON;
- manual sync;
- sync checkpoint/log;
- intake through existing idempotent vacancy service;
- Stage A triage for returned vacancies;
- summary counts: seen/new/updated/unchanged/rejected/errors;
- no continuous polling or automatic full V4 analysis.

Implement/update:

```text
POST /api/v1/hh/sync/vacancies
GET  /api/v1/hh/capabilities
CRUD-safe Search Profile endpoints from the frozen contract
```

Provide minimal existing-dashboard settings/search-profile UI sufficient to
configure credentials by explicit action, test connection, manage profiles and
run manual sync. Extension never receives the application token and needs no
`api.hh.ru` permission.

## Tests

Use `httpx.MockTransport` or equivalent official contract fixtures:

- required user agent on every call;
- auth header/token redacted;
- page/item bounds;
- multiple-page success;
- duplicate vacancy across pages;
- 401/403;
- 429 with Retry-After/backoff;
- transport/5xx bounded retry;
- invalid/partial response;
- manual sync idempotency and run log;
- disabled profile not run;
- no POST/write to HH;
- no extension HH host permission.

Live-token tests are manual/opt-in and must skip clearly when credentials are
absent.

## Non-goals

- no user OAuth, `/me`, resumes or negotiations;
- no daily schedule;
- no detailed messages;
- no auto-apply/application POST;
- no hidden extension fetch;
- no batch Full V4 by default.

## Acceptance criteria

- documented official public search/detail works through companion contract;
- user agent, pagination and 429 behavior have tests;
- secrets remain in keyring and never reach browser/export/log;
- manual sync feeds existing dedupe/triage;
- no unsafe HH write method exists;
- extension standalone mode remains intact.

## Validation

```powershell
pnpm verify:companion
pnpm verify
pnpm test:release
git diff --check
```

Report mocked contract tests separately from any live manual result.

## Handoff

Do not commit/push. Include official documentation references used.

Expected reviewed commit message:

```text
feat: add official HH vacancy discovery
```
