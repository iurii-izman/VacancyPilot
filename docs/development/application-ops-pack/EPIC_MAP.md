# VacancyPilot Application Ops — Epic Map

## Dependency sequence

```text
AOPS-00 Baseline and contract freeze
  ↓
AOPS-01 Companion foundation
  ↓
AOPS-02 SQLite domain and migrations
  ↓
AOPS-03 Localhost security, pairing and secrets
  ↓
AOPS-04 Extension Ops client and offline mode
  ↓
AOPS-05 Dexie migration and outbox
  ↓
AOPS-06 Vacancy intake, deduplication and local triage
  ↓
AOPS-07 Engine package, deterministic index and health
  ↓
AOPS-08 Full V4 analysis, providers and literal validation
  ↓
AOPS-09 Letter lifecycle, manual bridge and generated/sent diff
  ↓
AOPS-10 HH public API and search profiles
  ↓
AOPS-11 HH OAuth and read-only applicant sync
  ↓
AOPS-12 Command Center, Inbox and Application Card
  ↓
AOPS-13 Pipeline, events and follow-ups
  ↓
AOPS-14 Interview Pack
  ↓
AOPS-15 Analytics and production pilot
  ↓
AOPS-16 Backup, restore, privacy and debug bundle
  ↓
AOPS-17 E2E, browser QA and release 0.2.0
  ↓
AOPS-18 Conditional P1 enhancements
```

`AOPS-18` is not part of the P0 release gate. Start it only after AOPS-17 is
accepted and P0 remains stable.

## Epic table

| ID | Outcome | Size | Primary gate |
| --- | --- | --- | --- |
| AOPS-00 | Actual baseline, adopted MVP spec, ADRs, frozen v1 API/schema | M | docs and baseline tests only |
| AOPS-01 | Runnable FastAPI companion and root quality commands | M | health + pytest/Ruff/mypy |
| AOPS-02 | SQLite/Alembic domain with repositories and invariants | L | migration round-trip |
| AOPS-03 | Loopback-only pairing, keyring, CORS and redaction | L | security tests |
| AOPS-04 | Typed OpsClient, settings and offline-safe health UI | M | standalone mode preserved |
| AOPS-05 | Dexie preview/import/outbox/conflict reporting | L | idempotent migration/retry |
| AOPS-06 | Intake, snapshots, dedupe and no-AI triage | L | duplicate and hard-gate fixtures |
| AOPS-07 | Private-safe V4 package loading/index/health | L | invalid package blocks analysis |
| AOPS-08 | Provider abstraction, prompt compiler, JSON output and QA | XL | 15 regressions + 6 smoke |
| AOPS-09 | Letter versions, manual bridge, immutable sent snapshot and diff | L | QA gate + no form writes |
| AOPS-10 | Official public HH client and search profiles | L | mocked 401/429/pagination |
| AOPS-11 | PKCE OAuth, keyring refresh and read-only user sync | XL | capability and secret tests |
| AOPS-12 | Command Center, Inbox and evidence-aware Application Card | XL | component + integration tests |
| AOPS-13 | Pipeline/event timeline/follow-up lifecycle | L | transition and reminder tests |
| AOPS-14 | Evidence-aware Interview Pack and Markdown export | M | deterministic offline template |
| AOPS-15 | Funnel/edit/proof analytics and pilot report | L | empty/small/populated datasets |
| AOPS-16 | Portable backup, restore preview, privacy and debug bundle | L | round-trip and secret exclusion |
| AOPS-17 | Full E2E, Chrome/Edge evidence and release artifacts | XL | complete 0.2.0 acceptance |
| AOPS-18 | Optional daily sync, notifications, detailed timeline and filters | L | feature flags, P0 unchanged |

## Review gates

Every epic must satisfy all applicable gates:

1. Scope gate — only the current epic and necessary tests/docs changed.
2. Safety gate — no auto-apply, hidden HH requests, form writes, session
   handling, broad permissions, cloud backend, or default telemetry.
3. Data gate — migration/export/delete/backup behavior updated when persistence
   changes.
4. Contract gate — OpenAPI/shared contracts and consumers stay synchronized.
5. Test gate — actual commands pass; skipped tests are explained and accepted.
6. Evidence gate — no candidate fact or V4 evidence level is invented.
7. Git gate — no commit/push by DeepSeek; review begins from a visible diff.

## Cross-cutting decisions added to the source plan

### Real V4 payload is private by default

The actual engine pack contains candidate knowledge. Unless the user explicitly
confirms the target repository and all backups/remotes are private, commit only:

- loader/runtime code;
- manifest schema;
- synthetic test fixtures;
- an installer/import command;
- `.gitignore` rules for the real local payload.

Do not silently vendor real candidate facts into Git.

### OpenAPI is the contract source

FastAPI generates the canonical local API schema. A checked-in sanitized
OpenAPI snapshot is used to generate or validate TypeScript contracts. Avoid
hand-maintained duplicate request/response interfaces.

### Status changes are events plus a current projection

Keep `application_events` append-only. The `applications.status` field is a
current projection updated transactionally with a new event. Do not rely on
last-write-only status history.

### HH live tests are manual and opt-in

CI and normal development use contract/mocked fixtures. Real tokens are never
required for ordinary test runs and never enter logs, snapshots, or fixtures.

### P1 is a separate gate

Do not add daily schedulers, notifications, detailed negotiations, broad
filtering, or a DeepSeek runtime provider while P0 acceptance is incomplete.
